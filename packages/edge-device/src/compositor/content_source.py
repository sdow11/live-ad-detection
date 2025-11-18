"""Content sources for alternate content during ad breaks.

This module provides various content sources that can be used as
alternate content when ads are detected.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Optional

import cv2
import numpy as np

from video.types import Frame, FrameMetadata, VideoFormat

logger = logging.getLogger(__name__)


class ContentSource(ABC):
    """Abstract base class for content sources."""

    @abstractmethod
    async def initialize(self) -> None:
        """Initialize the content source."""
        pass

    @abstractmethod
    async def get_frame(self) -> Frame:
        """Get next frame from content source.

        Returns:
            Content frame
        """
        pass

    @abstractmethod
    async def reset(self) -> None:
        """Reset content source to beginning."""
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close and cleanup content source."""
        pass


class ColorBarsSource(ContentSource):
    """SMPTE color bars test pattern source.

    Generates standard SMPTE color bars, useful for testing and
    as a default alternate content.

    Example:
        >>> source = ColorBarsSource(width=1920, height=1080)
        >>> await source.initialize()
        >>> frame = await source.get_frame()
    """

    def __init__(self, width: int = 1920, height: int = 1080) -> None:
        """Initialize color bars source.

        Args:
            width: Frame width
            height: Frame height
        """
        self.width = width
        self.height = height
        self._frame_number = 0
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize color bars source."""
        logger.info(f"Initializing color bars source: {self.width}x{self.height}")
        self._initialized = True

    async def get_frame(self) -> Frame:
        """Get color bars frame.

        Returns:
            Frame with color bars pattern
        """
        if not self._initialized:
            raise RuntimeError("Content source not initialized")

        # Generate color bars in thread pool
        loop = asyncio.get_event_loop()
        frame_data = await loop.run_in_executor(None, self._generate_color_bars)

        self._frame_number += 1

        metadata = FrameMetadata(
            frame_number=self._frame_number,
            width=self.width,
            height=self.height,
            format=VideoFormat.RAW,
            source="color_bars",
        )

        return Frame(data=frame_data, metadata=metadata)

    def _generate_color_bars(self) -> np.ndarray:
        """Generate SMPTE color bars pattern.

        Returns:
            Color bars frame
        """
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)

        # Define SMPTE color bars (top 2/3)
        colors_top = [
            (192, 192, 192),  # Gray
            (192, 192, 0),    # Yellow
            (0, 192, 192),    # Cyan
            (0, 192, 0),      # Green
            (192, 0, 192),    # Magenta
            (192, 0, 0),      # Red
            (0, 0, 192),      # Blue
        ]

        bar_width = self.width // len(colors_top)
        top_height = (2 * self.height) // 3

        for i, color in enumerate(colors_top):
            x_start = i * bar_width
            x_end = (i + 1) * bar_width if i < len(colors_top) - 1 else self.width
            frame[:top_height, x_start:x_end] = color

        # Bottom 1/3: gradient and reference colors
        bottom_start = top_height

        # Add "ALTERNATE CONTENT" text
        font = cv2.FONT_HERSHEY_BOLD
        text = "ALTERNATE CONTENT"
        text_size = cv2.getTextSize(text, font, 2.0, 3)[0]
        text_x = (self.width - text_size[0]) // 2
        text_y = (self.height + top_height) // 2

        cv2.putText(
            frame, text, (text_x, text_y), font, 2.0, (255, 255, 255), 3, cv2.LINE_AA
        )

        return frame

    async def reset(self) -> None:
        """Reset frame counter."""
        self._frame_number = 0

    async def close(self) -> None:
        """Close color bars source."""
        self._initialized = False


class StaticImageSource(ContentSource):
    """Static image content source.

    Displays a single image repeatedly, useful for showing logos,
    promotional content, or static messages during ad breaks.

    Example:
        >>> source = StaticImageSource("content/logo.png")
        >>> await source.initialize()
        >>> frame = await source.get_frame()
    """

    def __init__(
        self, image_path: str, width: int = 1920, height: int = 1080
    ) -> None:
        """Initialize static image source.

        Args:
            image_path: Path to image file
            width: Output frame width
            height: Output frame height
        """
        self.image_path = image_path
        self.width = width
        self.height = height
        self._image: Optional[np.ndarray] = None
        self._frame_number = 0
        self._initialized = False

    async def initialize(self) -> None:
        """Load and initialize image."""
        logger.info(f"Loading static image: {self.image_path}")

        # Load in thread pool
        loop = asyncio.get_event_loop()
        self._image = await loop.run_in_executor(None, self._load_image)

        self._initialized = True
        logger.info("Static image loaded successfully")

    def _load_image(self) -> np.ndarray:
        """Load image from file (blocking).

        Returns:
            Loaded and resized image

        Raises:
            RuntimeError: If image cannot be loaded
        """
        image = cv2.imread(self.image_path)

        if image is None:
            raise RuntimeError(f"Failed to load image: {self.image_path}")

        # Resize to target dimensions
        if image.shape[:2] != (self.height, self.width):
            image = cv2.resize(image, (self.width, self.height))

        return image

    async def get_frame(self) -> Frame:
        """Get static image frame.

        Returns:
            Frame containing static image
        """
        if not self._initialized or self._image is None:
            raise RuntimeError("Content source not initialized")

        self._frame_number += 1

        metadata = FrameMetadata(
            frame_number=self._frame_number,
            width=self.width,
            height=self.height,
            format=VideoFormat.RAW,
            source=f"static_image:{self.image_path}",
        )

        return Frame(data=self._image.copy(), metadata=metadata)

    async def reset(self) -> None:
        """Reset frame counter."""
        self._frame_number = 0

    async def close(self) -> None:
        """Close static image source."""
        self._image = None
        self._initialized = False


class VideoFileSource(ContentSource):
    """Video file content source.

    Plays video files in a loop, useful for showing pre-recorded
    content during ad breaks.

    Example:
        >>> source = VideoFileSource("content/highlights.mp4")
        >>> await source.initialize()
        >>> frame = await source.get_frame()
    """

    def __init__(
        self, video_path: str, loop: bool = True
    ) -> None:
        """Initialize video file source.

        Args:
            video_path: Path to video file
            loop: If True, loop video when it ends
        """
        self.video_path = video_path
        self.loop = loop
        self._cap: Optional[cv2.VideoCapture] = None
        self._frame_number = 0
        self._initialized = False

    async def initialize(self) -> None:
        """Open video file."""
        logger.info(f"Opening video file: {self.video_path}")

        # Open in thread pool
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(None, self._open_video)

        if not success:
            raise RuntimeError(f"Failed to open video: {self.video_path}")

        self._initialized = True
        logger.info("Video file opened successfully")

    def _open_video(self) -> bool:
        """Open video file (blocking).

        Returns:
            True if successful
        """
        self._cap = cv2.VideoCapture(self.video_path)
        return self._cap.isOpened()

    async def get_frame(self) -> Frame:
        """Get next frame from video.

        Returns:
            Video frame

        Raises:
            RuntimeError: If video not initialized or read fails
        """
        if not self._initialized or self._cap is None:
            raise RuntimeError("Content source not initialized")

        # Read frame in thread pool
        loop = asyncio.get_event_loop()
        ret, frame_data = await loop.run_in_executor(None, self._cap.read)

        # If end of video and looping, reset
        if not ret and self.loop:
            await self.reset()
            ret, frame_data = await loop.run_in_executor(None, self._cap.read)

        if not ret or frame_data is None:
            raise RuntimeError("Failed to read video frame")

        self._frame_number += 1

        metadata = FrameMetadata(
            frame_number=self._frame_number,
            width=frame_data.shape[1],
            height=frame_data.shape[0],
            format=VideoFormat.RAW,
            source=f"video_file:{self.video_path}",
        )

        return Frame(data=frame_data, metadata=metadata)

    async def reset(self) -> None:
        """Reset video to beginning."""
        if self._cap is not None:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._cap.set, cv2.CAP_PROP_POS_FRAMES, 0)
            self._frame_number = 0

    async def close(self) -> None:
        """Close video file."""
        if self._cap is not None:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._cap.release)
            self._cap = None

        self._initialized = False
