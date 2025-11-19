"""Remote control integration.

Supports multiple remote control types:
- IR remote receivers (LIRC)
- Bluetooth remotes
- HDMI-CEC (TV remote pass-through)
- Network-based virtual remote (web/mobile app)
"""

import asyncio
import logging
import subprocess
from enum import Enum
from typing import Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class RemoteKey(str, Enum):
    """Remote control key codes."""

    # Navigation
    UP = "up"
    DOWN = "down"
    LEFT = "left"
    RIGHT = "right"
    SELECT = "select"  # OK/Enter
    BACK = "back"

    # Playback
    PLAY = "play"
    PAUSE = "pause"
    STOP = "stop"
    REWIND = "rewind"
    FAST_FORWARD = "fast_forward"
    SKIP_BACK = "skip_back"
    SKIP_FORWARD = "skip_forward"

    # Volume
    VOLUME_UP = "volume_up"
    VOLUME_DOWN = "volume_down"
    MUTE = "mute"

    # Channel
    CHANNEL_UP = "channel_up"
    CHANNEL_DOWN = "channel_down"

    # System
    POWER = "power"
    HOME = "home"
    MENU = "menu"
    INFO = "info"

    # Numbers
    NUM_0 = "num_0"
    NUM_1 = "num_1"
    NUM_2 = "num_2"
    NUM_3 = "num_3"
    NUM_4 = "num_4"
    NUM_5 = "num_5"
    NUM_6 = "num_6"
    NUM_7 = "num_7"
    NUM_8 = "num_8"
    NUM_9 = "num_9"

    # Colors
    RED = "red"
    GREEN = "green"
    YELLOW = "yellow"
    BLUE = "blue"


class RemoteControlHandler:
    """Handles remote control input from multiple sources."""

    def __init__(self):
        """Initialize remote control handler."""
        self.key_callbacks: Dict[RemoteKey, List[Callable]] = {}
        self.ir_enabled = False
        self.bluetooth_enabled = False
        self.cec_enabled = False

        self.ir_task: Optional[asyncio.Task] = None
        self.cec_task: Optional[asyncio.Task] = None

    def register_callback(self, key: RemoteKey, callback: Callable) -> None:
        """Register a callback for a remote key.

        Args:
            key: Remote key
            callback: Async function to call when key is pressed
        """
        if key not in self.key_callbacks:
            self.key_callbacks[key] = []

        self.key_callbacks[key].append(callback)
        logger.debug(f"Registered callback for key: {key}")

    def unregister_callback(self, key: RemoteKey, callback: Callable) -> None:
        """Unregister a callback.

        Args:
            key: Remote key
            callback: Callback to remove
        """
        if key in self.key_callbacks and callback in self.key_callbacks[key]:
            self.key_callbacks[key].remove(callback)

    async def handle_key(self, key: RemoteKey) -> None:
        """Handle a key press.

        Args:
            key: Remote key that was pressed
        """
        logger.debug(f"Key pressed: {key}")

        if key in self.key_callbacks:
            for callback in self.key_callbacks[key]:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback()
                    else:
                        callback()
                except Exception as e:
                    logger.error(f"Error in key callback: {e}", exc_info=True)

    # IR Remote Support

    async def enable_ir_remote(self, device: str = "/dev/lirc0") -> bool:
        """Enable IR remote receiver.

        Args:
            device: LIRC device path

        Returns:
            True if enabled successfully
        """
        try:
            # Check if LIRC is installed
            result = subprocess.run(
                ["which", "irw"],
                capture_output=True,
                timeout=5
            )

            if result.returncode != 0:
                logger.error("LIRC not installed (irw command not found)")
                return False

            # Start LIRC monitoring task
            self.ir_task = asyncio.create_task(self._ir_monitor_loop())
            self.ir_enabled = True

            logger.info("IR remote enabled")
            return True

        except Exception as e:
            logger.error(f"Failed to enable IR remote: {e}")
            return False

    async def _ir_monitor_loop(self) -> None:
        """Monitor IR remote input using irw."""
        try:
            # Run irw to monitor IR codes
            process = await asyncio.create_subprocess_exec(
                "irw",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            while True:
                line = await process.stdout.readline()

                if not line:
                    break

                # Parse irw output: "code repeat key remote"
                parts = line.decode().strip().split()
                if len(parts) >= 3:
                    key_name = parts[2].lower()

                    # Map IR key names to RemoteKey enum
                    remote_key = self._map_ir_key(key_name)
                    if remote_key:
                        await self.handle_key(remote_key)

        except asyncio.CancelledError:
            logger.info("IR monitor stopped")
        except Exception as e:
            logger.error(f"Error in IR monitor: {e}", exc_info=True)

    def _map_ir_key(self, key_name: str) -> Optional[RemoteKey]:
        """Map IR key name to RemoteKey.

        Args:
            key_name: IR key name from LIRC

        Returns:
            RemoteKey or None
        """
        # Common IR remote key mappings
        mapping = {
            "key_up": RemoteKey.UP,
            "key_down": RemoteKey.DOWN,
            "key_left": RemoteKey.LEFT,
            "key_right": RemoteKey.RIGHT,
            "key_ok": RemoteKey.SELECT,
            "key_enter": RemoteKey.SELECT,
            "key_back": RemoteKey.BACK,
            "key_exit": RemoteKey.BACK,
            "key_play": RemoteKey.PLAY,
            "key_pause": RemoteKey.PAUSE,
            "key_stop": RemoteKey.STOP,
            "key_rewind": RemoteKey.REWIND,
            "key_forward": RemoteKey.FAST_FORWARD,
            "key_volumeup": RemoteKey.VOLUME_UP,
            "key_volumedown": RemoteKey.VOLUME_DOWN,
            "key_mute": RemoteKey.MUTE,
            "key_channelup": RemoteKey.CHANNEL_UP,
            "key_channeldown": RemoteKey.CHANNEL_DOWN,
            "key_power": RemoteKey.POWER,
            "key_home": RemoteKey.HOME,
            "key_menu": RemoteKey.MENU,
            "key_info": RemoteKey.INFO,
            "key_0": RemoteKey.NUM_0,
            "key_1": RemoteKey.NUM_1,
            "key_2": RemoteKey.NUM_2,
            "key_3": RemoteKey.NUM_3,
            "key_4": RemoteKey.NUM_4,
            "key_5": RemoteKey.NUM_5,
            "key_6": RemoteKey.NUM_6,
            "key_7": RemoteKey.NUM_7,
            "key_8": RemoteKey.NUM_8,
            "key_9": RemoteKey.NUM_9,
            "key_red": RemoteKey.RED,
            "key_green": RemoteKey.GREEN,
            "key_yellow": RemoteKey.YELLOW,
            "key_blue": RemoteKey.BLUE,
        }

        return mapping.get(key_name.lower())

    async def disable_ir_remote(self) -> None:
        """Disable IR remote receiver."""
        if self.ir_task:
            self.ir_task.cancel()
            try:
                await self.ir_task
            except asyncio.CancelledError:
                pass

        self.ir_enabled = False
        logger.info("IR remote disabled")

    # HDMI-CEC Support

    async def enable_cec(self) -> bool:
        """Enable HDMI-CEC support.

        Returns:
            True if enabled successfully
        """
        try:
            # Check if cec-client is available
            result = subprocess.run(
                ["which", "cec-client"],
                capture_output=True,
                timeout=5
            )

            if result.returncode != 0:
                logger.error("CEC not installed (cec-client not found)")
                return False

            # Start CEC monitoring task
            self.cec_task = asyncio.create_task(self._cec_monitor_loop())
            self.cec_enabled = True

            logger.info("HDMI-CEC enabled")
            return True

        except Exception as e:
            logger.error(f"Failed to enable CEC: {e}")
            return False

    async def _cec_monitor_loop(self) -> None:
        """Monitor HDMI-CEC input."""
        try:
            # Run cec-client to monitor CEC commands
            process = await asyncio.create_subprocess_exec(
                "cec-client",
                "-m",  # Monitor mode
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            while True:
                line = await process.stdout.readline()

                if not line:
                    break

                line_str = line.decode().strip()

                # Parse CEC key press events
                if "key pressed:" in line_str.lower():
                    # Extract key name
                    key_name = line_str.split(":")[-1].strip()

                    # Map CEC key to RemoteKey
                    remote_key = self._map_cec_key(key_name)
                    if remote_key:
                        await self.handle_key(remote_key)

        except asyncio.CancelledError:
            logger.info("CEC monitor stopped")
        except Exception as e:
            logger.error(f"Error in CEC monitor: {e}", exc_info=True)

    def _map_cec_key(self, key_name: str) -> Optional[RemoteKey]:
        """Map CEC key name to RemoteKey.

        Args:
            key_name: CEC key name

        Returns:
            RemoteKey or None
        """
        # CEC key mappings
        mapping = {
            "up": RemoteKey.UP,
            "down": RemoteKey.DOWN,
            "left": RemoteKey.LEFT,
            "right": RemoteKey.RIGHT,
            "select": RemoteKey.SELECT,
            "exit": RemoteKey.BACK,
            "play": RemoteKey.PLAY,
            "pause": RemoteKey.PAUSE,
            "stop": RemoteKey.STOP,
            "rewind": RemoteKey.REWIND,
            "fast forward": RemoteKey.FAST_FORWARD,
            "volume up": RemoteKey.VOLUME_UP,
            "volume down": RemoteKey.VOLUME_DOWN,
            "mute": RemoteKey.MUTE,
            "power": RemoteKey.POWER,
            "root menu": RemoteKey.HOME,
            "setup menu": RemoteKey.MENU,
            "contents menu": RemoteKey.INFO,
            "number 0": RemoteKey.NUM_0,
            "number 1": RemoteKey.NUM_1,
            "number 2": RemoteKey.NUM_2,
            "number 3": RemoteKey.NUM_3,
            "number 4": RemoteKey.NUM_4,
            "number 5": RemoteKey.NUM_5,
            "number 6": RemoteKey.NUM_6,
            "number 7": RemoteKey.NUM_7,
            "number 8": RemoteKey.NUM_8,
            "number 9": RemoteKey.NUM_9,
        }

        return mapping.get(key_name.lower())

    async def disable_cec(self) -> None:
        """Disable HDMI-CEC."""
        if self.cec_task:
            self.cec_task.cancel()
            try:
                await self.cec_task
            except asyncio.CancelledError:
                pass

        self.cec_enabled = False
        logger.info("HDMI-CEC disabled")

    # Bluetooth Remote Support

    async def enable_bluetooth_remote(self) -> bool:
        """Enable Bluetooth remote support.

        Returns:
            True if enabled successfully
        """
        try:
            # TODO: Implement Bluetooth HID device pairing and monitoring
            # This would use bluez/dbus to detect and handle Bluetooth input devices

            self.bluetooth_enabled = True
            logger.info("Bluetooth remote enabled (placeholder)")
            return True

        except Exception as e:
            logger.error(f"Failed to enable Bluetooth remote: {e}")
            return False

    async def pair_bluetooth_remote(self) -> bool:
        """Put system in Bluetooth pairing mode.

        Returns:
            True if pairing mode activated
        """
        try:
            # Make Bluetooth discoverable
            subprocess.run([
                "bluetoothctl",
                "discoverable", "on"
            ], timeout=5)

            subprocess.run([
                "bluetoothctl",
                "pairable", "on"
            ], timeout=5)

            logger.info("Bluetooth pairing mode activated")
            return True

        except Exception as e:
            logger.error(f"Failed to activate Bluetooth pairing: {e}")
            return False

    async def disable_bluetooth_remote(self) -> None:
        """Disable Bluetooth remote support."""
        self.bluetooth_enabled = False
        logger.info("Bluetooth remote disabled")

    # Combined Control

    async def start(self, enable_ir: bool = True, enable_cec: bool = True,
                   enable_bluetooth: bool = False) -> None:
        """Start remote control handlers.

        Args:
            enable_ir: Enable IR remote
            enable_cec: Enable HDMI-CEC
            enable_bluetooth: Enable Bluetooth
        """
        if enable_ir:
            await self.enable_ir_remote()

        if enable_cec:
            await self.enable_cec()

        if enable_bluetooth:
            await self.enable_bluetooth_remote()

        logger.info("Remote control handlers started")

    async def stop(self) -> None:
        """Stop all remote control handlers."""
        await self.disable_ir_remote()
        await self.disable_cec()
        await self.disable_bluetooth_remote()

        logger.info("Remote control handlers stopped")


# Global remote control handler
remote_control = RemoteControlHandler()
