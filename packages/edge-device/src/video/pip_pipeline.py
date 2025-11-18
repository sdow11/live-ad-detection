"""Complete PiP pipeline with ML detection and video composition.

This module integrates ML-based ad detection with video composition
to create a seamless picture-in-picture experience.
"""

import asyncio
import logging
from typing import Optional

from compositor import VideoCompositor, CompositorConfig, ContentSource
from compositor.content_source import ColorBarsSource
from ml.detector import DetectorConfig
from ml.types import AdDetectionResult
from video.ml_pipeline import MLPipeline
from video.pipeline import PipelineConfig
from video.types import Frame, VideoCaptureProtocol, VideoOutputProtocol

logger = logging.getLogger(__name__)


class PiPPipeline(MLPipeline):
    """Complete PiP pipeline with ML detection and composition.

    Combines ML-based ad detection with video composition to automatically
    switch to PiP mode when ads are detected, showing alternate content
    full screen with the original feed in a small window.

    Example:
        >>> capture = MockVideoCapture(config)
        >>> output = MockVideoOutput(config)
        >>> alternate_content = ColorBarsSource()
        >>> pipeline = PiPPipeline(
        ...     capture, output,
        ...     alternate_content=alternate_content,
        ...     detector_config=detector_config
        ... )
        >>> await pipeline.initialize()
        >>> await pipeline.run()
    """

    def __init__(
        self,
        capture: VideoCaptureProtocol,
        output: VideoOutputProtocol,
        alternate_content: Optional[ContentSource] = None,
        pipeline_config: Optional[PipelineConfig] = None,
        detector_config: Optional[DetectorConfig] = None,
        compositor_config: Optional[CompositorConfig] = None,
        use_mock_model: bool = False,
    ) -> None:
        """Initialize PiP pipeline.

        Args:
            capture: Video capture source (TV feed)
            output: Video output destination
            alternate_content: Alternate content source for ad breaks
            pipeline_config: Pipeline configuration
            detector_config: Ad detector configuration
            compositor_config: Video compositor configuration
            use_mock_model: If True, use mock ML model
        """
        super().__init__(
            capture, output, pipeline_config, detector_config, use_mock_model
        )

        # Create compositor
        if compositor_config is None:
            compositor_config = CompositorConfig()

        self.compositor = VideoCompositor(compositor_config)
        self.compositor_config = compositor_config

        # Create or use provided alternate content source
        if alternate_content is None:
            # Default to color bars
            alternate_content = ColorBarsSource(
                width=compositor_config.output_width,
                height=compositor_config.output_height,
            )

        self.alternate_content = alternate_content
        self._alternate_frame: Optional[Frame] = None

    async def initialize(self) -> None:
        """Initialize the PiP pipeline."""
        # Initialize base ML pipeline
        await super().initialize()

        # Initialize alternate content source
        await self.alternate_content.initialize()

        logger.info("PiP pipeline initialized with video composition")

    async def process_single_frame(self) -> None:
        """Capture, analyze, compose, and display a single frame."""
        import time

        capture_start = time.time()

        # Capture frame from TV feed
        tv_frame = await self.capture.capture_frame()
        self._frames_captured += 1

        # Run ML inference to detect ads
        detection_result = None

        if self._frames_captured % 1 == 0:  # Analyze every frame
            detection_result = await self.detector.detect(tv_frame)
            self._current_detection = detection_result

            # Handle ad state transitions
            await self._handle_detection_transitions(detection_result)

        # Get alternate content frame if in ad break
        if self._in_ad_break:
            self._alternate_frame = await self.alternate_content.get_frame()

        # Compose output based on current state
        if self._in_ad_break and self._alternate_frame is not None:
            # Ad detected: Show alternate content full screen, TV in PiP
            composed_frame = await self.compositor.compose(
                main_frame=tv_frame,
                pip_frame=self._alternate_frame,
                swap_mode=True,  # Alternate content becomes main, TV becomes PiP
            )

            logger.debug(
                f"Frame {tv_frame.metadata.frame_number}: "
                f"PiP mode (showing alternate content)"
            )

        else:
            # No ad: Show TV full screen
            composed_frame = await self.compositor.compose(
                main_frame=tv_frame, pip_frame=None, swap_mode=False
            )

        # Display composed output
        await self.output.display_frame(composed_frame)
        self._frames_displayed += 1

        # Calculate latency
        total_latency = (time.time() - capture_start) * 1000

        # Track latency statistics
        if self.config.enable_stats:
            self._latencies_ms.append(total_latency)

            if total_latency > self.config.max_latency_ms:
                logger.warning(
                    f"High latency detected: {total_latency:.1f}ms "
                    f"(max: {self.config.max_latency_ms}ms)"
                )

    async def _handle_detection_transitions(
        self, result: AdDetectionResult
    ) -> None:
        """Handle transitions between ad and content states.

        Overrides parent to add PiP-specific behavior.

        Args:
            result: Detection result
        """
        if result.is_ad and not self._in_ad_break:
            # Transition: Content -> Ad
            self._in_ad_break = True
            self._ad_start_frame = result.frame_number

            logger.info(
                f"🎬 Ad break started at frame {result.frame_number} "
                f"(confidence: {result.confidence:.3f}) - "
                f"Switching to PiP mode"
            )

            # Reset alternate content to beginning
            await self.alternate_content.reset()

            # Trigger callbacks
            await self._trigger_ad_start_callbacks(result)

        elif not result.is_ad and self._in_ad_break:
            # Transition: Ad -> Content
            ad_duration_frames = result.frame_number - (self._ad_start_frame or 0)

            logger.info(
                f"📺 Content resumed at frame {result.frame_number} "
                f"(duration: {ad_duration_frames} frames) - "
                f"Exiting PiP mode"
            )

            self._in_ad_break = False
            self._ad_start_frame = None
            self._alternate_frame = None

            # Trigger callbacks
            await self._trigger_ad_end_callbacks(result)

    async def close(self) -> None:
        """Close pipeline and cleanup resources."""
        # Close alternate content source
        await self.alternate_content.close()

        # Close capture and output (base class handles this via context)
        logger.info("PiP pipeline closed")
