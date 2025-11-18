"""Ad detection engine with temporal smoothing.

This module provides the main ad detection functionality, combining
frame preprocessing, ML inference, and temporal smoothing to reduce
false positives.
"""

import asyncio
import logging
import time
from collections import deque
from datetime import datetime
from typing import Deque, Optional

from pydantic import BaseModel, Field

from ml.inference import MockModel, TFLiteModel
from ml.preprocessor import FramePreprocessor
from ml.types import (
    AdDetectionResult,
    DetectionStats,
    InferenceConfig,
    ModelProtocol,
    PreprocessConfig,
)
from video.types import Frame

logger = logging.getLogger(__name__)


class DetectorConfig(BaseModel):
    """Configuration for ad detector."""

    model_path: str = Field(..., description="Path to TFLite model")
    confidence_threshold: float = Field(
        0.5, ge=0.0, le=1.0, description="Confidence threshold for ad detection"
    )
    temporal_window: int = Field(
        5, ge=1, le=30, description="Number of frames for temporal smoothing"
    )
    temporal_threshold: float = Field(
        0.6,
        ge=0.0,
        le=1.0,
        description="Ratio of positive frames needed in temporal window",
    )
    num_threads: int = Field(4, ge=1, le=8, description="Number of inference threads")
    preprocess_config: Optional[PreprocessConfig] = Field(
        None, description="Custom preprocessing config"
    )


class AdDetector:
    """Ad detection engine with temporal smoothing.

    Combines frame preprocessing, ML inference, and temporal smoothing
    to detect advertisements in video streams with high accuracy and
    low false positive rate.

    Example:
        >>> config = DetectorConfig(
        ...     model_path="models/ad_detector.tflite",
        ...     confidence_threshold=0.7,
        ...     temporal_window=5
        ... )
        >>> detector = AdDetector(config)
        >>> await detector.initialize()
        >>> result = await detector.detect(frame)
        >>> print(f"Ad detected: {result.is_ad}")
    """

    def __init__(
        self,
        config: DetectorConfig,
        use_mock_model: bool = False,
        mock_fixed_output: Optional[float] = None,
    ) -> None:
        """Initialize ad detector.

        Args:
            config: Detector configuration
            use_mock_model: If True, use mock model instead of TFLite
            mock_fixed_output: Fixed output for deterministic mock model
        """
        self.config = config

        # Create preprocessor
        preprocess_config = config.preprocess_config or PreprocessConfig()
        self._preprocessor = FramePreprocessor(preprocess_config)

        # Create model
        inference_config = InferenceConfig(
            model_path=config.model_path,
            num_threads=config.num_threads,
            confidence_threshold=config.confidence_threshold,
        )

        if use_mock_model:
            # Use mock model for testing
            self._model: ModelProtocol = MockModel(
                inference_config,
                deterministic=mock_fixed_output is not None,
                fixed_output=mock_fixed_output or 0.5,
            )
            # Store reference for test manipulation
            self._mock_model = self._model
        else:
            # Use real TFLite model
            self._model = TFLiteModel(inference_config)

        # State
        self._initialized = False
        self._detection_history: Deque[bool] = deque(
            maxlen=config.temporal_window
        )

        # Statistics
        self._stats = DetectionStats()
        self._inference_times: list[float] = []

    async def initialize(self) -> None:
        """Initialize the detector."""
        logger.info("Initializing ad detector")

        # Initialize model
        await self._model.initialize()

        self._initialized = True
        logger.info("Ad detector initialized successfully")

    async def detect(self, frame: Frame) -> AdDetectionResult:
        """Detect if frame contains an advertisement.

        Args:
            frame: Video frame to analyze

        Returns:
            Detection result with confidence and metadata

        Raises:
            RuntimeError: If not initialized
        """
        if not self._initialized:
            raise RuntimeError("Detector not initialized")

        start_time = time.time()

        # Preprocess frame
        preprocessed = self._preprocessor.preprocess(frame)

        # Add batch dimension
        input_data = self._preprocessor.add_batch_dimension(preprocessed)

        # Run inference
        output = await self._model.predict(input_data)

        # Extract confidence (assumes binary classification with single output)
        confidence = float(output[0, 0])

        # Calculate inference time
        inference_time_ms = (time.time() - start_time) * 1000

        # Apply confidence threshold
        is_ad_raw = confidence >= self.config.confidence_threshold

        # Apply temporal smoothing
        self._detection_history.append(is_ad_raw)
        is_ad_smoothed = self._apply_temporal_smoothing()

        # Create result
        result = AdDetectionResult(
            is_ad=is_ad_smoothed,
            confidence=confidence,
            timestamp=datetime.utcnow(),
            frame_number=frame.metadata.frame_number,
            inference_time_ms=inference_time_ms,
            model_version="v1.0",  # TODO: Get from model metadata
        )

        # Update statistics
        self._update_stats(result)

        logger.debug(
            f"Frame {frame.metadata.frame_number}: "
            f"{'AD' if result.is_ad else 'CONTENT'} "
            f"(confidence: {confidence:.3f}, "
            f"inference: {inference_time_ms:.1f}ms)"
        )

        return result

    def _apply_temporal_smoothing(self) -> bool:
        """Apply temporal smoothing to reduce false positives.

        Returns:
            Smoothed detection result
        """
        if len(self._detection_history) == 0:
            return False

        # Calculate ratio of positive detections in window
        positive_count = sum(self._detection_history)
        positive_ratio = positive_count / len(self._detection_history)

        # Apply threshold
        return positive_ratio >= self.config.temporal_threshold

    def _update_stats(self, result: AdDetectionResult) -> None:
        """Update detection statistics.

        Args:
            result: Detection result
        """
        self._stats.total_frames += 1

        if result.is_ad:
            self._stats.ad_frames += 1
        else:
            self._stats.content_frames += 1

        # Track inference time
        self._inference_times.append(result.inference_time_ms)

        # Update averages
        if len(self._inference_times) > 0:
            self._stats.avg_inference_time_ms = sum(self._inference_times) / len(
                self._inference_times
            )

        # Calculate running average confidence
        # (simplified - could use exponential moving average)
        total_confidence = (
            self._stats.avg_confidence * (self._stats.total_frames - 1)
            + result.confidence
        )
        self._stats.avg_confidence = total_confidence / self._stats.total_frames

    def get_stats(self) -> DetectionStats:
        """Get detection statistics.

        Returns:
            Current detection statistics
        """
        return self._stats

    def reset_stats(self) -> None:
        """Reset detection statistics."""
        self._stats = DetectionStats()
        self._inference_times.clear()
        logger.info("Detection statistics reset")

    @property
    def is_ready(self) -> bool:
        """Check if detector is ready.

        Returns:
            True if initialized and ready
        """
        return self._initialized
