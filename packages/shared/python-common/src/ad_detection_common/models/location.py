"""Location domain models."""

from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel, EmailStr, Field


class LocationConfig(BaseModel):
    """Configuration for a location."""

    # Ad detection settings
    ad_detection_enabled: bool = True
    confidence_threshold: float = Field(default=0.85, ge=0.0, le=1.0)
    temporal_window_frames: int = Field(default=5, ge=1, le=30)

    # TV control settings
    default_channel: Optional[str] = None
    fallback_content_url: Optional[str] = None

    # Schedule settings
    auto_schedule_enabled: bool = True
    timezone: str = Field(default="America/New_York")

    # Custom settings
    custom: Dict[str, str] = Field(default_factory=dict)


class Location(BaseModel):
    """Represents a physical location (bar/restaurant)."""

    # Identity
    location_id: str = Field(..., description="Unique location identifier")
    name: str = Field(..., min_length=1, max_length=255, example="Bar XYZ")

    # Address
    address: str = Field(..., min_length=1)
    city: str = Field(..., min_length=1)
    state: str = Field(..., min_length=2, max_length=2)
    zip_code: str = Field(..., pattern=r"^\d{5}(-\d{4})?$")
    country: str = Field(default="US")
    timezone: str = Field(default="America/New_York")

    # Contact
    contact_name: str = Field(..., min_length=1)
    contact_email: EmailStr
    contact_phone: str = Field(..., pattern=r"^\+?1?\d{10,14}$")

    # Fleet info
    coordinator_id: Optional[str] = Field(None, description="Device ID of coordinator")
    device_count: int = Field(default=0, ge=0)

    # Customer
    customer_id: str = Field(..., description="Customer this location belongs to")

    # Configuration
    config: LocationConfig = Field(default_factory=LocationConfig)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def has_coordinator(self) -> bool:
        """Check if location has an assigned coordinator."""
        return self.coordinator_id is not None

    def update_device_count(self, count: int) -> None:
        """Update the device count for this location."""
        if count < 0:
            raise ValueError("Device count cannot be negative")
        self.device_count = count
        self.updated_at = datetime.utcnow()

    def assign_coordinator(self, device_id: str) -> None:
        """Assign a coordinator device to this location."""
        self.coordinator_id = device_id
        self.updated_at = datetime.utcnow()

    def remove_coordinator(self) -> None:
        """Remove the coordinator device from this location."""
        self.coordinator_id = None
        self.updated_at = datetime.utcnow()

    class Config:
        """Pydantic config."""

        json_schema_extra = {
            "example": {
                "location_id": "loc-xyz",
                "name": "Bar XYZ",
                "address": "123 Main St",
                "city": "New York",
                "state": "NY",
                "zip_code": "10001",
                "timezone": "America/New_York",
                "contact_name": "John Doe",
                "contact_email": "john@barxyz.com",
                "contact_phone": "+12125551234",
                "coordinator_id": "rpi-001",
                "device_count": 5,
                "customer_id": "cust-123",
            }
        }
