"""ML inference package for ad detection.

This package provides ML inference capabilities for detecting advertisements
in live TV video streams.

Example:
    >>> from ml import AdDetector, FramePreprocessor
    >>> preprocessor = FramePreprocessor(target_size=(224, 224))
    >>> detector = AdDetector(model_path="models/ad_detector.tflite")
    >>> result = await detector.detect(frame)
    >>> print(f"Is ad: {result.is_ad}, confidence: {result.confidence}")
"""

from ml.types import (
    AdDetectionResult,
    PreprocessConfig,
    InferenceConfig,
    DetectionConfidence,
)
from ml.preprocessor import FramePreprocessor
from ml.inference import TFLiteModel, MockModel
from ml.detector import AdDetector

__all__ = [
    # Types
    "AdDetectionResult",
    "PreprocessConfig",
    "InferenceConfig",
    "DetectionConfidence",
    # Preprocessing
    "FramePreprocessor",
    # Inference
    "TFLiteModel",
    "MockModel",
    # Detection
    "AdDetector",
]
