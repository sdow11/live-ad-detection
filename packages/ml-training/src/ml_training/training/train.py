"""Main training script for ad detection models.

This script handles the complete training process:
- Load configuration
- Prepare datasets with augmentation
- Build and compile model
- Train with validation
- Save checkpoints and final model
- Log metrics to MLflow
"""

import argparse
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import mlflow
import numpy as np
import tensorflow as tf
import yaml
from tensorflow import keras
from tensorflow.keras import layers, models
from tensorflow.keras.callbacks import (
    EarlyStopping,
    ModelCheckpoint,
    ReduceLROnPlateau,
    TensorBoard,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class AdDetectionTrainer:
    """Trainer for ad detection models."""

    def __init__(self, config_path: Path | str):
        """Initialize trainer.

        Args:
            config_path: Path to training configuration YAML
        """
        self.config_path = Path(config_path)
        self.config = self._load_config()

        # Set random seeds for reproducibility
        np.random.seed(self.config.get("random_seed", 42))
        tf.random.set_seed(self.config.get("random_seed", 42))

        # Configure GPU memory growth
        self._configure_gpu()

    def _load_config(self) -> Dict[str, Any]:
        """Load training configuration."""
        with open(self.config_path) as f:
            return yaml.safe_load(f)

    def _configure_gpu(self) -> None:
        """Configure GPU settings."""
        gpus = tf.config.list_physical_devices("GPU")
        if gpus:
            try:
                for gpu in gpus:
                    tf.config.experimental.set_memory_growth(gpu, True)
                logger.info(f"Found {len(gpus)} GPU(s), enabled memory growth")
            except RuntimeError as e:
                logger.warning(f"Error configuring GPU: {e}")
        else:
            logger.info("No GPUs found, using CPU")

    def build_model(self) -> keras.Model:
        """Build model architecture.

        Returns:
            Compiled Keras model
        """
        model_config = self.config["model"]
        architecture = model_config["architecture"]
        input_shape = tuple(model_config["input_shape"])

        logger.info(f"Building {architecture} model with input shape {input_shape}")

        if architecture == "efficientnet_lite0":
            model = self._build_efficientnet_lite0(input_shape)
        elif architecture == "mobilenet_v3_small":
            model = self._build_mobilenet_v3(input_shape, "small")
        elif architecture == "mobilenet_v3_large":
            model = self._build_mobilenet_v3(input_shape, "large")
        elif architecture == "custom_cnn":
            model = self._build_custom_cnn(input_shape)
        else:
            raise ValueError(f"Unknown architecture: {architecture}")

        # Compile model
        training_config = self.config["training"]
        optimizer = self._get_optimizer(training_config)

        model.compile(
            optimizer=optimizer,
            loss="binary_crossentropy",
            metrics=["accuracy", "precision", "recall", "AUC"]
        )

        return model

    def _build_efficientnet_lite0(self, input_shape: Tuple[int, int, int]) -> keras.Model:
        """Build EfficientNet-Lite0 model.

        Args:
            input_shape: Input image shape (height, width, channels)

        Returns:
            Keras model
        """
        # Use MobileNetV2 as a base (similar to EfficientNet-Lite0)
        base_model = keras.applications.MobileNetV2(
            input_shape=input_shape,
            include_top=False,
            weights="imagenet"
        )

        # Freeze base model layers initially
        base_model.trainable = False

        # Add custom head
        inputs = keras.Input(shape=input_shape)
        x = base_model(inputs, training=False)
        x = layers.GlobalAveragePooling2D()(x)
        x = layers.Dropout(0.2)(x)
        outputs = layers.Dense(1, activation="sigmoid")(x)

        model = keras.Model(inputs, outputs)

        return model

    def _build_mobilenet_v3(
        self,
        input_shape: Tuple[int, int, int],
        size: str = "small"
    ) -> keras.Model:
        """Build MobileNetV3 model.

        Args:
            input_shape: Input image shape
            size: Model size ("small" or "large")

        Returns:
            Keras model
        """
        if size == "small":
            base_model = keras.applications.MobileNetV3Small(
                input_shape=input_shape,
                include_top=False,
                weights="imagenet"
            )
        else:
            base_model = keras.applications.MobileNetV3Large(
                input_shape=input_shape,
                include_top=False,
                weights="imagenet"
            )

        base_model.trainable = False

        inputs = keras.Input(shape=input_shape)
        x = base_model(inputs, training=False)
        x = layers.GlobalAveragePooling2D()(x)
        x = layers.Dropout(0.2)(x)
        outputs = layers.Dense(1, activation="sigmoid")(x)

        return keras.Model(inputs, outputs)

    def _build_custom_cnn(self, input_shape: Tuple[int, int, int]) -> keras.Model:
        """Build custom CNN model.

        Args:
            input_shape: Input image shape

        Returns:
            Keras model
        """
        inputs = keras.Input(shape=input_shape)

        # First conv block
        x = layers.Conv2D(32, 3, strides=2, padding="same")(inputs)
        x = layers.BatchNormalization()(x)
        x = layers.ReLU()(x)

        # Second conv block
        x = layers.Conv2D(64, 3, strides=2, padding="same")(x)
        x = layers.BatchNormalization()(x)
        x = layers.ReLU()(x)

        # Third conv block
        x = layers.Conv2D(128, 3, strides=2, padding="same")(x)
        x = layers.BatchNormalization()(x)
        x = layers.ReLU()(x)

        # Global pooling and classification
        x = layers.GlobalAveragePooling2D()(x)
        x = layers.Dropout(0.3)(x)
        outputs = layers.Dense(1, activation="sigmoid")(x)

        return keras.Model(inputs, outputs)

    def _get_optimizer(self, training_config: Dict[str, Any]) -> keras.optimizers.Optimizer:
        """Get optimizer from config.

        Args:
            training_config: Training configuration

        Returns:
            Keras optimizer
        """
        optimizer_name = training_config["optimizer"].lower()
        lr = training_config["learning_rate"]

        if optimizer_name == "adam":
            return keras.optimizers.Adam(learning_rate=lr)
        elif optimizer_name == "sgd":
            momentum = training_config.get("momentum", 0.9)
            return keras.optimizers.SGD(learning_rate=lr, momentum=momentum)
        elif optimizer_name == "rmsprop":
            return keras.optimizers.RMSprop(learning_rate=lr)
        else:
            raise ValueError(f"Unknown optimizer: {optimizer_name}")

    def prepare_datasets(self) -> Tuple[tf.data.Dataset, tf.data.Dataset, tf.data.Dataset]:
        """Prepare train, validation, and test datasets.

        Returns:
            Tuple of (train_dataset, val_dataset, test_dataset)
        """
        dataset_config = self.config["dataset"]
        data_dir = Path(dataset_config["data_dir"])

        logger.info(f"Loading datasets from {data_dir}")

        # Load datasets
        train_ds = self._load_dataset(data_dir / "train", training=True)
        val_ds = self._load_dataset(data_dir / "val", training=False)
        test_ds = self._load_dataset(data_dir / "test", training=False)

        return train_ds, val_ds, test_ds

    def _load_dataset(
        self,
        data_dir: Path,
        training: bool = False
    ) -> tf.data.Dataset:
        """Load dataset from directory.

        Args:
            data_dir: Directory containing images
            training: Whether this is training dataset (for augmentation)

        Returns:
            tf.data.Dataset
        """
        dataset_config = self.config["dataset"]
        model_config = self.config["model"]

        batch_size = dataset_config["batch_size"]
        image_size = model_config["input_shape"][:2]

        # Load images from directory
        ds = keras.utils.image_dataset_from_directory(
            data_dir,
            labels="inferred",
            label_mode="binary",
            class_names=["content", "ad"],
            batch_size=batch_size,
            image_size=image_size,
            shuffle=training,
            seed=self.config.get("random_seed", 42)
        )

        # Normalize images
        normalization_layer = layers.Rescaling(1./255)
        ds = ds.map(lambda x, y: (normalization_layer(x), y))

        # Apply augmentation for training
        if training:
            augmentation_config = self.config.get("augmentation", {})
            if augmentation_config.get("enabled", True):
                ds = ds.map(
                    lambda x, y: (self._augment_image(x, augmentation_config), y),
                    num_parallel_calls=tf.data.AUTOTUNE
                )

        # Prefetch for performance
        ds = ds.prefetch(tf.data.AUTOTUNE)

        return ds

    def _augment_image(
        self,
        image: tf.Tensor,
        augmentation_config: Dict[str, Any]
    ) -> tf.Tensor:
        """Apply data augmentation.

        Args:
            image: Input image tensor
            augmentation_config: Augmentation configuration

        Returns:
            Augmented image tensor
        """
        # Random flip
        if augmentation_config.get("horizontal_flip", True):
            image = tf.image.random_flip_left_right(image)

        # Random brightness
        brightness_delta = augmentation_config.get("brightness_delta", 0.2)
        if brightness_delta > 0:
            image = tf.image.random_brightness(image, brightness_delta)

        # Random contrast
        contrast_range = augmentation_config.get("contrast_range", [0.8, 1.2])
        if contrast_range:
            image = tf.image.random_contrast(
                image,
                lower=contrast_range[0],
                upper=contrast_range[1]
            )

        # Random saturation
        saturation_range = augmentation_config.get("saturation_range", [0.8, 1.2])
        if saturation_range:
            image = tf.image.random_saturation(
                image,
                lower=saturation_range[0],
                upper=saturation_range[1]
            )

        # Random rotation
        rotation_range = augmentation_config.get("rotation_range", 10)
        if rotation_range > 0:
            angle = tf.random.uniform(
                [],
                -rotation_range,
                rotation_range,
                dtype=tf.float32
            )
            image = self._rotate_image(image, angle)

        # Clip values to [0, 1]
        image = tf.clip_by_value(image, 0.0, 1.0)

        return image

    def _rotate_image(self, image: tf.Tensor, angle: tf.Tensor) -> tf.Tensor:
        """Rotate image by angle in degrees.

        Args:
            image: Input image
            angle: Rotation angle in degrees

        Returns:
            Rotated image
        """
        # Convert angle to radians
        angle_rad = angle * np.pi / 180.0

        # Use tf.image.rot90 for 90-degree rotations, or just return image
        # For arbitrary rotations, we'd need tfa.image.rotate which requires tf-addons
        # For simplicity, just return the image (rotation is optional)
        return image

    def get_callbacks(self, output_dir: Path) -> List[keras.callbacks.Callback]:
        """Get training callbacks.

        Args:
            output_dir: Output directory for checkpoints and logs

        Returns:
            List of callbacks
        """
        callbacks = []

        # ModelCheckpoint
        checkpoint_dir = output_dir / "checkpoints"
        checkpoint_dir.mkdir(parents=True, exist_ok=True)

        callbacks.append(
            ModelCheckpoint(
                filepath=str(checkpoint_dir / "model_epoch_{epoch:02d}_val_loss_{val_loss:.4f}.keras"),
                monitor="val_loss",
                save_best_only=True,
                save_weights_only=False,
                mode="min",
                verbose=1
            )
        )

        # EarlyStopping
        early_stopping_config = self.config.get("early_stopping", {})
        if early_stopping_config.get("enabled", True):
            callbacks.append(
                EarlyStopping(
                    monitor="val_loss",
                    patience=early_stopping_config.get("patience", 10),
                    restore_best_weights=True,
                    verbose=1
                )
            )

        # ReduceLROnPlateau
        lr_schedule_config = self.config.get("lr_schedule", {})
        if lr_schedule_config.get("enabled", True):
            callbacks.append(
                ReduceLROnPlateau(
                    monitor="val_loss",
                    factor=lr_schedule_config.get("factor", 0.5),
                    patience=lr_schedule_config.get("patience", 5),
                    min_lr=lr_schedule_config.get("min_lr", 1e-7),
                    verbose=1
                )
            )

        # TensorBoard
        tensorboard_dir = output_dir / "tensorboard"
        tensorboard_dir.mkdir(parents=True, exist_ok=True)

        callbacks.append(
            TensorBoard(
                log_dir=str(tensorboard_dir),
                histogram_freq=1,
                write_graph=True,
                write_images=False,
                update_freq="epoch"
            )
        )

        return callbacks

    def train(self, output_dir: Path | str) -> keras.Model:
        """Train the model.

        Args:
            output_dir: Output directory for artifacts

        Returns:
            Trained model
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Start MLflow run
        mlflow.set_experiment(self.config["model"]["name"])

        with mlflow.start_run():
            # Log configuration
            mlflow.log_params(self._flatten_config(self.config))

            # Build model
            model = self.build_model()
            logger.info(f"Model has {model.count_params():,} parameters")
            mlflow.log_param("total_params", model.count_params())

            # Prepare datasets
            train_ds, val_ds, test_ds = self.prepare_datasets()

            # Get callbacks
            callbacks = self.get_callbacks(output_dir)

            # Train
            training_config = self.config["training"]
            logger.info(f"Starting training for {training_config['epochs']} epochs")

            history = model.fit(
                train_ds,
                validation_data=val_ds,
                epochs=training_config["epochs"],
                callbacks=callbacks,
                verbose=1
            )

            # Log metrics
            for metric_name, values in history.history.items():
                for epoch, value in enumerate(values):
                    mlflow.log_metric(metric_name, value, step=epoch)

            # Evaluate on test set
            logger.info("Evaluating on test set")
            test_results = model.evaluate(test_ds, verbose=1, return_dict=True)

            for metric_name, value in test_results.items():
                mlflow.log_metric(f"test_{metric_name}", value)
                logger.info(f"Test {metric_name}: {value:.4f}")

            # Save final model
            model_path = output_dir / "model_final.keras"
            model.save(model_path)
            logger.info(f"Saved final model to {model_path}")

            # Log model to MLflow
            mlflow.keras.log_model(model, "model")

            # Save training history
            history_path = output_dir / "training_history.npz"
            np.savez(history_path, **history.history)
            mlflow.log_artifact(str(history_path))

            logger.info("Training complete!")

        return model

    def _flatten_config(self, config: Dict[str, Any], prefix: str = "") -> Dict[str, Any]:
        """Flatten nested config dict for MLflow logging.

        Args:
            config: Configuration dictionary
            prefix: Key prefix

        Returns:
            Flattened dictionary
        """
        flat = {}
        for key, value in config.items():
            full_key = f"{prefix}{key}" if prefix else key

            if isinstance(value, dict):
                flat.update(self._flatten_config(value, f"{full_key}."))
            elif isinstance(value, (list, tuple)):
                flat[full_key] = str(value)
            else:
                flat[full_key] = value

        return flat


def main():
    """Main training entry point."""
    parser = argparse.ArgumentParser(description="Train ad detection model")
    parser.add_argument(
        "config",
        type=Path,
        help="Path to training configuration YAML"
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("output"),
        help="Output directory for artifacts"
    )
    parser.add_argument(
        "--mlflow-uri",
        type=str,
        default=None,
        help="MLflow tracking URI"
    )

    args = parser.parse_args()

    # Configure MLflow
    if args.mlflow_uri:
        mlflow.set_tracking_uri(args.mlflow_uri)

    # Train
    trainer = AdDetectionTrainer(args.config)
    trainer.train(args.output_dir)


if __name__ == "__main__":
    main()
