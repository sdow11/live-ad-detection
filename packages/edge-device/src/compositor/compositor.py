"""Video compositor for PiP and overlay rendering.

This module provides the main video composition functionality for
creating picture-in-picture displays with borders, transitions, and effects.
"""

import asyncio
import logging
from typing import Optional

import cv2
import numpy as np

from compositor.types import (
    CompositorConfig,
    PiPConfig,
    get_pip_position,
)
from video.types import Frame, FrameMetadata

logger = logging.getLogger(__name__)


class VideoCompositor:
    """Video compositor for creating PiP displays.

    Combines multiple video sources into a single output frame with
    picture-in-picture overlay, borders, and optional effects.

    Example:
        >>> config = CompositorConfig()
        >>> compositor = VideoCompositor(config)
        >>> output = await compositor.compose(main_frame, pip_frame)
    """

    def __init__(self, config: CompositorConfig) -> None:
        """Initialize compositor.

        Args:
            config: Compositor configuration
        """
        self.config = config

    async def compose(
        self,
        main_frame: Frame,
        pip_frame: Optional[Frame] = None,
        swap_mode: bool = False,
    ) -> Frame:
        """Compose main frame with optional PiP overlay.

        Args:
            main_frame: Main video frame (full screen)
            pip_frame: Optional PiP frame to overlay
            swap_mode: If True, swap main and PiP (alternate content full screen)

        Returns:
            Composed frame with PiP overlay
        """
        # If PiP disabled or no PiP frame, return main frame
        if not self.config.enable_pip or pip_frame is None:
            return main_frame

        # Run composition in thread pool (CPU-intensive)
        loop = asyncio.get_event_loop()
        composed_data = await loop.run_in_executor(
            None, self._compose_sync, main_frame, pip_frame, swap_mode
        )

        # Create output frame with same metadata as main
        output_metadata = FrameMetadata(
            timestamp=main_frame.metadata.timestamp,
            frame_number=main_frame.metadata.frame_number,
            width=self.config.output_width,
            height=self.config.output_height,
            format=main_frame.metadata.format,
            source="compositor",
        )

        return Frame(data=composed_data, metadata=output_metadata)

    def _compose_sync(
        self, main_frame: Frame, pip_frame: Frame, swap_mode: bool
    ) -> np.ndarray:
        """Synchronous composition (blocking operation).

        Args:
            main_frame: Main frame
            pip_frame: PiP frame
            swap_mode: Swap mode flag

        Returns:
            Composed frame data
        """
        if swap_mode:
            # Swap mode: PiP becomes full screen, main becomes small PiP
            return self._compose_swap_mode(main_frame, pip_frame)
        else:
            # Normal mode: Main is full screen, PiP is overlay
            return self._compose_normal_mode(main_frame, pip_frame)

    def _compose_normal_mode(
        self, main_frame: Frame, pip_frame: Frame
    ) -> np.ndarray:
        """Compose in normal mode (main full screen, PiP overlay).

        Args:
            main_frame: Main frame
            pip_frame: PiP frame

        Returns:
            Composed frame data
        """
        # Start with main frame
        output = main_frame.data.copy()

        # Ensure output size
        if output.shape[:2] != (self.config.output_height, self.config.output_width):
            output = cv2.resize(
                output, (self.config.output_width, self.config.output_height)
            )

        # Resize PiP if needed
        pip_width, pip_height = self.config.pip_config.size
        pip_data = pip_frame.data

        if pip_data.shape[:2] != (pip_height, pip_width):
            pip_data = cv2.resize(pip_data, (pip_width, pip_height))

        # Get PiP position
        x, y = get_pip_position(
            self.config.pip_config, self.config.output_width, self.config.output_height
        )

        # Draw border if configured
        if self.config.pip_config.border_width > 0:
            border_width = self.config.pip_config.border_width
            border_color = self.config.pip_config.border_color

            cv2.rectangle(
                output,
                (x - border_width, y - border_width),
                (x + pip_width + border_width, y + pip_height + border_width),
                border_color,
                border_width,
            )

        # Apply opacity blending
        opacity = self.config.pip_config.opacity

        if opacity < 1.0:
            # Alpha blending
            # output[ROI] = (pip * alpha) + (background * (1 - alpha))
            background_region = output[y : y + pip_height, x : x + pip_width].copy()
            blended = cv2.addWeighted(
                pip_data.astype(np.uint8),
                opacity,
                background_region,
                1.0 - opacity,
                0,
            )
            output[y : y + pip_height, x : x + pip_width] = blended
        else:
            # Full opacity, direct copy
            output[y : y + pip_height, x : x + pip_width] = pip_data

        return output

    def _compose_swap_mode(
        self, main_frame: Frame, pip_frame: Frame
    ) -> np.ndarray:
        """Compose in swap mode (PiP full screen, main as small PiP).

        This is used during ad breaks: alternate content fills screen,
        original TV feed shows in small PiP window.

        Args:
            main_frame: Original TV frame (becomes small PiP)
            pip_frame: Alternate content (becomes full screen)

        Returns:
            Composed frame data
        """
        # PiP frame becomes full screen
        output = pip_frame.data.copy()

        if output.shape[:2] != (self.config.output_height, self.config.output_width):
            output = cv2.resize(
                output, (self.config.output_width, self.config.output_height)
            )

        # Main frame becomes small PiP
        pip_width, pip_height = self.config.pip_config.size
        main_data = main_frame.data

        if main_data.shape[:2] != (pip_height, pip_width):
            main_data = cv2.resize(main_data, (pip_width, pip_height))

        # Get PiP position
        x, y = get_pip_position(
            self.config.pip_config, self.config.output_width, self.config.output_height
        )

        # Draw border
        if self.config.pip_config.border_width > 0:
            border_width = self.config.pip_config.border_width
            border_color = self.config.pip_config.border_color

            cv2.rectangle(
                output,
                (x - border_width, y - border_width),
                (x + pip_width + border_width, y + pip_height + border_width),
                border_color,
                border_width,
            )

        # Overlay main as PiP
        output[y : y + pip_height, x : x + pip_width] = main_data

        return output
