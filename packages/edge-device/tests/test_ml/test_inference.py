"""Tests for ML model inference.

Following TDD approach - these tests are written BEFORE implementation.
"""

import asyncio
import numpy as np
import pytest
from unittest.mock import MagicMock, patch

from ml.types import InferenceConfig
from ml.inference import TFLiteModel, MockModel


class TestInferenceConfig:
    """Test inference configuration."""

    def test_default_config(self):
        """Test default inference configuration."""
        config = InferenceConfig(model_path="models/test.tflite")

        assert config.model_path == "models/test.tflite"
        assert config.num_threads == 4
        assert config.use_gpu is False
        assert config.confidence_threshold == 0.5
        assert config.batch_size == 1

    def test_custom_config(self):
        """Test custom inference configuration."""
        config = InferenceConfig(
            model_path="models/custom.tflite",
            num_threads=2,
            use_gpu=True,
            confidence_threshold=0.7,
            batch_size=4,
        )

        assert config.num_threads == 2
        assert config.use_gpu is True
        assert config.confidence_threshold == 0.7
        assert config.batch_size == 4


class TestMockModel:
    """Test mock model for testing without TFLite."""

    @pytest.mark.asyncio
    async def test_mock_model_initialization(self):
        """Test mock model can be initialized."""
        config = InferenceConfig(model_path="mock.tflite")
        model = MockModel(config)

        await model.initialize()
        assert await model.is_ready()

    @pytest.mark.asyncio
    async def test_mock_model_predict(self):
        """Test mock model returns predictions."""
        config = InferenceConfig(
            model_path="mock.tflite", confidence_threshold=0.5
        )
        model = MockModel(config, input_shape=(1, 224, 224, 3))

        await model.initialize()

        # Create dummy input
        input_data = np.random.rand(1, 224, 224, 3).astype(np.float32)

        # Get prediction
        output = await model.predict(input_data)

        # Should return probability
        assert output.shape == (1, 1)
        assert 0.0 <= output[0, 0] <= 1.0

    @pytest.mark.asyncio
    async def test_mock_model_shapes(self):
        """Test mock model reports correct shapes."""
        config = InferenceConfig(model_path="mock.tflite")
        model = MockModel(
            config, input_shape=(1, 224, 224, 3), output_shape=(1, 1)
        )

        await model.initialize()

        assert model.input_shape == (1, 224, 224, 3)
        assert model.output_shape == (1, 1)

    @pytest.mark.asyncio
    async def test_mock_model_deterministic_mode(self):
        """Test mock model can return deterministic results."""
        config = InferenceConfig(model_path="mock.tflite")
        model = MockModel(config, deterministic=True, fixed_output=0.8)

        await model.initialize()

        input_data = np.random.rand(1, 224, 224, 3).astype(np.float32)
        output = await model.predict(input_data)

        # Should always return 0.8
        assert output[0, 0] == 0.8

    @pytest.mark.asyncio
    async def test_mock_model_input_validation(self):
        """Test mock model validates input shape."""
        config = InferenceConfig(model_path="mock.tflite")
        model = MockModel(config, input_shape=(1, 224, 224, 3))

        await model.initialize()

        # Wrong shape input
        wrong_input = np.random.rand(1, 128, 128, 3).astype(np.float32)

        with pytest.raises(ValueError, match="shape"):
            await model.predict(wrong_input)

    @pytest.mark.asyncio
    async def test_mock_model_not_initialized(self):
        """Test mock model fails if not initialized."""
        config = InferenceConfig(model_path="mock.tflite")
        model = MockModel(config)

        input_data = np.random.rand(1, 224, 224, 3).astype(np.float32)

        with pytest.raises(RuntimeError, match="not initialized"):
            await model.predict(input_data)


@pytest.mark.skipif(True, reason="Requires TensorFlow Lite - run manually")
class TestTFLiteModel:
    """Test real TFLite model.

    These tests require TensorFlow Lite and a real model file.
    Skipped by default, run manually when TFLite is available.
    """

    @pytest.mark.asyncio
    async def test_tflite_model_initialization(self):
        """Test TFLite model can be initialized."""
        config = InferenceConfig(
            model_path="models/ad_detector.tflite", num_threads=2
        )
        model = TFLiteModel(config)

        await model.initialize()
        assert await model.is_ready()

    @pytest.mark.asyncio
    async def test_tflite_model_predict(self):
        """Test TFLite model inference."""
        config = InferenceConfig(model_path="models/ad_detector.tflite")
        model = TFLiteModel(config)

        await model.initialize()

        # Create input matching model's expected shape
        input_shape = model.input_shape
        input_data = np.random.rand(*input_shape).astype(np.float32)

        # Run inference
        output = await model.predict(input_data)

        # Should get output
        assert output is not None
        assert output.shape == model.output_shape

    @pytest.mark.asyncio
    async def test_tflite_model_shapes(self):
        """Test TFLite model reports correct shapes."""
        config = InferenceConfig(model_path="models/ad_detector.tflite")
        model = TFLiteModel(config)

        await model.initialize()

        # Should have shapes from actual model
        assert len(model.input_shape) == 4  # (batch, height, width, channels)
        assert len(model.output_shape) >= 2  # (batch, classes, ...)

    @pytest.mark.asyncio
    async def test_tflite_model_multiple_predictions(self):
        """Test running multiple inferences."""
        config = InferenceConfig(model_path="models/ad_detector.tflite")
        model = TFLiteModel(config)

        await model.initialize()

        input_shape = model.input_shape

        # Run multiple predictions
        for _ in range(10):
            input_data = np.random.rand(*input_shape).astype(np.float32)
            output = await model.predict(input_data)
            assert output is not None

    @pytest.mark.asyncio
    async def test_tflite_model_threading(self):
        """Test TFLite model with different thread counts."""
        for num_threads in [1, 2, 4]:
            config = InferenceConfig(
                model_path="models/ad_detector.tflite", num_threads=num_threads
            )
            model = TFLiteModel(config)

            await model.initialize()

            input_data = np.random.rand(*model.input_shape).astype(np.float32)
            output = await model.predict(input_data)

            assert output is not None

    @pytest.mark.asyncio
    async def test_tflite_model_batch_inference(self):
        """Test batch inference if supported."""
        config = InferenceConfig(
            model_path="models/ad_detector.tflite", batch_size=4
        )
        model = TFLiteModel(config)

        await model.initialize()

        # Create batch input
        batch_shape = list(model.input_shape)
        batch_shape[0] = 4  # Batch size

        input_data = np.random.rand(*batch_shape).astype(np.float32)
        output = await model.predict(input_data)

        # Should handle batch
        assert output.shape[0] == 4

    @pytest.mark.asyncio
    async def test_tflite_model_invalid_model_path(self):
        """Test TFLite model with invalid path."""
        config = InferenceConfig(model_path="nonexistent.tflite")
        model = TFLiteModel(config)

        with pytest.raises(RuntimeError):
            await model.initialize()

    @pytest.mark.asyncio
    async def test_tflite_model_inference_timing(self):
        """Test measuring inference time."""
        config = InferenceConfig(model_path="models/ad_detector.tflite")
        model = TFLiteModel(config)

        await model.initialize()

        input_data = np.random.rand(*model.input_shape).astype(np.float32)

        import time

        start = time.time()
        output = await model.predict(input_data)
        inference_time = (time.time() - start) * 1000  # ms

        assert output is not None
        assert inference_time < 100  # Should be fast (< 100ms)
        print(f"Inference time: {inference_time:.2f}ms")
