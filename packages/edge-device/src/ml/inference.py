"""ML model inference implementations.

This module provides model inference capabilities using TensorFlow Lite
and mock implementations for testing.
"""

import asyncio
import logging
from typing import Optional, Tuple

import numpy as np

from ml.types import InferenceConfig, ModelProtocol

logger = logging.getLogger(__name__)


class MockModel:
    """Mock ML model for testing without TensorFlow Lite.

    Generates random or fixed predictions for testing the inference pipeline
    without requiring actual model files or TensorFlow Lite.

    Example:
        >>> config = InferenceConfig(model_path="mock.tflite")
        >>> model = MockModel(config, deterministic=True, fixed_output=0.9)
        >>> await model.initialize()
        >>> output = await model.predict(input_data)
    """

    def __init__(
        self,
        config: InferenceConfig,
        input_shape: Tuple[int, ...] = (1, 224, 224, 3),
        output_shape: Tuple[int, ...] = (1, 1),
        deterministic: bool = False,
        fixed_output: float = 0.5,
    ) -> None:
        """Initialize mock model.

        Args:
            config: Inference configuration
            input_shape: Expected input shape
            output_shape: Output shape
            deterministic: If True, always return fixed_output
            fixed_output: Fixed value to return when deterministic=True
        """
        self._config = config
        self._input_shape = input_shape
        self._output_shape = output_shape
        self._deterministic = deterministic
        self._fixed_output = fixed_output
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the mock model."""
        logger.info(f"Initializing mock model: {self._config.model_path}")
        self._initialized = True

    async def predict(self, input_data: np.ndarray) -> np.ndarray:
        """Run mock inference.

        Args:
            input_data: Input array

        Returns:
            Mock prediction output

        Raises:
            RuntimeError: If not initialized
            ValueError: If input shape doesn't match
        """
        if not self._initialized:
            raise RuntimeError("Model not initialized")

        # Validate input shape
        if input_data.shape != self._input_shape:
            raise ValueError(
                f"Input shape mismatch: expected {self._input_shape}, "
                f"got {input_data.shape}"
            )

        # Generate output
        if self._deterministic:
            output = np.full(self._output_shape, self._fixed_output, dtype=np.float32)
        else:
            # Random prediction between 0 and 1
            output = np.random.rand(*self._output_shape).astype(np.float32)

        # Simulate inference delay
        await asyncio.sleep(0.01)  # 10ms

        return output

    async def is_ready(self) -> bool:
        """Check if model is ready.

        Returns:
            True if initialized
        """
        return self._initialized

    @property
    def input_shape(self) -> Tuple[int, ...]:
        """Get input shape."""
        return self._input_shape

    @property
    def output_shape(self) -> Tuple[int, ...]:
        """Get output shape."""
        return self._output_shape


class TFLiteModel:
    """TensorFlow Lite model for edge inference.

    Loads and runs inference using TensorFlow Lite interpreter for
    efficient execution on edge devices.

    Example:
        >>> config = InferenceConfig(
        ...     model_path="models/ad_detector.tflite",
        ...     num_threads=4
        ... )
        >>> model = TFLiteModel(config)
        >>> await model.initialize()
        >>> output = await model.predict(input_data)
    """

    def __init__(self, config: InferenceConfig) -> None:
        """Initialize TFLite model.

        Args:
            config: Inference configuration
        """
        self._config = config
        self._interpreter: Optional[any] = None
        self._input_details: Optional[list] = None
        self._output_details: Optional[list] = None
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the TFLite interpreter.

        Raises:
            RuntimeError: If model file not found or initialization fails
        """
        logger.info(
            f"Initializing TFLite model: {self._config.model_path} "
            f"(threads: {self._config.num_threads})"
        )

        # Run initialization in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._init_interpreter)

        self._initialized = True
        logger.info(
            f"TFLite model initialized: "
            f"input={self.input_shape}, output={self.output_shape}"
        )

    def _init_interpreter(self) -> None:
        """Initialize TFLite interpreter (blocking operation).

        Raises:
            RuntimeError: If initialization fails
        """
        try:
            import tensorflow as tf
        except ImportError:
            raise RuntimeError(
                "TensorFlow Lite not installed. "
                "Install with: pip install tensorflow-lite"
            )

        try:
            # Load model
            self._interpreter = tf.lite.Interpreter(
                model_path=self._config.model_path,
                num_threads=self._config.num_threads,
            )

            # Allocate tensors
            self._interpreter.allocate_tensors()

            # Get input and output details
            self._input_details = self._interpreter.get_input_details()
            self._output_details = self._interpreter.get_output_details()

        except Exception as e:
            raise RuntimeError(f"Failed to initialize TFLite model: {e}")

    async def predict(self, input_data: np.ndarray) -> np.ndarray:
        """Run inference on input data.

        Args:
            input_data: Preprocessed input array

        Returns:
            Model output array

        Raises:
            RuntimeError: If not initialized or inference fails
        """
        if not self._initialized or self._interpreter is None:
            raise RuntimeError("Model not initialized")

        # Run inference in thread pool
        loop = asyncio.get_event_loop()
        output = await loop.run_in_executor(None, self._run_inference, input_data)

        return output

    def _run_inference(self, input_data: np.ndarray) -> np.ndarray:
        """Run TFLite inference (blocking operation).

        Args:
            input_data: Input array

        Returns:
            Output array
        """
        # Set input tensor
        self._interpreter.set_tensor(
            self._input_details[0]["index"], input_data
        )

        # Run inference
        self._interpreter.invoke()

        # Get output tensor
        output = self._interpreter.get_tensor(self._output_details[0]["index"])

        return output

    async def is_ready(self) -> bool:
        """Check if model is ready for inference.

        Returns:
            True if model is loaded and ready
        """
        return self._initialized and self._interpreter is not None

    @property
    def input_shape(self) -> Tuple[int, ...]:
        """Get expected input shape.

        Returns:
            Input tensor shape
        """
        if self._input_details is None:
            raise RuntimeError("Model not initialized")

        return tuple(self._input_details[0]["shape"])

    @property
    def output_shape(self) -> Tuple[int, ...]:
        """Get output shape.

        Returns:
            Output tensor shape
        """
        if self._output_details is None:
            raise RuntimeError("Model not initialized")

        return tuple(self._output_details[0]["shape"])
