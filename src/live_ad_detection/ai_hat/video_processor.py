"""Video capture, processing, and passthrough for HDMI streams."""

import cv2
import numpy as np
import threading
import logging
import time
from typing import Optional, Callable, Dict, Any, Tuple
from dataclasses import dataclass
from queue import Queue, Full
from enum import Enum

logger = logging.getLogger(__name__)


class VideoSource(Enum):
    """Video source types."""
    HDMI_0 = "hdmi0"
    HDMI_1 = "hdmi1"
    USB_CAMERA = "usb"
    CSI_CAMERA = "csi"
    FILE = "file"
    RTSP = "rtsp"


@dataclass
class VideoStreamConfig:
    """Configuration for a video stream."""
    source_type: VideoSource
    device_path: str  # e.g., "/dev/video0", "/dev/video1", or URL
    width: int = 1920
    height: int = 1080
    fps: int = 30
    passthrough: bool = True
    passthrough_device: Optional[str] = None  # Output device for passthrough


class VideoStream:
    """
    Manages a single video stream with capture and passthrough.

    Supports HDMI capture cards, USB cameras, CSI cameras, and network streams.
    Can pass video through to an output device while processing.
    """

    def __init__(self, config: VideoStreamConfig, stream_id: str = "stream0"):
        """
        Initialize video stream.

        Args:
            config: Stream configuration
            stream_id: Unique identifier for this stream
        """
        self.config = config
        self.stream_id = stream_id
        self.capture = None
        self.is_running = False
        self.frame_queue = Queue(maxsize=30)
        self.capture_thread = None
        self.passthrough_thread = None
        self.stats = {
            "frames_captured": 0,
            "frames_dropped": 0,
            "fps": 0,
            "last_frame_time": 0
        }

    def start(self) -> bool:
        """
        Start capturing video.

        Returns:
            True if successful, False otherwise
        """
        try:
            # Initialize video capture
            if self.config.source_type in [VideoSource.HDMI_0, VideoSource.HDMI_1,
                                           VideoSource.USB_CAMERA, VideoSource.CSI_CAMERA]:
                # Use V4L2 device
                self.capture = cv2.VideoCapture(self.config.device_path, cv2.CAP_V4L2)
            elif self.config.source_type == VideoSource.RTSP:
                # Network stream
                self.capture = cv2.VideoCapture(self.config.device_path)
            elif self.config.source_type == VideoSource.FILE:
                # Video file
                self.capture = cv2.VideoCapture(self.config.device_path)
            else:
                logger.error(f"Unsupported source type: {self.config.source_type}")
                return False

            if not self.capture.isOpened():
                logger.error(f"Failed to open video source: {self.config.device_path}")
                return False

            # Set capture properties
            self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.width)
            self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.height)
            self.capture.set(cv2.CAP_PROP_FPS, self.config.fps)

            # Set buffer size (important for low latency)
            self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            logger.info(f"Stream {self.stream_id} initialized: {self.config.device_path}")
            logger.info(f"Resolution: {self.config.width}x{self.config.height} @ {self.config.fps}fps")

            # Start capture thread
            self.is_running = True
            self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
            self.capture_thread.start()

            # Start passthrough thread if enabled
            if self.config.passthrough and self.config.passthrough_device:
                self.passthrough_thread = threading.Thread(target=self._passthrough_loop, daemon=True)
                self.passthrough_thread.start()

            return True

        except Exception as e:
            logger.error(f"Error starting video stream: {e}")
            return False

    def stop(self):
        """Stop capturing video."""
        logger.info(f"Stopping stream {self.stream_id}")
        self.is_running = False

        if self.capture_thread:
            self.capture_thread.join(timeout=2)

        if self.passthrough_thread:
            self.passthrough_thread.join(timeout=2)

        if self.capture:
            self.capture.release()

        logger.info(f"Stream {self.stream_id} stopped")

    def _capture_loop(self):
        """Main capture loop running in a separate thread."""
        logger.info(f"Capture loop started for {self.stream_id}")
        frame_count = 0
        start_time = time.time()

        while self.is_running:
            try:
                ret, frame = self.capture.read()

                if not ret:
                    logger.warning(f"Failed to read frame from {self.stream_id}")
                    time.sleep(0.1)
                    continue

                # Update stats
                frame_count += 1
                self.stats["frames_captured"] = frame_count
                self.stats["last_frame_time"] = time.time()

                # Calculate FPS every second
                elapsed = time.time() - start_time
                if elapsed >= 1.0:
                    self.stats["fps"] = frame_count / elapsed
                    frame_count = 0
                    start_time = time.time()

                # Add frame to queue
                try:
                    self.frame_queue.put(frame, block=False)
                except Full:
                    # Drop frame if queue is full
                    self.stats["frames_dropped"] += 1

            except Exception as e:
                logger.error(f"Error in capture loop: {e}")
                time.sleep(0.1)

    def _passthrough_loop(self):
        """Passthrough loop for sending video to output device."""
        logger.info(f"Passthrough enabled for {self.stream_id} -> {self.config.passthrough_device}")

        # Initialize output (could be HDMI output, network stream, or file)
        # For now, we'll use a simple window for demonstration
        # In production, this would write to HDMI output or stream

        while self.is_running:
            try:
                if not self.frame_queue.empty():
                    frame = self.frame_queue.get()

                    # Display frame (for testing)
                    # In production, replace with actual HDMI output
                    cv2.imshow(f"Passthrough {self.stream_id}", frame)
                    cv2.waitKey(1)

            except Exception as e:
                logger.error(f"Error in passthrough loop: {e}")
                time.sleep(0.1)

    def get_frame(self, timeout: float = 1.0) -> Optional[np.ndarray]:
        """
        Get the latest frame from the stream.

        Args:
            timeout: Maximum time to wait for a frame

        Returns:
            Frame as numpy array, or None if timeout
        """
        try:
            return self.frame_queue.get(timeout=timeout)
        except:
            return None

    def get_stats(self) -> Dict[str, Any]:
        """
        Get stream statistics.

        Returns:
            Dictionary with stream stats
        """
        return {
            "stream_id": self.stream_id,
            "device": self.config.device_path,
            "resolution": f"{self.config.width}x{self.config.height}",
            "running": self.is_running,
            **self.stats
        }


class VideoProcessor:
    """
    Manages multiple video streams and coordinates processing.

    Supports dual HDMI capture with passthrough for ad detection.
    """

    def __init__(self):
        """Initialize video processor."""
        self.streams: Dict[str, VideoStream] = {}
        self.processing_callbacks: Dict[str, Callable] = {}
        self.is_processing = False
        self.process_thread = None

    def add_stream(self, stream_id: str, config: VideoStreamConfig) -> bool:
        """
        Add a video stream.

        Args:
            stream_id: Unique identifier for the stream
            config: Stream configuration

        Returns:
            True if successful
        """
        if stream_id in self.streams:
            logger.warning(f"Stream {stream_id} already exists")
            return False

        stream = VideoStream(config, stream_id)
        self.streams[stream_id] = stream

        logger.info(f"Added stream {stream_id}")
        return True

    def remove_stream(self, stream_id: str):
        """
        Remove a video stream.

        Args:
            stream_id: Stream identifier
        """
        if stream_id in self.streams:
            self.streams[stream_id].stop()
            del self.streams[stream_id]
            logger.info(f"Removed stream {stream_id}")

    def start_stream(self, stream_id: str) -> bool:
        """
        Start a specific stream.

        Args:
            stream_id: Stream identifier

        Returns:
            True if successful
        """
        if stream_id not in self.streams:
            logger.error(f"Stream {stream_id} not found")
            return False

        return self.streams[stream_id].start()

    def stop_stream(self, stream_id: str):
        """
        Stop a specific stream.

        Args:
            stream_id: Stream identifier
        """
        if stream_id in self.streams:
            self.streams[stream_id].stop()

    def start_all_streams(self) -> bool:
        """
        Start all configured streams.

        Returns:
            True if all streams started successfully
        """
        success = True
        for stream_id in self.streams:
            if not self.start_stream(stream_id):
                success = False
                logger.error(f"Failed to start stream {stream_id}")

        return success

    def stop_all_streams(self):
        """Stop all streams."""
        for stream_id in self.streams:
            self.stop_stream(stream_id)

    def register_callback(self, stream_id: str, callback: Callable[[np.ndarray], None]):
        """
        Register a processing callback for a stream.

        The callback will be called for each frame captured from the stream.

        Args:
            stream_id: Stream identifier
            callback: Function to process frames, signature: callback(frame: np.ndarray)
        """
        self.processing_callbacks[stream_id] = callback
        logger.info(f"Registered callback for stream {stream_id}")

    def start_processing(self):
        """Start processing frames from all streams."""
        if self.is_processing:
            logger.warning("Processing already running")
            return

        self.is_processing = True
        self.process_thread = threading.Thread(target=self._processing_loop, daemon=True)
        self.process_thread.start()
        logger.info("Started frame processing")

    def stop_processing(self):
        """Stop processing frames."""
        self.is_processing = False
        if self.process_thread:
            self.process_thread.join(timeout=2)
        logger.info("Stopped frame processing")

    def _processing_loop(self):
        """Main processing loop."""
        while self.is_processing:
            try:
                # Process frames from each stream
                for stream_id, stream in self.streams.items():
                    if not stream.is_running:
                        continue

                    # Get frame
                    frame = stream.get_frame(timeout=0.1)
                    if frame is None:
                        continue

                    # Call registered callback if exists
                    if stream_id in self.processing_callbacks:
                        try:
                            self.processing_callbacks[stream_id](frame)
                        except Exception as e:
                            logger.error(f"Error in callback for {stream_id}: {e}")

            except Exception as e:
                logger.error(f"Error in processing loop: {e}")
                time.sleep(0.1)

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """
        Get statistics for all streams.

        Returns:
            Dictionary mapping stream IDs to their stats
        """
        return {
            stream_id: stream.get_stats()
            for stream_id, stream in self.streams.items()
        }

    def cleanup(self):
        """Clean up all resources."""
        self.stop_processing()
        self.stop_all_streams()
        cv2.destroyAllWindows()
        logger.info("VideoProcessor cleanup complete")


# Convenience function for dual HDMI setup
def create_dual_hdmi_processor(
    hdmi0_device: str = "/dev/video0",
    hdmi1_device: str = "/dev/video1",
    resolution: Tuple[int, int] = (1920, 1080),
    fps: int = 30
) -> VideoProcessor:
    """
    Create a video processor configured for dual HDMI capture.

    Args:
        hdmi0_device: Path to first HDMI capture device
        hdmi1_device: Path to second HDMI capture device
        resolution: Video resolution (width, height)
        fps: Frames per second

    Returns:
        Configured VideoProcessor instance
    """
    processor = VideoProcessor()

    # Configure HDMI 0
    config0 = VideoStreamConfig(
        source_type=VideoSource.HDMI_0,
        device_path=hdmi0_device,
        width=resolution[0],
        height=resolution[1],
        fps=fps,
        passthrough=True,
        passthrough_device="hdmi0_out"
    )
    processor.add_stream("hdmi0", config0)

    # Configure HDMI 1
    config1 = VideoStreamConfig(
        source_type=VideoSource.HDMI_1,
        device_path=hdmi1_device,
        width=resolution[0],
        height=resolution[1],
        fps=fps,
        passthrough=True,
        passthrough_device="hdmi1_out"
    )
    processor.add_stream("hdmi1", config1)

    return processor
