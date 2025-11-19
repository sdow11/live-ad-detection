"""Ad Detection App - Smart PiP mode.

Wraps the existing ad detection functionality as a home screen app.
"""

import logging
from typing import Any, Dict

from home_screen.app_framework import AppCategory, AppStatus, BaseApp

logger = logging.getLogger(__name__)


class AdDetectionApp(BaseApp):
    """Ad detection application with smart PiP mode."""

    def __init__(self):
        """Initialize ad detection app."""
        super().__init__(
            app_id="ad_detection",
            name="Smart TV",
            description="Live TV with automatic ad detection and PiP mode",
            icon="📺",
            category=AppCategory.VIDEO,
            version="1.0.0"
        )

        self.pipeline = None

    async def start(self) -> bool:
        """Start ad detection pipeline.

        Returns:
            True if started successfully
        """
        try:
            logger.info("Starting ad detection app")

            # Import here to avoid circular dependency
            from video.integrated_pipeline import IntegratedPipeline

            # Create and start pipeline
            self.pipeline = IntegratedPipeline(
                enable_pip=self.config.get("enable_pip", True),
                pip_content_source=self.config.get("pip_content_source"),
                ml_model_path=self.config.get("ml_model_path", "/opt/ad-detection/models/base-ad-detector.tflite"),
                detection_threshold=self.config.get("detection_threshold", 0.5)
            )

            # Start pipeline
            await self.pipeline.start()

            self.status = AppStatus.RUNNING
            logger.info("Ad detection app started successfully")

            return True

        except Exception as e:
            logger.error(f"Failed to start ad detection app: {e}", exc_info=True)
            self.error_message = str(e)
            self.status = AppStatus.ERROR
            return False

    async def stop(self) -> bool:
        """Stop ad detection pipeline.

        Returns:
            True if stopped successfully
        """
        try:
            logger.info("Stopping ad detection app")

            if self.pipeline:
                await self.pipeline.stop()
                self.pipeline = None

            self.status = AppStatus.STOPPED
            logger.info("Ad detection app stopped successfully")

            return True

        except Exception as e:
            logger.error(f"Failed to stop ad detection app: {e}", exc_info=True)
            self.error_message = str(e)
            return False

    async def pause(self) -> bool:
        """Pause ad detection (keep video playing but stop detection).

        Returns:
            True if paused successfully
        """
        try:
            if self.pipeline:
                # Pause ML inference but keep video pipeline running
                self.pipeline.pause_detection()

            self.status = AppStatus.PAUSED
            return True

        except Exception as e:
            logger.error(f"Failed to pause ad detection app: {e}")
            return False

    async def resume(self) -> bool:
        """Resume ad detection.

        Returns:
            True if resumed successfully
        """
        try:
            if self.pipeline:
                self.pipeline.resume_detection()

            self.status = AppStatus.RUNNING
            return True

        except Exception as e:
            logger.error(f"Failed to resume ad detection app: {e}")
            return False
