"""Local fleet management components."""

from ad_detection_edge.local_fleet.discovery import DeviceDiscoveryService
from ad_detection_edge.local_fleet.coordinator import (
    CoordinatorElection,
    CoordinatorService,
    ElectionState,
    VoteRequest,
    VoteResponse,
    HeartbeatMessage,
)
from ad_detection_edge.local_fleet.registry import DeviceRegistry

__all__ = [
    "DeviceDiscoveryService",
    "CoordinatorElection",
    "CoordinatorService",
    "ElectionState",
    "VoteRequest",
    "VoteResponse",
    "HeartbeatMessage",
    "DeviceRegistry",
]
