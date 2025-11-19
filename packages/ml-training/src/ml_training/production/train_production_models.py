"""Production model training orchestrator.

Handles the complete training pipeline:
1. Dataset preparation and validation
2. Model training with monitoring
3. Model evaluation against requirements
4. TFLite conversion with quantization
5. Deployment to model registry
6. Performance benchmarking
"""

import argparse
import json
import logging
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import mlflow
import numpy as np
import tensorflow as tf
import yaml
from tensorflow import keras

from ml_training.conversion.to_tflite import TFLiteConverter
from ml_training.registry.client import ModelRegistryClient
from ml_training.training.train import AdDetectionTrainer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class ProductionTrainingOrchestrator:
    """Orchestrates production model training and deployment."""

    def __init__(
        self,
        config_path: Path | str,
        registry_url: Optional[str] = None,
        dry_run: bool = False
    ):
        """Initialize orchestrator.

        Args:
            config_path: Path to training configuration
            registry_url: Model registry URL (optional)
            dry_run: If True, skip deployment steps
        """
        self.config_path = Path(config_path)
        self.dry_run = dry_run

        # Load configuration
        with open(self.config_path) as f:
            self.config = yaml.safe_load(f)

        # Model registry client
        self.registry_client = None
        if registry_url and not dry_run:
            self.registry_client = ModelRegistryClient(registry_url)

        # Training results
        self.results = {}

    def validate_dataset(self) -> bool:
        """Validate dataset structure and contents.

        Returns:
            True if dataset is valid
        """
        logger.info("Validating dataset...")

        data_config = self.config["data"]
        required_dirs = ["train_dir", "val_dir", "test_dir"]

        for dir_key in required_dirs:
            dir_path = Path(data_config[dir_key])

            if not dir_path.exists():
                logger.error(f"Missing directory: {dir_path}")
                return False

            # Check for class subdirectories
            class_dirs = list(dir_path.glob("*/"))
            if len(class_dirs) < 2:
                logger.error(
                    f"Expected at least 2 class directories in {dir_path}, "
                    f"found {len(class_dirs)}"
                )
                return False

            # Count samples
            total_samples = sum(
                len(list(class_dir.glob("*.jpg"))) +
                len(list(class_dir.glob("*.png")))
                for class_dir in class_dirs
            )

            logger.info(
                f"{dir_key}: {total_samples} samples in {len(class_dirs)} classes"
            )

            if total_samples == 0:
                logger.error(f"No samples found in {dir_path}")
                return False

        logger.info("Dataset validation passed")
        return True

    def train_model(self) -> Tuple[keras.Model, Dict]:
        """Train model using configuration.

        Returns:
            Tuple of (trained model, training history)
        """
        logger.info("Starting model training...")

        # Initialize trainer
        trainer = AdDetectionTrainer(self.config_path)

        # Build model
        model = trainer.build_model()

        # Load datasets
        train_dataset, val_dataset = trainer.load_datasets()

        # Train model
        history = trainer.train(model, train_dataset, val_dataset)

        logger.info("Model training completed")

        return model, history

    def evaluate_model(
        self,
        model: keras.Model
    ) -> Dict:
        """Evaluate model on test set.

        Args:
            model: Trained model

        Returns:
            Evaluation metrics
        """
        logger.info("Evaluating model on test set...")

        data_config = self.config["data"]
        test_dir = Path(data_config["test_dir"])
        input_shape = tuple(self.config["model"]["input_shape"])

        # Load test dataset
        test_dataset = keras.preprocessing.image_dataset_from_directory(
            test_dir,
            image_size=input_shape[:2],
            batch_size=32,
            shuffle=False,
            label_mode="binary"
        )

        # Evaluate
        results = model.evaluate(test_dataset, return_dict=True)

        # Compute additional metrics
        y_true = []
        y_pred = []

        for images, labels in test_dataset:
            predictions = model.predict(images, verbose=0)
            y_true.extend(labels.numpy())
            y_pred.extend(predictions.flatten())

        y_true = np.array(y_true)
        y_pred_binary = (np.array(y_pred) > 0.5).astype(int)

        # Compute confusion matrix
        from sklearn.metrics import (
            confusion_matrix,
            f1_score,
            precision_score,
            recall_score,
            roc_auc_score
        )

        cm = confusion_matrix(y_true, y_pred_binary)
        results["confusion_matrix"] = cm.tolist()
        results["precision"] = precision_score(y_true, y_pred_binary)
        results["recall"] = recall_score(y_true, y_pred_binary)
        results["f1_score"] = f1_score(y_true, y_pred_binary)
        results["roc_auc"] = roc_auc_score(y_true, y_pred)

        logger.info(f"Test accuracy: {results['accuracy']:.4f}")
        logger.info(f"Test F1 score: {results['f1_score']:.4f}")
        logger.info(f"Confusion matrix:\n{cm}")

        return results

    def check_requirements(self, metrics: Dict) -> bool:
        """Check if model meets minimum requirements.

        Args:
            metrics: Evaluation metrics

        Returns:
            True if requirements met
        """
        logger.info("Checking deployment requirements...")

        deployment_config = self.config.get("deployment", {})
        requirements = deployment_config.get("requirements", {})

        passed = True

        for metric_name, min_value in requirements.items():
            if metric_name.startswith("min_"):
                actual_metric = metric_name.replace("min_", "")
                actual_value = metrics.get(actual_metric)

                if actual_value is None:
                    logger.warning(f"Metric {actual_metric} not found in results")
                    continue

                if actual_value < min_value:
                    logger.error(
                        f"Requirement not met: {actual_metric} = {actual_value:.4f} "
                        f"< {min_value:.4f}"
                    )
                    passed = False
                else:
                    logger.info(
                        f"✓ {actual_metric} = {actual_value:.4f} >= {min_value:.4f}"
                    )

        return passed

    def convert_to_tflite(
        self,
        model: keras.Model,
        output_path: Path
    ) -> Path:
        """Convert model to TFLite with quantization.

        Args:
            model: Trained Keras model
            output_path: Output path for TFLite model

        Returns:
            Path to TFLite model
        """
        logger.info("Converting model to TFLite...")

        export_config = self.config["export"]
        tflite_config = export_config.get("tflite", {})

        if not tflite_config.get("enabled", False):
            logger.info("TFLite conversion disabled in config")
            return None

        # Save as SavedModel first
        saved_model_dir = Path(export_config["saved_model_dir"])
        saved_model_dir.mkdir(parents=True, exist_ok=True)
        model.save(saved_model_dir)

        logger.info(f"Saved model to {saved_model_dir}")

        # Convert to TFLite
        converter = TFLiteConverter(str(saved_model_dir))

        # Configure quantization
        quant_config = tflite_config.get("quantization", {})
        if quant_config.get("enabled", False):
            quant_type = quant_config.get("type", "int8")
            rep_dataset_path = quant_config.get("representative_dataset")

            if rep_dataset_path and Path(rep_dataset_path).exists():
                logger.info(f"Using {quant_type} quantization")

                # Load representative dataset
                def representative_dataset():
                    dataset = keras.preprocessing.image_dataset_from_directory(
                        rep_dataset_path,
                        image_size=tuple(self.config["model"]["input_shape"][:2]),
                        batch_size=1,
                        shuffle=True
                    )

                    count = 0
                    max_samples = quant_config.get("representative_samples", 100)

                    for images, _ in dataset:
                        if count >= max_samples:
                            break
                        yield [images]
                        count += 1

                tflite_model = converter.convert(
                    quantize=True,
                    quantization_type=quant_type,
                    representative_dataset=representative_dataset
                )
            else:
                logger.warning(
                    "Representative dataset not found, using default quantization"
                )
                tflite_model = converter.convert(quantize=True)
        else:
            tflite_model = converter.convert(quantize=False)

        # Save TFLite model
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(tflite_model)

        logger.info(f"TFLite model saved to {output_path}")
        logger.info(f"Model size: {len(tflite_model) / 1024 / 1024:.2f} MB")

        return output_path

    def benchmark_tflite(self, tflite_path: Path) -> Dict:
        """Benchmark TFLite model inference time.

        Args:
            tflite_path: Path to TFLite model

        Returns:
            Benchmark results
        """
        logger.info("Benchmarking TFLite model...")

        # Load TFLite model
        interpreter = tf.lite.Interpreter(model_path=str(tflite_path))
        interpreter.allocate_tensors()

        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()

        # Generate random input
        input_shape = input_details[0]["shape"]
        input_data = np.random.rand(*input_shape).astype(np.float32)

        # Warm-up
        for _ in range(10):
            interpreter.set_tensor(input_details[0]["index"], input_data)
            interpreter.invoke()

        # Benchmark
        num_runs = 100
        times = []

        for _ in range(num_runs):
            start = time.perf_counter()
            interpreter.set_tensor(input_details[0]["index"], input_data)
            interpreter.invoke()
            end = time.perf_counter()
            times.append((end - start) * 1000)  # Convert to ms

        results = {
            "mean_ms": np.mean(times),
            "std_ms": np.std(times),
            "min_ms": np.min(times),
            "max_ms": np.max(times),
            "p50_ms": np.percentile(times, 50),
            "p95_ms": np.percentile(times, 95),
            "p99_ms": np.percentile(times, 99)
        }

        logger.info(f"Inference time: {results['mean_ms']:.2f} ± {results['std_ms']:.2f} ms")
        logger.info(f"P50: {results['p50_ms']:.2f} ms, P95: {results['p95_ms']:.2f} ms")

        return results

    def deploy_to_registry(
        self,
        tflite_path: Path,
        metrics: Dict,
        benchmark_results: Dict
    ) -> Optional[str]:
        """Deploy model to registry.

        Args:
            tflite_path: Path to TFLite model
            metrics: Evaluation metrics
            benchmark_results: Benchmark results

        Returns:
            Model version ID or None
        """
        if self.dry_run or not self.registry_client:
            logger.info("Skipping deployment (dry run or no registry)")
            return None

        logger.info("Deploying model to registry...")

        deployment_config = self.config["deployment"]

        # Upload model
        version_id = self.registry_client.upload_model(
            model_name=deployment_config["model_name"],
            version=deployment_config["version"],
            model_path=tflite_path,
            metadata={
                "architecture": self.config["model"]["architecture"],
                "input_shape": self.config["model"]["input_shape"],
                "description": deployment_config["description"],
                "metrics": metrics,
                "benchmark": benchmark_results,
                "training_config": self.config,
                "trained_at": datetime.utcnow().isoformat()
            }
        )

        logger.info(f"Model deployed with version ID: {version_id}")

        return version_id

    def save_results(self, output_dir: Path) -> None:
        """Save training results to disk.

        Args:
            output_dir: Output directory
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        results_file = output_dir / "training_results.json"

        with open(results_file, "w") as f:
            json.dump(self.results, f, indent=2, default=str)

        logger.info(f"Results saved to {results_file}")

    def run(self) -> bool:
        """Run complete training pipeline.

        Returns:
            True if successful
        """
        try:
            # 1. Validate dataset
            if not self.validate_dataset():
                logger.error("Dataset validation failed")
                return False

            # 2. Train model
            model, history = self.train_model()
            self.results["training_history"] = {
                k: [float(v) for v in vals]
                for k, vals in history.history.items()
            }

            # 3. Evaluate model
            metrics = self.evaluate_model(model)
            self.results["test_metrics"] = {
                k: float(v) if isinstance(v, (np.floating, np.integer)) else v
                for k, v in metrics.items()
            }

            # 4. Check requirements
            if not self.check_requirements(metrics):
                logger.error("Model does not meet minimum requirements")
                if not self.dry_run:
                    return False
                else:
                    logger.warning("Continuing in dry run mode...")

            # 5. Convert to TFLite
            export_config = self.config["export"]
            tflite_path = self.convert_to_tflite(
                model,
                export_config["tflite"]["output_path"]
            )

            if tflite_path:
                # 6. Benchmark TFLite model
                benchmark_results = self.benchmark_tflite(tflite_path)
                self.results["benchmark"] = benchmark_results

                # Check inference time requirement
                max_inference_time = self.config["deployment"]["requirements"].get(
                    "max_inference_time_ms"
                )
                if max_inference_time and benchmark_results["p95_ms"] > max_inference_time:
                    logger.error(
                        f"Inference time requirement not met: "
                        f"{benchmark_results['p95_ms']:.2f} ms > {max_inference_time} ms"
                    )
                    if not self.dry_run:
                        return False

                # 7. Deploy to registry
                version_id = self.deploy_to_registry(
                    tflite_path,
                    metrics,
                    benchmark_results
                )
                if version_id:
                    self.results["version_id"] = version_id

            # 8. Save results
            self.save_results(Path("training_results"))

            logger.info("Training pipeline completed successfully!")
            return True

        except Exception as e:
            logger.error(f"Training pipeline failed: {e}", exc_info=True)
            return False


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Production model training orchestrator"
    )
    parser.add_argument(
        "--config",
        type=str,
        required=True,
        help="Path to training configuration YAML"
    )
    parser.add_argument(
        "--registry-url",
        type=str,
        help="Model registry URL"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without deploying to registry"
    )

    args = parser.parse_args()

    orchestrator = ProductionTrainingOrchestrator(
        config_path=args.config,
        registry_url=args.registry_url,
        dry_run=args.dry_run
    )

    success = orchestrator.run()

    if not success:
        exit(1)


if __name__ == "__main__":
    main()
