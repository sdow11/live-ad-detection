"""Tests for video output module.

Following TDD approach - these tests are written BEFORE implementation.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from video.types import (
    Frame,
    FrameMetadata,
    VideoOutputConfig,
    VideoFormat,
    VideoMode,
)
from video.output import VideoOutput, MockVideoOutput


class TestVideoOutputConfig:
    """Test video output configuration."""

    def test_default_config(self):
        """Test default configuration values."""
        config = VideoOutputConfig()

        assert config.device == "/dev/dri/card0"
        assert config.mode == VideoMode.FHD_1080P_60
        assert config.vsync is True
        assert config.buffer_count == 2

    def test_custom_config(self):
        """Test custom configuration values."""
        config = VideoOutputConfig(
            device="/dev/dri/card1",
            mode=VideoMode.HD_720P_30,
            vsync=False,
            buffer_count=3,
        )

        assert config.device == "/dev/dri/card1"
        assert config.mode == VideoMode.HD_720P_30
        assert config.vsync is False
        assert config.buffer_count == 3

    def test_buffer_count_validation(self):
        """Test buffer count is within valid range."""
        # Valid range
        config = VideoOutputConfig(buffer_count=2)
        assert config.buffer_count == 2

        config = VideoOutputConfig(buffer_count=4)
        assert config.buffer_count == 4

        # Invalid range should raise validation error
        with pytest.raises(Exception):  # Pydantic ValidationError
            VideoOutputConfig(buffer_count=1)

        with pytest.raises(Exception):
            VideoOutputConfig(buffer_count=5)


class TestMockVideoOutput:
    """Test mock video output for testing without hardware."""

    @pytest.mark.asyncio
    async def test_mock_output_initialization(self):
        """Test mock output can be initialized."""
        config = VideoOutputConfig()
        output = MockVideoOutput(config)

        await output.initialize()
        assert await output.is_available()

    @pytest.mark.asyncio
    async def test_mock_output_display_frame(self):
        """Test mock output can display frames."""
        config = VideoOutputConfig(mode=VideoMode.HD_720P_30)
        output = MockVideoOutput(config)

        await output.initialize()

        # Create a test frame
        frame_data = np.zeros((720, 1280, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1280, height=720)
        frame = Frame(data=frame_data, metadata=metadata)

        # Should not raise
        await output.display_frame(frame)

    @pytest.mark.asyncio
    async def test_mock_output_tracks_displayed_frames(self):
        """Test mock output tracks number of displayed frames."""
        config = VideoOutputConfig()
        output = MockVideoOutput(config)

        await output.initialize()

        # Display multiple frames
        for i in range(5):
            frame_data = np.zeros((1080, 1920, 3), dtype=np.uint8)
            metadata = FrameMetadata(width=1920, height=1080, frame_number=i)
            frame = Frame(data=frame_data, metadata=metadata)
            await output.display_frame(frame)

        # Verify frame count
        assert output.frames_displayed == 5

    @pytest.mark.asyncio
    async def test_mock_output_validates_frame_dimensions(self):
        """Test mock output validates frame matches configured resolution."""
        config = VideoOutputConfig(mode=VideoMode.HD_720P_30)
        output = MockVideoOutput(config)

        await output.initialize()

        # Wrong resolution frame
        frame_data = np.zeros((1080, 1920, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)
        frame = Frame(data=frame_data, metadata=metadata)

        # Should raise error for mismatched resolution
        with pytest.raises(ValueError, match="resolution mismatch"):
            await output.display_frame(frame)

    @pytest.mark.asyncio
    async def test_mock_output_close(self):
        """Test mock output can be closed."""
        config = VideoOutputConfig()
        output = MockVideoOutput(config)

        await output.initialize()
        assert await output.is_available()

        await output.close()
        assert not await output.is_available()

    @pytest.mark.asyncio
    async def test_mock_output_fails_if_not_initialized(self):
        """Test output fails if used before initialization."""
        config = VideoOutputConfig()
        output = MockVideoOutput(config)

        frame_data = np.zeros((1080, 1920, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)
        frame = Frame(data=frame_data, metadata=metadata)

        # Should fail before initialization
        with pytest.raises(RuntimeError, match="not initialized"):
            await output.display_frame(frame)

    @pytest.mark.asyncio
    async def test_mock_output_config_property(self):
        """Test config property returns configuration."""
        config = VideoOutputConfig(device="/dev/dri/card2")
        output = MockVideoOutput(config)

        assert output.config == config
        assert output.config.device == "/dev/dri/card2"

    @pytest.mark.asyncio
    async def test_mock_output_vsync_timing(self):
        """Test mock output simulates vsync delay."""
        config = VideoOutputConfig(
            mode=VideoMode.HD_720P_60,  # 60fps = ~16.67ms per frame
            vsync=True,
        )
        output = MockVideoOutput(config)

        await output.initialize()

        frame_data = np.zeros((720, 1280, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1280, height=720)
        frame = Frame(data=frame_data, metadata=metadata)

        # Measure time for frame display
        import time

        start = time.time()
        await output.display_frame(frame)
        elapsed = time.time() - start

        # Should take at least 1 frame time (~16.67ms)
        expected_frame_time = 1.0 / config.mode.fps
        assert elapsed >= expected_frame_time * 0.8  # Allow 20% tolerance

    @pytest.mark.asyncio
    async def test_mock_output_no_vsync_faster(self):
        """Test mock output without vsync is faster."""
        config = VideoOutputConfig(
            mode=VideoMode.HD_720P_60,
            vsync=False,  # No vsync delay
        )
        output = MockVideoOutput(config)

        await output.initialize()

        frame_data = np.zeros((720, 1280, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1280, height=720)
        frame = Frame(data=frame_data, metadata=metadata)

        import time

        start = time.time()
        await output.display_frame(frame)
        elapsed = time.time() - start

        # Should be much faster without vsync (< 5ms)
        assert elapsed < 0.005


@pytest.mark.skipif(True, reason="Requires DRM/KMS hardware - run manually on RPi")
class TestVideoOutput:
    """Test real video output with DRM/KMS.

    These tests require actual hardware and are skipped by default.
    Run manually on Raspberry Pi with HDMI output.
    """

    @pytest.mark.asyncio
    async def test_drm_output_initialization(self):
        """Test DRM output can be initialized."""
        config = VideoOutputConfig(device="/dev/dri/card0")
        output = VideoOutput(config)

        await output.initialize()
        assert await output.is_available()
        await output.close()

    @pytest.mark.asyncio
    async def test_drm_output_display_frame(self):
        """Test DRM output can display frames."""
        config = VideoOutputConfig()
        output = VideoOutput(config)

        await output.initialize()

        # Create test frame
        frame_data = np.zeros((1080, 1920, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)
        frame = Frame(data=frame_data, metadata=metadata)

        await output.display_frame(frame)
        await output.close()

    @pytest.mark.asyncio
    async def test_drm_output_multiple_frames(self):
        """Test displaying multiple frames in sequence."""
        config = VideoOutputConfig()
        output = VideoOutput(config)

        await output.initialize()

        for i in range(60):  # 1 second at 60fps
            frame_data = np.full((1080, 1920, 3), i * 4, dtype=np.uint8)
            metadata = FrameMetadata(
                width=1920, height=1080, frame_number=i
            )
            frame = Frame(data=frame_data, metadata=metadata)
            await output.display_frame(frame)

        await output.close()

    @pytest.mark.asyncio
    async def test_drm_output_different_resolutions(self):
        """Test output with different video modes."""
        modes = [
            VideoMode.HD_720P_30,
            VideoMode.HD_720P_60,
            VideoMode.FHD_1080P_30,
            VideoMode.FHD_1080P_60,
        ]

        for mode in modes:
            config = VideoOutputConfig(mode=mode)
            output = VideoOutput(config)

            await output.initialize()

            frame_data = np.zeros(
                (mode.height, mode.width, 3), dtype=np.uint8
            )
            metadata = FrameMetadata(width=mode.width, height=mode.height)
            frame = Frame(data=frame_data, metadata=metadata)

            await output.display_frame(frame)
            await output.close()
