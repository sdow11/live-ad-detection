#!/usr/bin/env python3
"""Production-ready integrated system demo.

This script demonstrates the complete integrated system with:
- Video capture and processing
- ML-based ad detection
- PiP composition with alternate content
- TV control (channel change, mute, etc.)
- Multiple ad response strategies

Usage:
    # PiP only strategy (default)
    python demo_production.py

    # Channel change strategy
    python demo_production.py \
        --strategy channel_change \
        --original-channel "5-1" \
        --alternate-channel "5-2"

    # PiP with mute strategy
    python demo_production.py \
        --strategy pip_with_mute

    # Full production setup
    python demo_production.py \
        --device /dev/video0 \
        --model models/ad_detector.tflite \
        --strategy channel_change \
        --original-channel "5-1" \
        --alternate-channel "5-2" \
        --enable-tv-control \
        --tv-brand samsung
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

from ad_detection_common.models.device import DeviceCapability
from compositor import (
    CompositorConfig,
    PiPConfig,
    PiPPosition,
    ColorBarsSource,
    VideoFileSource,
)
from ml.detector import DetectorConfig
from ml.types import AdDetectionResult
from tv_control import TVBrand, TVControllerConfig, ControlMethod
from tv_control.controller import create_tv_controller
from video import MockVideoCapture, MockVideoOutput
from video.integrated_pipeline import IntegratedPipeline, AdResponseStrategy
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
        description="Production integrated system demo"
    )

    # Video settings
    parser.add_argument(
        "--device",
        type=str,
        default=None,
        help="V4L2 device path. If not specified, uses mock capture",
    )

    parser.add_argument(
        "--mode",
        type=str,
        default="720p30",
        choices=["720p30", "720p60", "1080p30", "1080p60"],
        help="Video mode",
    )

    # ML settings
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Path to TFLite model. If not specified, uses mock model",
    )

    parser.add_argument(
        "--confidence",
        type=float,
        default=0.5,
        help="Ad detection confidence threshold",
    )

    # TV control settings
    parser.add_argument(
        "--enable-tv-control",
        action="store_true",
        help="Enable TV control features",
    )

    parser.add_argument(
        "--tv-brand",
        type=str,
        default="generic",
        choices=["samsung", "lg", "sony", "vizio", "tcl", "generic"],
        help="TV brand for IR commands",
    )

    parser.add_argument(
        "--original-channel",
        type=str,
        default="5-1",
        help="Original channel to watch",
    )

    parser.add_argument(
        "--alternate-channel",
        type=str,
        default="5-2",
        help="Alternate channel during ads",
    )

    # Ad response strategy
    parser.add_argument(
        "--strategy",
        type=str,
        default="pip_only",
        choices=["pip_only", "channel_change", "input_switch", "pip_with_mute"],
        help="Ad response strategy",
    )

    # Alternate content
    parser.add_argument(
        "--alternate-content",
        type=str,
        default="colorbars",
        help="Alternate content: 'colorbars' or 'video:path'",
    )

    # Runtime settings
    parser.add_argument(
        "--duration",
        type=int,
        default=120,
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


async def on_ad_start(result: AdDetectionResult):
    """Callback when ad is detected."""
    logger.warning(
        f"\n{'='*60}\n"
        f"🎬 ADVERTISEMENT DETECTED\n"
        f"{'='*60}\n"
        f"Frame: {result.frame_number}\n"
        f"Confidence: {result.confidence:.3f} ({result.confidence_level.value})\n"
        f"Inference Time: {result.inference_time_ms:.1f}ms\n"
        f"{'='*60}\n"
    )


async def on_ad_end(result: AdDetectionResult):
    """Callback when ad ends."""
    logger.info(
        f"\n{'='*60}\n"
        f"📺 REGULAR CONTENT RESUMED\n"
        f"{'='*60}\n"
        f"Frame: {result.frame_number}\n"
        f"{'='*60}\n"
    )


async def main():
    """Main demo function."""
    args = parse_args()

    mode = mode_from_string(args.mode)
    strategy = AdResponseStrategy[args.strategy.upper()]

    # Print configuration
    logger.info("\n" + "=" * 60)
    logger.info("PRODUCTION INTEGRATED SYSTEM")
    logger.info("=" * 60)
    logger.info(f"Video Mode: {mode.value}")
    logger.info(f"Ad Response Strategy: {strategy.value}")
    logger.info(f"Original Channel: {args.original_channel}")

    if strategy == AdResponseStrategy.CHANNEL_CHANGE:
        logger.info(f"Alternate Channel: {args.alternate_channel}")

    logger.info(f"TV Control: {'Enabled' if args.enable_tv_control else 'Disabled'}")

    if args.enable_tv_control:
        logger.info(f"TV Brand: {args.tv_brand}")

    logger.info(f"ML Model: {'Mock' if not args.model else args.model}")
    logger.info(f"Alternate Content: {args.alternate_content}")
    logger.info("=" * 60 + "\n")

    # Create capture
    logger.info("Initializing video capture...")
    capture_config = VideoCaptureConfig(mode=mode)
    capture = MockVideoCapture(capture_config)

    # Create output
    output_config = VideoOutputConfig(mode=mode, vsync=False)
    output = MockVideoOutput(output_config)

    # Create TV controller if enabled
    tv_controller = None

    if args.enable_tv_control:
        logger.info(f"Initializing TV controller ({args.tv_brand})...")

        tv_brand = TVBrand[args.tv_brand.upper()]

        # Determine available control methods
        # In production, this would be detected from actual hardware
        control_methods = [ControlMethod.IR_BLASTER]  # Default to IR

        tv_config = TVControllerConfig(
            device_id="demo-device",
            brand=tv_brand,
            preferred_methods=control_methods,
            ir_remote_name=f"{args.tv_brand}_tv",
        )

        try:
            tv_controller = await create_tv_controller(tv_config)
            logger.info("✅ TV controller initialized")

            # Set to original channel
            logger.info(f"Setting initial channel to {args.original_channel}...")
            await tv_controller.set_channel(args.original_channel)

        except Exception as e:
            logger.warning(f"⚠️  TV controller initialization failed: {e}")
            logger.warning("Continuing without TV control...")
            tv_controller = None

    # Create detector config
    use_mock_model = args.model is None

    if use_mock_model:
        logger.info("Using mock ML model (simulated detection)")
        model_path = "mock.tflite"
    else:
        logger.info(f"Using TFLite model: {args.model}")
        model_path = args.model

    detector_config = DetectorConfig(
        model_path=model_path,
        confidence_threshold=args.confidence,
        temporal_window=5,
        temporal_threshold=0.6,
        num_threads=4,
    )

    # Create alternate content
    if args.alternate_content == "colorbars":
        alternate_content = ColorBarsSource(width=mode.width, height=mode.height)
    elif args.alternate_content.startswith("video:"):
        video_path = args.alternate_content[6:]
        alternate_content = VideoFileSource(video_path, loop=True)
    else:
        alternate_content = ColorBarsSource(width=mode.width, height=mode.height)

    # Create compositor config
    pip_config = PiPConfig(
        position=PiPPosition.BOTTOM_RIGHT,
        size=(480, 270),
        border_width=3,
        border_color=(255, 255, 0),  # Yellow border
        margin=30,
    )

    compositor_config = CompositorConfig(
        output_width=mode.width,
        output_height=mode.height,
        pip_config=pip_config,
        enable_pip=True,
    )

    # Create pipeline config
    pipeline_config = PipelineConfig(
        mode=mode,
        enable_stats=True,
        stats_interval_sec=10.0,
        max_latency_ms=150.0,
    )

    # Create integrated pipeline
    logger.info("Creating integrated pipeline...")

    pipeline = IntegratedPipeline(
        capture=capture,
        output=output,
        tv_controller=tv_controller,
        alternate_content=alternate_content,
        alternate_channel=args.alternate_channel,
        original_channel=args.original_channel,
        strategy=strategy,
        pipeline_config=pipeline_config,
        detector_config=detector_config,
        compositor_config=compositor_config,
        use_mock_model=use_mock_model,
    )

    # Register callbacks
    pipeline.on_ad_start(on_ad_start)
    pipeline.on_ad_end(on_ad_end)

    # Initialize
    try:
        await pipeline.initialize()
        logger.info("✅ Pipeline initialized successfully\n")

    except Exception as e:
        logger.error(f"❌ Failed to initialize pipeline: {e}")
        import traceback

        traceback.print_exc()
        return 1

    # Run
    try:
        logger.info("=" * 60)
        logger.info("STARTING PRODUCTION SYSTEM")
        logger.info("=" * 60)
        logger.info(f"Strategy: {strategy.value}")

        if strategy == AdResponseStrategy.PIP_ONLY:
            logger.info("  → When ad detected: Show alternate content in PiP")
        elif strategy == AdResponseStrategy.CHANNEL_CHANGE:
            logger.info(
                f"  → When ad detected: Change to channel {args.alternate_channel}"
            )
            logger.info(
                f"  → When ad ends: Restore channel {args.original_channel}"
            )
        elif strategy == AdResponseStrategy.PIP_WITH_MUTE:
            logger.info("  → When ad detected: Show PiP and mute TV")
            logger.info("  → When ad ends: Unmute TV")

        logger.info("=" * 60)
        logger.info("Press Ctrl+C to stop\n")

        if args.duration > 0:

            async def stop_after_duration():
                await asyncio.sleep(args.duration)
                await pipeline.stop()
                logger.info(f"\n⏱️  Stopped after {args.duration} seconds")

            await asyncio.gather(pipeline.run(), stop_after_duration())

        else:
            await pipeline.run()

    except KeyboardInterrupt:
        logger.info("\n\n🛑 Interrupted by user")
        await pipeline.stop()

    except Exception as e:
        logger.error(f"\n❌ Pipeline error: {e}")
        import traceback

        traceback.print_exc()
        await pipeline.stop()
        return 1

    finally:
        # Clean up
        logger.info("\nShutting down...")
        await pipeline.close()
        await capture.close()
        await output.close()

        # Final stats
        logger.info("\n" + "=" * 60)
        logger.info("FINAL STATISTICS")
        logger.info("=" * 60)

        stats = pipeline.get_stats()
        logger.info(f"Frames: {stats.frames_captured} captured, {stats.frames_displayed} displayed")
        logger.info(f"Drop Rate: {stats.drop_rate * 100:.2f}%")
        logger.info(f"Average FPS: {stats.average_fps:.1f}")
        logger.info(
            f"Latency: {stats.average_latency_ms:.1f}ms avg "
            f"(min: {stats.min_latency_ms:.1f}ms, max: {stats.max_latency_ms:.1f}ms)"
        )

        logger.info("\n" + pipeline.get_ml_stats())

        detector_stats = pipeline.detector.get_stats()
        if detector_stats.total_frames > 0:
            logger.info("\nAd Detection Summary:")
            logger.info(
                f"  Frames with ads: {detector_stats.ad_frames} "
                f"({detector_stats.ad_ratio*100:.1f}%)"
            )
            logger.info(
                f"  Frames with content: {detector_stats.content_frames} "
                f"({detector_stats.content_ratio*100:.1f}%)"
            )
            logger.info(
                f"  Average confidence: {detector_stats.avg_confidence:.3f}"
            )

        logger.info("=" * 60 + "\n")

    logger.info("✅ Production system demo complete!\n")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
