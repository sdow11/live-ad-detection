"""Types and protocols for ML inference.

This module defines the core data structures and protocol interfaces
for ML-based ad detection.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Protocol, Tuple

import numpy as np
from pydantic import BaseModel, Field


class DetectionConfidence(str, Enum):
    """Confidence levels for ad detection."""

    HIGH = "high"  # > 0.9
    MEDIUM = "medium"  # 0.7 - 0.9
    LOW = "low"  # 0.5 - 0.7
    UNCERTAIN = "uncertain"  # < 0.5


@dataclass
class AdDetectionResult:
    """Result of ad detection inference.

    Attributes:
        is_ad: True if advertisement detected
        confidence: Confidence score (0.0 - 1.0)
        timestamp: When detection occurred
        frame_number: Frame number in sequence
        inference_time_ms: Time taken for inference
        model_version: Model version used
    """

    is_ad: bool
    confidence: float
    timestamp: datetime = field(default_factory=datetime.utcnow)
    frame_number: int = 0
    inference_time_ms: float = 0.0
    model_version: str = "unknown"

    def __post_init__(self) -> None:
        """Validate result after initialization."""
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(f"Confidence must be 0-1, got {self.confidence}")

    @property
    def confidence_level(self) -> DetectionConfidence:
        """Get confidence level category.

        Returns:
            Confidence level enum
        """
        if self.confidence >= 0.9:
            return DetectionConfidence.HIGH
        elif self.confidence >= 0.7:
            return DetectionConfidence.MEDIUM
        elif self.confidence >= 0.5:
            return DetectionConfidence.LOW
        else:
            return DetectionConfidence.UNCERTAIN


class PreprocessConfig(BaseModel):
    """Configuration for frame preprocessing."""

    target_size: Tuple[int, int] = Field(
        (224, 224), description="Target size for model input (width, height)"
    )
    normalize: bool = Field(True, description="Normalize pixel values to [0, 1]")
    mean: Tuple[float, float, float] = Field(
        (0.485, 0.456, 0.406), description="Mean for normalization (ImageNet default)"
    )
    std: Tuple[float, float, float] = Field(
        (0.229, 0.224, 0.225), description="Std for normalization (ImageNet default)"
    )
    resize_method: str = Field(
        "bilinear", description="Resize method (bilinear, nearest, cubic)"
    )
    convert_to_rgb: bool = Field(
        True, description="Convert BGR to RGB (for OpenCV frames)"
    )


class InferenceConfig(BaseModel):
    """Configuration for ML inference."""

    model_path: str = Field(..., description="Path to model file")
    num_threads: int = Field(4, ge=1, le=8, description="Number of CPU threads")
    use_gpu: bool = Field(False, description="Use GPU acceleration if available")
    confidence_threshold: float = Field(
        0.5, ge=0.0, le=1.0, description="Minimum confidence for positive detection"
    )
    batch_size: int = Field(1, ge=1, le=32, description="Batch size for inference")


class ModelProtocol(Protocol):
    """Protocol for ML model implementations."""

    async def initialize(self) -> None:
        """Initialize the model.

        Raises:
            RuntimeError: If initialization fails
        """
        ...

    async def predict(self, input_data: np.ndarray) -> np.ndarray:
        """Run inference on input data.

        Args:
            input_data: Preprocessed input array

        Returns:
            Model output array

        Raises:
            RuntimeError: If inference fails
        """
        ...

    async def is_ready(self) -> bool:
        """Check if model is ready for inference.

        Returns:
            True if model is loaded and ready
        """
        ...

    @property
    def input_shape(self) -> Tuple[int, ...]:
        """Get expected input shape."""
        ...

    @property
    def output_shape(self) -> Tuple[int, ...]:
        """Get output shape."""
        ...


@dataclass
class DetectionStats:
    """Statistics for ad detection over time."""

    total_frames: int = 0
    ad_frames: int = 0
    content_frames: int = 0
    avg_confidence: float = 0.0
    avg_inference_time_ms: float = 0.0

    @property
    def ad_ratio(self) -> float:
        """Calculate ratio of ad frames to total frames."""
        return self.ad_frames / self.total_frames if self.total_frames > 0 else 0.0

    @property
    def content_ratio(self) -> float:
        """Calculate ratio of content frames to total frames."""
        return (
            self.content_frames / self.total_frames if self.total_frames > 0 else 0.0
        )
