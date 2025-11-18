"""Tests for video capture module.

Following TDD approach - these tests are written BEFORE implementation.
"""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from video.types import Frame, FrameMetadata, VideoCaptureConfig, VideoFormat, VideoMode
from video.capture import VideoCapture, MockVideoCapture


class TestVideoCaptureConfig:
    """Test video capture configuration."""

    def test_default_config(self):
        """Test default configuration values."""
        config = VideoCaptureConfig()

        assert config.device == "/dev/video0"
        assert config.mode == VideoMode.FHD_1080P_60
        assert config.format == VideoFormat.H264
        assert config.buffer_size == 4
        assert config.timeout_ms == 5000

    def test_custom_config(self):
        """Test custom configuration values."""
        config = VideoCaptureConfig(
            device="/dev/video1",
            mode=VideoMode.HD_720P_30,
            format=VideoFormat.MJPEG,
            buffer_size=8,
            timeout_ms=3000,
        )

        assert config.device == "/dev/video1"
        assert config.mode == VideoMode.HD_720P_30
        assert config.format == VideoFormat.MJPEG
        assert config.buffer_size == 8
        assert config.timeout_ms == 3000

    def test_buffer_size_validation(self):
        """Test buffer size is within valid range."""
        # Valid range
        config = VideoCaptureConfig(buffer_size=1)
        assert config.buffer_size == 1

        config = VideoCaptureConfig(buffer_size=32)
        assert config.buffer_size == 32

        # Invalid range should raise validation error
        with pytest.raises(Exception):  # Pydantic ValidationError
            VideoCaptureConfig(buffer_size=0)

        with pytest.raises(Exception):
            VideoCaptureConfig(buffer_size=33)


class TestMockVideoCapture:
    """Test mock video capture for testing without hardware."""

    @pytest.mark.asyncio
    async def test_mock_capture_initialization(self):
        """Test mock capture can be initialized."""
        config = VideoCaptureConfig()
        capture = MockVideoCapture(config)

        await capture.initialize()
        assert await capture.is_available()

    @pytest.mark.asyncio
    async def test_mock_capture_frame(self):
        """Test mock capture returns valid frames."""
        config = VideoCaptureConfig(mode=VideoMode.HD_720P_30)
        capture = MockVideoCapture(config)

        await capture.initialize()
        frame = await capture.capture_frame()

        # Verify frame structure
        assert isinstance(frame, Frame)
        assert isinstance(frame.data, np.ndarray)
        assert isinstance(frame.metadata, FrameMetadata)

        # Verify dimensions match config
        assert frame.width == config.mode.width
        assert frame.height == config.mode.height
        assert frame.data.shape == (config.mode.height, config.mode.width, 3)

    @pytest.mark.asyncio
    async def test_mock_capture_frame_numbers_increment(self):
        """Test frame numbers increment sequentially."""
        config = VideoCaptureConfig()
        capture = MockVideoCapture(config)

        await capture.initialize()

        frame1 = await capture.capture_frame()
        frame2 = await capture.capture_frame()
        frame3 = await capture.capture_frame()

        assert frame1.metadata.frame_number == 1
        assert frame2.metadata.frame_number == 2
        assert frame3.metadata.frame_number == 3

    @pytest.mark.asyncio
    async def test_mock_capture_timestamps_increase(self):
        """Test frame timestamps increase monotonically."""
        config = VideoCaptureConfig()
        capture = MockVideoCapture(config)

        await capture.initialize()

        frame1 = await capture.capture_frame()
        await asyncio.sleep(0.01)  # Small delay
        frame2 = await capture.capture_frame()

        assert frame2.metadata.timestamp > frame1.metadata.timestamp

    @pytest.mark.asyncio
    async def test_mock_capture_generates_test_pattern(self):
        """Test mock capture generates consistent test pattern."""
        config = VideoCaptureConfig()
        capture = MockVideoCapture(config)

        await capture.initialize()
        frame = await capture.capture_frame()

        # Test pattern should not be all zeros
        assert np.any(frame.data != 0)

        # Test pattern should be in valid range for uint8
        assert frame.data.dtype == np.uint8
        assert frame.data.min() >= 0
        assert frame.data.max() <= 255

    @pytest.mark.asyncio
    async def test_mock_capture_close(self):
        """Test mock capture can be closed."""
        config = VideoCaptureConfig()
        capture = MockVideoCapture(config)

        await capture.initialize()
        assert await capture.is_available()

        await capture.close()
        assert not await capture.is_available()

    @pytest.mark.asyncio
    async def test_mock_capture_fails_if_not_initialized(self):
        """Test capture fails if used before initialization."""
        config = VideoCaptureConfig()
        capture = MockVideoCapture(config)

        # Should fail before initialization
        with pytest.raises(RuntimeError, match="not initialized"):
            await capture.capture_frame()

    @pytest.mark.asyncio
    async def test_mock_capture_config_property(self):
        """Test config property returns configuration."""
        config = VideoCaptureConfig(device="/dev/video2")
        capture = MockVideoCapture(config)

        assert capture.config == config
        assert capture.config.device == "/dev/video2"


@pytest.mark.skipif(True, reason="Requires V4L2 hardware - run manually on RPi")
class TestVideoCapture:
    """Test real video capture with V4L2.

    These tests require actual hardware and are skipped by default.
    Run manually on Raspberry Pi with HDMI capture device.
    """

    @pytest.mark.asyncio
    async def test_v4l2_capture_initialization(self):
        """Test V4L2 capture can be initialized."""
        config = VideoCaptureConfig(device="/dev/video0")
        capture = VideoCapture(config)

        await capture.initialize()
        assert await capture.is_available()
        await capture.close()

    @pytest.mark.asyncio
    async def test_v4l2_capture_frame(self):
        """Test V4L2 capture returns valid frames."""
        config = VideoCaptureConfig()
        capture = VideoCapture(config)

        await capture.initialize()
        frame = await capture.capture_frame()

        assert isinstance(frame, Frame)
        assert frame.width == config.mode.width
        assert frame.height == config.mode.height

        await capture.close()

    @pytest.mark.asyncio
    async def test_v4l2_capture_multiple_frames(self):
        """Test capturing multiple frames in sequence."""
        config = VideoCaptureConfig()
        capture = VideoCapture(config)

        await capture.initialize()

        frames = []
        for _ in range(10):
            frame = await capture.capture_frame()
            frames.append(frame)

        # Verify all frames captured
        assert len(frames) == 10

        # Verify frame numbers are sequential
        for i, frame in enumerate(frames):
            assert frame.metadata.frame_number == i + 1

        await capture.close()

    @pytest.mark.asyncio
    async def test_v4l2_capture_timeout(self):
        """Test capture times out if no frames available."""
        config = VideoCaptureConfig(
            device="/dev/video99",  # Non-existent device
            timeout_ms=1000,
        )
        capture = VideoCapture(config)

        # Initialization should fail
        with pytest.raises(RuntimeError):
            await capture.initialize()

    @pytest.mark.asyncio
    async def test_v4l2_capture_different_resolutions(self):
        """Test capture with different video modes."""
        modes = [
            VideoMode.HD_720P_30,
            VideoMode.HD_720P_60,
            VideoMode.FHD_1080P_30,
            VideoMode.FHD_1080P_60,
        ]

        for mode in modes:
            config = VideoCaptureConfig(mode=mode)
            capture = VideoCapture(config)

            await capture.initialize()
            frame = await capture.capture_frame()

            assert frame.width == mode.width
            assert frame.height == mode.height

            await capture.close()


class TestFrameMetadata:
    """Test frame metadata structure."""

    def test_metadata_creation(self):
        """Test creating metadata with default values."""
        metadata = FrameMetadata()

        assert isinstance(metadata.timestamp, datetime)
        assert metadata.frame_number == 0
        assert metadata.width == 1920
        assert metadata.height == 1080
        assert metadata.format == VideoFormat.RAW

    def test_metadata_custom_values(self):
        """Test creating metadata with custom values."""
        now = datetime.utcnow()
        metadata = FrameMetadata(
            timestamp=now,
            frame_number=42,
            width=1280,
            height=720,
            format=VideoFormat.H264,
            pts=12345,
            source="test_camera",
        )

        assert metadata.timestamp == now
        assert metadata.frame_number == 42
        assert metadata.width == 1280
        assert metadata.height == 720
        assert metadata.format == VideoFormat.H264
        assert metadata.pts == 12345
        assert metadata.source == "test_camera"

    def test_metadata_invalid_dimensions(self):
        """Test metadata rejects invalid dimensions."""
        with pytest.raises(ValueError, match="Invalid dimensions"):
            FrameMetadata(width=0, height=720)

        with pytest.raises(ValueError):
            FrameMetadata(width=1280, height=-1)


class TestFrame:
    """Test frame structure."""

    def test_frame_creation(self):
        """Test creating a valid frame."""
        data = np.zeros((720, 1280, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1280, height=720)
        frame = Frame(data=data, metadata=metadata)

        assert frame.width == 1280
        assert frame.height == 720
        assert frame.channels == 3
        assert frame.shape == (720, 1280, 3)

    def test_frame_grayscale(self):
        """Test creating a grayscale frame."""
        data = np.zeros((720, 1280), dtype=np.uint8)
        metadata = FrameMetadata(width=1280, height=720)
        frame = Frame(data=data, metadata=metadata)

        assert frame.channels == 1
        assert frame.shape == (720, 1280)

    def test_frame_dimension_mismatch(self):
        """Test frame rejects mismatched dimensions."""
        data = np.zeros((720, 1280, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)  # Wrong dimensions

        with pytest.raises(ValueError, match="don't match"):
            Frame(data=data, metadata=metadata)

    def test_frame_invalid_ndim(self):
        """Test frame rejects invalid array dimensions."""
        data = np.zeros((10, 10, 10, 10), dtype=np.uint8)  # 4D array
        metadata = FrameMetadata(width=10, height=10)

        with pytest.raises(ValueError, match="must be 2D or 3D"):
            Frame(data=data, metadata=metadata)
