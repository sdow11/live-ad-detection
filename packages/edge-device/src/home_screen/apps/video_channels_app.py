"""Video Channels App.

Multi-channel video player supporting various sources:
- HDMI inputs
- Streaming URLs (RTSP, HLS, etc.)
- Local video files
- Network cameras
"""

import asyncio
import json
import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import pygame

from home_screen.app_framework import AppCategory, AppStatus, BaseApp

logger = logging.getLogger(__name__)


@dataclass
class VideoChannel:
    """Video channel configuration."""

    channel_id: str
    name: str
    source_type: str  # "hdmi", "stream", "file", "camera"
    source_uri: str  # HDMI device path, stream URL, file path, etc.
    description: Optional[str] = None
    icon: str = "📺"

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "channel_id": self.channel_id,
            "name": self.name,
            "source_type": self.source_type,
            "source_uri": self.source_uri,
            "description": self.description,
            "icon": self.icon
        }


class VideoChannelsApp(BaseApp):
    """Video channels application."""

    def __init__(self):
        """Initialize video channels app."""
        super().__init__(
            app_id="video_channels",
            name="Video Channels",
            description="Watch multiple video sources and channels",
            icon="📡",
            category=AppCategory.VIDEO,
            version="1.0.0"
        )

        self.screen = None
        self.running = False
        self.channels: List[VideoChannel] = []
        self.current_channel_index = 0
        self.player_process = None
        self.ui_task = None

    async def start(self) -> bool:
        """Start video channels app.

        Returns:
            True if started successfully
        """
        try:
            logger.info("Starting video channels app")

            # Initialize pygame for UI
            pygame.init()

            # Get display resolution
            display_info = pygame.display.Info()
            screen_width = display_info.current_w
            screen_height = display_info.current_h

            # Create fullscreen window
            self.screen = pygame.display.set_mode(
                (screen_width, screen_height),
                pygame.FULLSCREEN
            )
            pygame.display.set_caption("Video Channels")

            # Load channels
            self._load_channels()

            # Start UI loop
            self.running = True
            self.ui_task = asyncio.create_task(self._ui_loop())

            self.status = AppStatus.RUNNING
            logger.info("Video channels app started successfully")

            return True

        except Exception as e:
            logger.error(f"Failed to start video channels app: {e}", exc_info=True)
            self.error_message = str(e)
            self.status = AppStatus.ERROR
            return False

    async def stop(self) -> bool:
        """Stop video channels app.

        Returns:
            True if stopped successfully
        """
        try:
            logger.info("Stopping video channels app")

            self.running = False

            # Stop video player
            if self.player_process:
                self.player_process.terminate()
                try:
                    self.player_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.player_process.kill()
                self.player_process = None

            # Stop UI task
            if self.ui_task:
                self.ui_task.cancel()
                try:
                    await self.ui_task
                except asyncio.CancelledError:
                    pass

            if self.screen:
                pygame.quit()
                self.screen = None

            self.status = AppStatus.STOPPED
            logger.info("Video channels app stopped successfully")

            return True

        except Exception as e:
            logger.error(f"Failed to stop video channels app: {e}", exc_info=True)
            return False

    def _load_channels(self) -> None:
        """Load video channels from configuration."""
        channels_file = Path(self.config.get(
            "channels_config",
            "/var/lib/ad-detection/video-channels/channels.json"
        ))

        # Default channels
        self.channels = [
            VideoChannel(
                channel_id="hdmi1",
                name="HDMI Input 1",
                source_type="hdmi",
                source_uri="/dev/video0",
                description="Primary HDMI input",
                icon="📺"
            ),
            VideoChannel(
                channel_id="hdmi2",
                name="HDMI Input 2",
                source_type="hdmi",
                source_uri="/dev/video1",
                description="Secondary HDMI input",
                icon="📺"
            ),
            VideoChannel(
                channel_id="stream1",
                name="NASA TV",
                source_type="stream",
                source_uri="https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8",
                description="NASA TV Public Stream",
                icon="🚀"
            ),
            VideoChannel(
                channel_id="stream2",
                name="Big Buck Bunny",
                source_type="stream",
                source_uri="http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
                description="Sample video stream",
                icon="🐰"
            )
        ]

        if channels_file.exists():
            try:
                with open(channels_file) as f:
                    data = json.load(f)
                    custom_channels = []
                    for ch_data in data.get("channels", []):
                        custom_channels.append(VideoChannel(
                            channel_id=ch_data["channel_id"],
                            name=ch_data["name"],
                            source_type=ch_data["source_type"],
                            source_uri=ch_data["source_uri"],
                            description=ch_data.get("description"),
                            icon=ch_data.get("icon", "📺")
                        ))
                    # Prepend custom channels
                    self.channels = custom_channels + self.channels
                    logger.info(f"Loaded {len(custom_channels)} custom channels")
            except Exception as e:
                logger.warning(f"Failed to load channels config: {e}")

        logger.info(f"Total channels available: {len(self.channels)}")

    def _play_channel(self, channel: VideoChannel) -> None:
        """Play video channel.

        Args:
            channel: Channel to play
        """
        try:
            # Stop current player if any
            if self.player_process:
                self.player_process.terminate()
                try:
                    self.player_process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.player_process.kill()

            # Build player command based on source type
            if channel.source_type == "hdmi":
                # Use GStreamer for HDMI capture
                cmd = [
                    "gst-launch-1.0",
                    "-v",
                    f"v4l2src device={channel.source_uri}",
                    "!",
                    "videoconvert",
                    "!",
                    "autovideosink"
                ]
            elif channel.source_type in ["stream", "file"]:
                # Use VLC for streams and files
                cmd = [
                    "vlc",
                    "--fullscreen",
                    "--no-video-title-show",
                    "--play-and-exit",
                    channel.source_uri
                ]
            elif channel.source_type == "camera":
                # Network camera (RTSP usually)
                cmd = [
                    "vlc",
                    "--fullscreen",
                    "--no-video-title-show",
                    "--network-caching=1000",
                    channel.source_uri
                ]
            else:
                logger.error(f"Unknown source type: {channel.source_type}")
                return

            # Launch player
            self.player_process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )

            logger.info(f"Playing channel: {channel.name} ({channel.source_uri})")

        except Exception as e:
            logger.error(f"Failed to play channel: {e}")

    async def _ui_loop(self) -> None:
        """Main UI loop for channel selection."""
        # Initialize fonts
        try:
            title_font = pygame.font.Font(None, 72)
            channel_font = pygame.font.Font(None, 48)
            desc_font = pygame.font.Font(None, 32)
            inst_font = pygame.font.Font(None, 36)
        except:
            title_font = pygame.font.SysFont("arial", 72)
            channel_font = pygame.font.SysFont("arial", 48)
            desc_font = pygame.font.SysFont("arial", 32)
            inst_font = pygame.font.SysFont("arial", 36)

        # Colors
        BG_COLOR = (20, 25, 35)
        TEXT_COLOR = (255, 255, 255)
        SELECTED_BG = (80, 140, 200)
        NORMAL_BG = (50, 60, 75)
        DESC_COLOR = (180, 180, 180)

        selected_index = 0
        is_playing = False
        show_channel_list = True

        while self.running:
            # Handle events
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False

                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        if is_playing:
                            # Stop playback, return to list
                            if self.player_process:
                                self.player_process.terminate()
                                self.player_process = None
                            is_playing = False
                            show_channel_list = True
                        else:
                            # Exit app
                            self.running = False

                    elif event.key == pygame.K_m:
                        # Toggle menu
                        if is_playing:
                            show_channel_list = not show_channel_list

                    elif not is_playing or show_channel_list:
                        if event.key == pygame.K_UP:
                            selected_index = (selected_index - 1) % max(1, len(self.channels))
                        elif event.key == pygame.K_DOWN:
                            selected_index = (selected_index + 1) % max(1, len(self.channels))
                        elif event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                            if self.channels:
                                self._play_channel(self.channels[selected_index])
                                is_playing = True
                                show_channel_list = False
                        elif event.key in [pygame.K_LEFT, pygame.K_RIGHT]:
                            # Quick channel switching
                            if is_playing:
                                if event.key == pygame.K_LEFT:
                                    selected_index = (selected_index - 1) % max(1, len(self.channels))
                                else:
                                    selected_index = (selected_index + 1) % max(1, len(self.channels))
                                self._play_channel(self.channels[selected_index])

            # Check if player is still running
            if is_playing and self.player_process and self.player_process.poll() is not None:
                # Player exited
                is_playing = False
                show_channel_list = True

            # Draw UI (only when channel list is visible)
            if show_channel_list:
                self.screen.fill(BG_COLOR)

                # Draw title
                title_text = title_font.render("📡 VIDEO CHANNELS", True, TEXT_COLOR)
                title_rect = title_text.get_rect(centerx=self.screen.get_width() // 2, y=50)
                self.screen.blit(title_text, title_rect)

                if self.channels:
                    # Draw channel list
                    y_offset = 180
                    visible_channels = 7
                    start_index = max(0, selected_index - visible_channels // 2)
                    end_index = min(len(self.channels), start_index + visible_channels)

                    for i in range(start_index, end_index):
                        channel = self.channels[i]
                        is_selected = (i == selected_index)

                        # Draw background
                        bg_color = SELECTED_BG if is_selected else NORMAL_BG
                        rect = pygame.Rect(100, y_offset, self.screen.get_width() - 200, 75)
                        pygame.draw.rect(self.screen, bg_color, rect, border_radius=5)

                        # Draw channel name with icon
                        channel_text = channel_font.render(
                            f"{channel.icon} {channel.name}",
                            True,
                            TEXT_COLOR
                        )
                        channel_rect = channel_text.get_rect(x=rect.x + 20, y=rect.y + 10)
                        self.screen.blit(channel_text, channel_rect)

                        # Draw description
                        if channel.description:
                            desc_text = desc_font.render(channel.description, True, DESC_COLOR)
                            desc_rect = desc_text.get_rect(x=rect.x + 20, y=rect.y + 45)
                            self.screen.blit(desc_text, desc_rect)

                        y_offset += 85

                    # Draw instructions
                    if is_playing:
                        instructions = "↑↓ to select | ENTER to play | ←→ to switch | M to hide menu | ESC to exit"
                    else:
                        instructions = "↑↓ to select | ENTER to play | ESC to exit"

                    inst_text = inst_font.render(instructions, True, (200, 200, 200))
                    inst_rect = inst_text.get_rect(
                        centerx=self.screen.get_width() // 2,
                        bottom=self.screen.get_height() - 30
                    )
                    self.screen.blit(inst_text, inst_rect)

                else:
                    # No channels available
                    no_channels_text = channel_font.render("No channels configured", True, (200, 100, 100))
                    no_channels_rect = no_channels_text.get_rect(
                        centerx=self.screen.get_width() // 2,
                        centery=self.screen.get_height() // 2
                    )
                    self.screen.blit(no_channels_text, no_channels_rect)

                    inst_text = inst_font.render(
                        f"Add channels to: {self.config.get('channels_config', '/var/lib/ad-detection/video-channels/channels.json')}",
                        True,
                        (150, 150, 150)
                    )
                    inst_rect = inst_text.get_rect(
                        centerx=self.screen.get_width() // 2,
                        centery=self.screen.get_height() // 2 + 80
                    )
                    self.screen.blit(inst_text, inst_rect)

                pygame.display.flip()

            # Control frame rate
            await asyncio.sleep(1 / 60)

        logger.info("Video channels app UI loop ended")
