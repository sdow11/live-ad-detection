"""Ad detection using AI HAT and video streams."""

import logging
import time
import numpy as np
from typing import List, Dict, Any, Optional, Callable
from datetime import datetime
from dataclasses import dataclass, asdict
import uuid

from .hailo_inference import HailoInference
from .video_processor import VideoProcessor

logger = logging.getLogger(__name__)


@dataclass
class Detection:
    """Represents a single ad detection."""
    detection_id: str
    stream_id: str
    timestamp: datetime
    confidence: float
    ad_type: str
    bounding_box: Optional[Dict[str, float]] = None  # x, y, w, h
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API reporting."""
        data = asdict(self)
        data['timestamp'] = self.timestamp.isoformat()
        return data


class AdDetector:
    """
    Main ad detection engine combining video processing and AI inference.

    Uses the Raspberry Pi AI HAT (Hailo-8L) for hardware-accelerated
    ad detection across multiple video streams.
    """

    def __init__(
        self,
        model_path: str,
        confidence_threshold: float = 0.8,
        detection_callback: Optional[Callable[[Detection], None]] = None
    ):
        """
        Initialize ad detector.

        Args:
            model_path: Path to Hailo compiled model (.hef file)
            confidence_threshold: Minimum confidence for detections
            detection_callback: Function to call when ad is detected
        """
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.detection_callback = detection_callback

        # Initialize components
        self.hailo = HailoInference(model_path)
        self.video_processor = VideoProcessor()

        # Statistics
        self.stats = {
            "total_frames_processed": 0,
            "total_detections": 0,
            "detections_by_stream": {},
            "processing_fps": 0,
            "inference_time_ms": 0
        }

        self.is_running = False
        self.last_detections: Dict[str, List[Detection]] = {}

    def initialize(self) -> bool:
        """
        Initialize the detector and AI HAT.

        Returns:
            True if successful
        """
        logger.info("Initializing ad detector...")

        # Initialize Hailo
        if not self.hailo.initialize(self.model_path):
            logger.error("Failed to initialize Hailo AI HAT")
            return False

        # Get device info
        device_info = self.hailo.get_device_info()
        logger.info(f"Hailo device: {device_info}")

        logger.info("Ad detector initialized successfully")
        return True

    def add_video_stream(
        self,
        stream_id: str,
        device_path: str,
        source_type: str = "hdmi",
        resolution: tuple = (1920, 1080),
        fps: int = 30,
        passthrough: bool = True
    ) -> bool:
        """
        Add a video stream for ad detection.

        Args:
            stream_id: Unique identifier for stream
            device_path: Device path (e.g., /dev/video0)
            source_type: Type of source (hdmi, usb, rtsp, etc.)
            resolution: Video resolution (width, height)
            fps: Frames per second
            passthrough: Enable video passthrough

        Returns:
            True if successful
        """
        from .video_processor import VideoStreamConfig, VideoSource

        # Map source type string to enum
        source_map = {
            "hdmi": VideoSource.HDMI_0,
            "hdmi0": VideoSource.HDMI_0,
            "hdmi1": VideoSource.HDMI_1,
            "usb": VideoSource.USB_CAMERA,
            "csi": VideoSource.CSI_CAMERA,
            "rtsp": VideoSource.RTSP,
            "file": VideoSource.FILE
        }

        source_enum = source_map.get(source_type.lower(), VideoSource.HDMI_0)

        config = VideoStreamConfig(
            source_type=source_enum,
            device_path=device_path,
            width=resolution[0],
            height=resolution[1],
            fps=fps,
            passthrough=passthrough,
            passthrough_device=f"{stream_id}_out"
        )

        if self.video_processor.add_stream(stream_id, config):
            # Register processing callback
            self.video_processor.register_callback(
                stream_id,
                lambda frame: self._process_frame(stream_id, frame)
            )
            logger.info(f"Added video stream: {stream_id}")
            return True

        return False

    def start(self) -> bool:
        """
        Start ad detection on all streams.

        Returns:
            True if successful
        """
        if self.is_running:
            logger.warning("Ad detector already running")
            return False

        logger.info("Starting ad detection...")

        # Start all video streams
        if not self.video_processor.start_all_streams():
            logger.error("Failed to start video streams")
            return False

        # Start processing
        self.video_processor.start_processing()

        self.is_running = True
        logger.info("Ad detection started")
        return True

    def stop(self):
        """Stop ad detection."""
        logger.info("Stopping ad detection...")

        self.is_running = False
        self.video_processor.stop_processing()
        self.video_processor.stop_all_streams()

        logger.info("Ad detection stopped")

    def _process_frame(self, stream_id: str, frame: np.ndarray):
        """
        Process a single frame for ad detection.

        Args:
            stream_id: Stream identifier
            frame: Video frame as numpy array
        """
        try:
            start_time = time.time()

            # Run inference on Hailo
            results = self.hailo.run_inference(frame)

            if results is None:
                return

            # Parse detections from inference results
            detections = self._parse_detections(stream_id, results, frame.shape)

            # Update statistics
            self.stats["total_frames_processed"] += 1
            inference_time = (time.time() - start_time) * 1000
            self.stats["inference_time_ms"] = inference_time

            # Process each detection
            for detection in detections:
                self._handle_detection(detection)

        except Exception as e:
            logger.error(f"Error processing frame from {stream_id}: {e}")

    def _parse_detections(
        self,
        stream_id: str,
        inference_results: np.ndarray,
        frame_shape: tuple
    ) -> List[Detection]:
        """
        Parse inference results into Detection objects.

        Args:
            stream_id: Stream identifier
            inference_results: Raw inference output
            frame_shape: Shape of input frame (h, w, c)

        Returns:
            List of Detection objects
        """
        detections = []

        try:
            # Parse results based on model output format
            # This is model-specific and should be adapted to your model
            # Example format: [batch, num_detections, 6] where 6 = [x, y, w, h, confidence, class]

            for detection in inference_results[0]:  # First batch
                x, y, w, h, confidence, class_id = detection

                # Filter by confidence threshold
                if confidence < self.confidence_threshold:
                    continue

                # Map class ID to ad type
                ad_type = self._get_ad_type(int(class_id))

                detection_obj = Detection(
                    detection_id=str(uuid.uuid4()),
                    stream_id=stream_id,
                    timestamp=datetime.now(),
                    confidence=float(confidence),
                    ad_type=ad_type,
                    bounding_box={
                        "x": float(x),
                        "y": float(y),
                        "w": float(w),
                        "h": float(h)
                    },
                    metadata={
                        "class_id": int(class_id),
                        "frame_shape": frame_shape
                    }
                )

                detections.append(detection_obj)

        except Exception as e:
            logger.error(f"Error parsing detections: {e}")

        return detections

    def _get_ad_type(self, class_id: int) -> str:
        """
        Map class ID to ad type.

        Args:
            class_id: Numeric class ID from model

        Returns:
            Ad type string
        """
        # This mapping should match your trained model
        ad_types = {
            0: "commercial",
            1: "banner",
            2: "pre-roll",
            3: "mid-roll",
            4: "overlay",
            5: "sponsored_content"
        }

        return ad_types.get(class_id, f"unknown_{class_id}")

    def _handle_detection(self, detection: Detection):
        """
        Handle a detected ad.

        Args:
            detection: Detection object
        """
        # Update statistics
        self.stats["total_detections"] += 1

        stream_id = detection.stream_id
        if stream_id not in self.stats["detections_by_stream"]:
            self.stats["detections_by_stream"][stream_id] = 0
        self.stats["detections_by_stream"][stream_id] += 1

        # Store recent detections
        if stream_id not in self.last_detections:
            self.last_detections[stream_id] = []
        self.last_detections[stream_id].append(detection)

        # Keep only last 100 detections per stream
        if len(self.last_detections[stream_id]) > 100:
            self.last_detections[stream_id] = self.last_detections[stream_id][-100:]

        # Log detection
        logger.info(
            f"Ad detected on {stream_id}: {detection.ad_type} "
            f"(confidence: {detection.confidence:.2f})"
        )

        # Call user callback if provided
        if self.detection_callback:
            try:
                self.detection_callback(detection)
            except Exception as e:
                logger.error(f"Error in detection callback: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """
        Get detector statistics.

        Returns:
            Dictionary with statistics
        """
        video_stats = self.video_processor.get_all_stats()

        return {
            "detector": self.stats,
            "streams": video_stats,
            "hailo": self.hailo.get_device_info()
        }

    def get_recent_detections(
        self,
        stream_id: Optional[str] = None,
        limit: int = 10
    ) -> List[Detection]:
        """
        Get recent detections.

        Args:
            stream_id: Filter by stream ID (all streams if None)
            limit: Maximum number of detections to return

        Returns:
            List of recent Detection objects
        """
        if stream_id:
            detections = self.last_detections.get(stream_id, [])
        else:
            # Combine all streams
            detections = []
            for stream_detections in self.last_detections.values():
                detections.extend(stream_detections)
            # Sort by timestamp
            detections.sort(key=lambda d: d.timestamp, reverse=True)

        return detections[:limit]

    def cleanup(self):
        """Clean up all resources."""
        self.stop()
        self.video_processor.cleanup()
        self.hailo.cleanup()
        logger.info("AdDetector cleanup complete")

    def __del__(self):
        """Destructor to ensure cleanup."""
        self.cleanup()
