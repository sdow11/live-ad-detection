"""Karaoke App.

Full karaoke system with lyric display and video playback.
Supports standard karaoke video formats (MP4+G, CDG, etc.).
"""

import asyncio
import logging
import subprocess
from pathlib import Path
from typing import List, Optional

import pygame

from home_screen.app_framework import AppCategory, AppStatus, BaseApp

logger = logging.getLogger(__name__)


class KaraokeApp(BaseApp):
    """Karaoke application with lyric display."""

    def __init__(self):
        """Initialize karaoke app."""
        super().__init__(
            app_id="karaoke",
            name="Karaoke",
            description="Sing along with your favorite songs",
            icon="🎤",
            category=AppCategory.ENTERTAINMENT,
            version="1.0.0"
        )

        self.screen = None
        self.running = False
        self.songs = []
        self.current_song_index = 0
        self.player_process = None
        self.ui_task = None

    async def start(self) -> bool:
        """Start karaoke app.

        Returns:
            True if started successfully
        """
        try:
            logger.info("Starting karaoke app")

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
            pygame.display.set_caption("Karaoke")

            # Load song library
            self._load_songs()

            # Start UI loop
            self.running = True
            self.ui_task = asyncio.create_task(self._ui_loop())

            self.status = AppStatus.RUNNING
            logger.info("Karaoke app started successfully")

            return True

        except Exception as e:
            logger.error(f"Failed to start karaoke app: {e}", exc_info=True)
            self.error_message = str(e)
            self.status = AppStatus.ERROR
            return False

    async def stop(self) -> bool:
        """Stop karaoke app.

        Returns:
            True if stopped successfully
        """
        try:
            logger.info("Stopping karaoke app")

            self.running = False

            # Stop video player
            if self.player_process:
                self.player_process.terminate()
                self.player_process.wait()
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
            logger.info("Karaoke app stopped successfully")

            return True

        except Exception as e:
            logger.error(f"Failed to stop karaoke app: {e}", exc_info=True)
            return False

    def _load_songs(self) -> None:
        """Load karaoke song library."""
        songs_dir = Path(self.config.get("songs_dir", "/var/lib/ad-detection/karaoke/songs"))

        if songs_dir.exists():
            # Find all karaoke files
            for ext in ["*.mp4", "*.mkv", "*.cdg", "*.kar"]:
                self.songs.extend(songs_dir.glob(ext))

            self.songs.sort()
            logger.info(f"Loaded {len(self.songs)} karaoke songs")
        else:
            logger.warning(f"Karaoke songs directory not found: {songs_dir}")

    def _play_song(self, song_path: Path) -> None:
        """Play karaoke song using vlc or omxplayer.

        Args:
            song_path: Path to karaoke file
        """
        try:
            # Stop current player if any
            if self.player_process:
                self.player_process.terminate()
                self.player_process.wait()

            # Start new player (using VLC for better format support)
            # For Raspberry Pi, could use omxplayer for better performance
            self.player_process = subprocess.Popen([
                "vlc",
                "--fullscreen",
                "--no-video-title-show",
                str(song_path)
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            logger.info(f"Playing karaoke song: {song_path.name}")

        except Exception as e:
            logger.error(f"Failed to play song: {e}")

    async def _ui_loop(self) -> None:
        """Main UI loop for song selection."""
        # Initialize fonts
        try:
            title_font = pygame.font.Font(None, 72)
            song_font = pygame.font.Font(None, 48)
            inst_font = pygame.font.Font(None, 36)
        except:
            title_font = pygame.font.SysFont("arial", 72)
            song_font = pygame.font.SysFont("arial", 48)
            inst_font = pygame.font.SysFont("arial", 36)

        # Colors
        BG_COLOR = (30, 15, 50)
        TEXT_COLOR = (255, 255, 255)
        SELECTED_BG = (150, 50, 150)
        NORMAL_BG = (70, 35, 100)

        selected_index = 0
        is_playing = False

        while self.running:
            # Handle events
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False

                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        if is_playing:
                            # Stop playback
                            if self.player_process:
                                self.player_process.terminate()
                                is_playing = False
                        else:
                            # Exit app
                            self.running = False

                    elif not is_playing:
                        if event.key == pygame.K_UP:
                            selected_index = (selected_index - 1) % max(1, len(self.songs))
                        elif event.key == pygame.K_DOWN:
                            selected_index = (selected_index + 1) % max(1, len(self.songs))
                        elif event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                            if self.songs:
                                self._play_song(self.songs[selected_index])
                                is_playing = True

            # Check if player is still running
            if is_playing and self.player_process and self.player_process.poll() is not None:
                is_playing = False

            # Draw UI (only when not playing)
            if not is_playing:
                self.screen.fill(BG_COLOR)

                # Draw title
                title_text = title_font.render("🎤 KARAOKE", True, TEXT_COLOR)
                title_rect = title_text.get_rect(centerx=self.screen.get_width() // 2, y=50)
                self.screen.blit(title_text, title_rect)

                if self.songs:
                    # Draw song list
                    y_offset = 200
                    visible_songs = 8
                    start_index = max(0, selected_index - visible_songs // 2)
                    end_index = min(len(self.songs), start_index + visible_songs)

                    for i in range(start_index, end_index):
                        song = self.songs[i]
                        is_selected = (i == selected_index)

                        # Draw background
                        bg_color = SELECTED_BG if is_selected else NORMAL_BG
                        rect = pygame.Rect(100, y_offset, self.screen.get_width() - 200, 60)
                        pygame.draw.rect(self.screen, bg_color, rect, border_radius=5)

                        # Draw song name
                        song_text = song_font.render(song.stem, True, TEXT_COLOR)
                        song_rect = song_text.get_rect(centerx=rect.centerx, centery=rect.centery)
                        self.screen.blit(song_text, song_rect)

                        y_offset += 70

                    # Draw instructions
                    instructions = "↑↓ to select | ENTER to play | ESC to exit"
                    inst_text = inst_font.render(instructions, True, (200, 200, 200))
                    inst_rect = inst_text.get_rect(
                        centerx=self.screen.get_width() // 2,
                        bottom=self.screen.get_height() - 30
                    )
                    self.screen.blit(inst_text, inst_rect)

                else:
                    # No songs available
                    no_songs_text = song_font.render("No karaoke songs found", True, (200, 100, 100))
                    no_songs_rect = no_songs_text.get_rect(
                        centerx=self.screen.get_width() // 2,
                        centery=self.screen.get_height() // 2
                    )
                    self.screen.blit(no_songs_text, no_songs_rect)

                    inst_text = inst_font.render(f"Add songs to: {self.config.get('songs_dir', '/var/lib/ad-detection/karaoke/songs')}", True, (150, 150, 150))
                    inst_rect = inst_text.get_rect(
                        centerx=self.screen.get_width() // 2,
                        centery=self.screen.get_height() // 2 + 80
                    )
                    self.screen.blit(inst_text, inst_rect)

                pygame.display.flip()

            # Control frame rate
            await asyncio.sleep(1 / 60)

        logger.info("Karaoke app UI loop ended")
