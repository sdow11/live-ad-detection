"""Tests for compositor types module."""

import pytest
from pydantic import ValidationError
import sys
import importlib.util

# Load compositor.types directly without triggering __init__.py
spec = importlib.util.spec_from_file_location(
    "compositor.types",
    "packages/edge-device/src/compositor/types.py"
)
compositor_types = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compositor_types)

# Import from loaded module
PiPPosition = compositor_types.PiPPosition
TransitionType = compositor_types.TransitionType
PiPConfig = compositor_types.PiPConfig
CompositorConfig = compositor_types.CompositorConfig
get_pip_position = compositor_types.get_pip_position


class TestPiPPosition:
    """Test PiPPosition enum."""

    def test_pip_position_values(self):
        """Test PiPPosition enum has expected values."""
        assert PiPPosition.TOP_LEFT.value == "top_left"
        assert PiPPosition.TOP_RIGHT.value == "top_right"
        assert PiPPosition.BOTTOM_LEFT.value == "bottom_left"
        assert PiPPosition.BOTTOM_RIGHT.value == "bottom_right"
        assert PiPPosition.CENTER.value == "center"
        assert PiPPosition.CUSTOM.value == "custom"

    def test_all_positions_accessible(self):
        """Test all PiP positions are accessible."""
        positions = [
            PiPPosition.TOP_LEFT,
            PiPPosition.TOP_RIGHT,
            PiPPosition.BOTTOM_LEFT,
            PiPPosition.BOTTOM_RIGHT,
            PiPPosition.CENTER,
            PiPPosition.CUSTOM
        ]
        assert len(positions) == 6


class TestTransitionType:
    """Test TransitionType enum."""

    def test_transition_type_values(self):
        """Test TransitionType enum has expected values."""
        assert TransitionType.NONE.value == "none"
        assert TransitionType.FADE.value == "fade"
        assert TransitionType.SLIDE.value == "slide"
        assert TransitionType.ZOOM.value == "zoom"

    def test_all_transitions_accessible(self):
        """Test all transition types are accessible."""
        transitions = [
            TransitionType.NONE,
            TransitionType.FADE,
            TransitionType.SLIDE,
            TransitionType.ZOOM
        ]
        assert len(transitions) == 4


class TestPiPConfig:
    """Test PiPConfig model."""

    def test_default_initialization(self):
        """Test creating PiP config with defaults."""
        config = PiPConfig()

        assert config.position == PiPPosition.BOTTOM_RIGHT
        assert config.custom_position is None
        assert config.size == (480, 270)
        assert config.border_width == 2
        assert config.border_color == (255, 255, 255)
        assert config.margin == 20
        assert config.opacity == 1.0

    def test_custom_position_config(self):
        """Test creating config with custom position."""
        config = PiPConfig(
            position=PiPPosition.CUSTOM,
            custom_position=(100, 200)
        )

        assert config.position == PiPPosition.CUSTOM
        assert config.custom_position == (100, 200)

    def test_custom_size(self):
        """Test creating config with custom size."""
        config = PiPConfig(size=(640, 360))

        assert config.size == (640, 360)

    def test_border_width_minimum(self):
        """Test border_width minimum value."""
        config = PiPConfig(border_width=0)
        assert config.border_width == 0

    def test_border_width_maximum(self):
        """Test border_width maximum value."""
        config = PiPConfig(border_width=10)
        assert config.border_width == 10

    def test_border_width_too_small_raises_error(self):
        """Test that border_width < 0 raises ValidationError."""
        with pytest.raises(ValidationError):
            PiPConfig(border_width=-1)

    def test_border_width_too_large_raises_error(self):
        """Test that border_width > 10 raises ValidationError."""
        with pytest.raises(ValidationError):
            PiPConfig(border_width=11)

    def test_custom_border_color(self):
        """Test creating config with custom border color."""
        config = PiPConfig(border_color=(255, 0, 0))  # Red border

        assert config.border_color == (255, 0, 0)

    def test_custom_margin(self):
        """Test creating config with custom margin."""
        config = PiPConfig(margin=50)

        assert config.margin == 50

    def test_margin_minimum(self):
        """Test margin minimum value."""
        config = PiPConfig(margin=0)
        assert config.margin == 0

    def test_margin_negative_raises_error(self):
        """Test that negative margin raises ValidationError."""
        with pytest.raises(ValidationError):
            PiPConfig(margin=-1)

    def test_opacity_minimum(self):
        """Test opacity minimum value."""
        config = PiPConfig(opacity=0.0)
        assert config.opacity == 0.0

    def test_opacity_maximum(self):
        """Test opacity maximum value."""
        config = PiPConfig(opacity=1.0)
        assert config.opacity == 1.0

    def test_opacity_too_small_raises_error(self):
        """Test that opacity < 0.0 raises ValidationError."""
        with pytest.raises(ValidationError):
            PiPConfig(opacity=-0.1)

    def test_opacity_too_large_raises_error(self):
        """Test that opacity > 1.0 raises ValidationError."""
        with pytest.raises(ValidationError):
            PiPConfig(opacity=1.1)

    def test_semi_transparent_config(self):
        """Test creating config with semi-transparency."""
        config = PiPConfig(opacity=0.5)

        assert config.opacity == 0.5

    def test_all_positions(self):
        """Test config with all predefined positions."""
        for position in [
            PiPPosition.TOP_LEFT,
            PiPPosition.TOP_RIGHT,
            PiPPosition.BOTTOM_LEFT,
            PiPPosition.BOTTOM_RIGHT,
            PiPPosition.CENTER
        ]:
            config = PiPConfig(position=position)
            assert config.position == position


class TestCompositorConfig:
    """Test CompositorConfig model."""

    def test_default_initialization(self):
        """Test creating compositor config with defaults."""
        config = CompositorConfig()

        assert config.output_width == 1920
        assert config.output_height == 1080
        assert isinstance(config.pip_config, PiPConfig)
        assert config.transition_type == TransitionType.FADE
        assert config.transition_duration_frames == 30
        assert config.enable_pip is True

    def test_custom_resolution(self):
        """Test creating config with custom resolution."""
        config = CompositorConfig(
            output_width=1280,
            output_height=720
        )

        assert config.output_width == 1280
        assert config.output_height == 720

    def test_4k_resolution(self):
        """Test creating config with 4K resolution."""
        config = CompositorConfig(
            output_width=3840,
            output_height=2160
        )

        assert config.output_width == 3840
        assert config.output_height == 2160

    def test_output_width_minimum(self):
        """Test output_width minimum value."""
        config = CompositorConfig(output_width=640)
        assert config.output_width == 640

    def test_output_width_too_small_raises_error(self):
        """Test that output_width < 640 raises ValidationError."""
        with pytest.raises(ValidationError):
            CompositorConfig(output_width=639)

    def test_output_height_minimum(self):
        """Test output_height minimum value."""
        config = CompositorConfig(output_height=480)
        assert config.output_height == 480

    def test_output_height_too_small_raises_error(self):
        """Test that output_height < 480 raises ValidationError."""
        with pytest.raises(ValidationError):
            CompositorConfig(output_height=479)

    def test_custom_pip_config(self):
        """Test creating config with custom PiP settings."""
        pip_config = PiPConfig(
            position=PiPPosition.TOP_LEFT,
            size=(320, 180),
            opacity=0.8
        )
        config = CompositorConfig(pip_config=pip_config)

        assert config.pip_config.position == PiPPosition.TOP_LEFT
        assert config.pip_config.size == (320, 180)
        assert config.pip_config.opacity == 0.8

    def test_different_transition_types(self):
        """Test config with different transition types."""
        for transition in [
            TransitionType.NONE,
            TransitionType.FADE,
            TransitionType.SLIDE,
            TransitionType.ZOOM
        ]:
            config = CompositorConfig(transition_type=transition)
            assert config.transition_type == transition

    def test_transition_duration_minimum(self):
        """Test transition_duration_frames minimum value."""
        config = CompositorConfig(transition_duration_frames=1)
        assert config.transition_duration_frames == 1

    def test_transition_duration_maximum(self):
        """Test transition_duration_frames maximum value."""
        config = CompositorConfig(transition_duration_frames=120)
        assert config.transition_duration_frames == 120

    def test_transition_duration_too_small_raises_error(self):
        """Test that transition_duration_frames < 1 raises ValidationError."""
        with pytest.raises(ValidationError):
            CompositorConfig(transition_duration_frames=0)

    def test_transition_duration_too_large_raises_error(self):
        """Test that transition_duration_frames > 120 raises ValidationError."""
        with pytest.raises(ValidationError):
            CompositorConfig(transition_duration_frames=121)

    def test_pip_disabled(self):
        """Test creating config with PiP disabled."""
        config = CompositorConfig(enable_pip=False)

        assert config.enable_pip is False

    def test_pip_enabled(self):
        """Test creating config with PiP enabled."""
        config = CompositorConfig(enable_pip=True)

        assert config.enable_pip is True


class TestGetPipPosition:
    """Test get_pip_position function."""

    def test_top_left_position(self):
        """Test calculating top-left position."""
        config = PiPConfig(position=PiPPosition.TOP_LEFT, margin=20)
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 20
        assert y == 20

    def test_top_right_position(self):
        """Test calculating top-right position."""
        config = PiPConfig(
            position=PiPPosition.TOP_RIGHT,
            size=(480, 270),
            margin=20
        )
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 1920 - 480 - 20  # 1420
        assert y == 20

    def test_bottom_left_position(self):
        """Test calculating bottom-left position."""
        config = PiPConfig(
            position=PiPPosition.BOTTOM_LEFT,
            size=(480, 270),
            margin=20
        )
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 20
        assert y == 1080 - 270 - 20  # 790

    def test_bottom_right_position(self):
        """Test calculating bottom-right position."""
        config = PiPConfig(
            position=PiPPosition.BOTTOM_RIGHT,
            size=(480, 270),
            margin=20
        )
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 1920 - 480 - 20  # 1420
        assert y == 1080 - 270 - 20  # 790

    def test_center_position(self):
        """Test calculating center position."""
        config = PiPConfig(
            position=PiPPosition.CENTER,
            size=(480, 270)
        )
        x, y = get_pip_position(config, 1920, 1080)

        assert x == (1920 - 480) // 2  # 720
        assert y == (1080 - 270) // 2  # 405

    def test_custom_position(self):
        """Test using custom position."""
        config = PiPConfig(
            position=PiPPosition.CUSTOM,
            custom_position=(100, 200)
        )
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 100
        assert y == 200

    def test_custom_position_none_defaults_to_bottom_right(self):
        """Test that CUSTOM position with no coordinates defaults to bottom-right."""
        config = PiPConfig(
            position=PiPPosition.CUSTOM,
            size=(480, 270),
            margin=20
        )
        x, y = get_pip_position(config, 1920, 1080)

        # Should default to bottom-right
        assert x == 1920 - 480 - 20
        assert y == 1080 - 270 - 20

    def test_different_frame_sizes(self):
        """Test position calculation with different frame sizes."""
        config = PiPConfig(
            position=PiPPosition.TOP_RIGHT,
            size=(320, 180),
            margin=10
        )

        # 720p frame
        x, y = get_pip_position(config, 1280, 720)
        assert x == 1280 - 320 - 10  # 950
        assert y == 10

        # 4K frame
        x, y = get_pip_position(config, 3840, 2160)
        assert x == 3840 - 320 - 10  # 3510
        assert y == 10

    def test_different_pip_sizes(self):
        """Test position calculation with different PiP sizes."""
        # Small PiP
        config_small = PiPConfig(
            position=PiPPosition.BOTTOM_RIGHT,
            size=(240, 135),
            margin=15
        )
        x, y = get_pip_position(config_small, 1920, 1080)
        assert x == 1920 - 240 - 15  # 1665
        assert y == 1080 - 135 - 15  # 930

        # Large PiP
        config_large = PiPConfig(
            position=PiPPosition.BOTTOM_RIGHT,
            size=(960, 540),
            margin=15
        )
        x, y = get_pip_position(config_large, 1920, 1080)
        assert x == 1920 - 960 - 15  # 945
        assert y == 1080 - 540 - 15  # 525

    def test_zero_margin(self):
        """Test position calculation with zero margin."""
        config = PiPConfig(
            position=PiPPosition.TOP_LEFT,
            margin=0
        )
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 0
        assert y == 0

    def test_large_margin(self):
        """Test position calculation with large margin."""
        config = PiPConfig(
            position=PiPPosition.TOP_LEFT,
            margin=100
        )
        x, y = get_pip_position(config, 1920, 1080)

        assert x == 100
        assert y == 100


class TestCompositorTypesIntegration:
    """Integration tests for compositor types."""

    def test_complete_compositor_config_workflow(self):
        """Test creating complete compositor configuration."""
        # Create custom PiP config
        pip_config = PiPConfig(
            position=PiPPosition.BOTTOM_RIGHT,
            size=(640, 360),
            border_width=3,
            border_color=(0, 255, 0),  # Green border
            margin=30,
            opacity=0.9
        )

        # Create compositor config
        compositor_config = CompositorConfig(
            output_width=1920,
            output_height=1080,
            pip_config=pip_config,
            transition_type=TransitionType.FADE,
            transition_duration_frames=45,
            enable_pip=True
        )

        # Calculate PiP position
        x, y = get_pip_position(
            compositor_config.pip_config,
            compositor_config.output_width,
            compositor_config.output_height
        )

        # Verify everything works together
        assert compositor_config.output_width == 1920
        assert compositor_config.output_height == 1080
        assert compositor_config.pip_config.size == (640, 360)
        assert x == 1920 - 640 - 30  # 1250
        assert y == 1080 - 360 - 30  # 690

    def test_multiple_pip_positions_in_compositor(self):
        """Test using different PiP positions in same compositor."""
        compositor_config = CompositorConfig()

        # Test all positions
        positions = [
            PiPPosition.TOP_LEFT,
            PiPPosition.TOP_RIGHT,
            PiPPosition.BOTTOM_LEFT,
            PiPPosition.BOTTOM_RIGHT,
            PiPPosition.CENTER
        ]

        for position in positions:
            compositor_config.pip_config.position = position
            x, y = get_pip_position(
                compositor_config.pip_config,
                compositor_config.output_width,
                compositor_config.output_height
            )

            # All positions should return valid coordinates
            assert isinstance(x, int)
            assert isinstance(y, int)
            assert x >= 0
            assert y >= 0
