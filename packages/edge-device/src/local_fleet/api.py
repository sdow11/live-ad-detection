"""Local fleet management API using FastAPI.

This module provides REST API endpoints for managing the local fleet of devices.
It's designed to run on the coordinator device and be accessible to staff via
a web browser on the local network.

Example:
    >>> app = create_app(registry=registry, coordinator_service=service)
    >>> uvicorn.run(app, host="0.0.0.0", port=8080)
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncGenerator, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse
import os

from ad_detection_common.models.device import Device, DeviceHealth, DeviceStatus
from ad_detection_edge.local_fleet.coordinator import (
    CoordinatorService,
    HeartbeatMessage,
    VoteRequest,
    VoteResponse,
)
from ad_detection_edge.local_fleet.registry import DeviceRegistry

logger = logging.getLogger(__name__)


# Request/Response Models


class ChannelChangeRequest(BaseModel):
    """Request to change TV channel."""

    device_id: str = Field(..., description="Device ID to control")
    channel: str = Field(..., description="Channel to switch to")


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    device_count: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class StatusResponse(BaseModel):
    """Coordinator status response."""

    is_coordinator: bool
    coordinator: Optional[Device] = None
    device_count: int
    online_count: int
    election_term: int
    election_state: str


class DeviceRegistrationResponse(BaseModel):
    """Response after device registration."""

    device_id: str
    status: str = "registered"
    message: str = "Device registered successfully"


# Application State


class AppState:
    """Application state container."""

    def __init__(
        self,
        registry: DeviceRegistry,
        coordinator_service: Optional[CoordinatorService] = None,
    ) -> None:
        """Initialize application state.

        Args:
            registry: Device registry
            coordinator_service: Optional coordinator service
        """
        self.registry = registry
        self.coordinator_service = coordinator_service
        self.event_queue: asyncio.Queue = asyncio.Queue()


# Application Factory


def create_app(
    registry: DeviceRegistry,
    coordinator_service: Optional[CoordinatorService] = None,
) -> FastAPI:
    """Create and configure FastAPI application.

    Args:
        registry: Device registry for persistence
        coordinator_service: Optional coordinator service for election

    Returns:
        Configured FastAPI application
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator:
        """Manage application lifecycle."""
        # Startup
        logger.info("Starting local fleet API")
        if not registry.is_initialized:
            await registry.initialize()

        # Store state in app
        app.state.app_state = AppState(
            registry=registry, coordinator_service=coordinator_service
        )

        yield

        # Shutdown
        logger.info("Shutting down local fleet API")

    app = FastAPI(
        title="Local Fleet Management API",
        description="API for managing ad detection devices on local network",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Setup Jinja2 templates
    template_dir = os.path.join(os.path.dirname(__file__), "templates")
    templates = Jinja2Templates(directory=template_dir)

    # Add CORS middleware for local network access
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins on local network
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Web UI endpoint

    @app.get("/", response_class=HTMLResponse, tags=["UI"])
    async def dashboard(request: Request) -> HTMLResponse:
        """Serve the web dashboard UI.

        Returns:
            HTML dashboard page
        """
        return templates.TemplateResponse("index.html", {"request": request})

    # Health check endpoint

    @app.get("/api/v1/local/health", response_model=HealthResponse, tags=["Health"])
    async def health_check(request: Request) -> HealthResponse:
        """Health check endpoint.

        Returns:
            Health status and basic metrics
        """
        state: AppState = request.app.state.app_state
        device_count = await state.registry.get_device_count()

        return HealthResponse(status="healthy", device_count=device_count)

    # Device management endpoints

    @app.post(
        "/api/v1/local/devices/register",
        response_model=Device,
        status_code=201,
        tags=["Devices"],
    )
    async def register_device(request: Request, device: Device) -> Device:
        """Register a new device or update existing device.

        Args:
            device: Device to register

        Returns:
            Registered device
        """
        state: AppState = request.app.state.app_state
        await state.registry.register_device(device)

        logger.info(f"Device registered: {device.device_id}")

        # Notify via event stream
        await state.event_queue.put(
            {"event": "device_registered", "device_id": device.device_id}
        )

        return device

    @app.get("/api/v1/local/devices", response_model=List[Device], tags=["Devices"])
    async def list_devices(request: Request) -> List[Device]:
        """Get list of all registered devices.

        Returns:
            List of all devices
        """
        state: AppState = request.app.state.app_state
        devices = await state.registry.get_all_devices()
        return devices

    @app.get("/api/v1/local/devices/{device_id}", response_model=Device, tags=["Devices"])
    async def get_device(request: Request, device_id: str) -> Device:
        """Get a specific device by ID.

        Args:
            device_id: Device ID to retrieve

        Returns:
            Device information

        Raises:
            HTTPException: If device not found
        """
        state: AppState = request.app.state.app_state
        device = await state.registry.get_device(device_id)

        if device is None:
            raise HTTPException(status_code=404, detail="Device not found")

        return device

    @app.post(
        "/api/v1/local/devices/{device_id}/health",
        response_model=DeviceRegistrationResponse,
        tags=["Devices"],
    )
    async def update_device_health(
        request: Request, device_id: str, health: DeviceHealth
    ) -> DeviceRegistrationResponse:
        """Update device health metrics.

        Args:
            device_id: Device ID to update
            health: New health metrics

        Returns:
            Update confirmation

        Raises:
            HTTPException: If device not found
        """
        state: AppState = request.app.state.app_state

        # Verify device exists
        device = await state.registry.get_device(device_id)
        if device is None:
            raise HTTPException(status_code=404, detail="Device not found")

        # Update health
        await state.registry.update_device_health(device_id, health)

        # Notify via event stream
        await state.event_queue.put({"event": "health_updated", "device_id": device_id})

        return DeviceRegistrationResponse(
            device_id=device_id, status="updated", message="Health metrics updated"
        )

    # Election endpoints

    @app.post(
        "/api/v1/local/election/vote",
        response_model=VoteResponse,
        tags=["Election"],
    )
    async def handle_vote_request(
        request: Request, vote_request: VoteRequest
    ) -> VoteResponse:
        """Handle vote request from another device during election.

        Args:
            vote_request: Vote request from candidate

        Returns:
            Vote response indicating whether vote was granted
        """
        state: AppState = request.app.state.app_state

        if state.coordinator_service is None:
            # If no coordinator service, deny vote
            return VoteResponse(
                term=0, vote_granted=False, voter_id="unknown"
            )

        response = await state.coordinator_service.election.handle_vote_request(
            vote_request
        )
        return response

    @app.post(
        "/api/v1/local/election/heartbeat",
        status_code=200,
        tags=["Election"],
    )
    async def handle_heartbeat(
        request: Request, heartbeat: HeartbeatMessage
    ) -> dict:
        """Handle heartbeat from coordinator.

        Args:
            heartbeat: Heartbeat message from leader

        Returns:
            Acknowledgment
        """
        state: AppState = request.app.state.app_state

        if state.coordinator_service is not None:
            await state.coordinator_service.election.handle_heartbeat(heartbeat)

        return {"status": "acknowledged"}

    # Control endpoints

    @app.post(
        "/api/v1/local/control/channel",
        response_model=dict,
        tags=["Control"],
    )
    async def change_channel(
        request: Request, channel_request: ChannelChangeRequest
    ) -> dict:
        """Change TV channel on a specific device.

        Args:
            channel_request: Channel change request

        Returns:
            Operation status

        Raises:
            HTTPException: If device not found
        """
        state: AppState = request.app.state.app_state

        # Verify device exists
        device = await state.registry.get_device(channel_request.device_id)
        if device is None:
            raise HTTPException(status_code=404, detail="Device not found")

        # TODO: Implement actual TV control
        # For now, just acknowledge the request
        logger.info(
            f"Channel change requested: {channel_request.device_id} -> {channel_request.channel}"
        )

        # Notify via event stream
        await state.event_queue.put(
            {
                "event": "channel_changed",
                "device_id": channel_request.device_id,
                "channel": channel_request.channel,
            }
        )

        return {
            "status": "success",
            "device_id": channel_request.device_id,
            "channel": channel_request.channel,
            "message": "Channel change command sent",
        }

    # Status endpoint

    @app.get(
        "/api/v1/local/status",
        response_model=StatusResponse,
        tags=["Status"],
    )
    async def get_status(request: Request) -> StatusResponse:
        """Get coordinator and fleet status.

        Returns:
            Current status information
        """
        state: AppState = request.app.state.app_state

        device_count = await state.registry.get_device_count()
        online_devices = await state.registry.get_online_devices()
        coordinator = await state.registry.get_coordinator()

        is_coordinator = False
        election_term = 0
        election_state = "unknown"

        if state.coordinator_service is not None:
            is_coordinator = (
                state.coordinator_service.election.state.value == "leader"
            )
            election_term = state.coordinator_service.election.current_term
            election_state = state.coordinator_service.election.state.value

        return StatusResponse(
            is_coordinator=is_coordinator,
            coordinator=coordinator,
            device_count=device_count,
            online_count=len(online_devices),
            election_term=election_term,
            election_state=election_state,
        )

    # Real-time events endpoint (Server-Sent Events)

    @app.get("/api/v1/local/events", tags=["Events"])
    async def event_stream(request: Request) -> EventSourceResponse:
        """Server-Sent Events stream for real-time updates.

        Returns:
            SSE stream of events
        """
        state: AppState = request.app.state.app_state

        async def event_generator() -> AsyncGenerator:
            """Generate events from queue."""
            try:
                while True:
                    # Check if client disconnected
                    if await request.is_disconnected():
                        break

                    try:
                        # Wait for event with timeout
                        event = await asyncio.wait_for(
                            state.event_queue.get(), timeout=30.0
                        )
                        yield event
                    except asyncio.TimeoutError:
                        # Send keepalive ping
                        yield {"event": "ping", "timestamp": datetime.utcnow().isoformat()}

            except asyncio.CancelledError:
                logger.debug("Event stream cancelled")

        return EventSourceResponse(event_generator())

    return app


# Convenience function for running the app


async def run_api_server(
    registry: DeviceRegistry,
    coordinator_service: Optional[CoordinatorService] = None,
    host: str = "0.0.0.0",
    port: int = 8080,
) -> None:
    """Run the API server.

    Args:
        registry: Device registry
        coordinator_service: Optional coordinator service
        host: Host to bind to
        port: Port to listen on
    """
    import uvicorn

    app = create_app(registry=registry, coordinator_service=coordinator_service)

    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=True,
    )

    server = uvicorn.Server(config)
    await server.serve()
