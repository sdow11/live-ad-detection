"""Video output implementations for HDMI output.

This module provides both real DRM/KMS-based output and mock output for testing.
"""

import asyncio
import logging
from typing import Optional

import cv2
import numpy as np

from video.types import Frame, VideoOutputConfig, VideoOutputProtocol

logger = logging.getLogger(__name__)


class MockVideoOutput:
    """Mock video output for testing without hardware.

    Simulates video output including vsync timing for realistic testing.
    Useful for development and testing without HDMI output hardware.

    Example:
        >>> config = VideoOutputConfig(mode=VideoMode.HD_720P_30)
        >>> output = MockVideoOutput(config)
        >>> await output.initialize()
        >>> await output.display_frame(frame)
    """

    def __init__(self, config: VideoOutputConfig) -> None:
        """Initialize mock output.

        Args:
            config: Output configuration
        """
        self._config = config
        self._initialized = False
        self._closed = False
        self._frames_displayed = 0

    async def initialize(self) -> None:
        """Initialize the mock output device."""
        logger.info(f"Initializing mock output: {self._config.mode.value}")
        self._initialized = True
        self._closed = False
        self._frames_displayed = 0

    async def display_frame(self, frame: Frame) -> None:
        """Display a frame (simulated).

        Args:
            frame: Frame to display

        Raises:
            RuntimeError: If not initialized
            ValueError: If frame dimensions don't match configuration
        """
        if not self._initialized or self._closed:
            raise RuntimeError("Output not initialized")

        # Validate frame dimensions
        if (
            frame.width != self._config.mode.width
            or frame.height != self._config.mode.height
        ):
            raise ValueError(
                f"Frame resolution mismatch: got {frame.width}x{frame.height}, "
                f"expected {self._config.mode.width}x{self._config.mode.height}"
            )

        # Simulate vsync delay if enabled
        if self._config.vsync:
            frame_time = 1.0 / self._config.mode.fps
            await asyncio.sleep(frame_time)

        self._frames_displayed += 1

        logger.debug(
            f"Displayed frame {frame.metadata.frame_number} "
            f"({self._frames_displayed} total)"
        )

    async def is_available(self) -> bool:
        """Check if output is available.

        Returns:
            True if initialized and not closed
        """
        return self._initialized and not self._closed

    async def close(self) -> None:
        """Close the mock output device."""
        logger.info(
            f"Closing mock output (displayed {self._frames_displayed} frames)"
        )
        self._closed = True
        self._initialized = False

    @property
    def config(self) -> VideoOutputConfig:
        """Get output configuration."""
        return self._config

    @property
    def frames_displayed(self) -> int:
        """Get number of frames displayed."""
        return self._frames_displayed


class VideoOutput:
    """Real video output using DRM/KMS (Direct Rendering Manager).

    Outputs video to HDMI using Linux DRM/KMS for low latency.
    For now, uses OpenCV as a fallback until DRM/KMS is fully implemented.

    Example:
        >>> config = VideoOutputConfig(device="/dev/dri/card0")
        >>> output = VideoOutput(config)
        >>> await output.initialize()
        >>> await output.display_frame(frame)
        >>> await output.close()
    """

    def __init__(self, config: VideoOutputConfig) -> None:
        """Initialize DRM/KMS output.

        Args:
            config: Output configuration
        """
        self._config = config
        self._initialized = False
        self._frames_displayed = 0

        # For Phase 1, use OpenCV window as fallback
        # TODO: Implement proper DRM/KMS output in Phase 4
        self._window_name = "Live TV - Press 'q' to quit"
        self._use_opencv_fallback = True

    async def initialize(self) -> None:
        """Initialize the DRM/KMS output device.

        For Phase 1, creates an OpenCV window as fallback.

        Raises:
            RuntimeError: If initialization fails
        """
        logger.info(
            f"Initializing video output: {self._config.device} "
            f"at {self._config.mode.value}"
        )

        if self._use_opencv_fallback:
            logger.warning(
                "Using OpenCV window fallback. "
                "DRM/KMS output will be implemented in Phase 4."
            )

            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._init_opencv_window)

        else:
            # TODO: Initialize DRM/KMS
            # - Open DRM device
            # - Get connector and CRTC
            # - Set video mode
            # - Allocate framebuffers
            pass

        self._initialized = True
        logger.info("Video output initialized successfully")

    def _init_opencv_window(self) -> None:
        """Initialize OpenCV window (fallback implementation).

        This is a temporary solution for Phase 1 development.
        """
        cv2.namedWindow(self._window_name, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(
            self._window_name,
            self._config.mode.width,
            self._config.mode.height,
        )

    async def display_frame(self, frame: Frame) -> None:
        """Display a frame on the output device.

        Args:
            frame: Frame to display

        Raises:
            RuntimeError: If not initialized
        """
        if not self._initialized:
            raise RuntimeError("Output not initialized")

        if self._use_opencv_fallback:
            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, self._display_frame_opencv, frame
            )

            # Simulate vsync if enabled
            if self._config.vsync:
                frame_time = 1.0 / self._config.mode.fps
                await asyncio.sleep(frame_time)

        else:
            # TODO: DRM/KMS frame display
            # - Convert frame to framebuffer format
            # - Queue buffer for display
            # - Wait for vsync if enabled
            pass

        self._frames_displayed += 1

    def _display_frame_opencv(self, frame: Frame) -> None:
        """Display frame using OpenCV (fallback).

        Args:
            frame: Frame to display
        """
        # Convert RGB to BGR for OpenCV
        if frame.channels == 3:
            display_frame = cv2.cvtColor(frame.data, cv2.COLOR_RGB2BGR)
        else:
            display_frame = frame.data

        cv2.imshow(self._window_name, display_frame)
        cv2.waitKey(1)  # Process window events

    async def is_available(self) -> bool:
        """Check if output device is available.

        Returns:
            True if initialized and ready
        """
        return self._initialized

    async def close(self) -> None:
        """Close the output device and release resources."""
        logger.info(
            f"Closing video output (displayed {self._frames_displayed} frames)"
        )

        if self._use_opencv_fallback:
            # Run in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, cv2.destroyAllWindows)

        else:
            # TODO: Close DRM/KMS resources
            pass

        self._initialized = False

    @property
    def config(self) -> VideoOutputConfig:
        """Get output configuration."""
        return self._config

    @property
    def frames_displayed(self) -> int:
        """Get number of frames displayed."""
        return self._frames_displayed
