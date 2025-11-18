"""TV control protocol definitions.

This module defines the abstract protocols for TV control.
Different control methods (IR, CEC, HTTP, Bluetooth) implement these protocols.

Following the Strategy pattern for flexible TV control.
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Optional, Protocol

from pydantic import BaseModel, Field


class TVCommand(str, Enum):
    """TV control commands."""

    POWER_ON = "power_on"
    POWER_OFF = "power_off"
    POWER_TOGGLE = "power_toggle"
    VOLUME_UP = "volume_up"
    VOLUME_DOWN = "volume_down"
    VOLUME_MUTE = "volume_mute"
    CHANNEL_UP = "channel_up"
    CHANNEL_DOWN = "channel_down"
    CHANNEL_SET = "channel_set"
    INPUT_HDMI1 = "input_hdmi1"
    INPUT_HDMI2 = "input_hdmi2"
    INPUT_HDMI3 = "input_hdmi3"
    INPUT_HDMI4 = "input_hdmi4"


class ControlMethod(str, Enum):
    """TV control methods."""

    IR_BLASTER = "ir_blaster"
    HDMI_CEC = "hdmi_cec"
    HTTP_API = "http_api"
    BLUETOOTH = "bluetooth"


class TVBrand(str, Enum):
    """Supported TV brands."""

    SAMSUNG = "samsung"
    LG = "lg"
    SONY = "sony"
    VIZIO = "vizio"
    TCL = "tcl"
    HISENSE = "hisense"
    GENERIC = "generic"


class ChannelInfo(BaseModel):
    """Channel information."""

    number: str = Field(..., description="Channel number (e.g., '5', '5.1', '105')")
    name: Optional[str] = Field(None, description="Channel name (e.g., 'ESPN')")
    callsign: Optional[str] = Field(None, description="Channel callsign")


class TVControlProtocol(Protocol):
    """Protocol for TV control implementations.

    All TV control methods must implement this protocol.
    """

    async def send_command(
        self, command: TVCommand, value: Optional[str] = None
    ) -> bool:
        """Send a command to the TV.

        Args:
            command: Command to send
            value: Optional value for commands that need it (e.g., channel number)

        Returns:
            True if command was sent successfully, False otherwise
        """
        ...

    async def power_on(self) -> bool:
        """Turn TV on."""
        ...

    async def power_off(self) -> bool:
        """Turn TV off."""
        ...

    async def set_channel(self, channel: str) -> bool:
        """Change to specific channel.

        Args:
            channel: Channel number to change to

        Returns:
            True if successful
        """
        ...

    async def volume_up(self) -> bool:
        """Increase volume."""
        ...

    async def volume_down(self) -> bool:
        """Decrease volume."""
        ...

    async def is_available(self) -> bool:
        """Check if this control method is available.

        Returns:
            True if control method can be used
        """
        ...


class TVControllerConfig(BaseModel):
    """Configuration for TV controller."""

    device_id: str
    brand: TVBrand = TVBrand.GENERIC
    model: Optional[str] = None

    # Control method preferences (in order of preference)
    preferred_methods: list[ControlMethod] = Field(
        default=[
            ControlMethod.HDMI_CEC,
            ControlMethod.IR_BLASTER,
            ControlMethod.HTTP_API,
        ]
    )

    # IR configuration
    ir_remote_name: Optional[str] = Field(
        None, description="LIRC remote configuration name"
    )
    ir_device: str = Field(default="/dev/lirc0")

    # CEC configuration
    cec_adapter: str = Field(default="/dev/cec0")

    # HTTP API configuration
    tv_ip_address: Optional[str] = None
    tv_api_port: int = Field(default=8080)

    # Timing
    command_delay_ms: int = Field(
        default=100, description="Delay between commands in milliseconds"
    )
    channel_digit_delay_ms: int = Field(
        default=300, description="Delay between channel digits in milliseconds"
    )


class TVController(ABC):
    """Abstract base class for TV controllers.

    Implements common functionality and delegates control to specific methods.
    """

    def __init__(self, config: TVControllerConfig) -> None:
        """Initialize TV controller.

        Args:
            config: Controller configuration
        """
        self.config = config
        self.current_method: Optional[ControlMethod] = None

    @abstractmethod
    async def initialize(self) -> None:
        """Initialize the controller and detect available control methods."""
        pass

    @abstractmethod
    async def send_command(
        self, command: TVCommand, value: Optional[str] = None
    ) -> bool:
        """Send command to TV using best available method.

        Args:
            command: Command to send
            value: Optional value for the command

        Returns:
            True if successful
        """
        pass

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
