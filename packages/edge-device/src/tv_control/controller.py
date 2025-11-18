"""Unified TV controller with automatic method selection and fallback.

This module provides a unified TV controller that automatically selects
the best available control method and falls back to alternatives if needed.

Example:
    >>> config = TVControllerConfig(
    ...     device_id="rpi-001",
    ...     brand=TVBrand.SAMSUNG,
    ...     preferred_methods=[ControlMethod.HDMI_CEC, ControlMethod.IR_BLASTER]
    ... )
    >>> controller = UnifiedTVController(config)
    >>> await controller.initialize()
    >>> await controller.set_channel("105")
"""

import logging
from typing import List, Optional

from tv_control import (
    ControlMethod,
    TVCommand,
    TVController,
    TVControllerConfig,
    TVControlProtocol,
)
from tv_control.cec import CECControl
from tv_control.ir_blaster import IRBlasterControl

logger = logging.getLogger(__name__)


class UnifiedTVController(TVController):
    """Unified TV controller that uses best available control method.

    This controller tries multiple control methods in order of preference
    and automatically falls back to alternatives if the primary method fails.

    Example:
        >>> controller = UnifiedTVController(config)
        >>> await controller.initialize()
        >>> # Will use CEC if available, else IR, else HTTP
        >>> await controller.power_on()
    """

    def __init__(self, config: TVControllerConfig) -> None:
        """Initialize unified TV controller.

        Args:
            config: Controller configuration
        """
        super().__init__(config)
        self.controllers: List[TVControlProtocol] = []
        self.available_methods: List[ControlMethod] = []

    async def initialize(self) -> None:
        """Initialize all control methods and detect availability."""
        logger.info(f"Initializing TV controller for device {self.config.device_id}")

        # Initialize each preferred method
        for method in self.config.preferred_methods:
            controller = await self._create_controller(method)
            if controller:
                self.controllers.append(controller)

                # Check if available
                if await controller.is_available():
                    self.available_methods.append(method)
                    logger.info(f"Control method available: {method}")

        if not self.available_methods:
            logger.warning(f"No TV control methods available for {self.config.device_id}")
        else:
            self.current_method = self.available_methods[0]
            logger.info(
                f"Using {self.current_method} as primary control method "
                f"({len(self.available_methods)} methods available)"
            )

    async def _create_controller(
        self, method: ControlMethod
    ) -> Optional[TVControlProtocol]:
        """Create a controller for the specified method.

        Args:
            method: Control method to create

        Returns:
            Controller instance or None if not supported
        """
        try:
            if method == ControlMethod.IR_BLASTER:
                controller = IRBlasterControl(self.config)
                await controller.initialize()
                return controller

            elif method == ControlMethod.HDMI_CEC:
                controller = CECControl(self.config)
                await controller.initialize()
                return controller

            elif method == ControlMethod.HTTP_API:
                # TODO: Implement HTTP API control
                logger.warning("HTTP API control not yet implemented")
                return None

            elif method == ControlMethod.BLUETOOTH:
                # TODO: Implement Bluetooth control
                logger.warning("Bluetooth control not yet implemented")
                return None

            else:
                logger.warning(f"Unknown control method: {method}")
                return None

        except Exception as e:
            logger.error(f"Failed to create {method} controller: {e}")
            return None

    async def send_command(
        self, command: TVCommand, value: Optional[str] = None
    ) -> bool:
        """Send command using best available method with fallback.

        Tries each available control method in order until one succeeds.

        Args:
            command: Command to send
            value: Optional value for the command

        Returns:
            True if any method succeeded
        """
        if not self.controllers:
            logger.error("No TV control methods available")
            return False

        # Try each controller in order
        for i, controller in enumerate(self.controllers):
            try:
                method = self.config.preferred_methods[i]
                logger.debug(f"Trying {method} for command {command}")

                result = await controller.send_command(command, value)

                if result:
                    logger.info(f"Command {command} succeeded via {method}")
                    return True
                else:
                    logger.debug(f"Command {command} failed via {method}")

            except Exception as e:
                logger.warning(f"Error with {method}: {e}")
                continue

        logger.error(f"Command {command} failed on all methods")
        return False

    async def get_available_methods(self) -> List[ControlMethod]:
        """Get list of available control methods.

        Returns:
            List of available methods
        """
        return self.available_methods.copy()

    async def set_preferred_method(self, method: ControlMethod) -> bool:
        """Set the preferred control method.

        Args:
            method: Method to use as primary

        Returns:
            True if method is available and set
        """
        if method in self.available_methods:
            self.current_method = method
            logger.info(f"Set preferred method to: {method}")
            return True
        else:
            logger.warning(f"Method {method} not available")
            return False


async def create_tv_controller(config: TVControllerConfig) -> UnifiedTVController:
    """Factory function to create and initialize a TV controller.

    Args:
        config: Controller configuration

    Returns:
        Initialized TV controller
    """
    controller = UnifiedTVController(config)
    await controller.initialize()
    return controller
