"""Tests for video compositor.

Following TDD approach - these tests are written BEFORE implementation.
"""

import numpy as np
import pytest

from compositor.types import (
    PiPConfig,
    PiPPosition,
    CompositorConfig,
    TransitionType,
    get_pip_position,
)
from compositor.compositor import VideoCompositor
from video.types import Frame, FrameMetadata


class TestPiPConfig:
    """Test PiP configuration."""

    def test_default_config(self):
        """Test default PiP configuration."""
        config = PiPConfig()

        assert config.position == PiPPosition.BOTTOM_RIGHT
        assert config.size == (480, 270)
        assert config.border_width == 2
        assert config.border_color == (255, 255, 255)
        assert config.margin == 20
        assert config.opacity == 1.0

    def test_custom_config(self):
        """Test custom PiP configuration."""
        config = PiPConfig(
            position=PiPPosition.TOP_LEFT,
            size=(640, 360),
            border_width=4,
            border_color=(255, 0, 0),
            margin=50,
            opacity=0.8,
        )

        assert config.position == PiPPosition.TOP_LEFT
        assert config.size == (640, 360)
        assert config.border_width == 4
        assert config.opacity == 0.8


class TestPiPPosition:
    """Test PiP position calculation."""

    def test_top_left_position(self):
        """Test top-left PiP positioning."""
        config = PiPConfig(position=PiPPosition.TOP_LEFT, margin=20)
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 20
        assert y == 20

    def test_top_right_position(self):
        """Test top-right PiP positioning."""
        config = PiPConfig(
            position=PiPPosition.TOP_RIGHT, size=(480, 270), margin=20
        )
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 1920 - 480 - 20  # 1420
        assert y == 20

    def test_bottom_left_position(self):
        """Test bottom-left PiP positioning."""
        config = PiPConfig(
            position=PiPPosition.BOTTOM_LEFT, size=(480, 270), margin=20
        )
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 20
        assert y == 1080 - 270 - 20  # 790

    def test_bottom_right_position(self):
        """Test bottom-right PiP positioning."""
        config = PiPConfig(
            position=PiPPosition.BOTTOM_RIGHT, size=(480, 270), margin=20
        )
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 1920 - 480 - 20  # 1420
        assert y == 1080 - 270 - 20  # 790

    def test_center_position(self):
        """Test center PiP positioning."""
        config = PiPConfig(position=PiPPosition.CENTER, size=(480, 270))
        x, y = get_pip_position(config, 1920, 1080)

        assert x == (1920 - 480) // 2  # 720
        assert y == (1080 - 270) // 2  # 405

    def test_custom_position(self):
        """Test custom PiP positioning."""
        config = PiPConfig(
            position=PiPPosition.CUSTOM, custom_position=(100, 200)
        )
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 100
        assert y == 200


class TestVideoCompositor:
    """Test video compositor."""

    @pytest.mark.asyncio
    async def test_compositor_initialization(self):
        """Test compositor can be initialized."""
        config = CompositorConfig()
        compositor = VideoCompositor(config)

        assert compositor.config == config

    @pytest.mark.asyncio
    async def test_compose_without_pip(self):
        """Test composition without PiP (passthrough)."""
        config = CompositorConfig(enable_pip=False)
        compositor = VideoCompositor(config)

        # Create main frame
        main_data = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
        main_metadata = FrameMetadata(width=1920, height=1080)
        main_frame = Frame(data=main_data, metadata=main_metadata)

        # Compose without PiP
        output = await compositor.compose(main_frame, pip_frame=None)

        # Should return main frame unchanged
        assert output.shape == main_frame.shape
        assert np.array_equal(output.data, main_frame.data)

    @pytest.mark.asyncio
    async def test_compose_with_pip(self):
        """Test composition with PiP overlay."""
        pip_config = PiPConfig(
            position=PiPPosition.BOTTOM_RIGHT, size=(480, 270)
        )
        config = CompositorConfig(pip_config=pip_config, enable_pip=True)
        compositor = VideoCompositor(config)

        # Create main frame
        main_data = np.zeros((1080, 1920, 3), dtype=np.uint8)
        main_metadata = FrameMetadata(width=1920, height=1080)
        main_frame = Frame(data=main_data, metadata=main_metadata)

        # Create PiP frame
        pip_data = np.full((270, 480, 3), 255, dtype=np.uint8)  # White
        pip_metadata = FrameMetadata(width=480, height=270)
        pip_frame = Frame(data=pip_data, metadata=pip_metadata)

        # Compose with PiP
        output = await compositor.compose(main_frame, pip_frame=pip_frame)

        # Should have PiP overlaid
        assert output.shape == main_frame.shape

        # Check PiP region is not black (has overlay)
        x, y = get_pip_position(pip_config, 1920, 1080)
        pip_region = output.data[y : y + 270, x : x + 480]
        assert np.any(pip_region > 0)  # Not all black

    @pytest.mark.asyncio
    async def test_compose_pip_auto_resize(self):
        """Test PiP frame is resized if needed."""
        pip_config = PiPConfig(size=(480, 270))
        config = CompositorConfig(pip_config=pip_config)
        compositor = VideoCompositor(config)

        main_data = np.zeros((1080, 1920, 3), dtype=np.uint8)
        main_metadata = FrameMetadata(width=1920, height=1080)
        main_frame = Frame(data=main_data, metadata=main_metadata)

        # PiP frame with different size (needs resize)
        pip_data = np.full((720, 1280, 3), 255, dtype=np.uint8)
        pip_metadata = FrameMetadata(width=1280, height=720)
        pip_frame = Frame(data=pip_data, metadata=pip_metadata)

        # Should resize and compose
        output = await compositor.compose(main_frame, pip_frame=pip_frame)

        assert output.shape == (1080, 1920, 3)

    @pytest.mark.asyncio
    async def test_compose_with_border(self):
        """Test PiP overlay includes border."""
        pip_config = PiPConfig(
            size=(480, 270), border_width=4, border_color=(255, 0, 0)
        )
        config = CompositorConfig(pip_config=pip_config)
        compositor = VideoCompositor(config)

        main_data = np.zeros((1080, 1920, 3), dtype=np.uint8)
        main_metadata = FrameMetadata(width=1920, height=1080)
        main_frame = Frame(data=main_data, metadata=main_metadata)

        pip_data = np.full((270, 480, 3), 128, dtype=np.uint8)
        pip_metadata = FrameMetadata(width=480, height=270)
        pip_frame = Frame(data=pip_data, metadata=pip_metadata)

        output = await compositor.compose(main_frame, pip_frame=pip_frame)

        # Check border exists (red pixels around PiP)
        x, y = get_pip_position(pip_config, 1920, 1080)

        # Top border pixel should be red
        border_pixel = output.data[y - 2, x]
        assert border_pixel[0] == 255  # Red channel

    @pytest.mark.asyncio
    async def test_compose_with_opacity(self):
        """Test PiP overlay with transparency."""
        pip_config = PiPConfig(size=(480, 270), opacity=0.5)
        config = CompositorConfig(pip_config=pip_config)
        compositor = VideoCompositor(config)

        # Main frame: white
        main_data = np.full((1080, 1920, 3), 255, dtype=np.uint8)
        main_metadata = FrameMetadata(width=1920, height=1080)
        main_frame = Frame(data=main_data, metadata=main_metadata)

        # PiP frame: black
        pip_data = np.zeros((270, 480, 3), dtype=np.uint8)
        pip_metadata = FrameMetadata(width=480, height=270)
        pip_frame = Frame(data=pip_data, metadata=pip_metadata)

        output = await compositor.compose(main_frame, pip_frame=pip_frame)

        # With 50% opacity, PiP region should be gray (blend of white + black)
        x, y = get_pip_position(pip_config, 1920, 1080)
        pip_region = output.data[y : y + 270, x : x + 480]

        # Should be approximately 127-128 (50% blend)
        avg_value = pip_region.mean()
        assert 100 < avg_value < 160  # Allow some tolerance

    @pytest.mark.asyncio
    async def test_swap_mode(self):
        """Test swap mode (PiP becomes main, main becomes PiP)."""
        config = CompositorConfig()
        compositor = VideoCompositor(config)

        # Main: black
        main_data = np.zeros((1080, 1920, 3), dtype=np.uint8)
        main_metadata = FrameMetadata(width=1920, height=1080)
        main_frame = Frame(data=main_data, metadata=main_metadata)

        # PiP: white
        pip_data = np.full((270, 480, 3), 255, dtype=np.uint8)
        pip_metadata = FrameMetadata(width=480, height=270)
        pip_frame = Frame(data=pip_data, metadata=pip_metadata)

        # Compose in swap mode (alternate content full screen, original in PiP)
        output = await compositor.compose(
            main_frame, pip_frame=pip_frame, swap_mode=True
        )

        # Most of frame should be white (from PiP expanded)
        # PiP region should be black (from main shrunk)
        center_pixel = output.data[540, 960]  # Center
        assert center_pixel[0] > 200  # Should be mostly white

    @pytest.mark.asyncio
    async def test_compose_different_positions(self):
        """Test composition at different PiP positions."""
        positions = [
            PiPPosition.TOP_LEFT,
            PiPPosition.TOP_RIGHT,
            PiPPosition.BOTTOM_LEFT,
            PiPPosition.BOTTOM_RIGHT,
            PiPPosition.CENTER,
        ]

        for position in positions:
            pip_config = PiPConfig(position=position, size=(480, 270))
            config = CompositorConfig(pip_config=pip_config)
            compositor = VideoCompositor(config)

            main_data = np.zeros((1080, 1920, 3), dtype=np.uint8)
            main_metadata = FrameMetadata(width=1920, height=1080)
            main_frame = Frame(data=main_data, metadata=main_metadata)

            pip_data = np.full((270, 480, 3), 255, dtype=np.uint8)
            pip_metadata = FrameMetadata(width=480, height=270)
            pip_frame = Frame(data=pip_data, metadata=pip_metadata)

            output = await compositor.compose(main_frame, pip_frame=pip_frame)

            # Should compose successfully for all positions
            assert output.shape == (1080, 1920, 3)

    @pytest.mark.asyncio
    async def test_compose_preserves_metadata(self):
        """Test composition preserves frame metadata."""
        config = CompositorConfig()
        compositor = VideoCompositor(config)

        main_data = np.zeros((1080, 1920, 3), dtype=np.uint8)
        main_metadata = FrameMetadata(
            width=1920, height=1080, frame_number=42
        )
        main_frame = Frame(data=main_data, metadata=main_metadata)

        output = await compositor.compose(main_frame, pip_frame=None)

        # Should preserve metadata
        assert output.metadata.frame_number == 42
        assert output.metadata.width == 1920
        assert output.metadata.height == 1080
