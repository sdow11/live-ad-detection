"""IR blaster TV control using LIRC (Linux Infrared Remote Control).

This module provides TV control via infrared blaster using LIRC.
LIRC must be installed and configured on the system.

Example:
    >>> config = TVControllerConfig(
    ...     device_id="rpi-001",
    ...     brand=TVBrand.SAMSUNG,
    ...     ir_remote_name="Samsung_TV"
    ... )
    >>> controller = IRBlasterControl(config)
    >>> await controller.initialize()
    >>> await controller.set_channel("105")
"""

import asyncio
import logging
import os
from typing import Dict, Optional

from tv_control import TVBrand, TVCommand, TVControllerConfig

logger = logging.getLogger(__name__)


# Command mappings for different TV brands
BRAND_COMMANDS: Dict[TVBrand, Dict[TVCommand, str]] = {
    TVBrand.SAMSUNG: {
        TVCommand.POWER_ON: "KEY_POWER",
        TVCommand.POWER_OFF: "KEY_POWER",
        TVCommand.POWER_TOGGLE: "KEY_POWER",
        TVCommand.VOLUME_UP: "KEY_VOLUMEUP",
        TVCommand.VOLUME_DOWN: "KEY_VOLUMEDOWN",
        TVCommand.VOLUME_MUTE: "KEY_MUTE",
        TVCommand.CHANNEL_UP: "KEY_CHANNELUP",
        TVCommand.CHANNEL_DOWN: "KEY_CHANNELDOWN",
        TVCommand.INPUT_HDMI1: "KEY_HDMI",
    },
    TVBrand.LG: {
        TVCommand.POWER_ON: "KEY_POWER",
        TVCommand.POWER_OFF: "KEY_POWER",
        TVCommand.POWER_TOGGLE: "KEY_POWER",
        TVCommand.VOLUME_UP: "KEY_VOLUMEUP",
        TVCommand.VOLUME_DOWN: "KEY_VOLUMEDOWN",
        TVCommand.VOLUME_MUTE: "KEY_MUTE",
        TVCommand.CHANNEL_UP: "KEY_CHANNELUP",
        TVCommand.CHANNEL_DOWN: "KEY_CHANNELDOWN",
        TVCommand.INPUT_HDMI1: "KEY_HDMI",
    },
    TVBrand.SONY: {
        TVCommand.POWER_ON: "KEY_POWER",
        TVCommand.POWER_OFF: "KEY_POWER",
        TVCommand.POWER_TOGGLE: "KEY_POWER",
        TVCommand.VOLUME_UP: "KEY_VOLUMEUP",
        TVCommand.VOLUME_DOWN: "KEY_VOLUMEDOWN",
        TVCommand.VOLUME_MUTE: "KEY_MUTE",
        TVCommand.CHANNEL_UP: "KEY_CHANNELUP",
        TVCommand.CHANNEL_DOWN: "KEY_CHANNELDOWN",
        TVCommand.INPUT_HDMI1: "KEY_HDMI",
    },
    TVBrand.GENERIC: {
        TVCommand.POWER_ON: "KEY_POWER",
        TVCommand.POWER_OFF: "KEY_POWER",
        TVCommand.POWER_TOGGLE: "KEY_POWER",
        TVCommand.VOLUME_UP: "KEY_VOLUMEUP",
        TVCommand.VOLUME_DOWN: "KEY_VOLUMEDOWN",
        TVCommand.VOLUME_MUTE: "KEY_MUTE",
        TVCommand.CHANNEL_UP: "KEY_CHANNELUP",
        TVCommand.CHANNEL_DOWN: "KEY_CHANNELDOWN",
    },
}


class IRBlasterControl:
    """TV control via IR blaster using LIRC.

    Uses LIRC (Linux Infrared Remote Control) to send IR commands to TVs.
    Requires LIRC to be installed and configured on the system.

    Example:
        >>> controller = IRBlasterControl(config)
        >>> await controller.initialize()
        >>> if await controller.is_available():
        ...     await controller.set_channel("5")
    """

    def __init__(self, config: TVControllerConfig) -> None:
        """Initialize IR blaster control.

        Args:
            config: Controller configuration
        """
        self.config = config
        self.is_initialized = False
        self.lirc = None

        # Get command mapping for this brand
        self.command_map = BRAND_COMMANDS.get(
            config.brand, BRAND_COMMANDS[TVBrand.GENERIC]
        )

    async def initialize(self) -> None:
        """Initialize LIRC connection."""
        try:
            # Try to import lirc
            import lirc

            self.lirc = lirc
            self.is_initialized = True
            logger.info(
                f"IR blaster initialized for {self.config.brand} "
                f"(remote: {self.config.ir_remote_name})"
            )
        except ImportError:
            logger.warning("LIRC not available - IR blaster control disabled")
            self.is_initialized = False
        except Exception as e:
            logger.error(f"Failed to initialize IR blaster: {e}")
            self.is_initialized = False

    async def is_available(self) -> bool:
        """Check if IR blaster is available.

        Returns:
            True if LIRC is available and device exists
        """
        # Check if LIRC device exists
        if not os.path.exists(self.config.ir_device):
            return False

        # Check if lirc module is available
        try:
            import lirc

            return True
        except ImportError:
            return False

    async def send_command(
        self, command: TVCommand, value: Optional[str] = None
    ) -> bool:
        """Send IR command to TV.

        Args:
            command: Command to send
            value: Optional value (e.g., channel number)

        Returns:
            True if successful
        """
        if not self.is_initialized or self.lirc is None:
            logger.error("IR blaster not initialized")
            return False

        try:
            if command == TVCommand.CHANNEL_SET and value:
                return await self._send_channel(value)
            else:
                return await self._send_ir_code(command)

        except Exception as e:
            logger.error(f"Failed to send IR command {command}: {e}")
            return False

    async def _send_ir_code(self, command: TVCommand) -> bool:
        """Send a single IR code.

        Args:
            command: Command to send

        Returns:
            True if successful
        """
        if self.lirc is None:
            return False

        # Get IR code for this command
        ir_code = self.command_map.get(command)
        if not ir_code:
            logger.warning(f"No IR code mapped for command: {command}")
            return False

        # Get remote name
        remote_name = self.config.ir_remote_name or f"{self.config.brand}_TV"

        try:
            # Send IR code via LIRC
            self.lirc.send_once(remote_name, ir_code)

            # Small delay after sending
            await asyncio.sleep(self.config.command_delay_ms / 1000.0)

            logger.debug(f"Sent IR command: {remote_name} {ir_code}")
            return True

        except Exception as e:
            logger.error(f"LIRC error sending {ir_code}: {e}")
            return False

    async def _send_channel(self, channel: str) -> bool:
        """Send channel number as sequence of digit commands.

        Args:
            channel: Channel number (e.g., "5", "105", "5.1")

        Returns:
            True if successful
        """
        if self.lirc is None:
            return False

        remote_name = self.config.ir_remote_name or f"{self.config.brand}_TV"

        try:
            # Send each digit/character
            for char in channel:
                if char.isdigit():
                    ir_code = f"KEY_{char}"
                elif char == ".":
                    ir_code = "KEY_DOT"
                elif char == "-":
                    ir_code = "KEY_MINUS"
                else:
                    logger.warning(f"Unsupported character in channel: {char}")
                    continue

                # Send digit
                self.lirc.send_once(remote_name, ir_code)

                # Delay between digits
                await asyncio.sleep(self.config.channel_digit_delay_ms / 1000.0)

            logger.info(f"Changed channel to: {channel}")
            return True

        except Exception as e:
            logger.error(f"Failed to send channel {channel}: {e}")
            return False

    async def power_on(self) -> bool:
        """Turn TV on."""
        return await self.send_command(TVCommand.POWER_ON)

    async def power_off(self) -> bool:
        """Turn TV off."""
        return await self.send_command(TVCommand.POWER_OFF)

    async def set_channel(self, channel: str) -> bool:
        """Change to specific channel.

        Args:
            channel: Channel number

        Returns:
            True if successful
        """
        return await self.send_command(TVCommand.CHANNEL_SET, value=channel)

    async def volume_up(self) -> bool:
        """Increase volume."""
        return await self.send_command(TVCommand.VOLUME_UP)

    async def volume_down(self) -> bool:
        """Decrease volume."""
        return await self.send_command(TVCommand.VOLUME_DOWN)

    async def mute(self) -> bool:
        """Mute/unmute volume."""
        return await self.send_command(TVCommand.VOLUME_MUTE)

    async def channel_up(self) -> bool:
        """Go to next channel."""
        return await self.send_command(TVCommand.CHANNEL_UP)

    async def channel_down(self) -> bool:
        """Go to previous channel."""
        return await self.send_command(TVCommand.CHANNEL_DOWN)
