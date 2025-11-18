"""Device domain models."""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class DeviceRole(str, Enum):
    """Role of a device in the local fleet."""

    COORDINATOR = "coordinator"
    WORKER = "worker"


class DeviceStatus(str, Enum):
    """Operational status of a device."""

    ONLINE = "online"
    OFFLINE = "offline"
    UPDATING = "updating"
    ERROR = "error"
    UNKNOWN = "unknown"


class DeviceCapability(str, Enum):
    """Hardware capabilities of a device."""

    HDMI_CAPTURE = "hdmi_capture"
    IR_BLASTER = "ir_blaster"
    BLUETOOTH = "bluetooth"
    CEC = "cec"
    AI_HAT = "ai_hat"


class DeviceHealth(BaseModel):
    """Health metrics for a device."""

    cpu_usage_percent: float = Field(..., ge=0, le=100, description="CPU usage percentage")
    memory_used_mb: float = Field(..., ge=0, description="Memory used in MB")
    memory_total_mb: float = Field(..., gt=0, description="Total memory in MB")
    temperature_celsius: float = Field(..., description="CPU temperature in Celsius")
    uptime_seconds: int = Field(..., ge=0, description="Uptime in seconds")
    disk_used_mb: float = Field(..., ge=0, description="Disk used in MB")
    disk_total_mb: float = Field(..., gt=0, description="Total disk in MB")

    @property
    def memory_usage_percent(self) -> float:
        """Calculate memory usage percentage."""
        return (self.memory_used_mb / self.memory_total_mb) * 100

    @property
    def disk_usage_percent(self) -> float:
        """Calculate disk usage percentage."""
        return (self.disk_used_mb / self.disk_total_mb) * 100

    def is_healthy(
        self,
        max_cpu: float = 80.0,
        max_memory: float = 90.0,
        max_temp: float = 80.0,
        max_disk: float = 90.0,
    ) -> bool:
        """Check if device health is within acceptable limits."""
        return (
            self.cpu_usage_percent <= max_cpu
            and self.memory_usage_percent <= max_memory
            and self.temperature_celsius <= max_temp
            and self.disk_usage_percent <= max_disk
        )


class Device(BaseModel):
    """Represents a physical Raspberry Pi device."""

    # Identity
    device_id: str = Field(..., description="Unique device identifier")
    hostname: str = Field(..., description="Network hostname")
    serial_number: str = Field(..., description="Hardware serial number")
    mac_address: str = Field(..., pattern=r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")

    # Role and status
    role: DeviceRole
    status: DeviceStatus

    # Hardware
    model: str = Field(..., example="Raspberry Pi 4 Model B")
    capabilities: List[DeviceCapability] = Field(default_factory=list)

    # Network
    ip_address: str = Field(..., description="Local IP address")
    local_port: int = Field(default=8081, ge=1024, le=65535)

    # Location
    location_id: Optional[str] = Field(None, description="Location this device belongs to")
    tv_location: str = Field(..., example="Main Bar", description="Physical TV location")

    # Software versions
    firmware_version: str = Field(..., pattern=r"^v\d+\.\d+\.\d+$")
    os_version: str

    # Health
    health: Optional[DeviceHealth] = None

    # Timestamps
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    registered_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, v: str) -> str:
        """Validate IP address format."""
        import ipaddress

        try:
            ipaddress.ip_address(v)
            return v
        except ValueError as e:
            raise ValueError(f"Invalid IP address: {v}") from e

    def is_online(self, timeout_seconds: int = 60) -> bool:
        """Check if device is online based on last_seen timestamp."""
        if self.status == DeviceStatus.OFFLINE:
            return False

        time_since_last_seen = (datetime.utcnow() - self.last_seen).total_seconds()
        return time_since_last_seen < timeout_seconds

    def update_health(self, health: DeviceHealth) -> None:
        """Update device health metrics."""
        self.health = health
        self.last_seen = datetime.utcnow()
        self.updated_at = datetime.utcnow()

        # Auto-update status based on health
        if self.health.is_healthy():
            if self.status == DeviceStatus.ERROR:
                self.status = DeviceStatus.ONLINE
        else:
            if self.status == DeviceStatus.ONLINE:
                self.status = DeviceStatus.ERROR

    def mark_online(self) -> None:
        """Mark device as online."""
        self.status = DeviceStatus.ONLINE
        self.last_seen = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def mark_offline(self) -> None:
        """Mark device as offline."""
        self.status = DeviceStatus.OFFLINE
        self.updated_at = datetime.utcnow()

    def has_capability(self, capability: DeviceCapability) -> bool:
        """Check if device has a specific capability."""
        return capability in self.capabilities

    class Config:
        """Pydantic config."""

        json_schema_extra = {
            "example": {
                "device_id": "rpi-001",
                "hostname": "ad-detection-001",
                "serial_number": "10000000a3b2c1d0",
                "mac_address": "dc:a6:32:12:34:56",
                "role": "worker",
                "status": "online",
                "model": "Raspberry Pi 4 Model B",
                "capabilities": ["hdmi_capture", "ir_blaster"],
                "ip_address": "192.168.1.100",
                "local_port": 8081,
                "location_id": "loc-xyz",
                "tv_location": "Main Bar",
                "firmware_version": "v1.0.0",
                "os_version": "Raspberry Pi OS 11",
            }
        }
