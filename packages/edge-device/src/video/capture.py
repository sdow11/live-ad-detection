"""Video capture implementations for HDMI input.

This module provides both real V4L2-based capture and mock capture for testing.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

import cv2
import numpy as np

from video.types import (
    Frame,
    FrameMetadata,
    VideoCaptureConfig,
    VideoCaptureProtocol,
    VideoFormat,
)

logger = logging.getLogger(__name__)


class MockVideoCapture:
    """Mock video capture for testing without hardware.

    Generates synthetic test pattern frames matching the configured resolution.
    Useful for development and testing without HDMI capture hardware.

    Example:
        >>> config = VideoCaptureConfig(mode=VideoMode.HD_720P_30)
        >>> capture = MockVideoCapture(config)
        >>> await capture.initialize()
        >>> frame = await capture.capture_frame()
        >>> print(f"Captured {frame.width}x{frame.height} frame")
    """

    def __init__(self, config: VideoCaptureConfig) -> None:
        """Initialize mock capture.

        Args:
            config: Capture configuration
        """
        self._config = config
        self._initialized = False
        self._frame_count = 0
        self._closed = False

    async def initialize(self) -> None:
        """Initialize the mock capture device."""
        logger.info(f"Initializing mock capture: {self._config.mode.value}")
        self._initialized = True
        self._closed = False
        self._frame_count = 0

    async def capture_frame(self) -> Frame:
        """Capture a synthetic test pattern frame.

        Returns:
            Frame with test pattern

        Raises:
            RuntimeError: If not initialized
        """
        if not self._initialized or self._closed:
            raise RuntimeError("Capture not initialized")

        # Generate test pattern (color bars + frame number)
        frame_data = self._generate_test_pattern()

        # Create metadata
        self._frame_count += 1
        metadata = FrameMetadata(
            timestamp=datetime.utcnow(),
            frame_number=self._frame_count,
            width=self._config.mode.width,
            height=self._config.mode.height,
            format=VideoFormat.RAW,
            source="mock_capture",
        )

        # Simulate realistic frame time
        await asyncio.sleep(1.0 / self._config.mode.fps)

        return Frame(data=frame_data, metadata=metadata)

    def _generate_test_pattern(self) -> np.ndarray:
        """Generate a color bar test pattern.

        Returns:
            Test pattern frame as numpy array
        """
        width = self._config.mode.width
        height = self._config.mode.height

        # Create color bars (SMPTE style)
        frame = np.zeros((height, width, 3), dtype=np.uint8)

        # Define 8 color bars
        colors = [
            (255, 255, 255),  # White
            (255, 255, 0),    # Yellow
            (0, 255, 255),    # Cyan
            (0, 255, 0),      # Green
            (255, 0, 255),    # Magenta
            (255, 0, 0),      # Red
            (0, 0, 255),      # Blue
            (0, 0, 0),        # Black
        ]

        bar_width = width // len(colors)

        for i, color in enumerate(colors):
            x_start = i * bar_width
            x_end = (i + 1) * bar_width if i < len(colors) - 1 else width
            frame[:, x_start:x_end] = color

        # Add frame number overlay
        font = cv2.FONT_HERSHEY_SIMPLEX
        text = f"Frame: {self._frame_count + 1}"
        cv2.putText(
            frame,
            text,
            (50, 100),
            font,
            2,
            (255, 255, 255),
            3,
            cv2.LINE_AA,
        )

        return frame

    async def is_available(self) -> bool:
        """Check if capture is available.

        Returns:
            True if initialized and not closed
        """
        return self._initialized and not self._closed

    async def close(self) -> None:
        """Close the mock capture device."""
        logger.info("Closing mock capture")
        self._closed = True
        self._initialized = False

    @property
    def config(self) -> VideoCaptureConfig:
        """Get capture configuration."""
        return self._config


class VideoCapture:
    """Real video capture using V4L2 (Video4Linux2).

    Captures video from HDMI capture devices using OpenCV's V4L2 backend.
    Designed for low latency with hardware-accelerated decoding where available.

    Example:
        >>> config = VideoCaptureConfig(device="/dev/video0")
        >>> capture = VideoCapture(config)
        >>> await capture.initialize()
        >>> frame = await capture.capture_frame()
        >>> await capture.close()
    """

    def __init__(self, config: VideoCaptureConfig) -> None:
        """Initialize V4L2 capture.

        Args:
            config: Capture configuration
        """
        self._config = config
        self._cap: Optional[cv2.VideoCapture] = None
        self._initialized = False
        self._frame_count = 0

    async def initialize(self) -> None:
        """Initialize the V4L2 capture device.

        Raises:
            RuntimeError: If device cannot be opened
        """
        logger.info(
            f"Initializing V4L2 capture: {self._config.device} "
            f"at {self._config.mode.value}"
        )

        # Run OpenCV initialization in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(None, self._init_capture)

        if not success:
            raise RuntimeError(
                f"Failed to open video device: {self._config.device}"
            )

        self._initialized = True
        logger.info("V4L2 capture initialized successfully")

    def _init_capture(self) -> bool:
        """Initialize OpenCV capture (blocking operation).

        Returns:
            True if successful
        """
        # Open device with V4L2 backend
        self._cap = cv2.VideoCapture(self._config.device, cv2.CAP_V4L2)

        if not self._cap.isOpened():
            return False

        # Configure capture format
        if self._config.format == VideoFormat.H264:
            fourcc = cv2.VideoWriter_fourcc('H', '2', '6', '4')
            self._cap.set(cv2.CAP_PROP_FOURCC, fourcc)
        elif self._config.format == VideoFormat.MJPEG:
            fourcc = cv2.VideoWriter_fourcc('M', 'J', 'P', 'G')
            self._cap.set(cv2.CAP_PROP_FOURCC, fourcc)

        # Set resolution and frame rate
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self._config.mode.width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._config.mode.height)
        self._cap.set(cv2.CAP_PROP_FPS, self._config.mode.fps)

        # Set buffer size
        self._cap.set(cv2.CAP_PROP_BUFFERSIZE, self._config.buffer_size)

        return True

    async def capture_frame(self) -> Frame:
        """Capture a frame from V4L2 device.

        Returns:
            Captured frame

        Raises:
            RuntimeError: If not initialized or capture fails
            TimeoutError: If capture times out
        """
        if not self._initialized or self._cap is None:
            raise RuntimeError("Capture not initialized")

        # Run blocking capture in thread pool
        loop = asyncio.get_event_loop()

        try:
            # Capture with timeout
            ret, frame_data = await asyncio.wait_for(
                loop.run_in_executor(None, self._cap.read),
                timeout=self._config.timeout_ms / 1000.0,
            )
        except asyncio.TimeoutError:
            raise TimeoutError(
                f"Frame capture timed out after {self._config.timeout_ms}ms"
            )

        if not ret or frame_data is None:
            raise RuntimeError("Failed to capture frame")

        # Create metadata
        self._frame_count += 1
        metadata = FrameMetadata(
            timestamp=datetime.utcnow(),
            frame_number=self._frame_count,
            width=frame_data.shape[1],
            height=frame_data.shape[0],
            format=VideoFormat.RAW,  # After decoding by OpenCV
            source=self._config.device,
        )

        return Frame(data=frame_data, metadata=metadata)

    async def is_available(self) -> bool:
        """Check if V4L2 device is available.

        Returns:
            True if device is open and ready
        """
        return self._initialized and self._cap is not None and self._cap.isOpened()

    async def close(self) -> None:
        """Close the V4L2 device and release resources."""
        logger.info("Closing V4L2 capture")

        if self._cap is not None:
            # Release in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._cap.release)
            self._cap = None

        self._initialized = False

    @property
    def config(self) -> VideoCaptureConfig:
        """Get capture configuration."""
        return self._config
