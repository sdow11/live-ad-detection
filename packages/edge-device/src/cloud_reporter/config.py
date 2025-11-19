"""Cloud reporter configuration."""

from pydantic import BaseModel, Field, HttpUrl


class CloudReporterConfig(BaseModel):
    """Configuration for cloud reporter service.

    Defines how edge devices communicate with the cloud API.
    """

    # Cloud API endpoint
    cloud_api_url: HttpUrl = Field(
        default="https://api.livetv.example.com",
        description="Cloud API base URL"
    )

    # Device identification
    device_id: str = Field(
        ...,
        description="Unique device identifier"
    )

    location_id: int = Field(
        ...,
        description="Location ID this device belongs to"
    )

    # API authentication (optional for now)
    api_key: str | None = Field(
        default=None,
        description="API key for authentication"
    )

    # Reporting intervals
    heartbeat_interval_sec: float = Field(
        default=30.0,
        description="Heartbeat interval in seconds",
        ge=5.0,
        le=300.0
    )

    health_interval_sec: float = Field(
        default=300.0,  # 5 minutes
        description="Health reporting interval in seconds",
        ge=60.0,
        le=3600.0
    )

    telemetry_interval_sec: float = Field(
        default=3600.0,  # 1 hour
        description="Telemetry reporting interval in seconds",
        ge=300.0,
        le=86400.0
    )

    firmware_check_interval_sec: float = Field(
        default=3600.0,  # 1 hour
        description="Firmware version check interval",
        ge=600.0,
        le=86400.0
    )

    # Retry configuration
    max_retries: int = Field(
        default=3,
        description="Maximum number of retries for failed requests",
        ge=0,
        le=10
    )

    retry_delay_sec: float = Field(
        default=5.0,
        description="Delay between retries in seconds",
        ge=1.0,
        le=60.0
    )

    # Timeout configuration
    request_timeout_sec: float = Field(
        default=10.0,
        description="HTTP request timeout in seconds",
        ge=1.0,
        le=60.0
    )

    # Enable/disable features
    enable_heartbeat: bool = Field(
        default=True,
        description="Enable heartbeat reporting"
    )

    enable_health_reporting: bool = Field(
        default=True,
        description="Enable health monitoring reporting"
    )

    enable_telemetry_reporting: bool = Field(
        default=True,
        description="Enable telemetry reporting"
    )

    enable_firmware_checks: bool = Field(
        default=True,
        description="Enable firmware update checks"
    )
