"""UI mode manager for switching between application modes.

This module manages the different operational modes of the system:
- HOME: Home screen with menu and navigation
- PASSTHROUGH: Live TV passthrough with ad detection
- SETTINGS: Configuration and settings UI
- GAME: Future gaming mode
"""

import asyncio
import logging
from enum import Enum
from typing import Optional, Protocol

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class UIMode(str, Enum):
    """Available UI modes."""

    HOME = "home"
    PASSTHROUGH = "passthrough"
    SETTINGS = "settings"
    GAME = "game"  # Future feature


class ModeChangeEvent(BaseModel):
    """Event emitted when mode changes."""

    from_mode: Optional[UIMode]
    to_mode: UIMode
    timestamp: float


class UIModeProtocol(Protocol):
    """Protocol for UI mode implementations."""

    async def enter(self) -> None:
        """Called when entering this mode."""
        ...

    async def exit(self) -> None:
        """Called when exiting this mode."""
        ...

    async def run(self) -> None:
        """Run the mode's main loop."""
        ...

    async def handle_input(self, key: str) -> Optional[UIMode]:
        """Handle user input.

        Args:
            key: Input key/command

        Returns:
            New mode to switch to, or None to stay in current mode
        """
        ...


class UIModeManager:
    """Manages switching between different UI modes.

    The mode manager handles the lifecycle of different UI modes and
    coordinates transitions between them.

    Example:
        >>> manager = UIModeManager()
        >>> manager.register_mode(UIMode.HOME, home_screen)
        >>> manager.register_mode(UIMode.PASSTHROUGH, passthrough_mode)
        >>> await manager.run()  # Starts in HOME mode
    """

    def __init__(self, initial_mode: UIMode = UIMode.HOME) -> None:
        """Initialize mode manager.

        Args:
            initial_mode: Initial UI mode
        """
        self._modes: dict[UIMode, UIModeProtocol] = {}
        self._current_mode: Optional[UIMode] = None
        self._current_mode_task: Optional[asyncio.Task] = None
        self._initial_mode = initial_mode
        self._running = False
        self._mode_change_listeners: list = []

    def register_mode(self, mode: UIMode, implementation: UIModeProtocol) -> None:
        """Register a UI mode implementation.

        Args:
            mode: The UI mode to register
            implementation: The mode implementation
        """
        self._modes[mode] = implementation
        logger.info(f"Registered UI mode: {mode.value}")

    async def switch_mode(self, new_mode: UIMode) -> None:
        """Switch to a different UI mode.

        Args:
            new_mode: Mode to switch to

        Raises:
            ValueError: If mode is not registered
        """
        if new_mode not in self._modes:
            raise ValueError(f"Mode not registered: {new_mode.value}")

        if new_mode == self._current_mode:
            logger.debug(f"Already in {new_mode.value} mode")
            return

        logger.info(f"Switching mode: {self._current_mode} -> {new_mode}")

        old_mode = self._current_mode

        # Exit current mode
        if self._current_mode is not None:
            current_impl = self._modes[self._current_mode]

            # Cancel current mode task if running
            if self._current_mode_task and not self._current_mode_task.done():
                self._current_mode_task.cancel()
                try:
                    await self._current_mode_task
                except asyncio.CancelledError:
                    pass

            # Call exit handler
            await current_impl.exit()

        # Enter new mode
        self._current_mode = new_mode
        new_impl = self._modes[new_mode]
        await new_impl.enter()

        # Start new mode task
        self._current_mode_task = asyncio.create_task(new_impl.run())

        # Emit mode change event
        event = ModeChangeEvent(
            from_mode=old_mode,
            to_mode=new_mode,
            timestamp=asyncio.get_event_loop().time(),
        )
        await self._emit_mode_change(event)

        logger.info(f"Switched to {new_mode.value} mode")

    async def run(self) -> None:
        """Run the mode manager.

        Starts in the initial mode and handles mode switches.
        """
        logger.info(f"Starting UI mode manager (initial: {self._initial_mode.value})")

        self._running = True

        # Start in initial mode
        await self.switch_mode(self._initial_mode)

        try:
            # Keep running until stopped
            while self._running:
                await asyncio.sleep(0.1)

        finally:
            # Clean up
            if self._current_mode is not None:
                await self.switch_mode(UIMode.HOME)  # Return to home
                current_impl = self._modes[self._current_mode]
                await current_impl.exit()

            logger.info("UI mode manager stopped")

    async def stop(self) -> None:
        """Stop the mode manager."""
        logger.info("Stopping UI mode manager")
        self._running = False

    def add_mode_change_listener(self, listener) -> None:
        """Add a listener for mode change events.

        Args:
            listener: Async callable that receives ModeChangeEvent
        """
        self._mode_change_listeners.append(listener)

    async def _emit_mode_change(self, event: ModeChangeEvent) -> None:
        """Emit mode change event to all listeners.

        Args:
            event: Mode change event
        """
        for listener in self._mode_change_listeners:
            try:
                await listener(event)
            except Exception as e:
                logger.error(f"Error in mode change listener: {e}")

    @property
    def current_mode(self) -> Optional[UIMode]:
        """Get current UI mode.

        Returns:
            Current mode, or None if not started
        """
        return self._current_mode

    @property
    def is_running(self) -> bool:
        """Check if mode manager is running.

        Returns:
            True if running
        """
        return self._running
