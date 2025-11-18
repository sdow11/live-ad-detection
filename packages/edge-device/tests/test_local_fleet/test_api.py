"""Tests for local fleet API (TDD)."""

import asyncio
from datetime import datetime
from typing import AsyncGenerator

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from ad_detection_common.models.device import (
    Device,
    DeviceCapability,
    DeviceHealth,
    DeviceRole,
    DeviceStatus,
)
from ad_detection_edge.local_fleet.api import create_app
from ad_detection_edge.local_fleet.registry import DeviceRegistry


@pytest.fixture
async def test_registry() -> AsyncGenerator[DeviceRegistry, None]:
    """Create a test registry with in-memory database."""
    registry = DeviceRegistry(db_path=":memory:")
    await registry.initialize()
    yield registry
    await registry.close()


@pytest.fixture
def test_device() -> Device:
    """Create a test device."""
    return Device(
        device_id="rpi-001",
        hostname="ad-detection-001",
        serial_number="10000000a3b2c1d0",
        mac_address="dc:a6:32:12:34:56",
        role=DeviceRole.WORKER,
        status=DeviceStatus.ONLINE,
        model="Raspberry Pi 4 Model B",
        capabilities=[DeviceCapability.HDMI_CAPTURE, DeviceCapability.IR_BLASTER],
        ip_address="192.168.1.100",
        tv_location="Main Bar",
        firmware_version="v1.0.0",
        os_version="Raspberry Pi OS 11",
    )


@pytest.fixture
def coordinator_device() -> Device:
    """Create a coordinator device."""
    return Device(
        device_id="rpi-coordinator",
        hostname="ad-detection-coordinator",
        serial_number="10000000a3b2c1d0",
        mac_address="dc:a6:32:12:34:01",
        role=DeviceRole.COORDINATOR,
        status=DeviceStatus.ONLINE,
        model="Raspberry Pi 4 Model B",
        ip_address="192.168.1.101",
        tv_location="Coordinator",
        firmware_version="v1.0.0",
        os_version="Raspberry Pi OS 11",
    )


class TestHealthEndpoint:
    """Test suite for health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_endpoint_returns_200(self, test_registry: DeviceRegistry) -> None:
        """Test that health endpoint returns 200 OK."""
        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/api/v1/local/health")
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_health_endpoint_returns_status(
        self, test_registry: DeviceRegistry
    ) -> None:
        """Test that health endpoint returns status information."""
        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/api/v1/local/health")
            data = response.json()

            assert "status" in data
            assert data["status"] == "healthy"
            assert "device_count" in data


class TestDeviceRegistrationEndpoint:
    """Test suite for device registration endpoint."""

    @pytest.mark.asyncio
    async def test_register_device_returns_201(
        self, test_registry: DeviceRegistry, test_device: Device
    ) -> None:
        """Test that registering a device returns 201 Created."""
        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/local/devices/register",
                json=test_device.model_dump(mode="json"),
            )
            assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_register_device_stores_in_registry(
        self, test_registry: DeviceRegistry, test_device: Device
    ) -> None:
        """Test that registered device is stored in registry."""
        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            await client.post(
                "/api/v1/local/devices/register",
                json=test_device.model_dump(mode="json"),
            )

            # Verify in registry
            stored = await test_registry.get_device(test_device.device_id)
            assert stored is not None
            assert stored.device_id == test_device.device_id

    @pytest.mark.asyncio
    async def test_register_device_returns_device(
        self, test_registry: DeviceRegistry, test_device: Device
    ) -> None:
        """Test that registration returns the registered device."""
        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/local/devices/register",
                json=test_device.model_dump(mode="json"),
            )
            data = response.json()

            assert data["device_id"] == test_device.device_id
            assert data["role"] == test_device.role.value


class TestListDevicesEndpoint:
    """Test suite for listing devices endpoint."""

    @pytest.mark.asyncio
    async def test_list_devices_returns_200(
        self, test_registry: DeviceRegistry
    ) -> None:
        """Test that listing devices returns 200 OK."""
        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/api/v1/local/devices")
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_list_devices_returns_array(
        self, test_registry: DeviceRegistry
    ) -> None:
        """Test that listing devices returns an array."""
        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/api/v1/local/devices")
            data = response.json()

            assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_list_devices_returns_all_devices(
        self, test_registry: DeviceRegistry, test_device: Device
    ) -> None:
        """Test that all registered devices are returned."""
        app = create_app(registry=test_registry)

        # Register multiple devices
        for i in range(3):
            device = Device(
                device_id=f"rpi-{i:03d}",
                hostname=f"ad-detection-{i:03d}",
                serial_number=f"1000000{i}",
                mac_address=f"dc:a6:32:12:34:{i:02d}",
                role=DeviceRole.WORKER,
                status=DeviceStatus.ONLINE,
                model="Raspberry Pi 4 Model B",
                ip_address=f"192.168.1.{100+i}",
                tv_location=f"TV {i+1}",
                firmware_version="v1.0.0",
                os_version="Raspberry Pi OS 11",
            )
            await test_registry.register_device(device)

        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/api/v1/local/devices")
            data = response.json()

            assert len(data) == 3


class TestGetDeviceEndpoint:
    """Test suite for getting a specific device."""

    @pytest.mark.asyncio
    async def test_get_device_returns_200(
        self, test_registry: DeviceRegistry, test_device: Device
    ) -> None:
        """Test that getting an existing device returns 200 OK."""
        await test_registry.register_device(test_device)

        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get(f"/api/v1/local/devices/{test_device.device_id}")
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_device_returns_404_for_nonexistent(
        self, test_registry: DeviceRegistry
    ) -> None:
        """Test that getting a nonexistent device returns 404."""
        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/api/v1/local/devices/nonexistent")
            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_device_returns_correct_device(
        self, test_registry: DeviceRegistry, test_device: Device
    ) -> None:
        """Test that correct device data is returned."""
        await test_registry.register_device(test_device)

        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get(f"/api/v1/local/devices/{test_device.device_id}")
            data = response.json()

            assert data["device_id"] == test_device.device_id
            assert data["hostname"] == test_device.hostname


class TestUpdateDeviceHealthEndpoint:
    """Test suite for updating device health."""

    @pytest.mark.asyncio
    async def test_update_health_returns_200(
        self, test_registry: DeviceRegistry, test_device: Device
    ) -> None:
        """Test that updating health returns 200 OK."""
        await test_registry.register_device(test_device)

        health = DeviceHealth(
            cpu_usage_percent=45.0,
            memory_used_mb=1200.0,
            memory_total_mb=4096.0,
            temperature_celsius=52.0,
            uptime_seconds=3600,
            disk_used_mb=5000.0,
            disk_total_mb=32000.0,
        )

        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/local/devices/{test_device.device_id}/health",
                json=health.model_dump(mode="json"),
            )
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_update_health_stores_in_registry(
        self, test_registry: DeviceRegistry, test_device: Device
    ) -> None:
        """Test that health update is stored in registry."""
        await test_registry.register_device(test_device)

        health = DeviceHealth(
            cpu_usage_percent=45.0,
            memory_used_mb=1200.0,
            memory_total_mb=4096.0,
            temperature_celsius=52.0,
            uptime_seconds=3600,
            disk_used_mb=5000.0,
            disk_total_mb=32000.0,
        )

        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            await client.post(
                f"/api/v1/local/devices/{test_device.device_id}/health",
                json=health.model_dump(mode="json"),
            )

            # Verify in registry
            device = await test_registry.get_device(test_device.device_id)
            assert device.health is not None
            assert device.health.cpu_usage_percent == 45.0


class TestElectionEndpoints:
    """Test suite for election-related endpoints."""

    @pytest.mark.asyncio
    async def test_vote_endpoint_exists(self, test_registry: DeviceRegistry) -> None:
        """Test that vote endpoint is available."""
        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            vote_request = {
                "candidate_id": "rpi-002",
                "term": 1,
                "last_log_index": 0,
                "last_log_term": 0,
            }
            response = await client.post("/api/v1/local/election/vote", json=vote_request)
            # Should not be 404
            assert response.status_code != 404

    @pytest.mark.asyncio
    async def test_heartbeat_endpoint_exists(
        self, test_registry: DeviceRegistry
    ) -> None:
        """Test that heartbeat endpoint is available."""
        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            heartbeat = {
                "leader_id": "rpi-001",
                "term": 1,
                "timestamp": datetime.utcnow().isoformat(),
            }
            response = await client.post(
                "/api/v1/local/election/heartbeat", json=heartbeat
            )
            # Should not be 404
            assert response.status_code != 404


class TestChannelControlEndpoint:
    """Test suite for TV channel control."""

    @pytest.mark.asyncio
    async def test_change_channel_endpoint_exists(
        self, test_registry: DeviceRegistry, test_device: Device
    ) -> None:
        """Test that channel change endpoint exists."""
        await test_registry.register_device(test_device)

        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            request = {"device_id": test_device.device_id, "channel": "ESPN"}
            response = await client.post("/api/v1/local/control/channel", json=request)
            # Should not be 404
            assert response.status_code != 404


class TestStatusEndpoint:
    """Test suite for coordinator status endpoint."""

    @pytest.mark.asyncio
    async def test_status_endpoint_returns_200(
        self, test_registry: DeviceRegistry
    ) -> None:
        """Test that status endpoint returns 200 OK."""
        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/api/v1/local/status")
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_status_includes_device_count(
        self, test_registry: DeviceRegistry, test_device: Device
    ) -> None:
        """Test that status includes device count."""
        await test_registry.register_device(test_device)

        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/api/v1/local/status")
            data = response.json()

            assert "device_count" in data
            assert data["device_count"] >= 1

    @pytest.mark.asyncio
    async def test_status_includes_coordinator_info(
        self, test_registry: DeviceRegistry, coordinator_device: Device
    ) -> None:
        """Test that status includes coordinator information."""
        await test_registry.register_device(coordinator_device)

        app = create_app(registry=test_registry)
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/api/v1/local/status")
            data = response.json()

            assert "coordinator" in data
            assert data["coordinator"] is not None
            assert data["coordinator"]["device_id"] == coordinator_device.device_id
