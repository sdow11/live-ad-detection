"""Database models for cloud fleet management.

SQLAlchemy models for multi-tenant device management.
"""

from datetime import datetime
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
    release_notes = Column(Text)
    file_url = Column(String(500))  # S3/CDN URL
    file_size_bytes = Column(Integer)
    checksum_sha256 = Column(String(64))

    is_stable = Column(Boolean, default=False)
    is_latest = Column(Boolean, default=False)
    min_os_version = Column(String(50))

    released_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"<FirmwareVersion(version='{self.version}', stable={self.is_stable})>"


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
