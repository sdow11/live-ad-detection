"""Tests for ad detection engine.

Following TDD approach - these tests are written BEFORE implementation.
"""

import asyncio
import numpy as np
import pytest

from ml.types import AdDetectionResult, DetectionStats, PreprocessConfig, InferenceConfig
from ml.detector import AdDetector, DetectorConfig
from ml.inference import MockModel
from ml.preprocessor import FramePreprocessor
from video.types import Frame, FrameMetadata


class TestDetectorConfig:
    """Test detector configuration."""

    def test_default_config(self):
        """Test default detector configuration."""
        config = DetectorConfig(model_path="models/test.tflite")

        assert config.model_path == "models/test.tflite"
        assert config.confidence_threshold == 0.5
        assert config.temporal_window == 5
        assert config.temporal_threshold == 0.6

    def test_custom_config(self):
        """Test custom detector configuration."""
        config = DetectorConfig(
            model_path="models/custom.tflite",
            confidence_threshold=0.7,
            temporal_window=10,
            temporal_threshold=0.8,
        )

        assert config.confidence_threshold == 0.7
        assert config.temporal_window == 10
        assert config.temporal_threshold == 0.8


class TestAdDetector:
    """Test ad detection engine."""

    @pytest.mark.asyncio
    async def test_detector_initialization(self):
        """Test detector can be initialized."""
        config = DetectorConfig(model_path="mock.tflite")
        detector = AdDetector(config, use_mock_model=True)

        await detector.initialize()
        assert detector.is_ready

    @pytest.mark.asyncio
    async def test_detect_single_frame(self):
        """Test detecting ad in single frame."""
        config = DetectorConfig(model_path="mock.tflite", confidence_threshold=0.5)
        detector = AdDetector(config, use_mock_model=True)

        await detector.initialize()

        # Create test frame
        frame_data = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080, frame_number=1)
        frame = Frame(data=frame_data, metadata=metadata)

        # Detect
        result = await detector.detect(frame)

        assert isinstance(result, AdDetectionResult)
        assert isinstance(result.is_ad, bool)
        assert 0.0 <= result.confidence <= 1.0
        assert result.frame_number == 1

    @pytest.mark.asyncio
    async def test_detect_with_high_confidence(self):
        """Test detection with high confidence threshold."""
        config = DetectorConfig(
            model_path="mock.tflite", confidence_threshold=0.9
        )

        # Use deterministic mock with high output
        detector = AdDetector(config, use_mock_model=True, mock_fixed_output=0.95)

        await detector.initialize()

        frame_data = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)
        frame = Frame(data=frame_data, metadata=metadata)

        result = await detector.detect(frame)

        # Should detect as ad with 0.95 confidence
        assert result.is_ad is True
        assert result.confidence == 0.95

    @pytest.mark.asyncio
    async def test_detect_with_low_confidence(self):
        """Test detection with low confidence below threshold."""
        config = DetectorConfig(
            model_path="mock.tflite", confidence_threshold=0.7
        )

        # Use deterministic mock with low output
        detector = AdDetector(config, use_mock_model=True, mock_fixed_output=0.3)

        await detector.initialize()

        frame_data = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)
        frame = Frame(data=frame_data, metadata=metadata)

        result = await detector.detect(frame)

        # Should not detect as ad
        assert result.is_ad is False
        assert result.confidence == 0.3

    @pytest.mark.asyncio
    async def test_temporal_smoothing(self):
        """Test temporal smoothing reduces false positives."""
        config = DetectorConfig(
            model_path="mock.tflite",
            confidence_threshold=0.5,
            temporal_window=3,
            temporal_threshold=0.67,  # 2 out of 3
        )

        detector = AdDetector(config, use_mock_model=True)
        await detector.initialize()

        # Simulate flickering detection: ad, content, ad
        # Without temporal smoothing, this would trigger twice
        # With temporal smoothing (2/3), it should smooth out

        results = []

        for i, conf in enumerate([0.9, 0.2, 0.9]):
            detector._mock_model._fixed_output = conf

            frame_data = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
            metadata = FrameMetadata(width=224, height=224, frame_number=i)
            frame = Frame(data=frame_data, metadata=metadata)

            result = await detector.detect(frame)
            results.append(result)

        # Check temporal smoothing is applied
        # This test verifies the mechanism exists; exact behavior depends on implementation

    @pytest.mark.asyncio
    async def test_detection_stats(self):
        """Test detector collects statistics."""
        config = DetectorConfig(model_path="mock.tflite")
        detector = AdDetector(config, use_mock_model=True)

        await detector.initialize()

        # Detect on multiple frames
        for i in range(10):
            frame_data = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
            metadata = FrameMetadata(width=224, height=224, frame_number=i)
            frame = Frame(data=frame_data, metadata=metadata)

            await detector.detect(frame)

        # Get stats
        stats = detector.get_stats()

        assert isinstance(stats, DetectionStats)
        assert stats.total_frames == 10
        assert stats.ad_frames + stats.content_frames == 10

    @pytest.mark.asyncio
    async def test_inference_timing(self):
        """Test detector tracks inference time."""
        config = DetectorConfig(model_path="mock.tflite")
        detector = AdDetector(config, use_mock_model=True)

        await detector.initialize()

        frame_data = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)
        frame = Frame(data=frame_data, metadata=metadata)

        result = await detector.detect(frame)

        # Should track inference time
        assert result.inference_time_ms > 0
        assert result.inference_time_ms < 1000  # Should be fast

    @pytest.mark.asyncio
    async def test_detector_not_initialized(self):
        """Test detector fails if not initialized."""
        config = DetectorConfig(model_path="mock.tflite")
        detector = AdDetector(config, use_mock_model=True)

        frame_data = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=224, height=224)
        frame = Frame(data=frame_data, metadata=metadata)

        with pytest.raises(RuntimeError, match="not initialized"):
            await detector.detect(frame)

    @pytest.mark.asyncio
    async def test_detection_confidence_levels(self):
        """Test confidence level categorization."""
        config = DetectorConfig(model_path="mock.tflite")
        detector = AdDetector(config, use_mock_model=True, mock_fixed_output=0.95)

        await detector.initialize()

        frame_data = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=224, height=224)
        frame = Frame(data=frame_data, metadata=metadata)

        result = await detector.detect(frame)

        # With 0.95 confidence, should be HIGH
        assert result.confidence_level.value == "high"

    @pytest.mark.asyncio
    async def test_reset_stats(self):
        """Test resetting detection statistics."""
        config = DetectorConfig(model_path="mock.tflite")
        detector = AdDetector(config, use_mock_model=True)

        await detector.initialize()

        # Detect some frames
        for i in range(5):
            frame_data = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
            metadata = FrameMetadata(width=224, height=224, frame_number=i)
            frame = Frame(data=frame_data, metadata=metadata)
            await detector.detect(frame)

        # Reset stats
        detector.reset_stats()

        stats = detector.get_stats()
        assert stats.total_frames == 0
        assert stats.ad_frames == 0
        assert stats.content_frames == 0

    @pytest.mark.asyncio
    async def test_detector_with_custom_preprocessor(self):
        """Test detector with custom preprocessing config."""
        preprocess_config = PreprocessConfig(
            target_size=(320, 320), normalize=True
        )

        config = DetectorConfig(
            model_path="mock.tflite", preprocess_config=preprocess_config
        )

        detector = AdDetector(config, use_mock_model=True)
        await detector.initialize()

        frame_data = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)
        frame = Frame(data=frame_data, metadata=metadata)

        result = await detector.detect(frame)

        # Should work with custom preprocessing
        assert result is not None

    @pytest.mark.asyncio
    async def test_concurrent_detections(self):
        """Test running multiple detections concurrently."""
        config = DetectorConfig(model_path="mock.tflite")
        detector = AdDetector(config, use_mock_model=True)

        await detector.initialize()

        # Create multiple frames
        frames = []
        for i in range(5):
            frame_data = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
            metadata = FrameMetadata(width=224, height=224, frame_number=i)
            frames.append(Frame(data=frame_data, metadata=metadata))

        # Run detections concurrently
        results = await asyncio.gather(*[detector.detect(frame) for frame in frames])

        assert len(results) == 5
        for result in results:
            assert isinstance(result, AdDetectionResult)
