"""Video passthrough pipeline for live TV processing.

This module implements the core pipeline that captures video, processes it,
and outputs it with minimal latency.
"""

import asyncio
import logging
import time
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from video.types import (
    VideoCaptureProtocol,
    VideoMode,
    VideoOutputProtocol,
    VideoStats,
)

logger = logging.getLogger(__name__)


class PipelineConfig(BaseModel):
    """Configuration for video pipeline."""

    mode: VideoMode = Field(
        VideoMode.FHD_1080P_60, description="Video mode for pipeline"
    )
    enable_stats: bool = Field(True, description="Enable statistics collection")
    stats_interval_sec: float = Field(
        5.0, ge=1.0, description="Statistics reporting interval"
    )
    max_latency_ms: float = Field(
        100.0, ge=1.0, description="Maximum acceptable latency"
    )


class PassthroughPipeline:
    """Basic video passthrough pipeline.

    Captures frames from input, optionally processes them, and displays
    on output with minimal latency.

    Example:
        >>> capture = MockVideoCapture(config)
        >>> output = MockVideoOutput(config)
        >>> pipeline = PassthroughPipeline(capture, output)
        >>> await pipeline.initialize()
        >>> await pipeline.run()
    """

    def __init__(
        self,
        capture: VideoCaptureProtocol,
        output: VideoOutputProtocol,
        config: Optional[PipelineConfig] = None,
    ) -> None:
        """Initialize pipeline.

        Args:
            capture: Video capture source
            output: Video output destination
            config: Pipeline configuration
        """
        self.capture = capture
        self.output = output
        self.config = config or PipelineConfig()

        self._running = False
        self._stop_event = asyncio.Event()

        # Statistics
        self._frames_captured = 0
        self._frames_displayed = 0
        self._frames_dropped = 0
        self._latencies_ms: list[float] = []
        self._start_time: Optional[float] = None
        self._last_stats_time: Optional[float] = None

    async def initialize(self) -> None:
        """Initialize the pipeline."""
        logger.info(f"Initializing pipeline: {self.config.mode.value}")

        # Initialize capture and output
        await self.capture.initialize()
        await self.output.initialize()

        # Verify both are available
        if not await self.capture.is_available():
            raise RuntimeError("Video capture not available")

        if not await self.output.is_available():
            raise RuntimeError("Video output not available")

        logger.info("Pipeline initialized successfully")

    async def process_single_frame(self) -> None:
        """Capture and display a single frame.

        This is the core processing loop for one frame.

        Raises:
            RuntimeError: If capture or display fails
        """
        capture_start = time.time()

        # Capture frame
        frame = await self.capture.capture_frame()
        self._frames_captured += 1

        # Calculate capture latency
        capture_time = time.time()
        capture_latency = (capture_time - capture_start) * 1000

        # Display frame
        await self.output.display_frame(frame)
        self._frames_displayed += 1

        # Calculate total latency (capture + display)
        total_latency = (time.time() - capture_start) * 1000

        # Track latency statistics
        if self.config.enable_stats:
            self._latencies_ms.append(total_latency)

            # Warn if latency is too high
            if total_latency > self.config.max_latency_ms:
                logger.warning(
                    f"High latency detected: {total_latency:.1f}ms "
                    f"(max: {self.config.max_latency_ms}ms)"
                )

    async def run(self) -> None:
        """Run the pipeline continuously until stopped.

        This is the main pipeline loop. It will run until stop() is called.
        """
        logger.info("Starting pipeline")

        self._running = True
        self._stop_event.clear()
        self._start_time = time.time()
        self._last_stats_time = time.time()

        try:
            while self._running and not self._stop_event.is_set():
                try:
                    # Process one frame
                    await self.process_single_frame()

                    # Report stats periodically
                    if self.config.enable_stats:
                        await self._report_stats_if_needed()

                except Exception as e:
                    logger.error(f"Error processing frame: {e}")
                    self._frames_dropped += 1
                    # Re-raise for caller to handle
                    raise

        finally:
            self._running = False
            logger.info("Pipeline stopped")

            # Final stats report
            if self.config.enable_stats:
                self._log_stats()

    async def stop(self) -> None:
        """Stop the pipeline gracefully."""
        if self._running:
            logger.info("Stopping pipeline...")
            self._running = False
            self._stop_event.set()

    async def _report_stats_if_needed(self) -> None:
        """Report statistics if interval has elapsed."""
        if self._last_stats_time is None:
            return

        elapsed = time.time() - self._last_stats_time

        if elapsed >= self.config.stats_interval_sec:
            self._log_stats()
            self._last_stats_time = time.time()

    def _log_stats(self) -> None:
        """Log current pipeline statistics."""
        stats = self.get_stats()

        logger.info(
            f"Pipeline stats: {stats.frames_captured} captured, "
            f"{stats.frames_displayed} displayed, "
            f"{stats.frames_dropped} dropped "
            f"({stats.drop_rate * 100:.1f}% drop rate), "
            f"{stats.average_fps:.1f} FPS, "
            f"latency: {stats.average_latency_ms:.1f}ms avg "
            f"({stats.min_latency_ms:.1f}-{stats.max_latency_ms:.1f}ms)"
        )

    def get_stats(self) -> VideoStats:
        """Get current pipeline statistics.

        Returns:
            Current pipeline statistics
        """
        # Calculate FPS
        fps = 0.0
        if self._start_time is not None:
            elapsed = time.time() - self._start_time
            if elapsed > 0:
                fps = self._frames_displayed / elapsed

        # Calculate latency stats
        avg_latency = 0.0
        min_latency = 0.0
        max_latency = 0.0

        if self._latencies_ms:
            avg_latency = sum(self._latencies_ms) / len(self._latencies_ms)
            min_latency = min(self._latencies_ms)
            max_latency = max(self._latencies_ms)

        return VideoStats(
            frames_captured=self._frames_captured,
            frames_dropped=self._frames_dropped,
            frames_displayed=self._frames_displayed,
            average_fps=fps,
            average_latency_ms=avg_latency,
            min_latency_ms=min_latency,
            max_latency_ms=max_latency,
        )

    @property
    def is_running(self) -> bool:
        """Check if pipeline is currently running.

        Returns:
            True if pipeline is running
        """
        return self._running
