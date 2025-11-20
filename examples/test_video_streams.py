#!/usr/bin/env python3
"""
Test script for video capture and passthrough without AI inference.

Use this to verify your HDMI capture devices are working correctly
before enabling AI detection.
"""

import sys
import time
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from live_ad_detection.ai_hat.video_processor import (
    VideoProcessor, VideoStreamConfig, VideoSource
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    """Test video capture from HDMI devices."""

    logger.info("Video Stream Test")
    logger.info("=" * 60)

    # Create video processor
    processor = VideoProcessor()

    # Add HDMI stream 0
    config0 = VideoStreamConfig(
        source_type=VideoSource.HDMI_0,
        device_path="/dev/video0",
        width=1920,
        height=1080,
        fps=30,
        passthrough=True,
        passthrough_device="hdmi0_out"
    )

    if processor.add_stream("hdmi0", config0):
        logger.info("✅ Added HDMI stream 0")
    else:
        logger.error("❌ Failed to add HDMI stream 0")

    # Add HDMI stream 1
    config1 = VideoStreamConfig(
        source_type=VideoSource.HDMI_1,
        device_path="/dev/video1",
        width=1920,
        height=1080,
        fps=30,
        passthrough=True,
        passthrough_device="hdmi1_out"
    )

    if processor.add_stream("hdmi1", config1):
        logger.info("✅ Added HDMI stream 1")
    else:
        logger.error("❌ Failed to add HDMI stream 1")

    # Start streams
    logger.info("\nStarting video streams...")
    if processor.start_all_streams():
        logger.info("✅ All streams started")
    else:
        logger.error("❌ Some streams failed to start")
        return 1

    # Monitor for 30 seconds
    logger.info("\nMonitoring streams for 30 seconds...")
    logger.info("Press Ctrl+C to stop early\n")

    try:
        for i in range(6):  # 6 iterations of 5 seconds
            time.sleep(5)

            stats = processor.get_all_stats()

            logger.info(f"--- Stats at {(i+1)*5}s ---")
            for stream_id, stream_stats in stats.items():
                logger.info(f"{stream_id}:")
                logger.info(f"  Running: {stream_stats['running']}")
                logger.info(f"  FPS: {stream_stats['fps']:.1f}")
                logger.info(f"  Frames captured: {stream_stats['frames_captured']}")
                logger.info(f"  Frames dropped: {stream_stats['frames_dropped']}")
            logger.info("")

    except KeyboardInterrupt:
        logger.info("\nStopped by user")

    # Cleanup
    logger.info("Stopping streams...")
    processor.cleanup()

    logger.info("✅ Test complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
