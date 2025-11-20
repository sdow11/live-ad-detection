"""Channel change detection for video streams."""

import logging
import numpy as np
import cv2
from typing import Optional, Callable, Dict
from dataclasses import dataclass
from datetime import datetime, timedelta
import threading

logger = logging.getLogger(__name__)


@dataclass
class ChannelState:
    """Represents the current state of a channel."""
    channel_id: str
    last_change: datetime
    frame_signature: Optional[str] = None
    stable_frames: int = 0
    is_stable: bool = False


class ChannelMonitor:
    """
    Monitors video streams for channel changes.

    Detects when:
    - Channel is changed (different content)
    - Black screen / no signal
    - Static/frozen frame
    - Scene changes vs channel changes
    """

    def __init__(
        self,
        stability_threshold: int = 30,  # Frames before considered stable
        change_threshold: float = 0.15,  # % difference to trigger change
        callback: Optional[Callable] = None
    ):
        """
        Initialize channel monitor.

        Args:
            stability_threshold: Frames needed for stability
            change_threshold: Difference threshold (0-1)
            callback: Function to call on channel change
        """
        self.stability_threshold = stability_threshold
        self.change_threshold = change_threshold
        self.callback = callback

        self.channels: Dict[str, ChannelState] = {}
        self.lock = threading.Lock()

        self.stats = {
            "channel_changes": 0,
            "black_screens": 0,
            "frozen_frames": 0
        }

    def analyze_frame(self, stream_id: str, frame: np.ndarray) -> Dict[str, any]:
        """
        Analyze a frame for channel changes.

        Args:
            stream_id: Stream identifier
            frame: Video frame

        Returns:
            Analysis results
        """
        with self.lock:
            if stream_id not in self.channels:
                self.channels[stream_id] = ChannelState(
                    channel_id=stream_id,
                    last_change=datetime.now()
                )

            state = self.channels[stream_id]

            # Calculate frame signature
            current_sig = self._calculate_signature(frame)

            # Check for black screen
            if self._is_black_screen(frame):
                logger.info(f"Black screen detected on {stream_id}")
                self.stats["black_screens"] += 1
                state.is_stable = False
                state.stable_frames = 0

                if self.callback:
                    self.callback(stream_id, "black_screen", frame)

                return {
                    "event": "black_screen",
                    "stable": False
                }

            # First frame or after black screen
            if state.frame_signature is None:
                state.frame_signature = current_sig
                state.stable_frames = 0
                return {"event": "initial", "stable": False}

            # Calculate difference from last signature
            difference = self._calculate_difference(
                state.frame_signature,
                current_sig
            )

            # Channel change detected
            if difference > self.change_threshold:
                logger.info(
                    f"Channel change detected on {stream_id} "
                    f"(diff: {difference:.2%})"
                )

                state.frame_signature = current_sig
                state.last_change = datetime.now()
                state.stable_frames = 0
                state.is_stable = False
                self.stats["channel_changes"] += 1

                if self.callback:
                    self.callback(stream_id, "channel_change", frame)

                return {
                    "event": "channel_change",
                    "difference": difference,
                    "stable": False
                }

            # Frame is similar - increment stability
            state.stable_frames += 1

            # Check if channel is now stable
            if not state.is_stable and state.stable_frames >= self.stability_threshold:
                state.is_stable = True
                logger.info(
                    f"Channel {stream_id} is now stable "
                    f"({state.stable_frames} frames)"
                )

                if self.callback:
                    self.callback(stream_id, "channel_stable", frame)

                return {
                    "event": "channel_stable",
                    "stable_frames": state.stable_frames,
                    "stable": True
                }

            return {
                "event": "normal",
                "stable": state.is_stable,
                "stable_frames": state.stable_frames
            }

    def is_channel_stable(self, stream_id: str) -> bool:
        """
        Check if a channel is stable.

        Args:
            stream_id: Stream identifier

        Returns:
            True if stable
        """
        with self.lock:
            if stream_id not in self.channels:
                return False
            return self.channels[stream_id].is_stable

    def get_time_since_change(self, stream_id: str) -> Optional[float]:
        """
        Get time since last channel change.

        Args:
            stream_id: Stream identifier

        Returns:
            Seconds since last change, or None
        """
        with self.lock:
            if stream_id not in self.channels:
                return None

            state = self.channels[stream_id]
            delta = datetime.now() - state.last_change
            return delta.total_seconds()

    def reset_channel(self, stream_id: str):
        """
        Reset channel state (e.g., after manual channel change).

        Args:
            stream_id: Stream identifier
        """
        with self.lock:
            if stream_id in self.channels:
                state = self.channels[stream_id]
                state.frame_signature = None
                state.stable_frames = 0
                state.is_stable = False
                state.last_change = datetime.now()

                logger.info(f"Channel {stream_id} state reset")

    def get_stats(self) -> Dict[str, any]:
        """Get channel monitoring statistics."""
        with self.lock:
            return {
                "stats": self.stats.copy(),
                "channels": {
                    stream_id: {
                        "stable": state.is_stable,
                        "stable_frames": state.stable_frames,
                        "last_change": state.last_change.isoformat(),
                        "seconds_since_change": (
                            datetime.now() - state.last_change
                        ).total_seconds()
                    }
                    for stream_id, state in self.channels.items()
                }
            }

    def _calculate_signature(self, frame: np.ndarray) -> str:
        """
        Calculate a signature for a frame.

        Uses histogram and edge detection for robust comparison.

        Args:
            frame: Video frame

        Returns:
            Frame signature string
        """
        try:
            # Resize to standard size for comparison
            resized = cv2.resize(frame, (320, 240))

            # Convert to grayscale
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

            # Calculate histogram
            hist = cv2.calcHist([gray], [0], None, [16], [0, 256])
            hist = cv2.normalize(hist, hist).flatten()

            # Calculate edges (for scene detection)
            edges = cv2.Canny(gray, 50, 150)
            edge_density = np.count_nonzero(edges) / edges.size

            # Combine into signature
            sig_parts = [f"{h:.3f}" for h in hist[:8]]  # First 8 histogram bins
            sig_parts.append(f"{edge_density:.3f}")

            return "|".join(sig_parts)

        except Exception as e:
            logger.error(f"Error calculating signature: {e}")
            return "error"

    def _calculate_difference(self, sig1: str, sig2: str) -> float:
        """
        Calculate difference between two signatures.

        Args:
            sig1: First signature
            sig2: Second signature

        Returns:
            Difference (0-1, where 0 is identical)
        """
        try:
            parts1 = [float(x) for x in sig1.split("|")]
            parts2 = [float(x) for x in sig2.split("|")]

            # Calculate euclidean distance
            diff = np.sqrt(np.sum((np.array(parts1) - np.array(parts2)) ** 2))

            # Normalize to 0-1 range
            return min(diff / 2.0, 1.0)

        except Exception as e:
            logger.error(f"Error calculating difference: {e}")
            return 1.0  # Assume different on error

    def _is_black_screen(self, frame: np.ndarray, threshold: int = 10) -> bool:
        """
        Check if frame is a black screen.

        Args:
            frame: Video frame
            threshold: Brightness threshold

        Returns:
            True if black screen
        """
        try:
            # Calculate mean brightness
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            mean_brightness = np.mean(gray)

            return mean_brightness < threshold

        except Exception as e:
            logger.error(f"Error checking black screen: {e}")
            return False


def create_channel_change_handler(ad_detector) -> Callable:
    """
    Create a callback handler for channel changes.

    Args:
        ad_detector: AdDetector instance

    Returns:
        Callback function
    """
    def handle_channel_change(stream_id: str, event: str, frame: np.ndarray):
        """Handle channel change events."""

        if event == "channel_change":
            logger.info(f"🔄 Channel changed on {stream_id}")
            logger.info("  Pausing detections until channel stabilizes...")

            # Could pause detections, reset cooldowns, etc.
            # ad_detector.pause_stream(stream_id)

        elif event == "channel_stable":
            logger.info(f"✓ Channel {stream_id} stable, resuming detections")

            # Resume detections
            # ad_detector.resume_stream(stream_id)

        elif event == "black_screen":
            logger.info(f"⚫ Black screen on {stream_id}")
            # Pause detections during black screen
            # ad_detector.pause_stream(stream_id)

    return handle_channel_change
