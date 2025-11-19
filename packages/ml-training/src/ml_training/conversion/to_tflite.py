"""Convert trained models to TensorFlow Lite format.

This module provides utilities to convert PyTorch or TensorFlow models
to TFLite format for deployment on Raspberry Pi edge devices.
"""

import logging
from pathlib import Path
from typing import Optional, Literal
import numpy as np

import tensorflow as tf

logger = logging.getLogger(__name__)


QuantizationType = Literal["none", "float16", "int8", "dynamic"]


def convert_keras_to_tflite(
    model_path: Path | str,
    output_path: Path | str,
    quantization: QuantizationType = "int8",
    representative_dataset: Optional[callable] = None,
    input_shape: Optional[tuple[int, int, int]] = None
) -> Path:
    """Convert Keras model to TensorFlow Lite.

    Args:
        model_path: Path to Keras model (.h5 or SavedModel)
        output_path: Where to save TFLite model
        quantization: Quantization type
        representative_dataset: Representative dataset for calibration (required for int8)
        input_shape: Input shape (H, W, C) for validation

    Returns:
        Path to converted TFLite model

    Example:
        >>> def representative_data():
        ...     for _ in range(100):
        ...         yield [np.random.rand(1, 224, 224, 3).astype(np.float32)]
        ...
        >>> convert_keras_to_tflite(
        ...     "model.h5",
        ...     "model.tflite",
        ...     quantization="int8",
        ...     representative_dataset=representative_data
        ... )
    """
    model_path = Path(model_path)
    output_path = Path(output_path)

    logger.info(f"Loading Keras model from {model_path}...")

    # Load Keras model
    if model_path.suffix == ".h5":
        model = tf.keras.models.load_model(str(model_path))
    else:
        model = tf.keras.models.load_model(str(model_path))

    logger.info(f"Model loaded. Converting to TFLite with {quantization} quantization...")

    # Create converter
    converter = tf.lite.TFLiteConverter.from_keras_model(model)

    # Apply quantization
    if quantization == "none":
        # No quantization
        pass

    elif quantization == "float16":
        # Float16 quantization
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.target_spec.supported_types = [tf.float16]

    elif quantization == "int8":
        # Full integer quantization (requires representative dataset)
        if representative_dataset is None:
            raise ValueError("representative_dataset required for int8 quantization")

        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.representative_dataset = representative_dataset
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
        converter.inference_input_type = tf.uint8
        converter.inference_output_type = tf.uint8

    elif quantization == "dynamic":
        # Dynamic range quantization
        converter.optimizations = [tf.lite.Optimize.DEFAULT]

    else:
        raise ValueError(f"Unknown quantization type: {quantization}")

    # Convert model
    tflite_model = converter.convert()

    # Save model
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(tflite_model)

    # Get file sizes
    original_size_mb = model_path.stat().st_size / (1024 * 1024)
    tflite_size_mb = len(tflite_model) / (1024 * 1024)
    compression_ratio = original_size_mb / tflite_size_mb

    logger.info(f"✅ Conversion complete!")
    logger.info(f"   Original size: {original_size_mb:.2f} MB")
    logger.info(f"   TFLite size: {tflite_size_mb:.2f} MB")
    logger.info(f"   Compression: {compression_ratio:.2f}x")
    logger.info(f"   Saved to: {output_path}")

    # Validate if input shape provided
    if input_shape:
        logger.info("Validating converted model...")
        validate_tflite_model(output_path, input_shape)

    return output_path


def validate_tflite_model(
    model_path: Path | str,
    input_shape: tuple[int, int, int],
    num_samples: int = 10
) -> dict[str, float]:
    """Validate TFLite model can run inference.

    Args:
        model_path: Path to TFLite model
        input_shape: Input shape (H, W, C)
        num_samples: Number of test samples

    Returns:
        Dictionary with validation results

    Raises:
        RuntimeError: If model validation fails
    """
    model_path = Path(model_path)

    logger.info(f"Validating TFLite model: {model_path}")

    # Load TFLite model
    interpreter = tf.lite.Interpreter(model_path=str(model_path))
    interpreter.allocate_tensors()

    # Get input/output details
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    logger.info(f"Input shape: {input_details[0]['shape']}")
    logger.info(f"Output shape: {output_details[0]['shape']}")
    logger.info(f"Input dtype: {input_details[0]['dtype']}")
    logger.info(f"Output dtype: {output_details[0]['dtype']}")

    # Run test inferences
    latencies = []
    import time

    for i in range(num_samples):
        # Generate random input
        if input_details[0]['dtype'] == np.uint8:
            test_input = np.random.randint(0, 256, input_details[0]['shape'], dtype=np.uint8)
        else:
            test_input = np.random.rand(*input_details[0]['shape']).astype(np.float32)

        # Run inference
        start_time = time.time()
        interpreter.set_tensor(input_details[0]['index'], test_input)
        interpreter.invoke()
        output = interpreter.get_tensor(output_details[0]['index'])
        latency_ms = (time.time() - start_time) * 1000
        latencies.append(latency_ms)

        if i == 0:
            logger.info(f"Sample output: {output}")

    # Calculate statistics
    avg_latency = np.mean(latencies)
    p95_latency = np.percentile(latencies, 95)
    p99_latency = np.percentile(latencies, 99)

    logger.info(f"✅ Model validation passed!")
    logger.info(f"   Average latency: {avg_latency:.2f}ms")
    logger.info(f"   P95 latency: {p95_latency:.2f}ms")
    logger.info(f"   P99 latency: {p99_latency:.2f}ms")

    return {
        "avg_latency_ms": avg_latency,
        "p95_latency_ms": p95_latency,
        "p99_latency_ms": p99_latency,
        "input_shape": input_details[0]['shape'].tolist(),
        "output_shape": output_details[0]['shape'].tolist(),
        "input_dtype": str(input_details[0]['dtype']),
        "output_dtype": str(output_details[0]['dtype']),
    }


def create_representative_dataset(
    data_dir: Path | str,
    num_samples: int = 100,
    input_shape: tuple[int, int, int] = (224, 224, 3)
) -> callable:
    """Create representative dataset generator for quantization.

    Args:
        data_dir: Directory with sample images
        num_samples: Number of samples to use
        input_shape: Target input shape

    Returns:
        Generator function for representative dataset

    Example:
        >>> dataset_gen = create_representative_dataset("data/samples")
        >>> convert_keras_to_tflite(
        ...     "model.h5",
        ...     "model.tflite",
        ...     quantization="int8",
        ...     representative_dataset=dataset_gen
        ... )
    """
    import cv2

    data_dir = Path(data_dir)
    image_files = list(data_dir.glob("*.jpg")) + list(data_dir.glob("*.png"))

    if not image_files:
        raise ValueError(f"No images found in {data_dir}")

    if len(image_files) < num_samples:
        logger.warning(
            f"Only {len(image_files)} images found, requested {num_samples}. "
            f"Using all available images."
        )
        num_samples = len(image_files)

    logger.info(f"Creating representative dataset with {num_samples} samples from {data_dir}")

    def representative_dataset_gen():
        """Generator for representative dataset."""
        for i, img_path in enumerate(image_files[:num_samples]):
            # Load and preprocess image
            img = cv2.imread(str(img_path))
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img = cv2.resize(img, input_shape[:2])
            img = img.astype(np.float32) / 255.0

            # ImageNet normalization
            mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
            std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
            img = (img - mean) / std

            # Add batch dimension
            img = np.expand_dims(img, axis=0)

            yield [img]

            if (i + 1) % 10 == 0:
                logger.info(f"  Processed {i + 1}/{num_samples} samples")

    return representative_dataset_gen


# CLI entry point
def main():
    """CLI for model conversion."""
    import argparse

    parser = argparse.ArgumentParser(description="Convert models to TFLite")
    parser.add_argument("--model", required=True, help="Input model path (.h5 or SavedModel)")
    parser.add_argument("--output", required=True, help="Output TFLite path")
    parser.add_argument(
        "--quantization",
        choices=["none", "float16", "int8", "dynamic"],
        default="int8",
        help="Quantization type"
    )
    parser.add_argument("--data-dir", help="Directory with sample images (for int8)")
    parser.add_argument("--num-samples", type=int, default=100, help="Number of calibration samples")
    parser.add_argument("--input-shape", help="Input shape as HxWxC (e.g., 224x224x3)")
    parser.add_argument("--validate", action="store_true", help="Validate converted model")

    args = parser.parse_args()

    # Parse input shape
    input_shape = None
    if args.input_shape:
        h, w, c = map(int, args.input_shape.split("x"))
        input_shape = (h, w, c)

    # Create representative dataset if needed
    representative_dataset = None
    if args.quantization == "int8":
        if not args.data_dir:
            raise ValueError("--data-dir required for int8 quantization")

        representative_dataset = create_representative_dataset(
            args.data_dir,
            num_samples=args.num_samples,
            input_shape=input_shape or (224, 224, 3)
        )

    # Convert model
    output_path = convert_keras_to_tflite(
        model_path=args.model,
        output_path=args.output,
        quantization=args.quantization,
        representative_dataset=representative_dataset,
        input_shape=input_shape
    )

    # Validate if requested
    if args.validate and input_shape:
        validate_tflite_model(output_path, input_shape)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
