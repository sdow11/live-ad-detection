"""Hailo AI HAT inference engine for Raspberry Pi AI Kit."""

import logging
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)


class HailoInference:
    """
    Wrapper for Hailo-8L AI accelerator inference.

    The Raspberry Pi AI HAT uses the Hailo-8L chip which provides
    13 TOPS of AI acceleration for neural network inference.
    """

    def __init__(self, model_path: Optional[str] = None):
        """
        Initialize Hailo inference engine.

        Args:
            model_path: Path to Hailo compiled model (.hef file)
        """
        self.model_path = model_path
        self.device = None
        self.network_group = None
        self.input_vstream = None
        self.output_vstream = None
        self.is_initialized = False

        # Try to import Hailo SDK
        try:
            from hailo_platform import (
                Device,
                VDevice,
                HailoStreamInterface,
                ConfigureParams,
                InputVStreamParams,
                OutputVStreamParams,
                FormatType
            )
            self.hailo_available = True
            self.Device = Device
            self.VDevice = VDevice
            self.HailoStreamInterface = HailoStreamInterface
            self.ConfigureParams = ConfigureParams
            self.InputVStreamParams = InputVStreamParams
            self.OutputVStreamParams = OutputVStreamParams
            self.FormatType = FormatType
            logger.info("Hailo SDK detected")
        except ImportError:
            self.hailo_available = False
            logger.warning(
                "Hailo SDK not found. Running in simulation mode. "
                "Install with: sudo apt install hailo-all"
            )

    def initialize(self, model_path: Optional[str] = None) -> bool:
        """
        Initialize the Hailo device and load model.

        Args:
            model_path: Path to .hef model file

        Returns:
            True if successful, False otherwise
        """
        if not self.hailo_available:
            logger.warning("Hailo SDK not available, using simulation mode")
            self.is_initialized = True
            return True

        try:
            model_path = model_path or self.model_path

            if not model_path or not Path(model_path).exists():
                logger.error(f"Model file not found: {model_path}")
                return False

            # Initialize Hailo device
            logger.info("Initializing Hailo device...")
            self.device = self.Device()

            # Load HEF (Hailo Executable Format) file
            logger.info(f"Loading model from {model_path}")
            with self.device.configure(model_path) as configured_network:
                self.network_group = configured_network

                # Get input/output stream info
                input_vstream_info = self.network_group.get_input_vstream_infos()[0]
                output_vstream_info = self.network_group.get_output_vstream_infos()[0]

                logger.info(f"Input shape: {input_vstream_info.shape}")
                logger.info(f"Output shape: {output_vstream_info.shape}")

                self.input_shape = input_vstream_info.shape
                self.output_shape = output_vstream_info.shape

            self.is_initialized = True
            logger.info("Hailo device initialized successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize Hailo device: {e}")
            self.is_initialized = False
            return False

    def run_inference(self, frame: np.ndarray) -> Optional[np.ndarray]:
        """
        Run inference on a single frame.

        Args:
            frame: Input frame (numpy array)

        Returns:
            Inference results as numpy array, or None if failed
        """
        if not self.is_initialized:
            logger.error("Hailo device not initialized")
            return None

        # Simulation mode (no actual Hailo hardware)
        if not self.hailo_available:
            return self._simulate_inference(frame)

        try:
            # Prepare input
            input_data = self._preprocess_frame(frame)

            # Run inference on Hailo
            with self.network_group.activate() as activated_network:
                input_vstreams_params = self.InputVStreamParams.make_from_network_group(
                    self.network_group, quantized=False, format_type=self.FormatType.FLOAT32
                )
                output_vstreams_params = self.OutputVStreamParams.make_from_network_group(
                    self.network_group, quantized=False, format_type=self.FormatType.FLOAT32
                )

                with self.network_group.create_input_vstreams(input_vstreams_params) as input_vstreams:
                    with self.network_group.create_output_vstreams(output_vstreams_params) as output_vstreams:
                        # Send frame to Hailo
                        input_vstreams[0].send(input_data)

                        # Get results
                        output = output_vstreams[0].recv()

            return output

        except Exception as e:
            logger.error(f"Inference failed: {e}")
            return None

    def run_batch_inference(self, frames: List[np.ndarray]) -> Optional[List[np.ndarray]]:
        """
        Run inference on multiple frames.

        Args:
            frames: List of input frames

        Returns:
            List of inference results, or None if failed
        """
        results = []
        for frame in frames:
            result = self.run_inference(frame)
            if result is not None:
                results.append(result)
            else:
                logger.warning("Skipping frame due to inference failure")

        return results if results else None

    def _preprocess_frame(self, frame: np.ndarray) -> np.ndarray:
        """
        Preprocess frame for inference.

        Args:
            frame: Raw frame

        Returns:
            Preprocessed frame
        """
        # Resize to model input size if needed
        if hasattr(self, 'input_shape'):
            import cv2
            h, w = self.input_shape[1:3]
            frame = cv2.resize(frame, (w, h))

        # Normalize to float32
        frame = frame.astype(np.float32) / 255.0

        return frame

    def _simulate_inference(self, frame: np.ndarray) -> np.ndarray:
        """
        Simulate inference for testing without Hailo hardware.

        Args:
            frame: Input frame

        Returns:
            Dummy inference results
        """
        # Return dummy detection results for testing
        # Format: [batch, num_detections, 6] where 6 = [x, y, w, h, confidence, class]
        return np.random.rand(1, 10, 6).astype(np.float32)

    def get_device_info(self) -> Dict[str, Any]:
        """
        Get information about the Hailo device.

        Returns:
            Dictionary with device information
        """
        if not self.hailo_available or not self.device:
            return {
                "available": False,
                "mode": "simulation",
                "model": "Hailo-8L (simulated)"
            }

        try:
            return {
                "available": True,
                "mode": "hardware",
                "model": "Hailo-8L",
                "device_id": str(self.device.get_device_id()),
                "temperature": self.device.get_temperature() if hasattr(self.device, 'get_temperature') else None,
                "initialized": self.is_initialized
            }
        except Exception as e:
            logger.error(f"Failed to get device info: {e}")
            return {"available": False, "error": str(e)}

    def cleanup(self):
        """Release Hailo resources."""
        try:
            if self.device:
                # Cleanup happens automatically with context managers
                pass
            logger.info("Hailo resources released")
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

    def __del__(self):
        """Destructor to ensure cleanup."""
        self.cleanup()
