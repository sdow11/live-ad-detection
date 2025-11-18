"""Firmware update domain models."""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator


class DeploymentStatus(str, Enum):
    """Status of a firmware deployment."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"
    PAUSED = "paused"


class DeploymentPhase(BaseModel):
    """A phase in a staged firmware deployment."""

    phase_number: int = Field(..., ge=1)
    percentage: float = Field(..., gt=0, le=100, description="Percentage of devices to update")
    wait_hours: float = Field(default=24.0, ge=0, description="Hours to wait before next phase")
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    failed_devices: int = Field(default=0, ge=0)
    success_devices: int = Field(default=0, ge=0)

    @property
    def is_complete(self) -> bool:
        """Check if phase is complete."""
        return self.completed_at is not None

    @property
    def is_started(self) -> bool:
        """Check if phase is started."""
        return self.started_at is not None

    @property
    def failure_rate(self) -> float:
        """Calculate failure rate for this phase."""
        total = self.failed_devices + self.success_devices
        if total == 0:
            return 0.0
        return self.failed_devices / total


class FirmwareVersion(BaseModel):
    """Firmware version metadata."""

    # Version info
    version: str = Field(..., pattern=r"^v\d+\.\d+\.\d+$", example="v1.3.0")
    release_date: datetime

    # Download info
    url: HttpUrl
    checksum: str = Field(..., pattern=r"^[a-f0-9]{64}$", description="SHA256 checksum")
    signature: str = Field(..., description="RSA signature for verification")
    size_bytes: int = Field(..., gt=0)

    # Compatibility
    min_hardware_version: str = Field(..., example="Raspberry Pi 4")
    compatible_models: List[str] = Field(default_factory=list)

    # Release notes
    changelog: str = Field(..., min_length=1)
    breaking_changes: bool = False

    # Status
    status: str = Field(
        default="stable",
        pattern="^(draft|beta|stable|deprecated)$",
        description="Release status",
    )

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def is_compatible_with(self, model: str) -> bool:
        """Check if firmware is compatible with a device model."""
        return model in self.compatible_models or len(self.compatible_models) == 0

    def verify_checksum(self, file_checksum: str) -> bool:
        """Verify downloaded file checksum."""
        return file_checksum.lower() == self.checksum.lower()

    class Config:
        """Pydantic config."""

        json_schema_extra = {
            "example": {
                "version": "v1.3.0",
                "release_date": "2024-01-15T10:00:00Z",
                "url": "https://cdn.example.com/firmware/v1.3.0.tar.gz",
                "checksum": "a" * 64,
                "signature": "signature_data",
                "size_bytes": 52428800,
                "min_hardware_version": "Raspberry Pi 4",
                "compatible_models": ["Raspberry Pi 4 Model B", "Raspberry Pi 5"],
                "changelog": "- Added new feature\n- Fixed bug",
                "breaking_changes": False,
                "status": "stable",
            }
        }


class FirmwareDeployment(BaseModel):
    """Firmware deployment/rollout configuration and state."""

    # Identity
    deployment_id: str = Field(..., description="Unique deployment identifier")
    version: str = Field(..., pattern=r"^v\d+\.\d+\.\d+$")

    # Strategy
    strategy: str = Field(
        default="staged",
        pattern="^(immediate|staged|scheduled)$",
        description="Deployment strategy",
    )
    phases: List[DeploymentPhase] = Field(default_factory=list)

    # Target devices
    target_device_ids: List[str] = Field(default_factory=list)
    total_devices: int = Field(..., ge=0)

    # Progress
    updated_devices: int = Field(default=0, ge=0)
    failed_devices: int = Field(default=0, ge=0)
    pending_devices: int = Field(default=0, ge=0)

    # Health checks
    rollback_on_failure: bool = True
    failure_threshold: float = Field(
        default=0.05, ge=0.0, le=1.0, description="Rollback if failure rate exceeds this"
    )

    # Status
    status: DeploymentStatus = Field(default=DeploymentStatus.PENDING)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    @field_validator("phases")
    @classmethod
    def validate_phases_sum_to_100(cls, v: List[DeploymentPhase]) -> List[DeploymentPhase]:
        """Validate that phases sum to 100%."""
        if not v:
            return v

        total_percentage = sum(phase.percentage for phase in v)
        if total_percentage > 100.01:  # Allow small floating point error
            raise ValueError(f"Phase percentages sum to {total_percentage}, must be <= 100")

        return v

    @property
    def current_phase(self) -> Optional[DeploymentPhase]:
        """Get the current deployment phase."""
        for phase in self.phases:
            if phase.is_started and not phase.is_complete:
                return phase
        return None

    @property
    def failure_rate(self) -> float:
        """Calculate overall failure rate."""
        total = self.updated_devices + self.failed_devices
        if total == 0:
            return 0.0
        return self.failed_devices / total

    def should_rollback(self) -> bool:
        """Check if deployment should be rolled back based on failure rate."""
        if not self.rollback_on_failure:
            return False
        return self.failure_rate > self.failure_threshold

    def start_deployment(self) -> None:
        """Mark deployment as started."""
        if self.status != DeploymentStatus.PENDING:
            raise ValueError(f"Cannot start deployment with status {self.status}")

        self.status = DeploymentStatus.IN_PROGRESS
        self.started_at = datetime.utcnow()
        self.pending_devices = self.total_devices

    def complete_deployment(self) -> None:
        """Mark deployment as completed."""
        if self.status != DeploymentStatus.IN_PROGRESS:
            raise ValueError(f"Cannot complete deployment with status {self.status}")

        self.status = DeploymentStatus.COMPLETED
        self.completed_at = datetime.utcnow()

    def fail_deployment(self) -> None:
        """Mark deployment as failed."""
        self.status = DeploymentStatus.FAILED
        self.completed_at = datetime.utcnow()

    def rollback_deployment(self) -> None:
        """Mark deployment as rolled back."""
        self.status = DeploymentStatus.ROLLED_BACK
        self.completed_at = datetime.utcnow()

    def record_device_success(self) -> None:
        """Record a successful device update."""
        self.updated_devices += 1
        self.pending_devices = max(0, self.pending_devices - 1)

    def record_device_failure(self) -> None:
        """Record a failed device update."""
        self.failed_devices += 1
        self.pending_devices = max(0, self.pending_devices - 1)

    class Config:
        """Pydantic config."""

        json_schema_extra = {
            "example": {
                "deployment_id": "deploy-abc-123",
                "version": "v1.3.0",
                "strategy": "staged",
                "phases": [
                    {"phase_number": 1, "percentage": 5, "wait_hours": 24},
                    {"phase_number": 2, "percentage": 20, "wait_hours": 48},
                    {"phase_number": 3, "percentage": 75, "wait_hours": 0},
                ],
                "total_devices": 300,
                "rollback_on_failure": True,
                "failure_threshold": 0.05,
                "status": "pending",
            }
        }
