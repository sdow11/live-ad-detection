"""Tests for coordinator election (TDD)."""

import asyncio
from datetime import datetime, timedelta
from typing import List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ad_detection_common.models.device import Device, DeviceRole, DeviceStatus
from ad_detection_edge.local_fleet.coordinator import (
    CoordinatorElection,
    CoordinatorService,
    ElectionState,
    VoteRequest,
    VoteResponse,
)
from ad_detection_edge.local_fleet.discovery import DiscoveredDevice


@pytest.fixture
def mock_device() -> Device:
    """Create a mock device for testing."""
    return Device(
        device_id="rpi-001",
        hostname="ad-detection-001",
        serial_number="10000000a3b2c1d0",
        mac_address="dc:a6:32:12:34:56",
        role=DeviceRole.WORKER,
        status=DeviceStatus.ONLINE,
        model="Raspberry Pi 4 Model B",
        ip_address="192.168.1.100",
        tv_location="Main Bar",
        firmware_version="v1.0.0",
        os_version="Raspberry Pi OS 11",
    )


@pytest.fixture
def mock_discovered_devices() -> List[DiscoveredDevice]:
    """Create mock discovered devices."""
    return [
        DiscoveredDevice(
            device_id=f"rpi-{i:03d}",
            hostname=f"ad-detection-{i:03d}",
            ip_address=f"192.168.1.{100+i}",
            port=8081,
            role="worker",
            version="v1.0.0",
            service_info=MagicMock(),
        )
        for i in range(1, 4)
    ]


class TestElectionState:
    """Test suite for ElectionState enum."""

    def test_election_states_exist(self) -> None:
        """Test that all election states are defined."""
        assert ElectionState.FOLLOWER == "follower"
        assert ElectionState.CANDIDATE == "candidate"
        assert ElectionState.LEADER == "leader"


class TestVoteRequest:
    """Test suite for VoteRequest model."""

    def test_create_vote_request(self) -> None:
        """Test creating a valid vote request."""
        request = VoteRequest(
            candidate_id="rpi-001",
            term=1,
            last_log_index=0,
            last_log_term=0,
        )

        assert request.candidate_id == "rpi-001"
        assert request.term == 1
        assert request.last_log_index == 0
        assert request.last_log_term == 0


class TestVoteResponse:
    """Test suite for VoteResponse model."""

    def test_create_vote_response_granted(self) -> None:
        """Test creating a vote response that grants vote."""
        response = VoteResponse(
            term=1,
            vote_granted=True,
            voter_id="rpi-002",
        )

        assert response.term == 1
        assert response.vote_granted is True
        assert response.voter_id == "rpi-002"

    def test_create_vote_response_denied(self) -> None:
        """Test creating a vote response that denies vote."""
        response = VoteResponse(
            term=1,
            vote_granted=False,
            voter_id="rpi-002",
        )

        assert response.vote_granted is False


class TestCoordinatorElection:
    """Test suite for CoordinatorElection."""

    @pytest.mark.asyncio
    async def test_initial_state_is_follower(self, mock_device: Device) -> None:
        """Test that initial state is FOLLOWER."""
        election = CoordinatorElection(device=mock_device)

        assert election.state == ElectionState.FOLLOWER
        assert election.current_term == 0
        assert election.voted_for is None

    @pytest.mark.asyncio
    async def test_start_election_transitions_to_candidate(
        self, mock_device: Device
    ) -> None:
        """Test that starting election transitions to CANDIDATE state."""
        election = CoordinatorElection(device=mock_device)

        await election.start_election()

        assert election.state == ElectionState.CANDIDATE
        assert election.current_term == 1
        assert election.voted_for == mock_device.device_id

    @pytest.mark.asyncio
    async def test_start_election_increments_term(self, mock_device: Device) -> None:
        """Test that starting election increments term."""
        election = CoordinatorElection(device=mock_device)
        election.current_term = 5

        await election.start_election()

        assert election.current_term == 6

    @pytest.mark.asyncio
    async def test_request_vote_grants_vote_for_same_term(
        self, mock_device: Device
    ) -> None:
        """Test that vote is granted for first request in a term."""
        election = CoordinatorElection(device=mock_device)

        request = VoteRequest(
            candidate_id="rpi-002",
            term=1,
            last_log_index=0,
            last_log_term=0,
        )

        response = await election.handle_vote_request(request)

        assert response.vote_granted is True
        assert response.term == 1
        assert election.voted_for == "rpi-002"

    @pytest.mark.asyncio
    async def test_request_vote_denies_second_vote_in_same_term(
        self, mock_device: Device
    ) -> None:
        """Test that second vote request in same term is denied."""
        election = CoordinatorElection(device=mock_device)
        election.voted_for = "rpi-002"
        election.current_term = 1

        request = VoteRequest(
            candidate_id="rpi-003",
            term=1,
            last_log_index=0,
            last_log_term=0,
        )

        response = await election.handle_vote_request(request)

        assert response.vote_granted is False
        assert election.voted_for == "rpi-002"  # Unchanged

    @pytest.mark.asyncio
    async def test_request_vote_denies_old_term(self, mock_device: Device) -> None:
        """Test that vote request from old term is denied."""
        election = CoordinatorElection(device=mock_device)
        election.current_term = 5

        request = VoteRequest(
            candidate_id="rpi-002",
            term=3,  # Old term
            last_log_index=0,
            last_log_term=0,
        )

        response = await election.handle_vote_request(request)

        assert response.vote_granted is False
        assert response.term == 5

    @pytest.mark.asyncio
    async def test_request_vote_updates_term_if_higher(
        self, mock_device: Device
    ) -> None:
        """Test that higher term in vote request updates current term."""
        election = CoordinatorElection(device=mock_device)
        election.current_term = 3
        election.state = ElectionState.LEADER

        request = VoteRequest(
            candidate_id="rpi-002",
            term=5,  # Higher term
            last_log_index=0,
            last_log_term=0,
        )

        response = await election.handle_vote_request(request)

        assert election.current_term == 5
        assert election.state == ElectionState.FOLLOWER
        assert response.vote_granted is True

    @pytest.mark.asyncio
    async def test_become_leader_transitions_to_leader_state(
        self, mock_device: Device
    ) -> None:
        """Test that becoming leader transitions to LEADER state."""
        election = CoordinatorElection(device=mock_device)
        election.state = ElectionState.CANDIDATE

        await election.become_leader()

        assert election.state == ElectionState.LEADER
        assert mock_device.role == DeviceRole.COORDINATOR

    @pytest.mark.asyncio
    async def test_step_down_transitions_to_follower(self, mock_device: Device) -> None:
        """Test that stepping down transitions to FOLLOWER state."""
        election = CoordinatorElection(device=mock_device)
        election.state = ElectionState.LEADER
        mock_device.role = DeviceRole.COORDINATOR

        await election.step_down()

        assert election.state == ElectionState.FOLLOWER
        assert mock_device.role == DeviceRole.WORKER

    @pytest.mark.asyncio
    async def test_majority_votes_required(self, mock_device: Device) -> None:
        """Test that majority votes are correctly calculated."""
        election = CoordinatorElection(device=mock_device)

        # 1 device (self) = need 1 vote (self)
        assert election.votes_needed(total_devices=1) == 1

        # 3 devices = need 2 votes (majority)
        assert election.votes_needed(total_devices=3) == 2

        # 5 devices = need 3 votes
        assert election.votes_needed(total_devices=5) == 3

        # 7 devices = need 4 votes
        assert election.votes_needed(total_devices=7) == 4

    @pytest.mark.asyncio
    async def test_reset_election_timer_updates_last_heartbeat(
        self, mock_device: Device
    ) -> None:
        """Test that resetting election timer updates last heartbeat."""
        election = CoordinatorElection(device=mock_device)
        original_time = election.last_heartbeat

        await asyncio.sleep(0.01)
        election.reset_election_timer()

        assert election.last_heartbeat > original_time

    @pytest.mark.asyncio
    async def test_election_timeout_detected_after_timeout(
        self, mock_device: Device
    ) -> None:
        """Test that election timeout is detected after timeout period."""
        election = CoordinatorElection(device=mock_device)
        election.election_timeout = 0.1  # 100ms for testing

        # Set last heartbeat to old time
        election.last_heartbeat = datetime.utcnow() - timedelta(seconds=1)

        assert election.is_election_timeout() is True

    @pytest.mark.asyncio
    async def test_no_election_timeout_when_heartbeat_recent(
        self, mock_device: Device
    ) -> None:
        """Test that no timeout when heartbeat is recent."""
        election = CoordinatorElection(device=mock_device)
        election.reset_election_timer()

        assert election.is_election_timeout() is False


class TestCoordinatorService:
    """Test suite for CoordinatorService."""

    @pytest.mark.asyncio
    async def test_service_starts_in_follower_mode(self, mock_device: Device) -> None:
        """Test that service starts in follower mode."""
        service = CoordinatorService(device=mock_device)

        assert service.election.state == ElectionState.FOLLOWER

    @pytest.mark.asyncio
    async def test_service_can_start_and_stop(self, mock_device: Device) -> None:
        """Test that service can start and stop cleanly."""
        service = CoordinatorService(device=mock_device)

        await service.start()
        assert service.running is True

        await service.stop()
        assert service.running is False

    @pytest.mark.asyncio
    async def test_single_device_becomes_coordinator(self, mock_device: Device) -> None:
        """Test that single device automatically becomes coordinator."""
        service = CoordinatorService(device=mock_device)

        # Mock discovery to return no other devices
        with patch.object(service, "get_peer_devices", return_value=[]):
            await service.start()
            await asyncio.sleep(0.2)  # Wait for election

            assert service.election.state == ElectionState.LEADER
            assert mock_device.role == DeviceRole.COORDINATOR

            await service.stop()

    @pytest.mark.asyncio
    async def test_leader_sends_heartbeats(self, mock_device: Device) -> None:
        """Test that leader sends periodic heartbeats."""
        service = CoordinatorService(device=mock_device)
        service.heartbeat_interval = 0.1  # Fast for testing

        heartbeat_sent = False

        async def mock_send_heartbeat():
            nonlocal heartbeat_sent
            heartbeat_sent = True

        with patch.object(service, "send_heartbeat", side_effect=mock_send_heartbeat):
            await service.start()
            await service.election.become_leader()

            await asyncio.sleep(0.15)  # Wait for heartbeat

            assert heartbeat_sent is True

            await service.stop()

    @pytest.mark.asyncio
    async def test_follower_starts_election_on_timeout(
        self, mock_device: Device
    ) -> None:
        """Test that follower starts election when leader times out."""
        service = CoordinatorService(device=mock_device)
        service.election.election_timeout = 0.1  # Fast for testing

        # Set old heartbeat
        service.election.last_heartbeat = datetime.utcnow() - timedelta(seconds=1)

        election_started = False

        async def mock_start_election():
            nonlocal election_started
            election_started = True
            await service.election.start_election()

        with patch.object(
            service.election, "start_election", side_effect=mock_start_election
        ):
            await service.start()
            await asyncio.sleep(0.15)

            assert election_started is True

            await service.stop()

    @pytest.mark.asyncio
    async def test_coordinator_service_handles_discovery_events(
        self, mock_device: Device, mock_discovered_devices: List[DiscoveredDevice]
    ) -> None:
        """Test that coordinator service handles device discovery events."""
        service = CoordinatorService(device=mock_device)

        # Simulate device discovered
        await service.on_device_discovered(mock_discovered_devices[0])

        # Device should be tracked
        assert len(service.peer_devices) > 0

    @pytest.mark.asyncio
    async def test_coordinator_service_removes_offline_devices(
        self, mock_device: Device
    ) -> None:
        """Test that offline devices are removed."""
        service = CoordinatorService(device=mock_device)

        # Add a device
        service.peer_devices["rpi-002"] = MagicMock()

        # Simulate device removed
        await service.on_device_removed("rpi-002")

        assert "rpi-002" not in service.peer_devices
