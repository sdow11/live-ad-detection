"""Integrated pipeline with TV control, ML detection, and PiP.

This module integrates all components into a production-ready system:
- Video capture and passthrough
- ML-based ad detection
- PiP composition with alternate content
- TV control (channel change or input switching)
- Cloud reporting (optional)
"""

import asyncio
import logging
from enum import Enum
from typing import Optional

from compositor import VideoCompositor, CompositorConfig, ContentSource
from compositor.content_source import ColorBarsSource
from cloud_reporter import CloudReporter
from ml.detector import DetectorConfig
from ml.types import AdDetectionResult
from tv_control import TVCommand, TVControllerConfig
from tv_control.controller import UnifiedTVController, create_tv_controller
from video.pip_pipeline import PiPPipeline
from video.pipeline import PipelineConfig
from video.types import VideoCaptureProtocol, VideoOutputProtocol

logger = logging.getLogger(__name__)


class AdResponseStrategy(str, Enum):
    """Strategy for responding to detected ads."""

    PIP_ONLY = "pip_only"  # Just show alternate content in PiP
    CHANNEL_CHANGE = "channel_change"  # Change to alternate channel
    INPUT_SWITCH = "input_switch"  # Switch TV input
    PIP_WITH_MUTE = "pip_with_mute"  # PiP + mute TV audio


class IntegratedPipeline(PiPPipeline):
    """Complete integrated pipeline with TV control.

    Combines video processing, ML detection, PiP composition, and TV control
    into a single production-ready system.

    Example:
        >>> pipeline = IntegratedPipeline(
        ...     capture=capture,
        ...     output=output,
        ...     tv_controller=tv_controller,
        ...     alternate_channel="5-1",  # Alternate channel during ads
        ...     strategy=AdResponseStrategy.CHANNEL_CHANGE
        ... )
        >>> await pipeline.initialize()
        >>> await pipeline.run()
    """

    def __init__(
        self,
        capture: VideoCaptureProtocol,
        output: VideoOutputProtocol,
        tv_controller: Optional[UnifiedTVController] = None,
        cloud_reporter: Optional[CloudReporter] = None,
        alternate_content: Optional[ContentSource] = None,
        alternate_channel: Optional[str] = None,
        original_channel: Optional[str] = None,
        strategy: AdResponseStrategy = AdResponseStrategy.PIP_ONLY,
        pipeline_config: Optional[PipelineConfig] = None,
        detector_config: Optional[DetectorConfig] = None,
        compositor_config: Optional[CompositorConfig] = None,
        use_mock_model: bool = False,
    ) -> None:
        """Initialize integrated pipeline.

        Args:
            capture: Video capture source
            output: Video output destination
            tv_controller: TV controller (optional)
            cloud_reporter: Cloud reporter for telemetry (optional)
            alternate_content: Alternate content source
            alternate_channel: Channel to switch to during ads
            original_channel: Original channel to restore
            strategy: Ad response strategy
            pipeline_config: Pipeline configuration
            detector_config: Ad detector configuration
            compositor_config: Compositor configuration
            use_mock_model: Use mock ML model
        """
        super().__init__(
            capture=capture,
            output=output,
            alternate_content=alternate_content,
            pipeline_config=pipeline_config,
            detector_config=detector_config,
            compositor_config=compositor_config,
            use_mock_model=use_mock_model,
        )

        self.tv_controller = tv_controller
        self.cloud_reporter = cloud_reporter
        self.alternate_channel = alternate_channel
        self.original_channel = original_channel
        self.strategy = strategy

        # TV control state
        self._tv_muted = False
        self._tv_channel_changed = False

    async def initialize(self) -> None:
        """Initialize the integrated pipeline."""
        # Initialize base PiP pipeline
        await super().initialize()

        # Initialize TV controller if provided
        if self.tv_controller:
            available_methods = await self.tv_controller.get_available_methods()
            logger.info(
                f"TV controller initialized with methods: {available_methods}"
            )

        # Start cloud reporter if provided
        if self.cloud_reporter:
            await self.cloud_reporter.start()
            logger.info("Cloud reporter started")

        logger.info(
            f"Integrated pipeline initialized with strategy: {self.strategy.value}"
        )

    async def process_single_frame(self) -> None:
        """Process single frame with cloud telemetry recording.

        Extends parent to record telemetry data for cloud reporting.
        """
        # Process frame using parent implementation
        await super().process_single_frame()

        # Record telemetry if cloud reporter is enabled
        if self.cloud_reporter:
            # Get pipeline stats
            stats = self.get_stats()

            # Record frame metrics
            self.cloud_reporter.telemetry.record_frame(
                fps=stats.average_fps if stats.average_fps > 0 else None,
                latency_ms=stats.average_latency_ms if stats.average_latency_ms > 0 else None,
                dropped=(stats.drop_rate > 0)
            )

            # Record ML inference metrics (get from detector)
            detector_stats = self.detector.get_stats()
            if detector_stats.total_frames > 0:
                self.cloud_reporter.telemetry.record_inference(
                    inference_time_ms=detector_stats.avg_inference_time_ms,
                    confidence=detector_stats.avg_confidence
                )

    async def _handle_detection_transitions(
        self, result: AdDetectionResult
    ) -> None:
        """Handle ad detection transitions with TV control.

        Args:
            result: Detection result
        """
        if result.is_ad and not self._in_ad_break:
            # Transition: Content -> Ad
            self._in_ad_break = True
            self._ad_start_frame = result.frame_number

            logger.warning(
                f"🎬 AD BREAK DETECTED at frame {result.frame_number} "
                f"(confidence: {result.confidence:.3f}) - "
                f"Executing {self.strategy.value} strategy"
            )

            # Record ad start in cloud telemetry
            if self.cloud_reporter:
                self.cloud_reporter.telemetry.record_ad_start()

            # Execute ad response strategy
            await self._execute_ad_start_strategy()

            # Reset alternate content
            await self.alternate_content.reset()

            # Trigger callbacks
            await self._trigger_ad_start_callbacks(result)

        elif not result.is_ad and self._in_ad_break:
            # Transition: Ad -> Content
            ad_duration_frames = result.frame_number - (self._ad_start_frame or 0)

            logger.info(
                f"📺 CONTENT RESUMED at frame {result.frame_number} "
                f"(duration: {ad_duration_frames} frames) - "
                f"Restoring normal state"
            )

            # Record ad end in cloud telemetry
            if self.cloud_reporter:
                self.cloud_reporter.telemetry.record_ad_end()

            # Execute ad end strategy
            await self._execute_ad_end_strategy()

            self._in_ad_break = False
            self._ad_start_frame = None
            self._alternate_frame = None

            # Trigger callbacks
            await self._trigger_ad_end_callbacks(result)

    async def _execute_ad_start_strategy(self) -> None:
        """Execute strategy when ad break starts."""
        if self.strategy == AdResponseStrategy.PIP_ONLY:
            # Just show PiP, no TV control needed
            logger.info("Strategy: PiP only - showing alternate content")

        elif self.strategy == AdResponseStrategy.CHANNEL_CHANGE:
            # Change to alternate channel
            if self.tv_controller and self.alternate_channel:
                logger.info(f"Strategy: Changing to channel {self.alternate_channel}")
                success = await self.tv_controller.set_channel(
                    self.alternate_channel
                )

                if success:
                    self._tv_channel_changed = True
                    logger.info(f"✅ Changed to channel {self.alternate_channel}")
                else:
                    logger.error("❌ Failed to change channel")
            else:
                logger.warning("TV controller or alternate channel not configured")

        elif self.strategy == AdResponseStrategy.INPUT_SWITCH:
            # Switch TV input (if supported)
            if self.tv_controller:
                logger.info("Strategy: Switching TV input")
                # This would use HDMI input switching if available
                # For now, log it
                logger.info("Input switching not yet implemented")

        elif self.strategy == AdResponseStrategy.PIP_WITH_MUTE:
            # Show PiP and mute TV
            if self.tv_controller:
                logger.info("Strategy: PiP with mute")
                success = await self.tv_controller.mute()

                if success:
                    self._tv_muted = True
                    logger.info("✅ TV muted")
                else:
                    logger.error("❌ Failed to mute TV")

    async def _execute_ad_end_strategy(self) -> None:
        """Execute strategy when ad break ends."""
        if self.strategy == AdResponseStrategy.PIP_ONLY:
            # No TV control to restore
            logger.info("Strategy: PiP only - returning to full screen")

        elif self.strategy == AdResponseStrategy.CHANNEL_CHANGE:
            # Restore original channel
            if (
                self.tv_controller
                and self.original_channel
                and self._tv_channel_changed
            ):
                logger.info(f"Strategy: Restoring channel {self.original_channel}")
                success = await self.tv_controller.set_channel(
                    self.original_channel
                )

                if success:
                    self._tv_channel_changed = False
                    logger.info(f"✅ Restored to channel {self.original_channel}")
                else:
                    logger.error("❌ Failed to restore channel")

        elif self.strategy == AdResponseStrategy.INPUT_SWITCH:
            # Restore TV input
            logger.info("Strategy: Restoring TV input")

        elif self.strategy == AdResponseStrategy.PIP_WITH_MUTE:
            # Unmute TV
            if self.tv_controller and self._tv_muted:
                logger.info("Strategy: Unmuting TV")
                success = await self.tv_controller.unmute()

                if success:
                    self._tv_muted = False
                    logger.info("✅ TV unmuted")
                else:
                    logger.error("❌ Failed to unmute TV")

    async def close(self) -> None:
        """Close pipeline and cleanup resources."""
        # Restore TV state if needed
        if self._tv_channel_changed and self.original_channel:
            logger.info("Restoring original channel before shutdown")
            await self.tv_controller.set_channel(self.original_channel)

        if self._tv_muted:
            logger.info("Unmuting TV before shutdown")
            await self.tv_controller.unmute()

        # Stop cloud reporter
        if self.cloud_reporter:
            logger.info("Stopping cloud reporter...")
            await self.cloud_reporter.stop()

        # Close base pipeline
        await super().close()

        logger.info("Integrated pipeline closed")
