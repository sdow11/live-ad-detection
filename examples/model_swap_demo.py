#!/usr/bin/env python3
"""
Demo script showing how to hot-swap models during ad detection.

This demonstrates:
1. Running ad detection with an initial model
2. Swapping to a different model without stopping inference
3. Monitoring model swap success and performance impact
"""

import sys
import time
import logging
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from live_ad_detection.ai_hat import AdDetector

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    """Demonstrate model hot-swapping."""

    # Initial model
    model_path_v1 = "/opt/live-ad-detection/models/ad_detector_v1.hef"
    model_path_v2 = "/opt/live-ad-detection/models/ad_detector_v2.hef"

    logger.info("Initializing ad detector with model v1...")
    detector = AdDetector(
        model_path=model_path_v1,
        confidence_threshold=0.8,
        enable_channel_monitoring=True
    )

    if not detector.initialize():
        logger.error("Failed to initialize")
        return 1

    # Add a video stream
    logger.info("Adding HDMI stream...")
    detector.add_video_stream(
        stream_id="hdmi0",
        device_path="/dev/video0",
        source_type="hdmi",
        resolution=(1920, 1080),
        passthrough=True
    )

    # Start detection
    logger.info("Starting detection with model v1...")
    detector.start()

    try:
        # Run for 30 seconds with v1
        logger.info("Running with model v1 for 30 seconds...")
        for i in range(6):
            time.sleep(5)

            stats = detector.get_stats()
            model_info = stats['model']
            det_stats = stats['detector']

            logger.info(f"[{i*5}s] Model: {Path(model_info['model_path']).name}, "
                       f"Frames: {det_stats['total_frames_processed']}, "
                       f"Detections: {det_stats['total_detections']}, "
                       f"Inference: {det_stats['inference_time_ms']:.1f}ms")

        # Hot-swap to v2
        logger.info("=" * 60)
        logger.info("🔄 SWAPPING MODEL TO V2...")
        logger.info("=" * 60)

        swap_start = time.time()
        success = detector.swap_model(model_path_v2)
        swap_duration = time.time() - swap_start

        if success:
            logger.info(f"✅ Model swap completed in {swap_duration:.2f}s")
            logger.info("   Detection continued without interruption!")
        else:
            logger.error("❌ Model swap failed")
            return 1

        # Run for another 30 seconds with v2
        logger.info("Running with model v2 for 30 seconds...")
        for i in range(6):
            time.sleep(5)

            stats = detector.get_stats()
            model_info = stats['model']
            det_stats = stats['detector']

            logger.info(f"[{i*5}s] Model: {Path(model_info['model_path']).name}, "
                       f"Frames: {det_stats['total_frames_processed']}, "
                       f"Detections: {det_stats['total_detections']}, "
                       f"Inference: {det_stats['inference_time_ms']:.1f}ms, "
                       f"Swaps: {det_stats['model_swaps']}")

        # Final stats
        logger.info("=" * 60)
        logger.info("FINAL STATISTICS")
        logger.info("=" * 60)

        stats = detector.get_stats()
        det_stats = stats['detector']
        model_info = stats['model']

        logger.info(f"Total frames processed: {det_stats['total_frames_processed']}")
        logger.info(f"Total detections: {det_stats['total_detections']}")
        logger.info(f"Model swaps performed: {det_stats['model_swaps']}")
        logger.info(f"Final model: {model_info['model_path']}")
        logger.info(f"Average inference time: {det_stats['inference_time_ms']:.1f}ms")

    except KeyboardInterrupt:
        logger.info("Interrupted by user")

    finally:
        logger.info("Stopping detector...")
        detector.stop()
        detector.cleanup()

    return 0


if __name__ == "__main__":
    sys.exit(main())
