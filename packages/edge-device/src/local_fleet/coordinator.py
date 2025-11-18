"""Coordinator election and management using Raft-like consensus.

This module implements a simplified Raft consensus algorithm for leader election
among devices in the local fleet. The coordinator (leader) is responsible for
managing the local fleet and providing the web UI.

Key Features:
- Leader election with majority voting
- Automatic failover when coordinator goes down
- Heartbeat mechanism to detect failures
- Split-brain prevention

References:
- Raft Consensus Algorithm: https://raft.github.io/
"""

import asyncio
import logging
import random
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Protocol

import aiohttp
from pydantic import BaseModel

from ad_detection_common.models.device import Device, DeviceRole
from ad_detection_edge.local_fleet.discovery import DiscoveredDevice, DiscoveryListener

logger = logging.getLogger(__name__)


class ElectionState(str, Enum):
    """State of a device in the election process."""

    FOLLOWER = "follower"
    CANDIDATE = "candidate"
    LEADER = "leader"


class VoteRequest(BaseModel):
    """Request for vote in leader election."""

    candidate_id: str
    term: int
    last_log_index: int = 0
    last_log_term: int = 0


class VoteResponse(BaseModel):
    """Response to vote request."""

    term: int
    vote_granted: bool
    voter_id: str


class HeartbeatMessage(BaseModel):
    """Heartbeat message from leader."""

    leader_id: str
    term: int
    timestamp: datetime


class ElectionCallbacks(Protocol):
    """Protocol for election event callbacks."""

    async def on_became_leader(self) -> None:
        """Called when this device becomes the leader."""
        ...

    async def on_became_follower(self) -> None:
        """Called when this device becomes a follower."""
        ...

    async def on_leader_changed(self, leader_id: str) -> None:
        """Called when a new leader is detected."""
        ...


class CoordinatorElection:
    """Manages coordinator election using Raft-like consensus.

    This class implements a simplified version of the Raft consensus algorithm
    for leader election. Key differences from full Raft:
    - No log replication (not needed for simple leader election)
    - Simplified state machine
    - Randomized election timeouts

    Example:
        >>> device = Device(...)
        >>> election = CoordinatorElection(device)
        >>> await election.start_election()
        >>> if await election.request_votes(peer_devices):
        ...     await election.become_leader()
    """

    def __init__(
        self,
        device: Device,
        election_timeout: float = 5.0,
        heartbeat_interval: float = 1.0,
    ) -> None:
        """Initialize coordinator election.

        Args:
            device: This device
            election_timeout: Timeout before starting election (seconds)
            heartbeat_interval: Interval for leader heartbeats (seconds)
        """
        self.device = device
        self.election_timeout = election_timeout
        self.heartbeat_interval = heartbeat_interval

        # Raft state
        self.state = ElectionState.FOLLOWER
        self.current_term = 0
        self.voted_for: Optional[str] = None
        self.current_leader: Optional[str] = None

        # Timing
        self.last_heartbeat = datetime.utcnow()
        self._randomized_timeout = self._get_random_timeout()

        # Callbacks
        self.callbacks: Optional[ElectionCallbacks] = None

    def _get_random_timeout(self) -> float:
        """Get randomized election timeout to prevent split votes.

        Returns:
            Timeout in seconds with random jitter
        """
        # Random timeout between 1x and 2x the base timeout
        return self.election_timeout * (1.0 + random.random())

    async def start_election(self) -> None:
        """Start a new election.

        Transitions to CANDIDATE state, increments term, and votes for self.
        """
        logger.info(f"Starting election for term {self.current_term + 1}")

        # Increment term
        self.current_term += 1

        # Transition to candidate
        self.state = ElectionState.CANDIDATE

        # Vote for self
        self.voted_for = self.device.device_id

        # Reset election timer
        self.reset_election_timer()

    async def handle_vote_request(self, request: VoteRequest) -> VoteResponse:
        """Handle a vote request from another candidate.

        Args:
            request: Vote request from candidate

        Returns:
            Vote response indicating whether vote was granted
        """
        logger.debug(
            f"Received vote request from {request.candidate_id} for term {request.term}"
        )

        # If request term is old, deny
        if request.term < self.current_term:
            logger.debug(f"Denying vote: term {request.term} is old")
            return VoteResponse(
                term=self.current_term,
                vote_granted=False,
                voter_id=self.device.device_id,
            )

        # If request term is newer, update our term and step down
        if request.term > self.current_term:
            logger.info(f"Updating term from {self.current_term} to {request.term}")
            self.current_term = request.term
            self.voted_for = None
            if self.state != ElectionState.FOLLOWER:
                await self.step_down()

        # Grant vote if we haven't voted yet in this term
        vote_granted = False
        if self.voted_for is None or self.voted_for == request.candidate_id:
            self.voted_for = request.candidate_id
            vote_granted = True
            self.reset_election_timer()
            logger.info(f"Granted vote to {request.candidate_id} for term {request.term}")
        else:
            logger.debug(
                f"Denying vote: already voted for {self.voted_for} in term {self.current_term}"
            )

        return VoteResponse(
            term=self.current_term,
            vote_granted=vote_granted,
            voter_id=self.device.device_id,
        )

    async def become_leader(self) -> None:
        """Transition to leader state.

        Should be called after winning an election (receiving majority votes).
        """
        logger.info(f"Becoming leader for term {self.current_term}")

        self.state = ElectionState.LEADER
        self.current_leader = self.device.device_id
        self.device.role = DeviceRole.COORDINATOR

        if self.callbacks:
            await self.callbacks.on_became_leader()

    async def step_down(self) -> None:
        """Step down from leader/candidate to follower.

        Called when a higher term is discovered or when stepping down gracefully.
        """
        logger.info(f"Stepping down to follower in term {self.current_term}")

        old_state = self.state
        self.state = ElectionState.FOLLOWER

        if self.device.role == DeviceRole.COORDINATOR:
            self.device.role = DeviceRole.WORKER

        if old_state == ElectionState.LEADER and self.callbacks:
            await self.callbacks.on_became_follower()

        self.reset_election_timer()

    def reset_election_timer(self) -> None:
        """Reset the election timeout timer."""
        self.last_heartbeat = datetime.utcnow()
        self._randomized_timeout = self._get_random_timeout()

    def is_election_timeout(self) -> bool:
        """Check if election timeout has occurred.

        Returns:
            True if timeout has occurred, False otherwise
        """
        elapsed = (datetime.utcnow() - self.last_heartbeat).total_seconds()
        return elapsed > self._randomized_timeout

    def votes_needed(self, total_devices: int) -> int:
        """Calculate number of votes needed for majority.

        Args:
            total_devices: Total number of devices including self

        Returns:
            Number of votes needed for majority
        """
        return (total_devices // 2) + 1

    async def handle_heartbeat(self, heartbeat: HeartbeatMessage) -> None:
        """Handle heartbeat from leader.

        Args:
            heartbeat: Heartbeat message from leader
        """
        # If heartbeat term is old, ignore
        if heartbeat.term < self.current_term:
            logger.debug(f"Ignoring old heartbeat from term {heartbeat.term}")
            return

        # If heartbeat term is newer, update term and step down
        if heartbeat.term > self.current_term:
            logger.info(f"Received heartbeat with newer term: {heartbeat.term}")
            self.current_term = heartbeat.term
            await self.step_down()

        # Update leader and reset timer
        if self.current_leader != heartbeat.leader_id:
            logger.info(f"New leader detected: {heartbeat.leader_id}")
            self.current_leader = heartbeat.leader_id
            if self.callbacks:
                await self.callbacks.on_leader_changed(heartbeat.leader_id)

        self.reset_election_timer()


class CoordinatorService(DiscoveryListener):
    """Service that manages coordinator election and operations.

    This service integrates with the device discovery service to detect peers
    and manage leader election. It automatically starts elections when the
    leader times out and sends heartbeats when this device is the leader.

    Example:
        >>> device = Device(...)
        >>> service = CoordinatorService(device)
        >>> await service.start()
        >>> # Service runs in background, handling elections automatically
    """

    def __init__(
        self,
        device: Device,
        election_timeout: float = 5.0,
        heartbeat_interval: float = 1.0,
    ) -> None:
        """Initialize coordinator service.

        Args:
            device: This device
            election_timeout: Election timeout in seconds
            heartbeat_interval: Heartbeat interval in seconds
        """
        self.device = device
        self.election = CoordinatorElection(
            device=device,
            election_timeout=election_timeout,
            heartbeat_interval=heartbeat_interval,
        )
        self.election.callbacks = self

        self.heartbeat_interval = heartbeat_interval
        self.running = False
        self.peer_devices: Dict[str, DiscoveredDevice] = {}

        # Background tasks
        self._election_task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start the coordinator service."""
        if self.running:
            logger.warning("Coordinator service already running")
            return

        logger.info("Starting coordinator service")
        self.running = True

        # Start background tasks
        self._election_task = asyncio.create_task(self._election_loop())
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def stop(self) -> None:
        """Stop the coordinator service."""
        if not self.running:
            return

        logger.info("Stopping coordinator service")
        self.running = False

        # Cancel background tasks
        if self._election_task:
            self._election_task.cancel()
            try:
                await self._election_task
            except asyncio.CancelledError:
                pass

        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass

        # Step down if leader
        if self.election.state == ElectionState.LEADER:
            await self.election.step_down()

    async def _election_loop(self) -> None:
        """Background task that monitors election timeout."""
        while self.running:
            try:
                # Check if we should start an election
                if (
                    self.election.state != ElectionState.LEADER
                    and self.election.is_election_timeout()
                ):
                    logger.info("Election timeout detected, starting election")
                    await self._run_election()

                await asyncio.sleep(0.5)  # Check every 500ms

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in election loop: {e}", exc_info=True)
                await asyncio.sleep(1)

    async def _heartbeat_loop(self) -> None:
        """Background task that sends heartbeats when leader."""
        while self.running:
            try:
                if self.election.state == ElectionState.LEADER:
                    await self.send_heartbeat()

                await asyncio.sleep(self.heartbeat_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}", exc_info=True)
                await asyncio.sleep(1)

    async def _run_election(self) -> None:
        """Run an election to become coordinator."""
        try:
            # Start election
            await self.election.start_election()

            # Get peer devices
            peers = await self.get_peer_devices()

            # If no peers, we win automatically
            if len(peers) == 0:
                logger.info("No peers found, becoming coordinator")
                await self.election.become_leader()
                return

            # Request votes from peers
            votes = await self._request_votes(peers)

            # Count votes (we already voted for ourselves)
            total_devices = len(peers) + 1
            votes_received = sum(1 for v in votes if v.vote_granted) + 1  # +1 for self

            votes_needed = self.election.votes_needed(total_devices)

            logger.info(
                f"Received {votes_received}/{total_devices} votes, need {votes_needed}"
            )

            # Check if we won
            if votes_received >= votes_needed:
                await self.election.become_leader()
            else:
                logger.info("Did not receive majority, staying as follower")
                await self.election.step_down()

        except Exception as e:
            logger.error(f"Error during election: {e}", exc_info=True)
            await self.election.step_down()

    async def _request_votes(
        self, peers: List[DiscoveredDevice]
    ) -> List[VoteResponse]:
        """Request votes from peer devices.

        Args:
            peers: List of peer devices to request votes from

        Returns:
            List of vote responses
        """
        request = VoteRequest(
            candidate_id=self.device.device_id,
            term=self.election.current_term,
            last_log_index=0,
            last_log_term=0,
        )

        tasks = [self._send_vote_request(peer, request) for peer in peers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out exceptions and return valid responses
        return [r for r in results if isinstance(r, VoteResponse)]

    async def _send_vote_request(
        self, peer: DiscoveredDevice, request: VoteRequest
    ) -> VoteResponse:
        """Send vote request to a peer device.

        Args:
            peer: Peer device to send request to
            request: Vote request

        Returns:
            Vote response from peer

        Raises:
            Exception: If request fails
        """
        url = f"http://{peer.ip_address}:{peer.port}/api/v1/local/election/vote"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, json=request.model_dump(), timeout=aiohttp.ClientTimeout(total=2.0)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return VoteResponse(**data)
                    else:
                        raise Exception(f"Vote request failed: {response.status}")

        except Exception as e:
            logger.debug(f"Failed to get vote from {peer.device_id}: {e}")
            raise

    async def send_heartbeat(self) -> None:
        """Send heartbeat to all peers."""
        heartbeat = HeartbeatMessage(
            leader_id=self.device.device_id,
            term=self.election.current_term,
            timestamp=datetime.utcnow(),
        )

        peers = await self.get_peer_devices()
        tasks = [self._send_heartbeat_to_peer(peer, heartbeat) for peer in peers]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _send_heartbeat_to_peer(
        self, peer: DiscoveredDevice, heartbeat: HeartbeatMessage
    ) -> None:
        """Send heartbeat to a single peer.

        Args:
            peer: Peer device
            heartbeat: Heartbeat message
        """
        url = f"http://{peer.ip_address}:{peer.port}/api/v1/local/election/heartbeat"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=heartbeat.model_dump(mode="json"),
                    timeout=aiohttp.ClientTimeout(total=1.0),
                ) as response:
                    if response.status != 200:
                        logger.debug(f"Heartbeat to {peer.device_id} failed: {response.status}")

        except Exception as e:
            logger.debug(f"Failed to send heartbeat to {peer.device_id}: {e}")

    async def get_peer_devices(self) -> List[DiscoveredDevice]:
        """Get list of peer devices.

        Returns:
            List of discovered peer devices
        """
        return list(self.peer_devices.values())

    # DiscoveryListener implementation

    async def on_device_discovered(self, device: DiscoveredDevice) -> None:
        """Handle device discovered event.

        Args:
            device: Newly discovered device
        """
        logger.info(f"Peer discovered: {device.device_id}")
        self.peer_devices[device.device_id] = device

    async def on_device_removed(self, device_id: str) -> None:
        """Handle device removed event.

        Args:
            device_id: ID of removed device
        """
        logger.info(f"Peer removed: {device_id}")
        if device_id in self.peer_devices:
            del self.peer_devices[device_id]

        # If the removed device was the leader, we'll detect timeout and start election
        if device_id == self.election.current_leader:
            logger.info("Current leader went offline")

    async def on_device_updated(self, device: DiscoveredDevice) -> None:
        """Handle device updated event.

        Args:
            device: Updated device
        """
        self.peer_devices[device.device_id] = device

    # ElectionCallbacks implementation

    async def on_became_leader(self) -> None:
        """Called when this device becomes leader."""
        logger.info("✓ This device is now the COORDINATOR")
        # Additional setup can be done here (e.g., start web server)

    async def on_became_follower(self) -> None:
        """Called when this device becomes follower."""
        logger.info("Transitioned to FOLLOWER")

    async def on_leader_changed(self, leader_id: str) -> None:
        """Called when a new leader is detected.

        Args:
            leader_id: ID of the new leader
        """
        logger.info(f"New coordinator detected: {leader_id}")
