#!/usr/bin/env python3
"""
Example script for running ad detection with AI HAT and dual HDMI streams.

This demonstrates how to:
1. Initialize the AI HAT (Hailo-8L)
2. Set up dual HDMI video capture with passthrough
3. Run real-time ad detection
4. Report detections to the API server
"""

import sys
import time
import logging
import signal
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from live_ad_detection.ai_hat import AdDetector
from live_ad_detection.config import ConfigLoader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def on_detection(detection):
    """
    Callback function called when an ad is detected.

    Args:
        detection: Detection object with ad information
    """
    logger.info(f"🎯 AD DETECTED!")
    logger.info(f"  Stream: {detection.stream_id}")
    logger.info(f"  Type: {detection.ad_type}")
    logger.info(f"  Confidence: {detection.confidence:.2%}")
    logger.info(f"  Time: {detection.timestamp}")

    if detection.bounding_box:
        bbox = detection.bounding_box
        logger.info(f"  Location: x={bbox['x']:.0f}, y={bbox['y']:.0f}, "
                   f"w={bbox['w']:.0f}, h={bbox['h']:.0f}")


def main():
    """Main function to run ad detection."""

    # Load configuration
    logger.info("Loading configuration...")
    config = ConfigLoader()

    # Check if ad detection is enabled
    if not config.get('ad_detection.enabled'):
        logger.warning("Ad detection is disabled in configuration")
        logger.info("To enable, set ad_detection.enabled=true in device_config.yaml")
        return

    # Get AI HAT configuration
    model_path = config.get('ad_detection.ai_hat.model_path')
    confidence_threshold = config.get('ad_detection.confidence_threshold', 0.8)

    logger.info(f"Model path: {model_path}")
    logger.info(f"Confidence threshold: {confidence_threshold}")

    # Initialize ad detector
    logger.info("Initializing ad detector...")
    detector = AdDetector(
        model_path=model_path,
        confidence_threshold=confidence_threshold,
        detection_callback=on_detection
    )

    if not detector.initialize():
        logger.error("Failed to initialize ad detector")
        return 1

    # Add video streams from configuration
    video_streams = config.get('ad_detection.video_streams', [])

    if not video_streams:
        logger.warning("No video streams configured")
        logger.info("Add video streams in device_config.yaml under ad_detection.video_streams")
        return 1

    for stream_config in video_streams:
        if not stream_config.get('enabled', False):
            logger.info(f"Skipping disabled stream: {stream_config.get('stream_id')}")
            continue

        stream_id = stream_config['stream_id']
        device_path = stream_config['device_path']
        source_type = stream_config.get('source_type', 'hdmi')
        resolution = (
            stream_config.get('resolution', {}).get('width', 1920),
            stream_config.get('resolution', {}).get('height', 1080)
        )
        fps = stream_config.get('fps', 30)
        passthrough = stream_config.get('passthrough', True)

        logger.info(f"Adding stream: {stream_id}")
        logger.info(f"  Device: {device_path}")
        logger.info(f"  Resolution: {resolution[0]}x{resolution[1]} @ {fps}fps")
        logger.info(f"  Passthrough: {passthrough}")

        if not detector.add_video_stream(
            stream_id=stream_id,
            device_path=device_path,
            source_type=source_type,
            resolution=resolution,
            fps=fps,
            passthrough=passthrough
        ):
            logger.error(f"Failed to add stream: {stream_id}")
            continue

    # Set up signal handler for graceful shutdown
    def signal_handler(sig, frame):
        logger.info("Shutting down...")
        detector.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Start detection
    logger.info("Starting ad detection...")
    if not detector.start():
        logger.error("Failed to start ad detection")
        return 1

    logger.info("✅ Ad detection running!")
    logger.info("Press Ctrl+C to stop")

    # Main loop - print statistics every 10 seconds
    try:
        while True:
            time.sleep(10)

            stats = detector.get_stats()
            logger.info("=" * 60)
            logger.info("STATISTICS")
            logger.info("=" * 60)

            # Detector stats
            det_stats = stats['detector']
            logger.info(f"Frames processed: {det_stats['total_frames_processed']}")
            logger.info(f"Total detections: {det_stats['total_detections']}")
            logger.info(f"Inference time: {det_stats['inference_time_ms']:.1f}ms")

            # Per-stream stats
            for stream_id, stream_stats in stats['streams'].items():
                logger.info(f"\nStream: {stream_id}")
                logger.info(f"  FPS: {stream_stats['fps']:.1f}")
                logger.info(f"  Frames captured: {stream_stats['frames_captured']}")
                logger.info(f"  Frames dropped: {stream_stats['frames_dropped']}")

                stream_detections = det_stats['detections_by_stream'].get(stream_id, 0)
                logger.info(f"  Detections: {stream_detections}")

            # Hailo stats
            hailo_stats = stats['hailo']
            logger.info(f"\nHailo AI HAT: {hailo_stats.get('model', 'N/A')}")
            logger.info(f"  Mode: {hailo_stats.get('mode', 'N/A')}")
            if hailo_stats.get('temperature'):
                logger.info(f"  Temperature: {hailo_stats['temperature']}°C")

            logger.info("=" * 60)

    except KeyboardInterrupt:
        pass

    logger.info("Stopping ad detection...")
    detector.stop()
    detector.cleanup()

    logger.info("Ad detection stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
