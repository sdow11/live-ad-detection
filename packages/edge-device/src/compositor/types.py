"""Types and protocols for video composition.

This module defines the core data structures for video composition
including PiP configuration and transition effects.
"""

from enum import Enum
from typing import Optional, Tuple

from pydantic import BaseModel, Field


class PiPPosition(str, Enum):
    """Predefined PiP positions."""

    TOP_LEFT = "top_left"
    TOP_RIGHT = "top_right"
    BOTTOM_LEFT = "bottom_left"
    BOTTOM_RIGHT = "bottom_right"
    CENTER = "center"
    CUSTOM = "custom"


class TransitionType(str, Enum):
    """Transition effects."""

    NONE = "none"
    FADE = "fade"
    SLIDE = "slide"
    ZOOM = "zoom"


class PiPConfig(BaseModel):
    """Configuration for picture-in-picture display."""

    position: PiPPosition = Field(
        PiPPosition.BOTTOM_RIGHT, description="PiP position on screen"
    )
    custom_position: Optional[Tuple[int, int]] = Field(
        None, description="Custom (x, y) position if position=CUSTOM"
    )
    size: Tuple[int, int] = Field(
        (480, 270), description="PiP size (width, height)"
    )
    border_width: int = Field(2, ge=0, le=10, description="Border width in pixels")
    border_color: Tuple[int, int, int] = Field(
        (255, 255, 255), description="Border color (R, G, B)"
    )
    margin: int = Field(20, ge=0, description="Margin from screen edge in pixels")
    opacity: float = Field(1.0, ge=0.0, le=1.0, description="PiP opacity (0-1)")


class CompositorConfig(BaseModel):
    """Configuration for video compositor."""

    output_width: int = Field(1920, ge=640, description="Output frame width")
    output_height: int = Field(1080, ge=480, description="Output frame height")
    pip_config: PiPConfig = Field(
        default_factory=PiPConfig, description="PiP configuration"
    )
    transition_type: TransitionType = Field(
        TransitionType.FADE, description="Transition effect type"
    )
    transition_duration_frames: int = Field(
        30, ge=1, le=120, description="Transition duration in frames"
    )
    enable_pip: bool = Field(True, description="Enable PiP overlay")


def get_pip_position(
    config: PiPConfig, frame_width: int, frame_height: int
) -> Tuple[int, int]:
    """Calculate PiP position coordinates.

    Args:
        config: PiP configuration
        frame_width: Output frame width
        frame_height: Output frame height

    Returns:
        (x, y) coordinates for top-left corner of PiP
    """
    pip_width, pip_height = config.size
    margin = config.margin

    if config.position == PiPPosition.CUSTOM and config.custom_position:
        return config.custom_position

    elif config.position == PiPPosition.TOP_LEFT:
        return (margin, margin)

    elif config.position == PiPPosition.TOP_RIGHT:
        return (frame_width - pip_width - margin, margin)

    elif config.position == PiPPosition.BOTTOM_LEFT:
        return (margin, frame_height - pip_height - margin)

    elif config.position == PiPPosition.BOTTOM_RIGHT:
        return (
            frame_width - pip_width - margin,
            frame_height - pip_height - margin,
        )

    elif config.position == PiPPosition.CENTER:
        return (
            (frame_width - pip_width) // 2,
            (frame_height - pip_height) // 2,
        )

    else:
        # Default to bottom right
        return (
            frame_width - pip_width - margin,
            frame_height - pip_height - margin,
        )
