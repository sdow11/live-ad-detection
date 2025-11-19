"""Database models for cloud fleet management.

SQLAlchemy models for multi-tenant device management.
"""

from datetime import datetime
from enum import Enum as PyEnum
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ad_detection_common.models.device import DeviceRole, DeviceStatus

Base = declarative_base()


class UpdateStatus(str, PyEnum):
    """Firmware update status."""
    PENDING = "pending"
    DOWNLOADING = "downloading"
    VERIFYING = "verifying"
    INSTALLING = "installing"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class Organization(Base):
    """Organization/tenant model.

    Represents a customer organization (e.g., restaurant chain).
    """

    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    contact_email = Column(String(255))
    contact_phone = Column(String(50))
    plan = Column(String(50), default="standard")  # standard, premium, enterprise
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    locations = relationship("Location", back_populates="organization", cascade="all, delete-orphan")
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Organization(id={self.id}, name='{self.name}')>"


class Location(Base):
    """Location model.

    Represents a physical location (e.g., a specific bar/restaurant).
    """

    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    address = Column(Text)
    city = Column(String(100))
    state = Column(String(50))
    zip_code = Column(String(20))
    timezone = Column(String(50), default="UTC")
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    organization = relationship("Organization", back_populates="locations")
    devices = relationship("Device", back_populates="location", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Location(id={self.id}, name='{self.name}')>"


class Device(Base):
    """Device model.

    Represents a Raspberry Pi edge device.
    """

    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(100), unique=True, nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False, index=True)

    hostname = Column(String(255))
    role = Column(Enum(DeviceRole), nullable=False)
    status = Column(Enum(DeviceStatus), default=DeviceStatus.OFFLINE, nullable=False)

    # Hardware info
    hardware_model = Column(String(100))  # e.g., "Raspberry Pi 5"
    cpu_info = Column(String(255))
    total_memory_mb = Column(Integer)
    total_disk_mb = Column(Integer)

    # Software versions
    firmware_version = Column(String(50))
    os_version = Column(String(100))
    python_version = Column(String(50))

    # Network info
    ip_address = Column(String(50))
    mac_address = Column(String(50))

    # Capabilities (JSON array)
    capabilities = Column(JSON)

    # Last seen
    last_seen = Column(DateTime(timezone=True))
    last_heartbeat = Column(DateTime(timezone=True))

    # API Key for device authentication
    api_key = Column(String(255), unique=True, index=True)
    api_key_enabled = Column(Boolean, default=True)
    api_key_created_at = Column(DateTime(timezone=True))
    api_key_last_used = Column(DateTime(timezone=True))

    # Device metadata (renamed to avoid SQLAlchemy reserved name)
    device_metadata = Column(JSON)  # Additional custom fields

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    location = relationship("Location", back_populates="devices")
    health_records = relationship("DeviceHealth", back_populates="device", cascade="all, delete-orphan")
    telemetry_records = relationship("Telemetry", back_populates="device", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Device(id={self.id}, device_id='{self.device_id}', status={self.status})>"


class DeviceHealth(Base):
    """Device health snapshot model.

    Stores periodic health check data from devices.
    """

    __tablename__ = "device_health"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True)

    cpu_usage_percent = Column(Float)
    memory_used_mb = Column(Float)
    memory_total_mb = Column(Float)
    disk_used_mb = Column(Float)
    disk_total_mb = Column(Float)
    temperature_celsius = Column(Float)
    uptime_seconds = Column(Integer)

    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    device = relationship("Device", back_populates="health_records")

    def __repr__(self) -> str:
        return f"<DeviceHealth(device_id={self.device_id}, cpu={self.cpu_usage_percent}%)>"


class Telemetry(Base):
    """Telemetry data model.

    Stores ad detection statistics and performance metrics.
    """

    __tablename__ = "telemetry"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True)

    # Video pipeline stats
    frames_captured = Column(Integer, default=0)
    frames_dropped = Column(Integer, default=0)
    frames_displayed = Column(Integer, default=0)
    average_fps = Column(Float)
    average_latency_ms = Column(Float)

    # ML detection stats
    total_frames_analyzed = Column(Integer, default=0)
    ad_frames_detected = Column(Integer, default=0)
    content_frames_detected = Column(Integer, default=0)
    average_confidence = Column(Float)
    average_inference_time_ms = Column(Float)

    # Ad break tracking
    total_ad_breaks = Column(Integer, default=0)
    total_ad_duration_seconds = Column(Integer, default=0)

    # Time period
    period_start = Column(DateTime(timezone=True), nullable=False, index=True)
    period_end = Column(DateTime(timezone=True), nullable=False)

    recorded_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    device = relationship("Device", back_populates="telemetry_records")

    def __repr__(self) -> str:
        return f"<Telemetry(device_id={self.device_id}, ad_breaks={self.total_ad_breaks})>"


class FirmwareVersion(Base):
    """Firmware version model.

    Tracks available firmware versions and their deployment status.
    """

    __tablename__ = "firmware_versions"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(Text)  # Version description
    release_notes = Column(Text)

    # File info
    file_path = Column(String(500))  # Local file path
    file_url = Column(String(500))  # S3/CDN URL (optional)
    file_size = Column(Integer)  # Bytes
    checksum = Column(String(64))  # SHA-256 checksum

    # Compatibility
    min_device_version = Column(String(50))  # Minimum device version required
    min_os_version = Column(String(50))  # Minimum OS version required

    # Status flags
    is_active = Column(Boolean, default=False)  # Available for distribution
    is_stable = Column(Boolean, default=False)  # Marked as stable
    is_latest = Column(Boolean, default=False)  # Latest version

    # Timestamps
    uploaded_at = Column(DateTime(timezone=True))
    released_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    updates = relationship("FirmwareUpdate", back_populates="firmware_version", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<FirmwareVersion(version='{self.version}', active={self.is_active})>"


class FirmwareUpdate(Base):
    """Firmware update tracking model.

    Tracks firmware update status for individual devices.
    """

    __tablename__ = "firmware_updates"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True)
    firmware_version_id = Column(Integer, ForeignKey("firmware_versions.id"), nullable=False, index=True)

    # Version info
    current_version = Column(String(50))  # Device version before update
    target_version = Column(String(50), nullable=False)  # Target firmware version

    # Update status
    status = Column(Enum(UpdateStatus), default=UpdateStatus.PENDING, nullable=False, index=True)
    progress = Column(Integer, default=0)  # 0-100 percentage

    # Scheduling
    scheduled_for = Column(DateTime(timezone=True))  # When to apply update (None = manual)
    is_canary = Column(Boolean, default=False)  # Is this a canary deployment

    # Execution tracking
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))

    # Error tracking
    error_message = Column(Text)
    retry_count = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    device = relationship("Device")
    firmware_version = relationship("FirmwareVersion", back_populates="updates")

    def __repr__(self) -> str:
        return f"<FirmwareUpdate(id={self.id}, device_id={self.device_id}, status={self.status})>"


class User(Base):
    """User/admin model.

    Represents admin users who can access the dashboard.
    """

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))

    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)  # Platform admin

    last_login = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    organization = relationship("Organization", back_populates="users")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}')>"


class MLModel(Base):
    """ML Model model.

    Represents a machine learning model type (e.g., base-ad-detector, sports-ad-detector).
    """

    __tablename__ = "ml_models"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    model_type = Column(String(50), nullable=False)  # ad-detector, channel-specific, sports, etc.
    description = Column(Text)
    architecture = Column(String(100))  # efficientnet_lite0, mobilenet_v3, etc.

    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    versions = relationship("MLModelVersion", back_populates="model", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<MLModel(id={self.id}, name='{self.name}', type='{self.model_type}')>"


class MLModelVersion(Base):
    """ML Model Version model.

    Represents a specific version of a machine learning model.
    """

    __tablename__ = "ml_model_versions"

    id = Column(Integer, primary_key=True, index=True)
    model_id = Column(Integer, ForeignKey("ml_models.id"), nullable=False, index=True)
    version = Column(String(50), nullable=False, index=True)  # e.g., "1.0.0", "1.1.0"

    # File info
    file_url = Column(String(500), nullable=False)  # S3/CDN URL to .tflite file
    file_size_bytes = Column(Integer, nullable=False)
    checksum_sha256 = Column(String(64), nullable=False)

    # Model metadata
    input_shape = Column(JSON)  # [224, 224, 3]
    output_shape = Column(JSON)  # [1]
    quantization = Column(String(50))  # int8, float16, none
    framework = Column(String(50))  # tensorflow, pytorch
    framework_version = Column(String(50))

    # Performance metrics
    accuracy = Column(Float)
    precision = Column(Float)
    recall = Column(Float)
    f1_score = Column(Float)
    inference_time_ms = Column(Float)  # Average on Raspberry Pi 5
    model_size_mb = Column(Float)

    # Training info
    trained_on_dataset = Column(String(100))  # Dataset version used for training
    training_date = Column(DateTime(timezone=True))
    training_config = Column(JSON)  # Training hyperparameters

    # Deployment status
    status = Column(String(50), default="testing")  # testing, canary, production, deprecated
    rollout_percentage = Column(Float, default=0.0)  # For canary deployments (0-100)
    is_production = Column(Boolean, default=False)

    # Metadata
    release_notes = Column(Text)
    model_metadata = Column(JSON)  # Additional custom fields

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    model = relationship("MLModel", back_populates="versions")

    def __repr__(self) -> str:
        return f"<MLModelVersion(id={self.id}, model_id={self.model_id}, version='{self.version}', status='{self.status}')>"
