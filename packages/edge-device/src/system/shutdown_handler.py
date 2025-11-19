"""Graceful shutdown handler.

Handles system shutdown signals and ensures proper cleanup
of resources, saving state, and stopping apps gracefully.
"""

import asyncio
import logging
import signal
import sys
from typing import Callable, List, Optional

logger = logging.getLogger(__name__)


class ShutdownHandler:
    """Handles graceful shutdown of the application."""

    def __init__(self):
        """Initialize shutdown handler."""
        self.shutdown_callbacks: List[Callable] = []
        self.is_shutting_down = False
        self._shutdown_event = asyncio.Event()

    def register_callback(self, callback: Callable) -> None:
        """Register a shutdown callback.

        Args:
            callback: Async function to call on shutdown
        """
        self.shutdown_callbacks.append(callback)
        logger.debug(f"Registered shutdown callback: {callback.__name__}")

    def setup_signal_handlers(self) -> None:
        """Setup signal handlers for graceful shutdown."""
        # Handle SIGTERM (systemd stop)
        signal.signal(signal.SIGTERM, self._signal_handler)

        # Handle SIGINT (Ctrl+C)
        signal.signal(signal.SIGINT, self._signal_handler)

        # Handle SIGHUP (reload)
        signal.signal(signal.SIGHUP, self._signal_handler)

        logger.info("Signal handlers configured")

    def _signal_handler(self, signum: int, frame) -> None:
        """Handle shutdown signals.

        Args:
            signum: Signal number
            frame: Current stack frame
        """
        signal_name = signal.Signals(signum).name
        logger.info(f"Received signal: {signal_name}")

        if not self.is_shutting_down:
            self.is_shutting_down = True
            self._shutdown_event.set()

    async def wait_for_shutdown(self) -> None:
        """Wait for shutdown signal.

        This is an async function that blocks until a shutdown signal
        is received.
        """
        await self._shutdown_event.wait()

    async def shutdown(self) -> None:
        """Execute graceful shutdown sequence."""
        if self.is_shutting_down:
            logger.info("Shutdown already in progress")
            return

        logger.info("Starting graceful shutdown...")
        self.is_shutting_down = True

        # Execute all shutdown callbacks
        for callback in self.shutdown_callbacks:
            try:
                logger.info(f"Executing shutdown callback: {callback.__name__}")
                if asyncio.iscoroutinefunction(callback):
                    await callback()
                else:
                    callback()
            except Exception as e:
                logger.error(f"Error in shutdown callback {callback.__name__}: {e}",
                           exc_info=True)

        logger.info("Graceful shutdown complete")

    def is_shutdown_requested(self) -> bool:
        """Check if shutdown has been requested.

        Returns:
            True if shutdown is in progress
        """
        return self.is_shutting_down


class WatchdogNotifier:
    """Systemd watchdog notifier.

    Sends periodic keep-alive notifications to systemd to prevent
    the service from being restarted due to watchdog timeout.
    """

    def __init__(self, interval_seconds: int = 15):
        """Initialize watchdog notifier.

        Args:
            interval_seconds: Notification interval (should be < WatchdogSec/2)
        """
        self.interval = interval_seconds
        self.task: Optional[asyncio.Task] = None
        self.running = False

    async def start(self) -> None:
        """Start watchdog notifications."""
        self.running = True
        self.task = asyncio.create_task(self._notify_loop())
        logger.info(f"Watchdog notifier started (interval: {self.interval}s)")

    async def stop(self) -> None:
        """Stop watchdog notifications."""
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("Watchdog notifier stopped")

    async def _notify_loop(self) -> None:
        """Periodic watchdog notification loop."""
        import os

        while self.running:
            try:
                # Send watchdog notification to systemd
                # Uses sd_notify protocol
                notify_socket = os.environ.get('NOTIFY_SOCKET')
                if notify_socket:
                    import socket
                    sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
                    try:
                        sock.sendto(b'WATCHDOG=1', notify_socket)
                        logger.debug("Sent watchdog notification to systemd")
                    finally:
                        sock.close()
                else:
                    logger.debug("NOTIFY_SOCKET not set, skipping watchdog notification")

                await asyncio.sleep(self.interval)

            except Exception as e:
                logger.error(f"Error sending watchdog notification: {e}")
                await asyncio.sleep(self.interval)


# Global shutdown handler instance
shutdown_handler = ShutdownHandler()


async def shutdown_callback(func: Callable) -> None:
    """Decorator to register shutdown callbacks.

    Args:
        func: Function to call on shutdown
    """
    shutdown_handler.register_callback(func)
    return func
