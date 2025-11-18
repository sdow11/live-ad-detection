"""Video pipeline with ML-based ad detection.

This module extends the basic passthrough pipeline with ML inference
for real-time ad detection.
"""

import asyncio
import logging
from typing import Optional

from ml.detector import AdDetector, DetectorConfig
from ml.types import AdDetectionResult
from video.pipeline import PassthroughPipeline, PipelineConfig
from video.types import Frame, VideoCaptureProtocol, VideoOutputProtocol

logger = logging.getLogger(__name__)


class MLPipeline(PassthroughPipeline):
    """Video pipeline with ML-based ad detection.

    Extends the basic passthrough pipeline to include real-time ML inference
    for detecting advertisements. Optionally triggers actions when ads are detected.

    Example:
        >>> capture = MockVideoCapture(config)
        >>> output = MockVideoOutput(config)
        >>> detector_config = DetectorConfig(model_path="models/ad_detector.tflite")
        >>> pipeline = MLPipeline(capture, output, detector_config=detector_config)
        >>> await pipeline.initialize()
        >>> await pipeline.run()
    """

    def __init__(
        self,
        capture: VideoCaptureProtocol,
        output: VideoOutputProtocol,
        pipeline_config: Optional[PipelineConfig] = None,
        detector_config: Optional[DetectorConfig] = None,
        use_mock_model: bool = False,
    ) -> None:
        """Initialize ML pipeline.

        Args:
            capture: Video capture source
            output: Video output destination
            pipeline_config: Pipeline configuration
            detector_config: Ad detector configuration
            use_mock_model: If True, use mock model for testing
        """
        super().__init__(capture, output, pipeline_config)

        # Create ad detector
        if detector_config is None:
            detector_config = DetectorConfig(model_path="models/ad_detector.tflite")

        self.detector = AdDetector(detector_config, use_mock_model=use_mock_model)
        self.detector_config = detector_config

        # Detection state
        self._current_detection: Optional[AdDetectionResult] = None
        self._in_ad_break = False
        self._ad_start_frame: Optional[int] = None

        # Callbacks
        self._on_ad_start_callbacks: list = []
        self._on_ad_end_callbacks: list = []

    async def initialize(self) -> None:
        """Initialize the ML pipeline."""
        # Initialize base pipeline
        await super().initialize()

        # Initialize detector
        await self.detector.initialize()

        logger.info("ML pipeline initialized with ad detection")

    async def process_single_frame(self) -> None:
        """Capture, analyze, and display a single frame with ML inference."""
        import time

        capture_start = time.time()

        # Capture frame
        frame = await self.capture.capture_frame()
        self._frames_captured += 1

        # Run ML inference (every Nth frame for performance)
        detection_result = None

        # Analyze every frame for now (can reduce to every 2nd or 3rd frame)
        if self._frames_captured % 1 == 0:
            detection_result = await self.detector.detect(frame)
            self._current_detection = detection_result

            # Check for ad state transitions
            await self._handle_detection_transitions(detection_result)

        # Display frame
        await self.output.display_frame(frame)
        self._frames_displayed += 1

        # Calculate total latency
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

        Args:
            result: Detection result
        """
        if result.is_ad and not self._in_ad_break:
            # Transition: Content -> Ad
            self._in_ad_break = True
            self._ad_start_frame = result.frame_number

            logger.info(
                f"Ad break started at frame {result.frame_number} "
                f"(confidence: {result.confidence:.3f})"
            )

            # Trigger callbacks
            await self._trigger_ad_start_callbacks(result)

        elif not result.is_ad and self._in_ad_break:
            # Transition: Ad -> Content
            ad_duration_frames = result.frame_number - (self._ad_start_frame or 0)

            logger.info(
                f"Ad break ended at frame {result.frame_number} "
                f"(duration: {ad_duration_frames} frames)"
            )

            self._in_ad_break = False
            self._ad_start_frame = None

            # Trigger callbacks
            await self._trigger_ad_end_callbacks(result)

    async def _trigger_ad_start_callbacks(self, result: AdDetectionResult) -> None:
        """Trigger callbacks when ad starts.

        Args:
            result: Detection result
        """
        for callback in self._on_ad_start_callbacks:
            try:
                await callback(result)
            except Exception as e:
                logger.error(f"Error in ad start callback: {e}")

    async def _trigger_ad_end_callbacks(self, result: AdDetectionResult) -> None:
        """Trigger callbacks when ad ends.

        Args:
            result: Detection result
        """
        for callback in self._on_ad_end_callbacks:
            try:
                await callback(result)
            except Exception as e:
                logger.error(f"Error in ad end callback: {e}")

    def on_ad_start(self, callback) -> None:
        """Register callback for ad start event.

        Args:
            callback: Async callable receiving AdDetectionResult
        """
        self._on_ad_start_callbacks.append(callback)

    def on_ad_end(self, callback) -> None:
        """Register callback for ad end event.

        Args:
            callback: Async callable receiving AdDetectionResult
        """
        self._on_ad_end_callbacks.append(callback)

    def get_ml_stats(self) -> str:
        """Get ML detection statistics as formatted string.

        Returns:
            Formatted statistics string
        """
        detector_stats = self.detector.get_stats()
        pipeline_stats = self.get_stats()

        return (
            f"ML Stats: {detector_stats.total_frames} frames analyzed, "
            f"{detector_stats.ad_frames} ad frames ({detector_stats.ad_ratio*100:.1f}%), "
            f"{detector_stats.content_frames} content frames ({detector_stats.content_ratio*100:.1f}%), "
            f"avg confidence: {detector_stats.avg_confidence:.3f}, "
            f"avg inference: {detector_stats.avg_inference_time_ms:.1f}ms"
        )

    @property
    def is_in_ad(self) -> bool:
        """Check if currently in ad break.

        Returns:
            True if currently showing an ad
        """
        return self._in_ad_break

    @property
    def current_detection(self) -> Optional[AdDetectionResult]:
        """Get most recent detection result.

        Returns:
            Latest detection result, or None
        """
        return self._current_detection
