"""Tests for frame preprocessing module.

Following TDD approach - these tests are written BEFORE implementation.
"""

import numpy as np
import pytest

from ml.types import PreprocessConfig
from ml.preprocessor import FramePreprocessor
from video.types import Frame, FrameMetadata


class TestPreprocessConfig:
    """Test preprocessing configuration."""

    def test_default_config(self):
        """Test default preprocessing configuration."""
        config = PreprocessConfig()

        assert config.target_size == (224, 224)
        assert config.normalize is True
        assert config.mean == (0.485, 0.456, 0.406)
        assert config.std == (0.229, 0.224, 0.225)
        assert config.resize_method == "bilinear"
        assert config.convert_to_rgb is True

    def test_custom_config(self):
        """Test custom preprocessing configuration."""
        config = PreprocessConfig(
            target_size=(320, 320),
            normalize=False,
            mean=(0.5, 0.5, 0.5),
            std=(0.5, 0.5, 0.5),
            resize_method="nearest",
            convert_to_rgb=False,
        )

        assert config.target_size == (320, 320)
        assert config.normalize is False
        assert config.mean == (0.5, 0.5, 0.5)


class TestFramePreprocessor:
    """Test frame preprocessing."""

    def test_preprocessor_initialization(self):
        """Test preprocessor can be initialized."""
        config = PreprocessConfig()
        preprocessor = FramePreprocessor(config)

        assert preprocessor.config == config

    def test_resize_frame(self):
        """Test frame is resized to target size."""
        config = PreprocessConfig(target_size=(224, 224))
        preprocessor = FramePreprocessor(config)

        # Create 1080p frame
        frame_data = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)
        frame = Frame(data=frame_data, metadata=metadata)

        # Preprocess
        processed = preprocessor.preprocess(frame)

        # Should be resized to 224x224
        assert processed.shape == (224, 224, 3)

    def test_normalize_frame(self):
        """Test frame normalization."""
        config = PreprocessConfig(
            target_size=(224, 224), normalize=True, convert_to_rgb=False
        )
        preprocessor = FramePreprocessor(config)

        # Create frame with known values
        frame_data = np.full((224, 224, 3), 128, dtype=np.uint8)
        metadata = FrameMetadata(width=224, height=224)
        frame = Frame(data=frame_data, metadata=metadata)

        # Preprocess
        processed = preprocessor.preprocess(frame)

        # Should be normalized (0-1 range or standardized)
        assert processed.dtype == np.float32
        assert processed.min() >= -5.0  # After standardization
        assert processed.max() <= 5.0

    def test_no_normalization(self):
        """Test preprocessing without normalization."""
        config = PreprocessConfig(
            target_size=(224, 224), normalize=False, convert_to_rgb=False
        )
        preprocessor = FramePreprocessor(config)

        frame_data = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=224, height=224)
        frame = Frame(data=frame_data, metadata=metadata)

        processed = preprocessor.preprocess(frame)

        # Should still be uint8 without normalization
        assert processed.dtype == np.uint8
        assert processed.min() >= 0
        assert processed.max() <= 255

    def test_bgr_to_rgb_conversion(self):
        """Test BGR to RGB conversion."""
        config = PreprocessConfig(
            target_size=(224, 224), normalize=False, convert_to_rgb=True
        )
        preprocessor = FramePreprocessor(config)

        # Create BGR frame (OpenCV format) with distinct colors
        frame_data = np.zeros((224, 224, 3), dtype=np.uint8)
        frame_data[:, :, 0] = 255  # Blue channel
        frame_data[:, :, 1] = 0  # Green channel
        frame_data[:, :, 2] = 0  # Red channel

        metadata = FrameMetadata(width=224, height=224)
        frame = Frame(data=frame_data, metadata=metadata)

        processed = preprocessor.preprocess(frame)

        # After BGR->RGB conversion, channel 2 should be 255 (blue)
        assert processed[0, 0, 2] == 255
        assert processed[0, 0, 0] == 0

    def test_different_target_sizes(self):
        """Test preprocessing with different target sizes."""
        target_sizes = [(224, 224), (320, 320), (299, 299), (128, 128)]

        for target_size in target_sizes:
            config = PreprocessConfig(target_size=target_size)
            preprocessor = FramePreprocessor(config)

            frame_data = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
            metadata = FrameMetadata(width=1920, height=1080)
            frame = Frame(data=frame_data, metadata=metadata)

            processed = preprocessor.preprocess(frame)

            assert processed.shape == (*target_size, 3)

    def test_batch_preprocess(self):
        """Test preprocessing multiple frames."""
        config = PreprocessConfig(target_size=(224, 224))
        preprocessor = FramePreprocessor(config)

        # Create multiple frames
        frames = []
        for i in range(5):
            frame_data = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
            metadata = FrameMetadata(width=1920, height=1080, frame_number=i)
            frames.append(Frame(data=frame_data, metadata=metadata))

        # Preprocess batch
        processed_batch = preprocessor.preprocess_batch(frames)

        # Should return array with batch dimension
        assert processed_batch.shape[0] == 5
        assert processed_batch.shape[1:] == (224, 224, 3)

    def test_preprocess_grayscale_frame(self):
        """Test preprocessing grayscale frame."""
        config = PreprocessConfig(target_size=(224, 224))
        preprocessor = FramePreprocessor(config)

        # Grayscale frame (2D)
        frame_data = np.random.randint(0, 255, (1080, 1920), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)
        frame = Frame(data=frame_data, metadata=metadata)

        # Should convert to 3-channel
        processed = preprocessor.preprocess(frame)

        assert processed.shape == (224, 224, 3)

    def test_preprocess_preserves_aspect_ratio_option(self):
        """Test preprocessing can preserve aspect ratio with padding."""
        config = PreprocessConfig(
            target_size=(224, 224), resize_method="bilinear"
        )
        preprocessor = FramePreprocessor(config)

        # Wide frame (16:9)
        frame_data = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)
        frame = Frame(data=frame_data, metadata=metadata)

        processed = preprocessor.preprocess(frame)

        # For now, just verify shape (aspect ratio preservation is future feature)
        assert processed.shape == (224, 224, 3)

    def test_preprocess_caching(self):
        """Test preprocessor caches config-dependent operations."""
        config = PreprocessConfig(target_size=(224, 224))
        preprocessor = FramePreprocessor(config)

        frame_data = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=1920, height=1080)
        frame = Frame(data=frame_data, metadata=metadata)

        # First preprocess
        processed1 = preprocessor.preprocess(frame)

        # Second preprocess (should use cached config)
        processed2 = preprocessor.preprocess(frame)

        # Shapes should match
        assert processed1.shape == processed2.shape

    def test_preprocess_with_different_dtypes(self):
        """Test preprocessing handles different input dtypes."""
        config = PreprocessConfig(target_size=(224, 224), normalize=True)
        preprocessor = FramePreprocessor(config)

        # uint8 input
        frame_data_uint8 = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=224, height=224)
        frame = Frame(data=frame_data_uint8, metadata=metadata)

        processed = preprocessor.preprocess(frame)

        assert processed.dtype == np.float32

    def test_add_batch_dimension(self):
        """Test adding batch dimension for single frame."""
        config = PreprocessConfig(target_size=(224, 224))
        preprocessor = FramePreprocessor(config)

        frame_data = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
        metadata = FrameMetadata(width=224, height=224)
        frame = Frame(data=frame_data, metadata=metadata)

        processed = preprocessor.preprocess(frame)
        batched = preprocessor.add_batch_dimension(processed)

        assert batched.shape == (1, 224, 224, 3)

    def test_remove_batch_dimension(self):
        """Test removing batch dimension."""
        config = PreprocessConfig()
        preprocessor = FramePreprocessor(config)

        batched = np.random.rand(1, 224, 224, 3).astype(np.float32)
        unbatched = preprocessor.remove_batch_dimension(batched)

        assert unbatched.shape == (224, 224, 3)
