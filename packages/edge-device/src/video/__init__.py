"""Video processing package for live TV pass-through and ML inference.

This package provides the core video pipeline for capturing, processing,
and outputting video with minimal latency.

Example:
    >>> from video import VideoCapture, VideoOutput, PassthroughPipeline
    >>> capture = VideoCapture(device="/dev/video0")
    >>> output = VideoOutput(device="/dev/dri/card0")
    >>> pipeline = PassthroughPipeline(capture, output)
    >>> await pipeline.run()
"""

from video.types import (
    Frame,
    FrameMetadata,
    VideoFormat,
    VideoMode,
    VideoCaptureProtocol,
    VideoOutputProtocol,
)
from video.capture import VideoCapture, MockVideoCapture
from video.output import VideoOutput, MockVideoOutput
from video.pipeline import PassthroughPipeline

__all__ = [
    # Types
    "Frame",
    "FrameMetadata",
    "VideoFormat",
    "VideoMode",
    "VideoCaptureProtocol",
    "VideoOutputProtocol",
    # Capture
    "VideoCapture",
    "MockVideoCapture",
    # Output
    "VideoOutput",
    "MockVideoOutput",
    # Pipeline
    "PassthroughPipeline",
]
