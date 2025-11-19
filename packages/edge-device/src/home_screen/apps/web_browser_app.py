"""Web Browser App.

Full-featured web browser for displaying internet pages.
Uses Chromium/Firefox in kiosk mode for fullscreen browsing.
"""

import asyncio
import logging
import subprocess
from pathlib import Path
from typing import List, Optional

import pygame

from home_screen.app_framework import AppCategory, AppStatus, BaseApp

logger = logging.getLogger(__name__)


class WebBrowserApp(BaseApp):
    """Web browser application."""

    def __init__(self):
        """Initialize web browser app."""
        super().__init__(
            app_id="web_browser",
            name="Web Browser",
            description="Browse internet pages and websites",
            icon="🌐",
            category=AppCategory.ENTERTAINMENT,
            version="1.0.0"
        )

        self.browser_process = None
        self.current_url = None
        self.ui_task = None
        self.running = False
        self.screen = None

        # Browser preferences
        self.default_urls = [
            "https://www.google.com",
            "https://www.youtube.com",
            "https://www.wikipedia.org",
            "https://www.weather.com"
        ]
        self.custom_urls = []
        self.bookmarks = []

        # Load custom URLs and bookmarks from config
        self._load_browser_config()

    async def start(self) -> bool:
        """Start web browser app.

        Returns:
            True if started successfully
        """
        try:
            logger.info("Starting web browser app")

            # Initialize pygame for URL selection UI
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
            pygame.display.set_caption("Web Browser")

            # Start UI loop
            self.running = True
            self.ui_task = asyncio.create_task(self._ui_loop())

            self.status = AppStatus.RUNNING
            logger.info("Web browser app started successfully")

            return True

        except Exception as e:
            logger.error(f"Failed to start web browser app: {e}", exc_info=True)
            self.error_message = str(e)
            self.status = AppStatus.ERROR
            return False

    async def stop(self) -> bool:
        """Stop web browser app.

        Returns:
            True if stopped successfully
        """
        try:
            logger.info("Stopping web browser app")

            self.running = False

            # Stop browser
            if self.browser_process:
                self.browser_process.terminate()
                try:
                    self.browser_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.browser_process.kill()
                self.browser_process = None

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
            logger.info("Web browser app stopped successfully")

            return True

        except Exception as e:
            logger.error(f"Failed to stop web browser app: {e}", exc_info=True)
            return False

    def _load_browser_config(self) -> None:
        """Load browser configuration from config file."""
        config_file = Path(self.config.get(
            "browser_config",
            "/var/lib/ad-detection/browser/config.json"
        ))

        if config_file.exists():
            try:
                import json
                with open(config_file) as f:
                    data = json.load(f)
                    self.custom_urls = data.get("custom_urls", [])
                    self.bookmarks = data.get("bookmarks", [])
                    logger.info(f"Loaded {len(self.custom_urls)} custom URLs")
            except Exception as e:
                logger.warning(f"Failed to load browser config: {e}")

    def _launch_browser(self, url: str) -> None:
        """Launch browser in kiosk mode.

        Args:
            url: URL to open
        """
        try:
            # Stop current browser if any
            if self.browser_process:
                self.browser_process.terminate()
                try:
                    self.browser_process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.browser_process.kill()

            # Try Chromium first (better for kiosk mode)
            browser_commands = [
                # Chromium
                [
                    "chromium-browser",
                    "--kiosk",
                    "--noerrdialogs",
                    "--disable-infobars",
                    "--no-first-run",
                    "--fast",
                    "--fast-start",
                    "--disable-features=TranslateUI",
                    "--disk-cache-dir=/dev/null",
                    url
                ],
                # Firefox
                [
                    "firefox",
                    "--kiosk",
                    url
                ]
            ]

            # Try each browser command
            for cmd in browser_commands:
                try:
                    self.browser_process = subprocess.Popen(
                        cmd,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                    self.current_url = url
                    logger.info(f"Launched browser: {cmd[0]} with URL: {url}")
                    return
                except FileNotFoundError:
                    continue

            logger.error("No browser found (tried chromium-browser, firefox)")

        except Exception as e:
            logger.error(f"Failed to launch browser: {e}")

    async def _ui_loop(self) -> None:
        """Main UI loop for URL selection."""
        # Initialize fonts
        try:
            title_font = pygame.font.Font(None, 72)
            url_font = pygame.font.Font(None, 40)
            inst_font = pygame.font.Font(None, 36)
        except:
            title_font = pygame.font.SysFont("arial", 72)
            url_font = pygame.font.SysFont("arial", 40)
            inst_font = pygame.font.SysFont("arial", 36)

        # Colors
        BG_COLOR = (25, 35, 50)
        TEXT_COLOR = (255, 255, 255)
        SELECTED_BG = (60, 120, 200)
        NORMAL_BG = (45, 60, 80)

        # Combine all URLs
        all_urls = self.default_urls + self.custom_urls + self.bookmarks
        selected_index = 0
        is_browsing = False
        show_url_bar = False
        url_input = ""

        while self.running:
            # Handle events
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False

                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        if is_browsing:
                            # Exit browser, return to selection
                            if self.browser_process:
                                self.browser_process.terminate()
                                self.browser_process = None
                            is_browsing = False
                        elif show_url_bar:
                            # Cancel URL input
                            show_url_bar = False
                            url_input = ""
                        else:
                            # Exit app
                            self.running = False

                    elif show_url_bar:
                        # Handle URL input
                        if event.key == pygame.K_RETURN:
                            if url_input:
                                # Navigate to entered URL
                                if not url_input.startswith(("http://", "https://")):
                                    url_input = "https://" + url_input
                                self._launch_browser(url_input)
                                is_browsing = True
                                show_url_bar = False
                                url_input = ""
                        elif event.key == pygame.K_BACKSPACE:
                            url_input = url_input[:-1]
                        else:
                            # Add character to URL
                            if event.unicode and len(url_input) < 200:
                                url_input += event.unicode

                    elif not is_browsing:
                        if event.key == pygame.K_UP:
                            selected_index = (selected_index - 1) % max(1, len(all_urls))
                        elif event.key == pygame.K_DOWN:
                            selected_index = (selected_index + 1) % max(1, len(all_urls))
                        elif event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                            if all_urls:
                                self._launch_browser(all_urls[selected_index])
                                is_browsing = True
                        elif event.key == pygame.K_n:
                            # Show URL input bar
                            show_url_bar = True
                            url_input = ""

            # Check if browser is still running
            if is_browsing and self.browser_process and self.browser_process.poll() is not None:
                is_browsing = False

            # Draw UI (only when not browsing)
            if not is_browsing:
                self.screen.fill(BG_COLOR)

                # Draw title
                title_text = title_font.render("🌐 WEB BROWSER", True, TEXT_COLOR)
                title_rect = title_text.get_rect(centerx=self.screen.get_width() // 2, y=50)
                self.screen.blit(title_text, title_rect)

                if show_url_bar:
                    # Draw URL input bar
                    input_rect = pygame.Rect(100, 200, self.screen.get_width() - 200, 60)
                    pygame.draw.rect(self.screen, SELECTED_BG, input_rect, border_radius=5)

                    url_text = url_font.render(url_input + "_", True, TEXT_COLOR)
                    url_rect = url_text.get_rect(x=input_rect.x + 20, centery=input_rect.centery)
                    self.screen.blit(url_text, url_rect)

                    # Instructions
                    inst_text = inst_font.render("Enter URL and press ENTER | ESC to cancel", True, (200, 200, 200))
                    inst_rect = inst_text.get_rect(
                        centerx=self.screen.get_width() // 2,
                        bottom=self.screen.get_height() - 30
                    )
                    self.screen.blit(inst_text, inst_rect)

                elif all_urls:
                    # Draw URL list
                    y_offset = 200
                    visible_urls = 8
                    start_index = max(0, selected_index - visible_urls // 2)
                    end_index = min(len(all_urls), start_index + visible_urls)

                    for i in range(start_index, end_index):
                        url = all_urls[i]
                        is_selected = (i == selected_index)

                        # Draw background
                        bg_color = SELECTED_BG if is_selected else NORMAL_BG
                        rect = pygame.Rect(100, y_offset, self.screen.get_width() - 200, 55)
                        pygame.draw.rect(self.screen, bg_color, rect, border_radius=5)

                        # Draw URL (truncate if too long)
                        display_url = url if len(url) < 60 else url[:57] + "..."
                        url_text = url_font.render(display_url, True, TEXT_COLOR)
                        url_rect = url_text.get_rect(x=rect.x + 20, centery=rect.centery)
                        self.screen.blit(url_text, url_rect)

                        y_offset += 60

                    # Draw instructions
                    instructions = "↑↓ to select | ENTER to browse | N for new URL | ESC to exit"
                    inst_text = inst_font.render(instructions, True, (200, 200, 200))
                    inst_rect = inst_text.get_rect(
                        centerx=self.screen.get_width() // 2,
                        bottom=self.screen.get_height() - 30
                    )
                    self.screen.blit(inst_text, inst_rect)

                else:
                    # No URLs available
                    no_urls_text = url_font.render("No URLs configured", True, (200, 100, 100))
                    no_urls_rect = no_urls_text.get_rect(
                        centerx=self.screen.get_width() // 2,
                        centery=self.screen.get_height() // 2
                    )
                    self.screen.blit(no_urls_text, no_urls_rect)

                    inst_text = inst_font.render("Press N to enter a URL | ESC to exit", True, (150, 150, 150))
                    inst_rect = inst_text.get_rect(
                        centerx=self.screen.get_width() // 2,
                        centery=self.screen.get_height() // 2 + 80
                    )
                    self.screen.blit(inst_text, inst_rect)

                pygame.display.flip()

            # Control frame rate
            await asyncio.sleep(1 / 60)

        logger.info("Web browser app UI loop ended")
