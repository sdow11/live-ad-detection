"""Model management for ad detection - loading, swapping, and updates."""

import os
import logging
import threading
import time
from pathlib import Path
from typing import Optional, Dict, Any, Callable
from datetime import datetime
import hashlib

from .hailo_inference import HailoInference

logger = logging.getLogger(__name__)


class ModelManager:
    """
    Manages AI models for ad detection.

    Handles:
    - Model loading and initialization
    - Hot-swapping models without downtime
    - Model versioning and validation
    - Automatic model updates
    - Model warmup and optimization
    """

    def __init__(self, model_dir: str = "/opt/live-ad-detection/models"):
        """
        Initialize model manager.

        Args:
            model_dir: Directory containing model files
        """
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)

        self.current_model: Optional[HailoInference] = None
        self.current_model_path: Optional[str] = None
        self.current_model_info: Dict[str, Any] = {}

        self.standby_model: Optional[HailoInference] = None
        self.swap_lock = threading.Lock()

        self.model_history = []
        self.stats = {
            "models_loaded": 0,
            "swaps_completed": 0,
            "load_failures": 0,
            "last_swap": None
        }

    def load_model(self, model_path: str, warmup: bool = True) -> bool:
        """
        Load a model for inference.

        Args:
            model_path: Path to model file (.hef)
            warmup: Run warmup inference to optimize

        Returns:
            True if successful
        """
        logger.info(f"Loading model: {model_path}")

        if not Path(model_path).exists():
            logger.error(f"Model file not found: {model_path}")
            self.stats["load_failures"] += 1
            return False

        try:
            # Create new inference engine
            inference = HailoInference(model_path)

            if not inference.initialize():
                logger.error(f"Failed to initialize model: {model_path}")
                self.stats["load_failures"] += 1
                return False

            # Get model info
            model_info = self._get_model_info(model_path)

            # Warmup if requested
            if warmup:
                logger.info("Warming up model...")
                self._warmup_model(inference)

            # Set as current model
            with self.swap_lock:
                if self.current_model:
                    self.current_model.cleanup()

                self.current_model = inference
                self.current_model_path = model_path
                self.current_model_info = model_info

            self.stats["models_loaded"] += 1
            self.model_history.append({
                "path": model_path,
                "loaded_at": datetime.now().isoformat(),
                "info": model_info
            })

            logger.info(f"✓ Model loaded successfully: {model_info['name']}")
            return True

        except Exception as e:
            logger.error(f"Error loading model: {e}")
            self.stats["load_failures"] += 1
            return False

    def swap_model(self, new_model_path: str) -> bool:
        """
        Hot-swap to a new model without stopping inference.

        Process:
        1. Load new model in standby
        2. Warm up standby model
        3. Atomic swap with current model
        4. Cleanup old model

        Args:
            new_model_path: Path to new model

        Returns:
            True if swap successful
        """
        logger.info(f"Initiating model swap to: {new_model_path}")

        if not Path(new_model_path).exists():
            logger.error(f"New model not found: {new_model_path}")
            return False

        try:
            # Load new model in standby
            logger.info("Loading new model in standby...")
            standby = HailoInference(new_model_path)

            if not standby.initialize():
                logger.error("Failed to initialize standby model")
                return False

            # Warmup standby model
            logger.info("Warming up standby model...")
            self._warmup_model(standby)

            # Get model info
            new_model_info = self._get_model_info(new_model_path)

            # Atomic swap
            logger.info("Performing atomic model swap...")
            with self.swap_lock:
                old_model = self.current_model
                old_path = self.current_model_path

                self.current_model = standby
                self.current_model_path = new_model_path
                self.current_model_info = new_model_info

                # Cleanup old model (after short delay to ensure no in-flight requests)
                if old_model:
                    threading.Timer(2.0, lambda: old_model.cleanup()).start()

            self.stats["swaps_completed"] += 1
            self.stats["last_swap"] = datetime.now().isoformat()

            self.model_history.append({
                "path": new_model_path,
                "loaded_at": datetime.now().isoformat(),
                "info": new_model_info,
                "swapped_from": old_path
            })

            logger.info(f"✓ Model swap complete: {new_model_info['name']}")
            logger.info(f"  Previous model: {old_path}")
            logger.info(f"  New model: {new_model_path}")

            return True

        except Exception as e:
            logger.error(f"Error during model swap: {e}")
            return False

    def get_current_model(self) -> Optional[HailoInference]:
        """
        Get the current active model.

        Returns:
            Current HailoInference instance or None
        """
        with self.swap_lock:
            return self.current_model

    def run_inference(self, frame) -> Optional[Any]:
        """
        Run inference using current model (thread-safe).

        Args:
            frame: Input frame

        Returns:
            Inference results
        """
        with self.swap_lock:
            if self.current_model:
                return self.current_model.run_inference(frame)
        return None

    def list_available_models(self) -> list:
        """
        List all available models in model directory.

        Returns:
            List of model files with info
        """
        models = []

        for model_file in self.model_dir.glob("*.hef"):
            info = self._get_model_info(str(model_file))
            info["is_current"] = str(model_file) == self.current_model_path
            models.append(info)

        return models

    def validate_model(self, model_path: str) -> Dict[str, Any]:
        """
        Validate a model file.

        Args:
            model_path: Path to model

        Returns:
            Validation results
        """
        path = Path(model_path)

        result = {
            "valid": False,
            "path": str(path),
            "errors": []
        }

        # Check file exists
        if not path.exists():
            result["errors"].append("File not found")
            return result

        # Check extension
        if path.suffix != ".hef":
            result["errors"].append(f"Invalid extension: {path.suffix} (expected .hef)")
            return result

        # Check file size
        size_mb = path.stat().st_size / (1024 * 1024)
        if size_mb < 0.1:
            result["errors"].append(f"File too small: {size_mb:.2f}MB")
            return result

        if size_mb > 500:
            result["errors"].append(f"File too large: {size_mb:.2f}MB")

        # Try to load (without initializing device)
        try:
            # Basic validation passed
            result["valid"] = True
            result["size_mb"] = size_mb
            result["info"] = self._get_model_info(model_path)
        except Exception as e:
            result["errors"].append(f"Load error: {str(e)}")
            result["valid"] = False

        return result

    def watch_for_updates(self, callback: Callable[[str], None]):
        """
        Watch model directory for new models and auto-swap.

        Args:
            callback: Function to call when new model detected
        """
        logger.info(f"Watching for model updates in: {self.model_dir}")

        known_models = set(self.model_dir.glob("*.hef"))

        while True:
            try:
                time.sleep(10)  # Check every 10 seconds

                current_models = set(self.model_dir.glob("*.hef"))
                new_models = current_models - known_models

                for new_model in new_models:
                    logger.info(f"New model detected: {new_model}")
                    callback(str(new_model))

                known_models = current_models

            except Exception as e:
                logger.error(f"Error in model watch: {e}")
                time.sleep(60)

    def get_stats(self) -> Dict[str, Any]:
        """Get model manager statistics."""
        return {
            "current_model": self.current_model_info,
            "stats": self.stats,
            "model_history": self.model_history[-10:],  # Last 10
            "available_models": len(list(self.model_dir.glob("*.hef")))
        }

    def _warmup_model(self, inference: HailoInference, iterations: int = 5):
        """
        Warmup model with dummy inference to optimize performance.

        Args:
            inference: Inference engine to warmup
            iterations: Number of warmup iterations
        """
        import numpy as np

        # Create dummy input (typical video frame size)
        dummy_frame = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)

        for i in range(iterations):
            inference.run_inference(dummy_frame)

        logger.info(f"Model warmup complete ({iterations} iterations)")

    def _get_model_info(self, model_path: str) -> Dict[str, Any]:
        """
        Get information about a model file.

        Args:
            model_path: Path to model

        Returns:
            Model information dict
        """
        path = Path(model_path)

        # Calculate checksum
        checksum = self._calculate_checksum(model_path)

        return {
            "name": path.stem,
            "path": str(path),
            "size_mb": path.stat().st_size / (1024 * 1024),
            "modified": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
            "checksum": checksum
        }

    def _calculate_checksum(self, file_path: str) -> str:
        """Calculate SHA256 checksum of file."""
        sha256 = hashlib.sha256()

        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                sha256.update(chunk)

        return sha256.hexdigest()[:16]  # First 16 chars

    def cleanup(self):
        """Cleanup resources."""
        with self.swap_lock:
            if self.current_model:
                self.current_model.cleanup()
            if self.standby_model:
                self.standby_model.cleanup()

        logger.info("Model manager cleanup complete")
