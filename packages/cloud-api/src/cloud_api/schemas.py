"""Pydantic schemas for API requests and responses."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field

from ad_detection_common.models.device import DeviceRole, DeviceStatus


# Authentication schemas


class UserLogin(BaseModel):
    """Schema for user login."""

    email: EmailStr
    password: str = Field(..., min_length=8)


class UserRegister(BaseModel):
    """Schema for user registration."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=100)
    full_name: str = Field(..., min_length=1, max_length=255)
    organization_id: int


class UserResponse(BaseModel):
    """User response schema."""

    id: int
    email: str
    full_name: Optional[str] = None
    organization_id: int
    is_active: bool
    is_superuser: bool
    last_login: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Token response schema."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    """Refresh token request."""

    refresh_token: str


class PasswordChange(BaseModel):
    """Password change request."""

    current_password: str
    new_password: str = Field(..., min_length=8, max_length=100)


class APIKeyResponse(BaseModel):
    """API key response."""

    api_key: str
    device_id: str
    created_at: datetime
    enabled: bool


# Organization schemas


class OrganizationBase(BaseModel):
    """Base organization schema."""

    name: str = Field(..., min_length=1, max_length=255)
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    plan: str = "standard"


class OrganizationCreate(OrganizationBase):
    """Schema for creating an organization."""

    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")


class OrganizationUpdate(BaseModel):
    """Schema for updating an organization."""

    name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    plan: Optional[str] = None
    is_active: Optional[bool] = None


class Organization(OrganizationBase):
    """Organization response schema."""

    id: int
    slug: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Location schemas


class LocationBase(BaseModel):
    """Base location schema."""

    name: str = Field(..., min_length=1, max_length=255)
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    timezone: str = "UTC"


class LocationCreate(LocationBase):
    """Schema for creating a location."""

    organization_id: int


class LocationUpdate(BaseModel):
    """Schema for updating a location."""

    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None


class Location(LocationBase):
    """Location response schema."""

    id: int
    organization_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Device schemas


class DeviceBase(BaseModel):
    """Base device schema."""

    device_id: str = Field(..., min_length=1, max_length=100)
    hostname: Optional[str] = None
    role: DeviceRole


class DeviceRegister(DeviceBase):
    """Schema for device registration."""

    location_id: int
    hardware_model: Optional[str] = None
    cpu_info: Optional[str] = None
    total_memory_mb: Optional[int] = None
    total_disk_mb: Optional[int] = None
    firmware_version: Optional[str] = None
    os_version: Optional[str] = None
    capabilities: Optional[List[str]] = None


class DeviceUpdate(BaseModel):
    """Schema for updating a device."""

    location_id: Optional[int] = None
    hostname: Optional[str] = None
    status: Optional[DeviceStatus] = None
    firmware_version: Optional[str] = None
    ip_address: Optional[str] = None
    metadata: Optional[dict] = None


class DeviceHeartbeat(BaseModel):
    """Schema for device heartbeat."""

    device_id: str
    status: DeviceStatus
    ip_address: Optional[str] = None


class Device(DeviceBase):
    """Device response schema."""

    id: int
    location_id: int
    status: DeviceStatus
    hardware_model: Optional[str] = None
    firmware_version: Optional[str] = None
    os_version: Optional[str] = None
    ip_address: Optional[str] = None
    last_seen: Optional[datetime] = None
    last_heartbeat: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Health schemas


class DeviceHealthCreate(BaseModel):
    """Schema for submitting device health."""

    device_id: str
    cpu_usage_percent: float = Field(..., ge=0, le=100)
    memory_used_mb: float
    memory_total_mb: float
    disk_used_mb: float
    disk_total_mb: float
    temperature_celsius: float
    uptime_seconds: int


class DeviceHealthResponse(BaseModel):
    """Device health response schema."""

    id: int
    device_id: int
    cpu_usage_percent: float
    memory_used_mb: float
    memory_total_mb: float
    temperature_celsius: float
    recorded_at: datetime

    class Config:
        from_attributes = True


# Telemetry schemas


class TelemetryCreate(BaseModel):
    """Schema for submitting telemetry data."""

    device_id: str
    frames_captured: int = 0
    frames_dropped: int = 0
    frames_displayed: int = 0
    average_fps: Optional[float] = None
    average_latency_ms: Optional[float] = None
    total_frames_analyzed: int = 0
    ad_frames_detected: int = 0
    content_frames_detected: int = 0
    average_confidence: Optional[float] = None
    average_inference_time_ms: Optional[float] = None
    total_ad_breaks: int = 0
    total_ad_duration_seconds: int = 0
    period_start: datetime
    period_end: datetime


class TelemetryResponse(BaseModel):
    """Telemetry response schema."""

    id: int
    device_id: int
    total_ad_breaks: int
    total_ad_duration_seconds: int
    average_fps: Optional[float] = None
    period_start: datetime
    period_end: datetime
    recorded_at: datetime

    class Config:
        from_attributes = True


# Firmware schemas


class FirmwareVersionCreate(BaseModel):
    """Schema for creating firmware version."""

    version: str = Field(..., pattern=r"^\d+\.\d+\.\d+$")
    release_notes: Optional[str] = None
    file_url: str
    file_size_bytes: int
    checksum_sha256: str = Field(..., min_length=64, max_length=64)
    is_stable: bool = False
    min_os_version: Optional[str] = None
    released_at: datetime


class FirmwareVersion(BaseModel):
    """Firmware version response schema."""

    id: int
    version: str
    release_notes: Optional[str] = None
    file_url: str
    file_size_bytes: int
    checksum_sha256: str
    is_stable: bool
    is_latest: bool
    released_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# Analytics schemas


class OrganizationStats(BaseModel):
    """Organization-level statistics."""

    organization_id: int
    total_locations: int
    total_devices: int
    online_devices: int
    offline_devices: int
    total_ad_breaks_today: int
    total_ad_duration_seconds_today: int
    average_fps: Optional[float] = None
    average_latency_ms: Optional[float] = None


class LocationStats(BaseModel):
    """Location-level statistics."""

    location_id: int
    total_devices: int
    online_devices: int
    total_ad_breaks_today: int
    total_ad_duration_seconds_today: int


# ML Model schemas


class MLModelBase(BaseModel):
    """Base ML model schema."""

    name: str = Field(..., min_length=1, max_length=100)
    model_type: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = None
    architecture: Optional[str] = None


class MLModelCreate(MLModelBase):
    """Schema for creating an ML model."""
    pass


class MLModel(MLModelBase):
    """ML model response schema."""

    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MLModelVersionBase(BaseModel):
    """Base ML model version schema."""

    version: str = Field(..., min_length=1, max_length=50)
    file_url: str = Field(..., min_length=1, max_length=500)
    file_size_bytes: int = Field(..., gt=0)
    checksum_sha256: str = Field(..., min_length=64, max_length=64)

    # Model metadata
    input_shape: Optional[List[int]] = None
    output_shape: Optional[List[int]] = None
    quantization: Optional[str] = None
    framework: Optional[str] = None
    framework_version: Optional[str] = None

    # Performance metrics
    accuracy: Optional[float] = Field(None, ge=0, le=1)
    precision: Optional[float] = Field(None, ge=0, le=1)
    recall: Optional[float] = Field(None, ge=0, le=1)
    f1_score: Optional[float] = Field(None, ge=0, le=1)
    inference_time_ms: Optional[float] = Field(None, ge=0)
    model_size_mb: Optional[float] = Field(None, ge=0)

    # Training info
    trained_on_dataset: Optional[str] = None
    training_date: Optional[datetime] = None
    training_config: Optional[dict] = None

    # Release notes
    release_notes: Optional[str] = None
    model_metadata: Optional[dict] = None


class MLModelVersionCreate(MLModelVersionBase):
    """Schema for creating an ML model version."""

    model_id: int


class MLModelVersionUpdate(BaseModel):
    """Schema for updating an ML model version."""

    status: Optional[str] = None
    rollout_percentage: Optional[float] = Field(None, ge=0, le=100)
    is_production: Optional[bool] = None
    release_notes: Optional[str] = None


class MLModelVersion(MLModelVersionBase):
    """ML model version response schema."""

    id: int
    model_id: int
    status: str
    rollout_percentage: float
    is_production: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MLModelWithVersions(MLModel):
    """ML model with versions included."""

    versions: List[MLModelVersion] = []

    class Config:
        from_attributes = True


class MLModelDownload(BaseModel):
    """Schema for model download response."""

    model_name: str
    version: str
    file_url: str
    file_size_bytes: int
    checksum_sha256: str
    metadata: dict
