"""Video compositor package for PiP and overlay rendering.

This package provides video composition capabilities for creating
picture-in-picture displays and overlays.

Example:
    >>> from compositor import VideoCompositor, PiPConfig
    >>> config = PiPConfig(position=(1400, 750), size=(480, 270))
    >>> compositor = VideoCompositor(config)
    >>> output = await compositor.compose(main_frame, pip_frame)
"""

from compositor.types import (
    PiPConfig,
    PiPPosition,
    TransitionType,
    CompositorConfig,
)
from compositor.compositor import VideoCompositor
from compositor.content_source import (
    ContentSource,
    StaticImageSource,
    VideoFileSource,
    ColorBarsSource,
)

__all__ = [
    # Types
    "PiPConfig",
    "PiPPosition",
    "TransitionType",
    "CompositorConfig",
    # Compositor
    "VideoCompositor",
    # Content Sources
    "ContentSource",
    "StaticImageSource",
    "VideoFileSource",
    "ColorBarsSource",
]
