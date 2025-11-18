#!/usr/bin/env python3
"""Demo script for ML-based ad detection pipeline.

This script demonstrates Phase 2 implementation:
- Video capture (mock or V4L2)
- ML inference for ad detection
- Temporal smoothing to reduce false positives
- Real-time statistics and event callbacks

Usage:
    # Run with mock video and mock ML model (no dependencies)
    python demo_ml_detection.py

    # Run with real HDMI capture and mock model
    python demo_ml_detection.py --device /dev/video0

    # Run with real model (requires TensorFlow Lite)
    python demo_ml_detection.py --model models/ad_detector.tflite

    # Custom detection parameters
    python demo_ml_detection.py --confidence 0.7 --temporal-window 10
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

from ml.detector import DetectorConfig
from ml.types import AdDetectionResult
from video import (
    MockVideoCapture,
    MockVideoOutput,
    VideoCapture,
    VideoOutput,
)
from video.ml_pipeline import MLPipeline
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
        description="ML-based ad detection pipeline demo"
    )

    parser.add_argument(
        "--device",
        type=str,
        default=None,
        help="V4L2 device path (e.g., /dev/video0). If not specified, uses mock capture",
    )

    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Path to TFLite model. If not specified, uses mock model",
    )

    parser.add_argument(
        "--mode",
        type=str,
        default="720p30",
        choices=["720p30", "720p60", "1080p30", "1080p60"],
        help="Video mode",
    )

    parser.add_argument(
        "--confidence",
        type=float,
        default=0.5,
        help="Confidence threshold for ad detection (0.0-1.0)",
    )

    parser.add_argument(
        "--temporal-window",
        type=int,
        default=5,
        help="Number of frames for temporal smoothing",
    )

    parser.add_argument(
        "--temporal-threshold",
        type=float,
        default=0.6,
        help="Ratio threshold for temporal smoothing (0.0-1.0)",
    )

    parser.add_argument(
        "--duration",
        type=int,
        default=60,
        help="Duration to run in seconds (0 for infinite)",
    )

    parser.add_argument(
        "--stats-interval",
        type=int,
        default=5,
        help="Stats reporting interval in seconds",
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


async def on_ad_start(result: AdDetectionResult):
    """Callback when ad is detected.

    Args:
        result: Detection result
    """
    logger.warning(
        f"🎬 AD STARTED at frame {result.frame_number} "
        f"(confidence: {result.confidence:.3f}, "
        f"level: {result.confidence_level.value})"
    )
    # This is where you would trigger TV control to change channel or enable PiP


async def on_ad_end(result: AdDetectionResult):
    """Callback when ad ends.

    Args:
        result: Detection result
    """
    logger.info(
        f"📺 CONTENT RESUMED at frame {result.frame_number} "
        f"(confidence: {result.confidence:.3f})"
    )
    # This is where you would restore original channel


async def main():
    """Main demo function."""
    args = parse_args()

    mode = mode_from_string(args.mode)

    logger.info("=== ML-Based Ad Detection Pipeline Demo ===")
    logger.info(f"Video Mode: {mode.value}")
    logger.info(f"Confidence Threshold: {args.confidence}")
    logger.info(f"Temporal Window: {args.temporal_window} frames")
    logger.info(f"Temporal Threshold: {args.temporal_threshold}")
    logger.info(f"Duration: {args.duration}s" if args.duration > 0 else "Infinite")
    logger.info("")

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
    output_config = VideoOutputConfig(mode=mode, vsync=False)
    output = MockVideoOutput(output_config)

    logger.info("Using mock output (DRM/KMS in Phase 4)")

    # Create detector config
    use_mock_model = args.model is None

    if use_mock_model:
        logger.info("Using mock ML model (no TensorFlow Lite required)")
        model_path = "mock.tflite"
    else:
        logger.info(f"Using TFLite model: {args.model}")
        model_path = args.model

    detector_config = DetectorConfig(
        model_path=model_path,
        confidence_threshold=args.confidence,
        temporal_window=args.temporal_window,
        temporal_threshold=args.temporal_threshold,
        num_threads=4,
    )

    # Create pipeline config
    pipeline_config = PipelineConfig(
        mode=mode,
        enable_stats=True,
        stats_interval_sec=float(args.stats_interval),
    )

    # Create ML pipeline
    pipeline = MLPipeline(
        capture,
        output,
        pipeline_config=pipeline_config,
        detector_config=detector_config,
        use_mock_model=use_mock_model,
    )

    # Register event callbacks
    pipeline.on_ad_start(on_ad_start)
    pipeline.on_ad_end(on_ad_end)

    # Initialize
    try:
        await pipeline.initialize()
        logger.info("Pipeline initialized successfully")
        logger.info("")

    except Exception as e:
        logger.error(f"Failed to initialize pipeline: {e}")
        return 1

    # Run
    try:
        logger.info("Starting ML pipeline... Press Ctrl+C to stop")
        logger.info("Watching for advertisements...")
        logger.info("")

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
        logger.info("")
        logger.info("=== Final Statistics ===")

        stats = pipeline.get_stats()
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

        logger.info("")
        logger.info(pipeline.get_ml_stats())

        detector_stats = pipeline.detector.get_stats()
        if detector_stats.total_frames > 0:
            logger.info("")
            logger.info("Ad Detection Summary:")
            logger.info(
                f"  Total frames analyzed: {detector_stats.total_frames}"
            )
            logger.info(
                f"  Ad frames: {detector_stats.ad_frames} "
                f"({detector_stats.ad_ratio*100:.1f}%)"
            )
            logger.info(
                f"  Content frames: {detector_stats.content_frames} "
                f"({detector_stats.content_ratio*100:.1f}%)"
            )
            logger.info(
                f"  Average confidence: {detector_stats.avg_confidence:.3f}"
            )
            logger.info(
                f"  Average inference time: {detector_stats.avg_inference_time_ms:.1f}ms"
            )

    logger.info("")
    logger.info("Demo complete!")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
