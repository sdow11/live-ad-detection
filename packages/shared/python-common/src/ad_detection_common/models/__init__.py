"""Shared data models for the ad detection system."""

from ad_detection_common.models.device import (
    Device,
    DeviceCapability,
    DeviceRole,
    DeviceStatus,
    DeviceHealth,
)
from ad_detection_common.models.location import Location, LocationConfig
from ad_detection_common.models.firmware import (
    FirmwareVersion,
    FirmwareDeployment,
    DeploymentPhase,
    DeploymentStatus,
)

__all__ = [
    "Device",
    "DeviceCapability",
    "DeviceRole",
    "DeviceStatus",
    "DeviceHealth",
    "Location",
    "LocationConfig",
    "FirmwareVersion",
    "FirmwareDeployment",
    "DeploymentPhase",
    "DeploymentStatus",
]
