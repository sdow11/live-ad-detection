"""Tests for video passthrough pipeline.

Following TDD approach - these tests are written BEFORE implementation.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from video.capture import MockVideoCapture
from video.output import MockVideoOutput
from video.pipeline import PassthroughPipeline, PipelineConfig
from video.types import VideoMode, VideoStats


class TestPipelineConfig:
    """Test pipeline configuration."""

    def test_default_config(self):
        """Test default pipeline configuration."""
        config = PipelineConfig()

        assert config.mode == VideoMode.FHD_1080P_60
        assert config.enable_stats is True
        assert config.stats_interval_sec == 5.0
        assert config.max_latency_ms == 100.0

    def test_custom_config(self):
        """Test custom pipeline configuration."""
        config = PipelineConfig(
            mode=VideoMode.HD_720P_30,
            enable_stats=False,
            stats_interval_sec=10.0,
            max_latency_ms=50.0,
        )

        assert config.mode == VideoMode.HD_720P_30
        assert config.enable_stats is False
        assert config.stats_interval_sec == 10.0
        assert config.max_latency_ms == 50.0


class TestPassthroughPipeline:
    """Test basic passthrough pipeline."""

    @pytest.mark.asyncio
    async def test_pipeline_initialization(self):
        """Test pipeline can be initialized with capture and output."""
        capture = MockVideoCapture(config=MagicMock())
        output = MockVideoOutput(config=MagicMock())
        config = PipelineConfig()

        pipeline = PassthroughPipeline(capture, output, config)

        await pipeline.initialize()
        assert pipeline.is_running is False  # Not started yet

    @pytest.mark.asyncio
    async def test_pipeline_single_frame(self):
        """Test pipeline can process a single frame."""
        from video.types import VideoCaptureConfig, VideoOutputConfig

        capture = MockVideoCapture(
            config=VideoCaptureConfig(mode=VideoMode.HD_720P_30)
        )
        output = MockVideoOutput(
            config=VideoOutputConfig(mode=VideoMode.HD_720P_30, vsync=False)
        )
        config = PipelineConfig(mode=VideoMode.HD_720P_30)

        pipeline = PassthroughPipeline(capture, output, config)

        await pipeline.initialize()

        # Process one frame
        await pipeline.process_single_frame()

        # Verify frame was displayed
        assert output.frames_displayed == 1

    @pytest.mark.asyncio
    async def test_pipeline_multiple_frames(self):
        """Test pipeline can process multiple frames."""
        from video.types import VideoCaptureConfig, VideoOutputConfig

        capture = MockVideoCapture(
            config=VideoCaptureConfig(mode=VideoMode.HD_720P_30)
        )
        output = MockVideoOutput(
            config=VideoOutputConfig(mode=VideoMode.HD_720P_30, vsync=False)
        )
        config = PipelineConfig(mode=VideoMode.HD_720P_30)

        pipeline = PassthroughPipeline(capture, output, config)

        await pipeline.initialize()

        # Process 10 frames
        for _ in range(10):
            await pipeline.process_single_frame()

        # Verify all frames were displayed
        assert output.frames_displayed == 10

    @pytest.mark.asyncio
    async def test_pipeline_run_with_timeout(self):
        """Test pipeline runs continuously until stopped."""
        from video.types import VideoCaptureConfig, VideoOutputConfig

        capture = MockVideoCapture(
            config=VideoCaptureConfig(mode=VideoMode.HD_720P_30)
        )
        output = MockVideoOutput(
            config=VideoOutputConfig(mode=VideoMode.HD_720P_30, vsync=False)
        )
        config = PipelineConfig(mode=VideoMode.HD_720P_30, enable_stats=False)

        pipeline = PassthroughPipeline(capture, output, config)

        await pipeline.initialize()

        # Run for a short time then stop
        async def run_then_stop():
            await asyncio.sleep(0.1)
            await pipeline.stop()

        # Run both tasks concurrently
        await asyncio.gather(
            pipeline.run(),
            run_then_stop(),
        )

        # Verify some frames were processed
        assert output.frames_displayed > 0
        assert pipeline.is_running is False

    @pytest.mark.asyncio
    async def test_pipeline_stats_collection(self):
        """Test pipeline collects statistics."""
        from video.types import VideoCaptureConfig, VideoOutputConfig

        capture = MockVideoCapture(
            config=VideoCaptureConfig(mode=VideoMode.HD_720P_30)
        )
        output = MockVideoOutput(
            config=VideoOutputConfig(mode=VideoMode.HD_720P_30, vsync=False)
        )
        config = PipelineConfig(
            mode=VideoMode.HD_720P_30,
            enable_stats=True,
            stats_interval_sec=1.0,
        )

        pipeline = PassthroughPipeline(capture, output, config)

        await pipeline.initialize()

        # Process some frames
        for _ in range(10):
            await pipeline.process_single_frame()

        # Get stats
        stats = pipeline.get_stats()

        assert isinstance(stats, VideoStats)
        assert stats.frames_captured == 10
        assert stats.frames_displayed == 10
        assert stats.frames_dropped == 0
        assert stats.drop_rate == 0.0

    @pytest.mark.asyncio
    async def test_pipeline_latency_tracking(self):
        """Test pipeline tracks frame latency."""
        from video.types import VideoCaptureConfig, VideoOutputConfig

        capture = MockVideoCapture(
            config=VideoCaptureConfig(mode=VideoMode.HD_720P_30)
        )
        output = MockVideoOutput(
            config=VideoOutputConfig(mode=VideoMode.HD_720P_30, vsync=False)
        )
        config = PipelineConfig(
            mode=VideoMode.HD_720P_30, enable_stats=True
        )

        pipeline = PassthroughPipeline(capture, output, config)

        await pipeline.initialize()

        # Process frames
        for _ in range(10):
            await pipeline.process_single_frame()

        # Check latency stats
        stats = pipeline.get_stats()

        assert stats.average_latency_ms > 0
        assert stats.min_latency_ms > 0
        assert stats.max_latency_ms >= stats.average_latency_ms

    @pytest.mark.asyncio
    async def test_pipeline_error_handling(self):
        """Test pipeline handles capture errors gracefully."""
        from video.types import VideoCaptureConfig, VideoOutputConfig

        capture = MockVideoCapture(
            config=VideoCaptureConfig(mode=VideoMode.HD_720P_30)
        )
        output = MockVideoOutput(
            config=VideoOutputConfig(mode=VideoMode.HD_720P_30, vsync=False)
        )

        # Make capture fail
        capture.capture_frame = AsyncMock(side_effect=RuntimeError("Capture failed"))

        config = PipelineConfig(mode=VideoMode.HD_720P_30)
        pipeline = PassthroughPipeline(capture, output, config)

        await pipeline.initialize()

        # Should raise the error
        with pytest.raises(RuntimeError, match="Capture failed"):
            await pipeline.process_single_frame()

    @pytest.mark.asyncio
    async def test_pipeline_cleanup_on_stop(self):
        """Test pipeline cleans up resources on stop."""
        from video.types import VideoCaptureConfig, VideoOutputConfig

        capture = MockVideoCapture(
            config=VideoCaptureConfig(mode=VideoMode.HD_720P_30)
        )
        output = MockVideoOutput(
            config=VideoOutputConfig(mode=VideoMode.HD_720P_30, vsync=False)
        )
        config = PipelineConfig(mode=VideoMode.HD_720P_30)

        pipeline = PassthroughPipeline(capture, output, config)

        await pipeline.initialize()

        # Run briefly
        async def run_then_stop():
            await asyncio.sleep(0.05)
            await pipeline.stop()

        await asyncio.gather(pipeline.run(), run_then_stop())

        # Verify cleanup (capture and output should still be available
        # as pipeline doesn't own their lifecycle)
        assert pipeline.is_running is False

    @pytest.mark.asyncio
    async def test_pipeline_fps_measurement(self):
        """Test pipeline measures actual FPS."""
        from video.types import VideoCaptureConfig, VideoOutputConfig

        capture = MockVideoCapture(
            config=VideoCaptureConfig(mode=VideoMode.HD_720P_30)
        )
        output = MockVideoOutput(
            config=VideoOutputConfig(mode=VideoMode.HD_720P_30, vsync=False)
        )
        config = PipelineConfig(
            mode=VideoMode.HD_720P_30, enable_stats=True
        )

        pipeline = PassthroughPipeline(capture, output, config)

        await pipeline.initialize()

        # Run for a known time and count frames
        async def run_then_stop():
            await asyncio.sleep(0.2)  # 200ms
            await pipeline.stop()

        await asyncio.gather(pipeline.run(), run_then_stop())

        stats = pipeline.get_stats()

        # FPS should be measured (exact value depends on timing)
        assert stats.average_fps > 0

    @pytest.mark.asyncio
    async def test_pipeline_double_stop_safe(self):
        """Test calling stop() multiple times is safe."""
        from video.types import VideoCaptureConfig, VideoOutputConfig

        capture = MockVideoCapture(
            config=VideoCaptureConfig(mode=VideoMode.HD_720P_30)
        )
        output = MockVideoOutput(
            config=VideoOutputConfig(mode=VideoMode.HD_720P_30, vsync=False)
        )
        config = PipelineConfig(mode=VideoMode.HD_720P_30)

        pipeline = PassthroughPipeline(capture, output, config)

        await pipeline.initialize()

        # Stop multiple times (should not raise)
        await pipeline.stop()
        await pipeline.stop()
        await pipeline.stop()

        assert pipeline.is_running is False
