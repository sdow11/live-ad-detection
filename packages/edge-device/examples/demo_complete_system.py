#!/usr/bin/env python3
"""Complete end-to-end system demonstration.

This demo shows the entire live TV ad detection system working together:
- Edge device with video processing, ML detection, and TV control
- Cloud reporting (heartbeat, health, telemetry)
- Cloud API receiving and storing device data
- Admin dashboard for fleet monitoring

Architecture:
    Cloud API (localhost:8000) ←--→ Edge Device(s) (video pipeline)
                ↓
        Admin Dashboard (browser)

Usage:
    # Start cloud API first (in separate terminal):
    $ python demo_cloud_api.py

    # Then start edge device(s):
    $ python demo_complete_system.py --device-id rpi-001 --location-id 1

    # Open dashboard:
    $ open http://localhost:8000/dashboard.html
"""

import asyncio
import argparse
import logging
import signal
import sys
from pathlib import Path

# Cloud reporter
from cloud_reporter import CloudReporter, CloudReporterConfig

# Video pipeline components
from video.capture import MockVideoCapture
from video.output import MockVideoOutput
from video.types import VideoMode
from video.integrated_pipeline import IntegratedPipeline, AdResponseStrategy

# TV control
from tv_control import TVControllerConfig
from tv_control.controller import UnifiedTVController, create_tv_controller

# Compositor and content
from compositor import CompositorConfig
from compositor.content_source import ColorBarsSource

# Device models
from ad_detection_common.models.device import DeviceRole

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('edge_device.log')
    ]
)

logger = logging.getLogger(__name__)


class CompleteSystemDemo:
    """Complete end-to-end system demonstration."""

    def __init__(
        self,
        device_id: str,
        location_id: int,
        cloud_api_url: str = "http://localhost:8000",
        role: DeviceRole = DeviceRole.WORKER,
        strategy: AdResponseStrategy = AdResponseStrategy.PIP_ONLY,
        enable_tv_control: bool = False,
        video_mode: VideoMode = VideoMode.HD_720P_30
    ):
        """Initialize complete system demo.

        Args:
            device_id: Unique device identifier
            location_id: Location ID in cloud database
            cloud_api_url: Cloud API base URL
            role: Device role (coordinator or worker)
            strategy: Ad response strategy
            enable_tv_control: Enable actual TV control
            video_mode: Video resolution and framerate
        """
        self.device_id = device_id
        self.location_id = location_id
        self.cloud_api_url = cloud_api_url
        self.role = role
        self.strategy = strategy
        self.enable_tv_control = enable_tv_control
        self.video_mode = video_mode

        # Components
        self.pipeline = None
        self.cloud_reporter = None
        self.capture = None
        self.output = None
        self.tv_controller = None
        self.alternate_content = None

        # Shutdown flag
        self._shutdown = False

    async def setup(self) -> None:
        """Set up all system components."""
        logger.info("=" * 70)
        logger.info("🚀 STARTING COMPLETE AD DETECTION SYSTEM")
        logger.info("=" * 70)
        logger.info(f"Device ID: {self.device_id}")
        logger.info(f"Location ID: {self.location_id}")
        logger.info(f"Role: {self.role.value}")
        logger.info(f"Strategy: {self.strategy.value}")
        logger.info(f"Cloud API: {self.cloud_api_url}")
        logger.info(f"TV Control: {'ENABLED' if self.enable_tv_control else 'MOCK'}")
        logger.info(f"Video Mode: {self.video_mode.value}")
        logger.info("=" * 70)

        # 1. Create cloud reporter
        logger.info("📡 Setting up cloud reporter...")
        cloud_config = CloudReporterConfig(
            cloud_api_url=self.cloud_api_url,
            device_id=self.device_id,
            location_id=self.location_id,
            heartbeat_interval_sec=30.0,
            health_interval_sec=300.0,  # 5 minutes
            telemetry_interval_sec=3600.0,  # 1 hour
            enable_heartbeat=True,
            enable_health_reporting=True,
            enable_telemetry_reporting=True,
            enable_firmware_checks=True
        )

        self.cloud_reporter = CloudReporter(
            config=cloud_config,
            role=self.role,
            firmware_version="1.0.0-demo"
        )

        # 2. Create video capture (mock for demo)
        logger.info("📹 Setting up video capture...")
        self.capture = MockVideoCapture(mode=self.video_mode)

        # 3. Create video output (mock for demo)
        logger.info("🖥️  Setting up video output...")
        self.output = MockVideoOutput()

        # 4. Create alternate content source
        logger.info("🎨 Setting up alternate content...")
        self.alternate_content = ColorBarsSource(
            width=self.video_mode.width,
            height=self.video_mode.height,
            fps=self.video_mode.fps
        )

        # 5. Create TV controller
        if self.enable_tv_control:
            logger.info("📺 Setting up TV controller...")
            tv_config = TVControllerConfig(
                ir_enabled=True,
                cec_enabled=True,
                http_enabled=False,
                bluetooth_enabled=False,
                ir_remote_name="samsung",
                ir_device="/dev/lirc0"
            )
            self.tv_controller = await create_tv_controller(tv_config)
        else:
            logger.info("📺 TV control disabled (mock mode)")
            self.tv_controller = None

        # 6. Create integrated pipeline
        logger.info("⚙️  Setting up integrated pipeline...")
        compositor_config = CompositorConfig(
            pip_width=320,
            pip_height=180,
            pip_position_x=20,
            pip_position_y=20,
            border_width=2,
            border_color=(255, 255, 255)
        )

        self.pipeline = IntegratedPipeline(
            capture=self.capture,
            output=self.output,
            tv_controller=self.tv_controller,
            cloud_reporter=self.cloud_reporter,
            alternate_content=self.alternate_content,
            alternate_channel="5-1",
            original_channel="2-1",
            strategy=self.strategy,
            compositor_config=compositor_config,
            use_mock_model=True  # Using mock ML model for demo
        )

        # 7. Initialize pipeline
        logger.info("🔧 Initializing pipeline...")
        await self.pipeline.initialize()

        logger.info("✅ System setup complete!")
        logger.info("")

    async def run(self) -> None:
        """Run the complete system."""
        logger.info("▶️  STARTING VIDEO PIPELINE")
        logger.info("=" * 70)
        logger.info("The system is now running with:")
        logger.info("  • Video processing and ML ad detection")
        logger.info("  • Picture-in-Picture composition")
        logger.info("  • TV control (if enabled)")
        logger.info("  • Cloud reporting (heartbeat, health, telemetry)")
        logger.info("")
        logger.info("Cloud dashboard: http://localhost:8000/dashboard.html")
        logger.info("")
        logger.info("Press Ctrl+C to stop...")
        logger.info("=" * 70)

        # Set up signal handlers
        def signal_handler(signum, frame):
            logger.info("\n🛑 Received shutdown signal...")
            self._shutdown = True

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        # Run pipeline with periodic status updates
        try:
            # Start pipeline in background
            pipeline_task = asyncio.create_task(self.pipeline.run())

            # Status update task
            async def status_updates():
                """Print periodic status updates."""
                while not self._shutdown:
                    await asyncio.sleep(60.0)  # Every minute

                    # Get pipeline stats
                    stats = self.pipeline.get_stats()

                    # Get cloud reporter stats
                    cloud_stats = self.cloud_reporter.get_stats()

                    logger.info("")
                    logger.info("📊 STATUS UPDATE")
                    logger.info("-" * 70)
                    logger.info(f"Frames processed: {stats.frames_processed}")
                    logger.info(f"Average FPS: {stats.average_fps:.1f}")
                    logger.info(f"Average latency: {stats.average_latency_ms:.1f}ms")
                    logger.info(f"Drop rate: {stats.drop_rate:.2%}")
                    logger.info(f"Cloud registered: {cloud_stats['registered']}")
                    logger.info(f"Last heartbeat: {cloud_stats['last_heartbeat']}")
                    logger.info("-" * 70)

            status_task = asyncio.create_task(status_updates())

            # Wait for shutdown
            await pipeline_task

        except asyncio.CancelledError:
            logger.info("Pipeline cancelled")
        except Exception as e:
            logger.error(f"Pipeline error: {e}", exc_info=True)
        finally:
            # Cancel status updates
            if 'status_task' in locals():
                status_task.cancel()
                try:
                    await status_task
                except asyncio.CancelledError:
                    pass

    async def shutdown(self) -> None:
        """Shutdown all system components."""
        logger.info("")
        logger.info("=" * 70)
        logger.info("🛑 SHUTTING DOWN SYSTEM")
        logger.info("=" * 70)

        # Stop pipeline
        if self.pipeline:
            logger.info("Stopping pipeline...")
            await self.pipeline.close()

            # Print final statistics
            stats = self.pipeline.get_stats()
            logger.info("")
            logger.info("📈 FINAL STATISTICS")
            logger.info("-" * 70)
            logger.info(f"Total frames processed: {stats.frames_processed}")
            logger.info(f"Total runtime: {stats.total_runtime_seconds:.1f}s")
            logger.info(f"Average FPS: {stats.average_fps:.1f}")
            logger.info(f"Average latency: {stats.average_latency_ms:.1f}ms")
            logger.info(f"Drop rate: {stats.drop_rate:.2%}")
            logger.info("-" * 70)

        # Cloud reporter is stopped by pipeline.close()

        logger.info("✅ Shutdown complete")


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Complete live TV ad detection system demo"
    )
    parser.add_argument(
        "--device-id",
        type=str,
        default="rpi-demo-001",
        help="Unique device identifier"
    )
    parser.add_argument(
        "--location-id",
        type=int,
        default=1,
        help="Location ID in cloud database"
    )
    parser.add_argument(
        "--cloud-api-url",
        type=str,
        default="http://localhost:8000",
        help="Cloud API base URL"
    )
    parser.add_argument(
        "--role",
        type=str,
        choices=["coordinator", "worker"],
        default="worker",
        help="Device role"
    )
    parser.add_argument(
        "--strategy",
        type=str,
        choices=["pip_only", "channel_change", "input_switch", "pip_with_mute"],
        default="pip_only",
        help="Ad response strategy"
    )
    parser.add_argument(
        "--enable-tv-control",
        action="store_true",
        help="Enable actual TV control (requires hardware)"
    )
    parser.add_argument(
        "--video-mode",
        type=str,
        choices=["720p30", "720p60", "1080p30", "1080p60"],
        default="720p30",
        help="Video resolution and framerate"
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=0,
        help="Run duration in seconds (0 = infinite)"
    )

    args = parser.parse_args()

    # Map string arguments to enums
    role = DeviceRole.COORDINATOR if args.role == "coordinator" else DeviceRole.WORKER
    strategy = AdResponseStrategy(args.strategy)

    video_mode_map = {
        "720p30": VideoMode.HD_720P_30,
        "720p60": VideoMode.HD_720P_60,
        "1080p30": VideoMode.FHD_1080P_30,
        "1080p60": VideoMode.FHD_1080P_60,
    }
    video_mode = video_mode_map[args.video_mode]

    # Create and run demo
    demo = CompleteSystemDemo(
        device_id=args.device_id,
        location_id=args.location_id,
        cloud_api_url=args.cloud_api_url,
        role=role,
        strategy=strategy,
        enable_tv_control=args.enable_tv_control,
        video_mode=video_mode
    )

    try:
        # Setup
        await demo.setup()

        # Run
        if args.duration > 0:
            # Run for specified duration
            logger.info(f"Running for {args.duration} seconds...")
            await asyncio.wait_for(demo.run(), timeout=args.duration)
        else:
            # Run indefinitely
            await demo.run()

    except asyncio.TimeoutError:
        logger.info(f"Demo completed ({args.duration}s)")
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Demo error: {e}", exc_info=True)
        return 1
    finally:
        # Shutdown
        await demo.shutdown()

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
