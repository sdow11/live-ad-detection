"""PiP content management system.

Manages alternative content sources for Picture-in-Picture mode during ad breaks.
Supports multiple content types, per-device configuration, and scheduling.
"""

import json
import logging
import os
from datetime import datetime, time
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class ContentType(str, Enum):
    """PiP content type."""
    VIDEO_FILE = "video_file"           # Local video file
    IMAGE = "image"                     # Static image
    SLIDESHOW = "slideshow"             # Image slideshow
    STREAM_URL = "stream_url"           # RTSP/HTTP stream
    HDMI_INPUT = "hdmi_input"           # Alternative HDMI input
    WEB_PAGE = "web_page"               # Web browser content
    BLACK_SCREEN = "black_screen"       # Just black screen
    CUSTOM_OVERLAY = "custom_overlay"   # Custom graphics/text


class ContentSource:
    """Represents a PiP content source."""

    def __init__(
        self,
        content_id: str,
        name: str,
        content_type: ContentType,
        source_uri: str,
        metadata: Optional[Dict] = None
    ):
        """Initialize content source.

        Args:
            content_id: Unique content identifier
            name: Human-readable name
            content_type: Type of content
            source_uri: URI to content (file path, URL, etc.)
            metadata: Additional metadata (duration, resolution, etc.)
        """
        self.content_id = content_id
        self.name = name
        self.content_type = content_type
        self.source_uri = source_uri
        self.metadata = metadata or {}
        self.created_at = datetime.utcnow()

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "content_id": self.content_id,
            "name": self.name,
            "content_type": self.content_type,
            "source_uri": self.source_uri,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat()
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "ContentSource":
        """Create from dictionary."""
        source = cls(
            content_id=data["content_id"],
            name=data["name"],
            content_type=ContentType(data["content_type"]),
            source_uri=data["source_uri"],
            metadata=data.get("metadata", {})
        )
        if "created_at" in data:
            source.created_at = datetime.fromisoformat(data["created_at"])
        return source


class ContentSchedule:
    """Schedule for when to display specific content."""

    def __init__(
        self,
        schedule_id: str,
        content_id: str,
        days_of_week: Optional[List[int]] = None,  # 0=Monday, 6=Sunday
        start_time: Optional[time] = None,
        end_time: Optional[time] = None,
        priority: int = 0
    ):
        """Initialize content schedule.

        Args:
            schedule_id: Unique schedule identifier
            content_id: Content to display
            days_of_week: Days when this schedule is active (None = all days)
            start_time: Start time (None = all day)
            end_time: End time (None = all day)
            priority: Priority (higher number = higher priority)
        """
        self.schedule_id = schedule_id
        self.content_id = content_id
        self.days_of_week = days_of_week
        self.start_time = start_time
        self.end_time = end_time
        self.priority = priority

    def is_active(self, dt: Optional[datetime] = None) -> bool:
        """Check if schedule is currently active.

        Args:
            dt: Datetime to check (None = now)

        Returns:
            True if schedule is active
        """
        if dt is None:
            dt = datetime.now()

        # Check day of week
        if self.days_of_week is not None:
            if dt.weekday() not in self.days_of_week:
                return False

        # Check time range
        current_time = dt.time()

        if self.start_time and self.end_time:
            if self.start_time <= self.end_time:
                # Normal range (e.g., 9am - 5pm)
                if not (self.start_time <= current_time <= self.end_time):
                    return False
            else:
                # Overnight range (e.g., 10pm - 2am)
                if not (current_time >= self.start_time or current_time <= self.end_time):
                    return False

        return True

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "schedule_id": self.schedule_id,
            "content_id": self.content_id,
            "days_of_week": self.days_of_week,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "priority": self.priority
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "ContentSchedule":
        """Create from dictionary."""
        return cls(
            schedule_id=data["schedule_id"],
            content_id=data["content_id"],
            days_of_week=data.get("days_of_week"),
            start_time=time.fromisoformat(data["start_time"]) if data.get("start_time") else None,
            end_time=time.fromisoformat(data["end_time"]) if data.get("end_time") else None,
            priority=data.get("priority", 0)
        )


class DevicePiPConfig:
    """PiP configuration for a specific device."""

    def __init__(
        self,
        device_id: str,
        default_content_id: Optional[str] = None,
        schedules: Optional[List[ContentSchedule]] = None,
        enabled: bool = True
    ):
        """Initialize device PiP configuration.

        Args:
            device_id: Device identifier
            default_content_id: Default content (fallback)
            schedules: List of content schedules
            enabled: Whether PiP is enabled for this device
        """
        self.device_id = device_id
        self.default_content_id = default_content_id
        self.schedules = schedules or []
        self.enabled = enabled

    def get_active_content(self, dt: Optional[datetime] = None) -> Optional[str]:
        """Get content ID that should be displayed now.

        Args:
            dt: Datetime to check (None = now)

        Returns:
            Content ID or None
        """
        if not self.enabled:
            return None

        if dt is None:
            dt = datetime.now()

        # Find all active schedules
        active_schedules = [s for s in self.schedules if s.is_active(dt)]

        if not active_schedules:
            return self.default_content_id

        # Return highest priority schedule
        active_schedules.sort(key=lambda s: s.priority, reverse=True)
        return active_schedules[0].content_id

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "device_id": self.device_id,
            "default_content_id": self.default_content_id,
            "schedules": [s.to_dict() for s in self.schedules],
            "enabled": self.enabled
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "DevicePiPConfig":
        """Create from dictionary."""
        return cls(
            device_id=data["device_id"],
            default_content_id=data.get("default_content_id"),
            schedules=[ContentSchedule.from_dict(s) for s in data.get("schedules", [])],
            enabled=data.get("enabled", True)
        )


class PiPContentManager:
    """Manages PiP content sources and device configurations."""

    def __init__(self, storage_dir: str = "/var/lib/ad-detection/pip-content"):
        """Initialize content manager.

        Args:
            storage_dir: Directory for storing content and config
        """
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        self.content_dir = self.storage_dir / "content"
        self.content_dir.mkdir(exist_ok=True)

        self.config_file = self.storage_dir / "config.json"

        # In-memory storage
        self.content_sources: Dict[str, ContentSource] = {}
        self.device_configs: Dict[str, DevicePiPConfig] = {}

        # Load from disk
        self._load_config()

    def _load_config(self) -> None:
        """Load configuration from disk."""
        if not self.config_file.exists():
            return

        try:
            with open(self.config_file) as f:
                data = json.load(f)

            # Load content sources
            for source_data in data.get("content_sources", []):
                source = ContentSource.from_dict(source_data)
                self.content_sources[source.content_id] = source

            # Load device configs
            for config_data in data.get("device_configs", []):
                config = DevicePiPConfig.from_dict(config_data)
                self.device_configs[config.device_id] = config

            logger.info(
                f"Loaded {len(self.content_sources)} content sources, "
                f"{len(self.device_configs)} device configs"
            )

        except Exception as e:
            logger.error(f"Failed to load PiP config: {e}")

    def _save_config(self) -> None:
        """Save configuration to disk."""
        try:
            data = {
                "content_sources": [s.to_dict() for s in self.content_sources.values()],
                "device_configs": [c.to_dict() for c in self.device_configs.values()]
            }

            with open(self.config_file, "w") as f:
                json.dump(data, f, indent=2)

            logger.info("Saved PiP configuration")

        except Exception as e:
            logger.error(f"Failed to save PiP config: {e}")

    def add_content_source(
        self,
        content_id: str,
        name: str,
        content_type: ContentType,
        source_uri: str,
        metadata: Optional[Dict] = None
    ) -> ContentSource:
        """Add new content source.

        Args:
            content_id: Unique content identifier
            name: Human-readable name
            content_type: Type of content
            source_uri: URI to content
            metadata: Additional metadata

        Returns:
            Created content source
        """
        source = ContentSource(
            content_id=content_id,
            name=name,
            content_type=content_type,
            source_uri=source_uri,
            metadata=metadata
        )

        self.content_sources[content_id] = source
        self._save_config()

        logger.info(f"Added content source: {name} ({content_type})")

        return source

    def remove_content_source(self, content_id: str) -> bool:
        """Remove content source.

        Args:
            content_id: Content identifier

        Returns:
            True if removed
        """
        if content_id in self.content_sources:
            del self.content_sources[content_id]
            self._save_config()

            logger.info(f"Removed content source: {content_id}")
            return True

        return False

    def get_content_source(self, content_id: str) -> Optional[ContentSource]:
        """Get content source by ID.

        Args:
            content_id: Content identifier

        Returns:
            Content source or None
        """
        return self.content_sources.get(content_id)

    def list_content_sources(self) -> List[ContentSource]:
        """List all content sources.

        Returns:
            List of content sources
        """
        return list(self.content_sources.values())

    def set_device_config(
        self,
        device_id: str,
        default_content_id: Optional[str] = None,
        enabled: bool = True
    ) -> DevicePiPConfig:
        """Set device PiP configuration.

        Args:
            device_id: Device identifier
            default_content_id: Default content ID
            enabled: Whether PiP is enabled

        Returns:
            Device configuration
        """
        if device_id not in self.device_configs:
            self.device_configs[device_id] = DevicePiPConfig(device_id)

        config = self.device_configs[device_id]
        config.default_content_id = default_content_id
        config.enabled = enabled

        self._save_config()

        logger.info(f"Updated device config: {device_id}")

        return config

    def add_device_schedule(
        self,
        device_id: str,
        schedule: ContentSchedule
    ) -> DevicePiPConfig:
        """Add schedule to device configuration.

        Args:
            device_id: Device identifier
            schedule: Content schedule

        Returns:
            Updated device configuration
        """
        if device_id not in self.device_configs:
            self.device_configs[device_id] = DevicePiPConfig(device_id)

        config = self.device_configs[device_id]
        config.schedules.append(schedule)

        self._save_config()

        logger.info(f"Added schedule to device {device_id}")

        return config

    def remove_device_schedule(
        self,
        device_id: str,
        schedule_id: str
    ) -> bool:
        """Remove schedule from device configuration.

        Args:
            device_id: Device identifier
            schedule_id: Schedule identifier

        Returns:
            True if removed
        """
        if device_id not in self.device_configs:
            return False

        config = self.device_configs[device_id]
        original_len = len(config.schedules)

        config.schedules = [s for s in config.schedules if s.schedule_id != schedule_id]

        if len(config.schedules) < original_len:
            self._save_config()
            logger.info(f"Removed schedule {schedule_id} from device {device_id}")
            return True

        return False

    def get_device_config(self, device_id: str) -> Optional[DevicePiPConfig]:
        """Get device PiP configuration.

        Args:
            device_id: Device identifier

        Returns:
            Device configuration or None
        """
        return self.device_configs.get(device_id)

    def get_active_content_for_device(
        self,
        device_id: str,
        dt: Optional[datetime] = None
    ) -> Optional[ContentSource]:
        """Get content that should be displayed for device.

        Args:
            device_id: Device identifier
            dt: Datetime to check (None = now)

        Returns:
            Content source or None
        """
        config = self.get_device_config(device_id)

        if not config:
            return None

        content_id = config.get_active_content(dt)

        if not content_id:
            return None

        return self.get_content_source(content_id)

    def upload_content_file(
        self,
        content_id: str,
        filename: str,
        file_data: bytes
    ) -> str:
        """Upload content file to storage.

        Args:
            content_id: Content identifier
            filename: Original filename
            file_data: File data

        Returns:
            Path to stored file
        """
        # Create content directory
        content_path = self.content_dir / content_id
        content_path.mkdir(exist_ok=True)

        # Save file
        file_path = content_path / filename
        file_path.write_bytes(file_data)

        logger.info(f"Uploaded content file: {filename} ({len(file_data)} bytes)")

        return str(file_path)

    def get_all_configs(self) -> Dict:
        """Get all content sources and device configs.

        Returns:
            Dictionary with all configurations
        """
        return {
            "content_sources": [s.to_dict() for s in self.content_sources.values()],
            "device_configs": [c.to_dict() for c in self.device_configs.values()]
        }


# Global PiP content manager instance
pip_content_manager = PiPContentManager()
