"""Home screen UI with menu and navigation.

This module provides the home screen interface that appears when the
system is not in passthrough mode.
"""

import asyncio
import logging
from typing import Optional

import cv2
import numpy as np

from ui.mode_manager import UIMode, UIModeProtocol

logger = logging.getLogger(__name__)


class HomeScreen:
    """Home screen UI with menu system.

    Displays a menu allowing users to:
    - Start live TV passthrough
    - Access settings
    - View system information
    - Future: Launch games or other features

    Example:
        >>> home = HomeScreen()
        >>> await home.enter()
        >>> await home.run()
    """

    def __init__(self, width: int = 1920, height: int = 1080) -> None:
        """Initialize home screen.

        Args:
            width: Screen width
            height: Screen height
        """
        self.width = width
        self.height = height
        self._running = False
        self._selected_index = 0
        self._window_name = "Live TV Ad Detection System"

        # Menu items
        self._menu_items = [
            ("Watch Live TV", UIMode.PASSTHROUGH),
            ("Settings", UIMode.SETTINGS),
            ("System Info", None),  # Opens dialog
            ("Exit", None),  # Quits application
        ]

    async def enter(self) -> None:
        """Called when entering home screen mode."""
        logger.info("Entering home screen")

        # Create window
        cv2.namedWindow(self._window_name, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(self._window_name, self.width, self.height)

        self._running = True

    async def exit(self) -> None:
        """Called when exiting home screen mode."""
        logger.info("Exiting home screen")
        self._running = False

        # Clean up window
        cv2.destroyWindow(self._window_name)

    async def run(self) -> None:
        """Run the home screen main loop."""
        logger.info("Running home screen")

        while self._running:
            # Render home screen
            frame = self._render_home_screen()

            # Display
            cv2.imshow(self._window_name, frame)

            # Handle input with timeout
            key = cv2.waitKey(100) & 0xFF

            if key != 255:  # Key pressed
                new_mode = await self.handle_input(chr(key) if key < 128 else "")

                if new_mode is not None:
                    # Mode change requested - will be handled by manager
                    # For now, just log it
                    logger.info(f"Mode change requested: {new_mode}")

            await asyncio.sleep(0.01)  # Small delay to avoid busy loop

    async def handle_input(self, key: str) -> Optional[UIMode]:
        """Handle user input on home screen.

        Args:
            key: Input key

        Returns:
            New mode to switch to, or None
        """
        # Arrow keys for navigation
        if key == "w" or ord(key) == 82:  # Up arrow
            self._selected_index = (self._selected_index - 1) % len(
                self._menu_items
            )
            logger.debug(f"Selected: {self._menu_items[self._selected_index][0]}")

        elif key == "s" or ord(key) == 84:  # Down arrow
            self._selected_index = (self._selected_index + 1) % len(
                self._menu_items
            )
            logger.debug(f"Selected: {self._menu_items[self._selected_index][0]}")

        # Enter to select
        elif key == "\r" or key == "\n" or ord(key) == 13:
            selected_item = self._menu_items[self._selected_index]
            logger.info(f"Selected menu item: {selected_item[0]}")

            # Return the mode to switch to
            return selected_item[1]

        # 'q' to quit
        elif key == "q":
            logger.info("Quit requested")
            return None  # Could signal app shutdown

        return None

    def _render_home_screen(self) -> np.ndarray:
        """Render the home screen interface.

        Returns:
            Home screen frame as numpy array
        """
        # Create dark background
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        frame[:] = (20, 20, 40)  # Dark blue-gray

        # Title
        title = "Live TV Ad Detection System"
        cv2.putText(
            frame,
            title,
            (self.width // 2 - 400, 200),
            cv2.FONT_HERSHEY_BOLD,
            2.0,
            (255, 255, 255),
            3,
            cv2.LINE_AA,
        )

        # Subtitle
        subtitle = "Raspberry Pi Edge Device"
        cv2.putText(
            frame,
            subtitle,
            (self.width // 2 - 250, 260),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            (180, 180, 180),
            2,
            cv2.LINE_AA,
        )

        # Menu
        menu_start_y = 400
        menu_spacing = 80

        for i, (label, _) in enumerate(self._menu_items):
            y_pos = menu_start_y + i * menu_spacing

            # Highlight selected item
            if i == self._selected_index:
                # Draw selection box
                cv2.rectangle(
                    frame,
                    (self.width // 2 - 350, y_pos - 50),
                    (self.width // 2 + 350, y_pos + 10),
                    (80, 80, 180),
                    -1,
                )

                # Draw selection indicator
                cv2.putText(
                    frame,
                    ">",
                    (self.width // 2 - 400, y_pos),
                    cv2.FONT_HERSHEY_BOLD,
                    1.5,
                    (255, 200, 100),
                    3,
                    cv2.LINE_AA,
                )

                text_color = (255, 255, 255)
            else:
                text_color = (200, 200, 200)

            # Draw menu item text
            cv2.putText(
                frame,
                label,
                (self.width // 2 - 300, y_pos),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.2,
                text_color,
                2,
                cv2.LINE_AA,
            )

        # Instructions
        instructions = "Use W/S (or arrow keys) to navigate, ENTER to select, Q to quit"
        cv2.putText(
            frame,
            instructions,
            (self.width // 2 - 550, self.height - 100),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (150, 150, 150),
            1,
            cv2.LINE_AA,
        )

        # System status
        status = "Status: Ready | Device ID: rpi-001 | Network: Connected"
        cv2.putText(
            frame,
            status,
            (50, self.height - 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (100, 200, 100),
            1,
            cv2.LINE_AA,
        )

        return frame
