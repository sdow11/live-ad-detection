"""HDMI CEC TV control using python-cec.

This module provides TV control via HDMI CEC (Consumer Electronics Control).
CEC allows control of HDMI-connected devices over the HDMI cable itself.

Example:
    >>> config = TVControllerConfig(device_id="rpi-001")
    >>> controller = CECControl(config)
    >>> await controller.initialize()
    >>> await controller.power_on()
"""

import asyncio
import logging
import os
from typing import Optional

from tv_control import TVCommand, TVControllerConfig

logger = logging.getLogger(__name__)


class CECControl:
    """TV control via HDMI CEC.

    Uses HDMI CEC (Consumer Electronics Control) to send commands over HDMI cable.
    Requires python-cec library and CEC-compatible hardware.

    Example:
        >>> controller = CECControl(config)
        >>> await controller.initialize()
        >>> if await controller.is_available():
        ...     await controller.power_on()
    """

    def __init__(self, config: TVControllerConfig) -> None:
        """Initialize CEC control.

        Args:
            config: Controller configuration
        """
        self.config = config
        self.is_initialized = False
        self.cec = None
        self.tv_device = None

    async def initialize(self) -> None:
        """Initialize CEC connection."""
        try:
            # Try to import cec library
            import cec

            self.cec = cec

            # Initialize CEC adapter
            cec.init()

            # Find TV device on CEC bus
            devices = cec.list_devices()
            for device in devices:
                if device.is_tv:
                    self.tv_device = device
                    break

            if self.tv_device:
                self.is_initialized = True
                logger.info("CEC control initialized successfully")
            else:
                logger.warning("No TV found on CEC bus")
                self.is_initialized = False

        except ImportError:
            logger.warning("python-cec not available - CEC control disabled")
            self.is_initialized = False
        except Exception as e:
            logger.error(f"Failed to initialize CEC: {e}")
            self.is_initialized = False

    async def is_available(self) -> bool:
        """Check if CEC is available.

        Returns:
            True if CEC adapter exists and library is available
        """
        # Check if CEC device exists
        if not os.path.exists(self.config.cec_adapter):
            return False

        # Check if python-cec is available
        try:
            import cec

            return True
        except ImportError:
            return False

    async def send_command(
        self, command: TVCommand, value: Optional[str] = None
    ) -> bool:
        """Send CEC command to TV.

        Args:
            command: Command to send
            value: Optional value (not used for most CEC commands)

        Returns:
            True if successful
        """
        if not self.is_initialized or self.tv_device is None:
            logger.error("CEC not initialized or TV not found")
            return False

        try:
            if command == TVCommand.POWER_ON:
                return await self._power_on()
            elif command == TVCommand.POWER_OFF:
                return await self._power_off()
            elif command == TVCommand.VOLUME_UP:
                return await self._volume_up()
            elif command == TVCommand.VOLUME_DOWN:
                return await self._volume_down()
            elif command == TVCommand.VOLUME_MUTE:
                return await self._mute()
            else:
                logger.warning(f"CEC command not supported: {command}")
                return False

        except Exception as e:
            logger.error(f"Failed to send CEC command {command}: {e}")
            return False

    async def _power_on(self) -> bool:
        """Send power on command via CEC.

        Returns:
            True if successful
        """
        if self.tv_device is None:
            return False

        try:
            self.tv_device.power_on()
            logger.info("Sent CEC power on command")
            return True
        except Exception as e:
            logger.error(f"CEC power on failed: {e}")
            return False

    async def _power_off(self) -> bool:
        """Send standby command via CEC.

        Returns:
            True if successful
        """
        if self.tv_device is None:
            return False

        try:
            self.tv_device.standby()
            logger.info("Sent CEC standby command")
            return True
        except Exception as e:
            logger.error(f"CEC standby failed: {e}")
            return False

    async def _volume_up(self) -> bool:
        """Send volume up command via CEC.

        Returns:
            True if successful
        """
        if self.tv_device is None:
            return False

        try:
            # CEC volume up opcode
            self.tv_device.transmit(0x44)  # Volume Up
            logger.debug("Sent CEC volume up")
            return True
        except Exception as e:
            logger.error(f"CEC volume up failed: {e}")
            return False

    async def _volume_down(self) -> bool:
        """Send volume down command via CEC.

        Returns:
            True if successful
        """
        if self.tv_device is None:
            return False

        try:
            # CEC volume down opcode
            self.tv_device.transmit(0x45)  # Volume Down
            logger.debug("Sent CEC volume down")
            return True
        except Exception as e:
            logger.error(f"CEC volume down failed: {e}")
            return False

    async def _mute(self) -> bool:
        """Send mute command via CEC.

        Returns:
            True if successful
        """
        if self.tv_device is None:
            return False

        try:
            # CEC mute opcode
            self.tv_device.transmit(0x43)  # Mute
            logger.debug("Sent CEC mute")
            return True
        except Exception as e:
            logger.error(f"CEC mute failed: {e}")
            return False

    async def set_active_source(self) -> bool:
        """Set this device as the active HDMI source.

        Returns:
            True if successful
        """
        if self.tv_device is None:
            return False

        try:
            self.tv_device.set_active_source()
            logger.info("Set as active CEC source")
            return True
        except Exception as e:
            logger.error(f"Set active source failed: {e}")
            return False

    # Protocol implementation

    async def power_on(self) -> bool:
        """Turn TV on."""
        return await self.send_command(TVCommand.POWER_ON)

    async def power_off(self) -> bool:
        """Turn TV off."""
        return await self.send_command(TVCommand.POWER_OFF)

    async def set_channel(self, channel: str) -> bool:
        """Change channel (not supported via CEC).

        Args:
            channel: Channel number

        Returns:
            False (CEC doesn't support channel changing)
        """
        logger.warning("Channel changing not supported via CEC")
        return False

    async def volume_up(self) -> bool:
        """Increase volume."""
        return await self.send_command(TVCommand.VOLUME_UP)

    async def volume_down(self) -> bool:
        """Decrease volume."""
        return await self.send_command(TVCommand.VOLUME_DOWN)

    async def mute(self) -> bool:
        """Mute/unmute volume."""
        return await self.send_command(TVCommand.VOLUME_MUTE)
