"""Telemetry aggregation for cloud reporting.

Aggregates ad detection statistics and performance metrics over time
for periodic reporting to the cloud API.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


logger = logging.getLogger(__name__)


class TelemetryPeriod(BaseModel):
    """Telemetry data for a reporting period."""

    period_start: datetime
    period_end: datetime

    # Ad detection statistics
    total_ad_breaks: int = 0
    total_ad_duration_seconds: float = 0.0
    total_content_duration_seconds: float = 0.0

    # Performance metrics
    total_frames_processed: int = 0
    total_frames_dropped: int = 0
    average_fps: float = 0.0
    average_latency_ms: float = 0.0

    # ML inference stats
    total_inferences: int = 0
    average_inference_time_ms: float = 0.0
    average_confidence: float = 0.0


class TelemetryAggregator:
    """Aggregates telemetry data over time for cloud reporting.

    Collects ad detection and performance metrics from the video pipeline
    and aggregates them for periodic submission to the cloud API.

    Example:
        >>> aggregator = TelemetryAggregator()
        >>> aggregator.record_ad_break(duration_seconds=30.0)
        >>> aggregator.record_frame(fps=30.0, latency_ms=75.0)
        >>> telemetry = aggregator.get_and_reset()
    """

    def __init__(self) -> None:
        """Initialize telemetry aggregator."""
        self._period_start = datetime.now(timezone.utc)
        self._current_period = TelemetryPeriod(
            period_start=self._period_start,
            period_end=self._period_start
        )

        # Accumulators for averaging
        self._fps_samples: list[float] = []
        self._latency_samples: list[float] = []
        self._inference_time_samples: list[float] = []
        self._confidence_samples: list[float] = []

        # Ad break tracking
        self._in_ad_break = False
        self._ad_break_start: Optional[datetime] = None

    def record_ad_start(self) -> None:
        """Record the start of an ad break."""
        if not self._in_ad_break:
            self._in_ad_break = True
            self._ad_break_start = datetime.now(timezone.utc)
            self._current_period.total_ad_breaks += 1
            logger.debug("Ad break started")

    def record_ad_end(self) -> None:
        """Record the end of an ad break."""
        if self._in_ad_break and self._ad_break_start:
            duration = (datetime.now(timezone.utc) - self._ad_break_start).total_seconds()
            self._current_period.total_ad_duration_seconds += duration
            self._in_ad_break = False
            self._ad_break_start = None
            logger.debug(f"Ad break ended (duration: {duration:.1f}s)")

    def record_content_duration(self, duration_seconds: float) -> None:
        """Record content (non-ad) duration.

        Args:
            duration_seconds: Duration of content playback
        """
        self._current_period.total_content_duration_seconds += duration_seconds

    def record_frame(
        self,
        fps: Optional[float] = None,
        latency_ms: Optional[float] = None,
        dropped: bool = False
    ) -> None:
        """Record frame processing metrics.

        Args:
            fps: Current FPS
            latency_ms: Frame latency in milliseconds
            dropped: Whether frame was dropped
        """
        self._current_period.total_frames_processed += 1

        if dropped:
            self._current_period.total_frames_dropped += 1

        if fps is not None:
            self._fps_samples.append(fps)

        if latency_ms is not None:
            self._latency_samples.append(latency_ms)

    def record_inference(
        self,
        inference_time_ms: float,
        confidence: float
    ) -> None:
        """Record ML inference metrics.

        Args:
            inference_time_ms: Inference time in milliseconds
            confidence: Detection confidence (0.0-1.0)
        """
        self._current_period.total_inferences += 1
        self._inference_time_samples.append(inference_time_ms)
        self._confidence_samples.append(confidence)

    def get_current_period(self) -> TelemetryPeriod:
        """Get current period telemetry without resetting.

        Returns:
            Current telemetry period
        """
        period = self._current_period.model_copy()
        period.period_end = datetime.now(timezone.utc)

        # Calculate averages
        if self._fps_samples:
            period.average_fps = sum(self._fps_samples) / len(self._fps_samples)

        if self._latency_samples:
            period.average_latency_ms = sum(self._latency_samples) / len(self._latency_samples)

        if self._inference_time_samples:
            period.average_inference_time_ms = (
                sum(self._inference_time_samples) / len(self._inference_time_samples)
            )

        if self._confidence_samples:
            period.average_confidence = (
                sum(self._confidence_samples) / len(self._confidence_samples)
            )

        return period

    def get_and_reset(self) -> TelemetryPeriod:
        """Get current period telemetry and reset for new period.

        Returns:
            Completed telemetry period
        """
        period = self.get_current_period()

        # Reset for new period
        self._period_start = datetime.now(timezone.utc)
        self._current_period = TelemetryPeriod(
            period_start=self._period_start,
            period_end=self._period_start
        )

        # Clear accumulators
        self._fps_samples.clear()
        self._latency_samples.clear()
        self._inference_time_samples.clear()
        self._confidence_samples.clear()

        # Don't reset ad break state (might be ongoing)

        logger.info(
            f"Telemetry period complete: {period.total_ad_breaks} ad breaks, "
            f"{period.total_frames_processed} frames processed"
        )

        return period

    def reset(self) -> None:
        """Reset all telemetry data."""
        self._period_start = datetime.now(timezone.utc)
        self._current_period = TelemetryPeriod(
            period_start=self._period_start,
            period_end=self._period_start
        )

        self._fps_samples.clear()
        self._latency_samples.clear()
        self._inference_time_samples.clear()
        self._confidence_samples.clear()

        self._in_ad_break = False
        self._ad_break_start = None

        logger.info("Telemetry aggregator reset")
