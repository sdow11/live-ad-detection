"""Home Screen Launcher.

Main launcher interface with grid of available apps.
Allows user to browse and launch installed applications.
"""

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import pygame

from home_screen.app_framework import AppRegistry, BaseApp, AppStatus
from home_screen.apps.ad_detection_app import AdDetectionApp
from home_screen.apps.trivia_app import TriviaApp
from home_screen.apps.karaoke_app import KaraokeApp
from home_screen.apps.web_browser_app import WebBrowserApp
from home_screen.apps.video_channels_app import VideoChannelsApp
from system import (
    boot_config,
    shutdown_handler,
    WatchdogNotifier,
    system_monitor,
    health_checker,
    diagnostics_collector,
    audio_manager,
    remote_control,
)

logger = logging.getLogger(__name__)


class HomeScreenLauncher:
    """Home screen launcher with app grid."""

    def __init__(self, registry: AppRegistry):
        """Initialize launcher.

        Args:
            registry: App registry instance
        """
        self.registry = registry
        self.screen = None
        self.running = False
        self.selected_app_index = 0
        self.clock = None
        self.watchdog = WatchdogNotifier()

        # Display settings
        self.screen_width = 1920
        self.screen_height = 1080

        # Grid layout
        self.apps_per_row = 3
        self.app_card_width = 350
        self.app_card_height = 280
        self.grid_spacing = 40

    async def start(self) -> None:
        """Start the launcher."""
        try:
            logger.info("Starting home screen launcher")

            # Setup signal handlers for graceful shutdown
            shutdown_handler.setup_signal_handlers()
            shutdown_handler.register_callback(self.stop)

            # Start monitoring services
            await system_monitor.start(interval=5)
            logger.info("System monitoring started")

            await health_checker.start(interval=30)
            logger.info("Health checking started")

            # Load audio settings
            audio_manager.load_settings()
            logger.info("Audio settings loaded")

            # Start remote control handlers
            await remote_control.start(enable_ir=True, enable_cec=True, enable_bluetooth=False)
            logger.info("Remote control handlers started")

            # Start watchdog notifier
            await self.watchdog.start()

            # Initialize pygame
            pygame.init()

            # Get display resolution
            display_info = pygame.display.Info()
            self.screen_width = display_info.current_w
            self.screen_height = display_info.current_h

            # Create fullscreen window
            self.screen = pygame.display.set_mode(
                (self.screen_width, self.screen_height),
                pygame.FULLSCREEN
            )
            pygame.display.set_caption("Home Screen")

            # Initialize clock for frame rate
            self.clock = pygame.time.Clock()

            # Register all available apps
            self._register_apps()

            # Check for default app to auto-launch
            default_app_id = boot_config.get_default_app()
            if default_app_id:
                logger.info(f"Default app configured: {default_app_id}")
                delay = boot_config.get_auto_launch_delay()
                logger.info(f"Auto-launching in {delay} seconds...")
                await asyncio.sleep(delay)

                # Try to launch default app
                success = await self.registry.launch_app(default_app_id)
                if success:
                    logger.info(f"Auto-launched default app: {default_app_id}")
                    # Wait for app to finish
                    app = self.registry.get_app(default_app_id)
                    while app and app.status == AppStatus.RUNNING:
                        await asyncio.sleep(0.5)
                    logger.info(f"Default app exited, showing launcher")
                else:
                    logger.error(f"Failed to auto-launch default app: {default_app_id}")

            # Start main loop
            self.running = True
            await self._main_loop()

        except Exception as e:
            logger.error(f"Failed to start launcher: {e}", exc_info=True)
            raise

    async def stop(self) -> None:
        """Stop the launcher."""
        logger.info("Stopping home screen launcher")
        self.running = False

        # Save last active app
        active_app = self.registry.get_active_app()
        if active_app:
            boot_config.set_last_app(active_app.app_id)
            logger.info(f"Saved last app: {active_app.app_id}")

        # Stop watchdog
        await self.watchdog.stop()

        # Stop all running apps
        for app in self.registry.list_apps():
            if app.status == AppStatus.RUNNING:
                logger.info(f"Stopping app: {app.name}")
                await self.registry.stop_app(app.app_id)

        # Stop remote control
        await remote_control.stop()
        logger.info("Remote control stopped")

        # Save audio settings
        audio_manager.save_settings()
        logger.info("Audio settings saved")

        # Stop monitoring services
        await system_monitor.stop()
        await health_checker.stop()
        logger.info("Monitoring services stopped")

        if self.screen:
            pygame.quit()
            self.screen = None

        logger.info("Home screen launcher stopped")

    def _register_apps(self) -> None:
        """Register all available applications."""
        # Register built-in apps
        apps = [
            AdDetectionApp(),
            VideoChannelsApp(),
            WebBrowserApp(),
            TriviaApp(),
            KaraokeApp()
        ]

        for app in apps:
            self.registry.register_app(app)
            # Register with monitoring system
            system_monitor.register_app(app.app_id)
            system_monitor.update_app_status(app.app_id, "stopped")

        logger.info(f"Registered {len(apps)} applications")

    async def _main_loop(self) -> None:
        """Main UI loop."""
        # Initialize fonts
        try:
            header_font = pygame.font.Font(None, 80)
            app_name_font = pygame.font.Font(None, 42)
            app_desc_font = pygame.font.Font(None, 28)
            time_font = pygame.font.Font(None, 36)
        except:
            header_font = pygame.font.SysFont("arial", 80)
            app_name_font = pygame.font.SysFont("arial", 42)
            app_desc_font = pygame.font.SysFont("arial", 28)
            time_font = pygame.font.SysFont("arial", 36)

        # Colors
        BG_COLOR = (15, 20, 30)
        HEADER_BG = (25, 35, 50)
        CARD_BG = (40, 50, 65)
        SELECTED_CARD_BG = (70, 110, 160)
        TEXT_COLOR = (255, 255, 255)
        DESC_COLOR = (180, 190, 200)
        TIME_COLOR = (150, 160, 170)

        while self.running:
            # Handle events
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False

                elif event.type == pygame.KEYDOWN:
                    await self._handle_keypress(event.key)

            # Get installed apps
            installed_apps = self.registry.list_apps()

            # Draw background
            self.screen.fill(BG_COLOR)

            # Draw header
            header_rect = pygame.Rect(0, 0, self.screen_width, 120)
            pygame.draw.rect(self.screen, HEADER_BG, header_rect)

            # Draw title
            title_text = header_font.render("🏠 Home Screen", True, TEXT_COLOR)
            title_rect = title_text.get_rect(x=40, centery=60)
            self.screen.blit(title_text, title_rect)

            # Draw current time
            current_time = datetime.now().strftime("%I:%M %p")
            time_text = time_font.render(current_time, True, TIME_COLOR)
            time_rect = time_text.get_rect(right=self.screen_width - 40, centery=60)
            self.screen.blit(time_text, time_rect)

            if installed_apps:
                # Calculate grid layout
                grid_start_x = (self.screen_width - (self.apps_per_row * self.app_card_width +
                                                      (self.apps_per_row - 1) * self.grid_spacing)) // 2
                grid_start_y = 180

                # Draw app cards
                for i, app in enumerate(installed_apps):
                    row = i // self.apps_per_row
                    col = i % self.apps_per_row

                    x = grid_start_x + col * (self.app_card_width + self.grid_spacing)
                    y = grid_start_y + row * (self.app_card_height + self.grid_spacing)

                    # Check if this card is selected
                    is_selected = (i == self.selected_app_index)

                    # Draw card background
                    card_bg = SELECTED_CARD_BG if is_selected else CARD_BG
                    card_rect = pygame.Rect(x, y, self.app_card_width, self.app_card_height)
                    pygame.draw.rect(self.screen, card_bg, card_rect, border_radius=10)

                    # Draw selection border
                    if is_selected:
                        border_rect = pygame.Rect(x - 4, y - 4,
                                                  self.app_card_width + 8,
                                                  self.app_card_height + 8)
                        pygame.draw.rect(self.screen, (100, 150, 220), border_rect,
                                       width=4, border_radius=12)

                    # Draw app icon (large emoji)
                    icon_font = pygame.font.Font(None, 120)
                    icon_text = icon_font.render(app.icon, True, TEXT_COLOR)
                    icon_rect = icon_text.get_rect(centerx=x + self.app_card_width // 2,
                                                   y=y + 40)
                    self.screen.blit(icon_text, icon_rect)

                    # Draw app name
                    name_text = app_name_font.render(app.name, True, TEXT_COLOR)
                    name_rect = name_text.get_rect(centerx=x + self.app_card_width // 2,
                                                   y=y + 160)
                    self.screen.blit(name_text, name_rect)

                    # Draw app description (wrapped if too long)
                    desc_lines = self._wrap_text(app.description, app_desc_font,
                                                 self.app_card_width - 40)
                    desc_y = y + 200
                    for line in desc_lines[:2]:  # Max 2 lines
                        desc_text = app_desc_font.render(line, True, DESC_COLOR)
                        desc_rect = desc_text.get_rect(centerx=x + self.app_card_width // 2,
                                                       y=desc_y)
                        self.screen.blit(desc_text, desc_rect)
                        desc_y += 30

                # Draw instructions at bottom
                instructions = "← → ↑ ↓ to navigate | ENTER to launch | Q to quit"
                inst_font = pygame.font.Font(None, 32)
                inst_text = inst_font.render(instructions, True, DESC_COLOR)
                inst_rect = inst_text.get_rect(centerx=self.screen_width // 2,
                                               bottom=self.screen_height - 30)
                self.screen.blit(inst_text, inst_rect)

            else:
                # No apps installed
                no_apps_font = pygame.font.Font(None, 48)
                no_apps_text = no_apps_font.render("No applications installed",
                                                   True, DESC_COLOR)
                no_apps_rect = no_apps_text.get_rect(centerx=self.screen_width // 2,
                                                     centery=self.screen_height // 2)
                self.screen.blit(no_apps_text, no_apps_rect)

            # Update display
            pygame.display.flip()

            # Control frame rate (60 FPS)
            self.clock.tick(60)
            await asyncio.sleep(0)

        logger.info("Home screen launcher stopped")

    async def _handle_keypress(self, key: int) -> None:
        """Handle keyboard input.

        Args:
            key: Pygame key code
        """
        installed_apps = self.registry.list_apps()

        if not installed_apps:
            if key == pygame.K_q or key == pygame.K_ESCAPE:
                self.running = False
            return

        if key == pygame.K_UP:
            # Move up one row
            self.selected_app_index = max(0, self.selected_app_index - self.apps_per_row)

        elif key == pygame.K_DOWN:
            # Move down one row
            new_index = self.selected_app_index + self.apps_per_row
            if new_index < len(installed_apps):
                self.selected_app_index = new_index

        elif key == pygame.K_LEFT:
            # Move left
            if self.selected_app_index % self.apps_per_row > 0:
                self.selected_app_index -= 1

        elif key == pygame.K_RIGHT:
            # Move right
            if (self.selected_app_index % self.apps_per_row < self.apps_per_row - 1 and
                self.selected_app_index + 1 < len(installed_apps)):
                self.selected_app_index += 1

        elif key == pygame.K_RETURN or key == pygame.K_SPACE:
            # Launch selected app
            selected_app = installed_apps[self.selected_app_index]
            await self._launch_app(selected_app)

        elif key == pygame.K_q or key == pygame.K_ESCAPE:
            # Quit launcher
            self.running = False

    async def _launch_app(self, app: BaseApp) -> None:
        """Launch an application.

        Args:
            app: App to launch
        """
        logger.info(f"Launching app: {app.name}")

        try:
            # Hide launcher window
            pygame.display.iconify()

            # Update app status in monitoring
            system_monitor.update_app_status(app.app_id, "starting")

            # Launch app through registry
            success = await self.registry.launch_app(app.app_id)

            if success:
                logger.info(f"App launched successfully: {app.name}")

                # Update app status
                system_monitor.update_app_status(app.app_id, "running")

                # Wait for app to finish
                while app.status == AppStatus.RUNNING:
                    await asyncio.sleep(0.5)

                logger.info(f"App exited: {app.name}")
                system_monitor.update_app_status(app.app_id, "stopped")

            else:
                logger.error(f"Failed to launch app: {app.name}")
                system_monitor.update_app_status(app.app_id, "error")
                diagnostics_collector.report_error(
                    app.app_id,
                    Exception(f"Failed to launch {app.name}"),
                    severity="error"
                )

        except Exception as e:
            logger.error(f"Error launching app {app.name}: {e}", exc_info=True)
            system_monitor.update_app_status(app.app_id, "error")
            system_monitor.record_app_crash(app.app_id)
            diagnostics_collector.report_crash(app.app_id, e)

        finally:
            # Restore launcher window
            pygame.display.set_mode((self.screen_width, self.screen_height), pygame.FULLSCREEN)

    def _wrap_text(self, text: str, font: pygame.font.Font, max_width: int) -> List[str]:
        """Wrap text to fit within max width.

        Args:
            text: Text to wrap
            font: Font to use
            max_width: Maximum width in pixels

        Returns:
            List of text lines
        """
        words = text.split()
        lines = []
        current_line = ""

        for word in words:
            test_line = current_line + " " + word if current_line else word
            test_surface = font.render(test_line, True, (255, 255, 255))

            if test_surface.get_width() <= max_width:
                current_line = test_line
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word

        if current_line:
            lines.append(current_line)

        return lines


async def main():
    """Main entry point for home screen launcher."""
    # Create app registry
    registry = AppRegistry()

    # Create and start launcher
    launcher = HomeScreenLauncher(registry)

    try:
        await launcher.start()
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
    finally:
        await launcher.stop()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    asyncio.run(main())
