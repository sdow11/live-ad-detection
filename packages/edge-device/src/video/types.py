"""Common types and protocols for video processing.

This module defines the core data structures and protocol interfaces
used throughout the video pipeline.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Protocol, Optional, Tuple

import numpy as np
from pydantic import BaseModel, Field


class VideoFormat(str, Enum):
    """Supported video formats."""

    H264 = "h264"
    HEVC = "hevc"
    VP9 = "vp9"
    RAW = "raw"
    MJPEG = "mjpeg"


class VideoMode(str, Enum):
    """Video resolution and frame rate modes."""

    # HD modes
    HD_720P_30 = "1280x720@30"
    HD_720P_60 = "1280x720@60"

    # Full HD modes
    FHD_1080P_30 = "1920x1080@30"
    FHD_1080P_60 = "1920x1080@60"

    # 4K modes
    UHD_4K_30 = "3840x2160@30"
    UHD_4K_60 = "3840x2160@60"

    @property
    def resolution(self) -> Tuple[int, int]:
        """Get (width, height) from mode."""
        res_str = self.value.split("@")[0]
        width, height = res_str.split("x")
        return (int(width), int(height))

    @property
    def fps(self) -> int:
        """Get frames per second from mode."""
        return int(self.value.split("@")[1])

    @property
    def width(self) -> int:
        """Get width in pixels."""
        return self.resolution[0]

    @property
    def height(self) -> int:
        """Get height in pixels."""
        return self.resolution[1]


@dataclass
class FrameMetadata:
    """Metadata associated with a video frame."""

    timestamp: datetime = field(default_factory=datetime.utcnow)
    frame_number: int = 0
    width: int = 1920
    height: int = 1080
    format: VideoFormat = VideoFormat.RAW
    pts: Optional[int] = None  # Presentation timestamp
    source: str = "unknown"

    def __post_init__(self) -> None:
        """Validate metadata after initialization."""
        if self.width <= 0 or self.height <= 0:
            raise ValueError(f"Invalid dimensions: {self.width}x{self.height}")


@dataclass
class Frame:
    """A video frame with metadata.

    Attributes:
        data: The frame data as a numpy array (H, W, C)
        metadata: Frame metadata
    """

    data: np.ndarray
    metadata: FrameMetadata

    def __post_init__(self) -> None:
        """Validate frame after initialization."""
        if self.data.ndim not in (2, 3):
            raise ValueError(f"Frame must be 2D or 3D array, got {self.data.ndim}D")

        # Validate dimensions match metadata
        height, width = self.data.shape[:2]
        if height != self.metadata.height or width != self.metadata.width:
            raise ValueError(
                f"Frame dimensions {width}x{height} don't match "
                f"metadata {self.metadata.width}x{self.metadata.height}"
            )

    @property
    def shape(self) -> Tuple[int, ...]:
        """Get frame shape."""
        return self.data.shape

    @property
    def width(self) -> int:
        """Get frame width."""
        return self.metadata.width

    @property
    def height(self) -> int:
        """Get frame height."""
        return self.metadata.height

    @property
    def channels(self) -> int:
        """Get number of color channels."""
        return self.data.shape[2] if self.data.ndim == 3 else 1


class VideoCaptureConfig(BaseModel):
    """Configuration for video capture."""

    device: str = Field("/dev/video0", description="Video device path")
    mode: VideoMode = Field(VideoMode.FHD_1080P_60, description="Video mode")
    format: VideoFormat = Field(VideoFormat.H264, description="Video format")
    buffer_size: int = Field(4, ge=1, le=32, description="Number of frame buffers")
    timeout_ms: int = Field(5000, ge=100, description="Capture timeout in ms")


class VideoOutputConfig(BaseModel):
    """Configuration for video output."""

    device: str = Field("/dev/dri/card0", description="DRM device path")
    mode: VideoMode = Field(VideoMode.FHD_1080P_60, description="Video mode")
    vsync: bool = Field(True, description="Enable vertical sync")
    buffer_count: int = Field(2, ge=2, le=4, description="Number of output buffers")


# Protocol definitions for dependency injection and testing


class VideoCaptureProtocol(Protocol):
    """Protocol for video capture implementations."""

    async def initialize(self) -> None:
        """Initialize the video capture device.

        Raises:
            RuntimeError: If initialization fails
        """
        ...

    async def capture_frame(self) -> Frame:
        """Capture a single frame.

        Returns:
            Captured frame with metadata

        Raises:
            TimeoutError: If capture times out
            RuntimeError: If capture fails
        """
        ...

    async def is_available(self) -> bool:
        """Check if capture device is available.

        Returns:
            True if device can capture frames
        """
        ...

    async def close(self) -> None:
        """Close the capture device and release resources."""
        ...

    @property
    def config(self) -> VideoCaptureConfig:
        """Get capture configuration."""
        ...


class VideoOutputProtocol(Protocol):
    """Protocol for video output implementations."""

    async def initialize(self) -> None:
        """Initialize the video output device.

        Raises:
            RuntimeError: If initialization fails
        """
        ...

    async def display_frame(self, frame: Frame) -> None:
        """Display a frame on the output device.

        Args:
            frame: Frame to display

        Raises:
            RuntimeError: If display fails
        """
        ...

    async def is_available(self) -> bool:
        """Check if output device is available.

        Returns:
            True if device can display frames
        """
        ...

    async def close(self) -> None:
        """Close the output device and release resources."""
        ...

    @property
    def config(self) -> VideoOutputConfig:
        """Get output configuration."""
        ...


class VideoStats(BaseModel):
    """Video pipeline statistics."""

    frames_captured: int = 0
    frames_dropped: int = 0
    frames_displayed: int = 0
    average_fps: float = 0.0
    average_latency_ms: float = 0.0
    min_latency_ms: float = 0.0
    max_latency_ms: float = 0.0

    @property
    def drop_rate(self) -> float:
        """Calculate frame drop rate."""
        total = self.frames_captured + self.frames_dropped
        return self.frames_dropped / total if total > 0 else 0.0
