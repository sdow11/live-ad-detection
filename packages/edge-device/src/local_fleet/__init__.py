"""Local fleet management components."""

from ad_detection_edge.local_fleet.discovery import DeviceDiscoveryService
from ad_detection_edge.local_fleet.coordinator import CoordinatorElection, CoordinatorService
from ad_detection_edge.local_fleet.registry import DeviceRegistry

__all__ = [
    "DeviceDiscoveryService",
    "CoordinatorElection",
    "CoordinatorService",
    "DeviceRegistry",
]
