#!/usr/bin/env python3
"""Complete PiP demo with ML detection and video composition.

This script demonstrates Phase 3 implementation:
- Video capture from TV feed (mock or V4L2)
- ML inference for ad detection
- Video composition with PiP
- Automatic switching when ads detected
- Alternate content display (color bars, images, or videos)

Usage:
    # Run with all mock components (no dependencies)
    python demo_pip_complete.py

    # With real HDMI capture
    python demo_pip_complete.py --device /dev/video0

    # With custom alternate content
    python demo_pip_complete.py --alternate-content video:highlights.mp4

    # With real TFLite model
    python demo_pip_complete.py --model models/ad_detector.tflite

    # Custom PiP position and size
    python demo_pip_complete.py --pip-position top_left --pip-size 640x360
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

from compositor import (
    CompositorConfig,
    PiPConfig,
    PiPPosition,
    ColorBarsSource,
    StaticImageSource,
    VideoFileSource,
)
from ml.detector import DetectorConfig
from ml.types import AdDetectionResult
from video import MockVideoCapture, MockVideoOutput, VideoCapture, VideoOutput
from video.pip_pipeline import PiPPipeline
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
        description="Complete PiP pipeline demo with ML detection"
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
        "--alternate-content",
        type=str,
        default="colorbars",
        help="Alternate content: 'colorbars', 'image:path', or 'video:path'",
    )

    parser.add_argument(
        "--pip-position",
        type=str,
        default="bottom_right",
        choices=[
            "top_left",
            "top_right",
            "bottom_left",
            "bottom_right",
            "center",
        ],
        help="PiP window position",
    )

    parser.add_argument(
        "--pip-size",
        type=str,
        default="480x270",
        help="PiP window size as WIDTHxHEIGHT (e.g., 640x360)",
    )

    parser.add_argument(
        "--confidence",
        type=float,
        default=0.5,
        help="Ad detection confidence threshold (0.0-1.0)",
    )

    parser.add_argument(
        "--temporal-window",
        type=int,
        default=5,
        help="Temporal smoothing window size (frames)",
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


def parse_pip_size(size_str: str) -> tuple[int, int]:
    """Parse PiP size string.

    Args:
        size_str: Size as "WIDTHxHEIGHT"

    Returns:
        (width, height) tuple
    """
    parts = size_str.lower().split("x")
    if len(parts) != 2:
        raise ValueError(f"Invalid size format: {size_str}")

    width = int(parts[0])
    height = int(parts[1])

    return (width, height)


async def create_alternate_content(spec: str, width: int, height: int):
    """Create alternate content source from specification.

    Args:
        spec: Content spec ("colorbars", "image:path", or "video:path")
        width: Frame width
        height: Frame height

    Returns:
        ContentSource instance
    """
    if spec == "colorbars":
        logger.info("Using color bars as alternate content")
        return ColorBarsSource(width=width, height=height)

    elif spec.startswith("image:"):
        image_path = spec[6:]  # Remove "image:" prefix
        logger.info(f"Using static image as alternate content: {image_path}")
        return StaticImageSource(image_path, width=width, height=height)

    elif spec.startswith("video:"):
        video_path = spec[6:]  # Remove "video:" prefix
        logger.info(f"Using video file as alternate content: {video_path}")
        return VideoFileSource(video_path, loop=True)

    else:
        logger.warning(f"Unknown content spec '{spec}', using color bars")
        return ColorBarsSource(width=width, height=height)


async def on_ad_start(result: AdDetectionResult):
    """Callback when ad is detected."""
    logger.warning(
        f"🎬 AD STARTED at frame {result.frame_number} "
        f"(confidence: {result.confidence:.3f}) - "
        f"SWITCHING TO PiP MODE"
    )


async def on_ad_end(result: AdDetectionResult):
    """Callback when ad ends."""
    logger.info(
        f"📺 CONTENT RESUMED at frame {result.frame_number} - "
        f"RETURNING TO FULL SCREEN"
    )


async def main():
    """Main demo function."""
    args = parse_args()

    mode = mode_from_string(args.mode)
    pip_size = parse_pip_size(args.pip_size)

    logger.info("=" * 60)
    logger.info("COMPLETE PiP PIPELINE DEMO")
    logger.info("=" * 60)
    logger.info(f"Video Mode: {mode.value}")
    logger.info(
        f"PiP Position: {args.pip_position}, Size: {pip_size[0]}x{pip_size[1]}"
    )
    logger.info(f"Confidence Threshold: {args.confidence}")
    logger.info(f"Temporal Window: {args.temporal_window} frames")
    logger.info(f"Alternate Content: {args.alternate_content}")
    logger.info(f"Duration: {args.duration}s" if args.duration > 0 else "Infinite")
    logger.info("=" * 60)
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

    logger.info("Using mock output (OpenCV window)")
    logger.info("")

    # Create detector config
    use_mock_model = args.model is None

    if use_mock_model:
        logger.info("Using mock ML model (simulated ad detection)")
        model_path = "mock.tflite"
    else:
        logger.info(f"Using TFLite model: {args.model}")
        model_path = args.model

    detector_config = DetectorConfig(
        model_path=model_path,
        confidence_threshold=args.confidence,
        temporal_window=args.temporal_window,
        temporal_threshold=0.6,
        num_threads=4,
    )

    # Create compositor config
    pip_position = PiPPosition[args.pip_position.upper()]

    pip_config = PiPConfig(
        position=pip_position,
        size=pip_size,
        border_width=3,
        border_color=(255, 255, 0),  # Yellow border
        margin=30,
        opacity=1.0,
    )

    compositor_config = CompositorConfig(
        output_width=mode.width,
        output_height=mode.height,
        pip_config=pip_config,
        enable_pip=True,
    )

    # Create alternate content
    alternate_content = await create_alternate_content(
        args.alternate_content, mode.width, mode.height
    )

    # Create pipeline config
    pipeline_config = PipelineConfig(
        mode=mode,
        enable_stats=True,
        stats_interval_sec=float(args.stats_interval),
        max_latency_ms=150.0,  # Allow slightly higher latency for composition
    )

    # Create complete PiP pipeline
    pipeline = PiPPipeline(
        capture=capture,
        output=output,
        alternate_content=alternate_content,
        pipeline_config=pipeline_config,
        detector_config=detector_config,
        compositor_config=compositor_config,
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
        import traceback

        traceback.print_exc()
        return 1

    # Run
    try:
        logger.info("Starting complete PiP pipeline...")
        logger.info("=" * 60)
        logger.info("BEHAVIOR:")
        logger.info("  - Normal: TV feed shown full screen")
        logger.info("  - Ad detected: Alternate content full screen, TV in PiP")
        logger.info("  - Content resumes: Return to full screen TV")
        logger.info("=" * 60)
        logger.info("Press Ctrl+C to stop")
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
        logger.info("")
        logger.info("Interrupted by user")
        await pipeline.stop()

    except Exception as e:
        logger.error(f"Pipeline error: {e}")
        import traceback

        traceback.print_exc()
        await pipeline.stop()
        return 1

    finally:
        # Clean up
        await pipeline.close()
        await capture.close()
        await output.close()

        # Final stats
        logger.info("")
        logger.info("=" * 60)
        logger.info("FINAL STATISTICS")
        logger.info("=" * 60)

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
                f"  Average inference time: "
                f"{detector_stats.avg_inference_time_ms:.1f}ms"
            )

    logger.info("")
    logger.info("=" * 60)
    logger.info("Demo complete!")
    logger.info("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
