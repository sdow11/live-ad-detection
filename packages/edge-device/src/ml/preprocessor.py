"""Frame preprocessing for ML inference.

This module provides frame preprocessing functionality to prepare video
frames for ML model input.
"""

import logging
from typing import List

import cv2
import numpy as np

from ml.types import PreprocessConfig
from video.types import Frame

logger = logging.getLogger(__name__)


class FramePreprocessor:
    """Preprocesses video frames for ML model input.

    Handles resizing, normalization, color space conversion, and other
    preprocessing steps required by ML models.

    Example:
        >>> config = PreprocessConfig(target_size=(224, 224))
        >>> preprocessor = FramePreprocessor(config)
        >>> processed = preprocessor.preprocess(frame)
        >>> print(processed.shape)  # (224, 224, 3)
    """

    def __init__(self, config: PreprocessConfig) -> None:
        """Initialize preprocessor.

        Args:
            config: Preprocessing configuration
        """
        self.config = config

        # Map resize method string to OpenCV constant
        self._resize_methods = {
            "bilinear": cv2.INTER_LINEAR,
            "nearest": cv2.INTER_NEAREST,
            "cubic": cv2.INTER_CUBIC,
            "lanczos": cv2.INTER_LANCZOS4,
        }

    def preprocess(self, frame: Frame) -> np.ndarray:
        """Preprocess a single frame for model input.

        Args:
            frame: Input video frame

        Returns:
            Preprocessed frame array ready for model input
        """
        # Start with frame data
        data = frame.data.copy()

        # Handle grayscale -> RGB conversion
        if data.ndim == 2:
            data = cv2.cvtColor(data, cv2.COLOR_GRAY2RGB)

        # Convert BGR to RGB if needed (OpenCV uses BGR)
        if self.config.convert_to_rgb:
            data = cv2.cvtColor(data, cv2.COLOR_BGR2RGB)

        # Resize to target size
        if data.shape[:2] != self.config.target_size[::-1]:  # OpenCV uses (H, W)
            resize_method = self._resize_methods.get(
                self.config.resize_method, cv2.INTER_LINEAR
            )
            data = cv2.resize(
                data,
                self.config.target_size,  # OpenCV resize takes (W, H)
                interpolation=resize_method,
            )

        # Normalize if requested
        if self.config.normalize:
            # Convert to float32 and scale to [0, 1]
            data = data.astype(np.float32) / 255.0

            # Apply ImageNet normalization (subtract mean, divide by std)
            mean = np.array(self.config.mean, dtype=np.float32)
            std = np.array(self.config.std, dtype=np.float32)

            data = (data - mean) / std

        return data

    def preprocess_batch(self, frames: List[Frame]) -> np.ndarray:
        """Preprocess multiple frames as a batch.

        Args:
            frames: List of video frames

        Returns:
            Batch array of shape (N, H, W, C)
        """
        processed_frames = [self.preprocess(frame) for frame in frames]
        return np.stack(processed_frames, axis=0)

    def add_batch_dimension(self, data: np.ndarray) -> np.ndarray:
        """Add batch dimension to preprocessed frame.

        Args:
            data: Preprocessed frame array (H, W, C)

        Returns:
            Array with batch dimension (1, H, W, C)
        """
        return np.expand_dims(data, axis=0)

    def remove_batch_dimension(self, data: np.ndarray) -> np.ndarray:
        """Remove batch dimension from output.

        Args:
            data: Batched array (1, H, W, C) or (1, N)

        Returns:
            Array without batch dimension
        """
        if data.shape[0] == 1:
            return data[0]
        return data

    def denormalize(self, data: np.ndarray) -> np.ndarray:
        """Reverse normalization for visualization.

        Args:
            data: Normalized array

        Returns:
            Denormalized array in [0, 255] range
        """
        if not self.config.normalize:
            return data

        # Reverse standardization
        mean = np.array(self.config.mean, dtype=np.float32)
        std = np.array(self.config.std, dtype=np.float32)

        data = (data * std) + mean

        # Scale back to [0, 255]
        data = (data * 255.0).clip(0, 255).astype(np.uint8)

        return data
