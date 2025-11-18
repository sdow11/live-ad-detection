#!/usr/bin/env python3
"""Demo script for video passthrough pipeline.

This script demonstrates Phase 1 implementation:
- Video capture (mock or V4L2)
- Video output (OpenCV window fallback)
- Basic passthrough with statistics

Usage:
    # Run with mock video (no hardware needed)
    python demo_passthrough.py

    # Run with real HDMI capture (requires hardware)
    python demo_passthrough.py --device /dev/video0

    # Different resolution
    python demo_passthrough.py --mode 720p60
"""

import argparse
import asyncio
import logging
import sys

# Add src to path for development
sys.path.insert(0, "/home/user/live-ad-detection/packages/edge-device/src")
sys.path.insert(
    0, "/home/user/live-ad-detection/packages/shared/python-common/src"
)

from video import (
    MockVideoCapture,
    MockVideoOutput,
    PassthroughPipeline,
    VideoCapture,
    VideoOutput,
)
from video.pipeline import PipelineConfig
from video.types import VideoCaptureConfig, VideoMode, VideoOutputConfig

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Video passthrough pipeline demo"
    )

    parser.add_argument(
        "--device",
        type=str,
        default=None,
        help="V4L2 device path (e.g., /dev/video0). If not specified, uses mock capture",
    )

    parser.add_argument(
        "--mode",
        type=str,
        default="1080p60",
        choices=["720p30", "720p60", "1080p30", "1080p60"],
        help="Video mode",
    )

    parser.add_argument(
        "--duration",
        type=int,
        default=30,
        help="Duration to run in seconds (0 for infinite)",
    )

    return parser.parse_args()


def mode_from_string(mode_str: str) -> VideoMode:
    """Convert mode string to VideoMode enum."""
    modes = {
        "720p30": VideoMode.HD_720P_30,
        "720p60": VideoMode.HD_720P_60,
        "1080p30": VideoMode.FHD_1080P_30,
        "1080p60": VideoMode.FHD_1080P_60,
    }
    return modes[mode_str]


async def main():
    """Main demo function."""
    args = parse_args()

    mode = mode_from_string(args.mode)

    logger.info("=== Video Passthrough Pipeline Demo ===")
    logger.info(f"Mode: {mode.value}")
    logger.info(f"Duration: {args.duration}s" if args.duration > 0 else "Infinite")

    # Create capture
    if args.device:
        logger.info(f"Using V4L2 capture: {args.device}")
        capture_config = VideoCaptureConfig(device=args.device, mode=mode)
        capture = VideoCapture(capture_config)
    else:
        logger.info("Using mock capture (synthetic test pattern)")
        capture_config = VideoCaptureConfig(mode=mode)
        capture = MockVideoCapture(capture_config)

    # Create output
    output_config = VideoOutputConfig(mode=mode, vsync=True)
    output = MockVideoOutput(output_config)  # Using mock for now

    logger.info(
        "Using OpenCV window output (DRM/KMS will be implemented in Phase 4)"
    )

    # Create pipeline
    pipeline_config = PipelineConfig(
        mode=mode, enable_stats=True, stats_interval_sec=5.0
    )

    pipeline = PassthroughPipeline(capture, output, pipeline_config)

    # Initialize
    try:
        await pipeline.initialize()
        logger.info("Pipeline initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize pipeline: {e}")
        return 1

    # Run
    try:
        logger.info("Starting pipeline... Press Ctrl+C to stop")

        if args.duration > 0:
            # Run for specified duration
            async def stop_after_duration():
                await asyncio.sleep(args.duration)
                await pipeline.stop()
                logger.info(f"Stopped after {args.duration} seconds")

            await asyncio.gather(pipeline.run(), stop_after_duration())

        else:
            # Run indefinitely
            await pipeline.run()

    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        await pipeline.stop()

    except Exception as e:
        logger.error(f"Pipeline error: {e}")
        await pipeline.stop()
        return 1

    finally:
        # Clean up
        await capture.close()
        await output.close()

        # Final stats
        stats = pipeline.get_stats()
        logger.info("=== Final Statistics ===")
        logger.info(f"Frames captured: {stats.frames_captured}")
        logger.info(f"Frames displayed: {stats.frames_displayed}")
        logger.info(f"Frames dropped: {stats.frames_dropped}")
        logger.info(f"Drop rate: {stats.drop_rate * 100:.2f}%")
        logger.info(f"Average FPS: {stats.average_fps:.1f}")
        logger.info(
            f"Latency: {stats.average_latency_ms:.1f}ms "
            f"(min: {stats.min_latency_ms:.1f}ms, "
            f"max: {stats.max_latency_ms:.1f}ms)"
        )

    logger.info("Demo complete!")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
