"""Tests for cloud fleet management API.

This module tests all REST endpoints for the remote fleet management system.
"""

import pytest
from datetime import datetime, timedelta
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from cloud_api.main import app, get_db
from cloud_api.models import Base


# Test database setup
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def db_engine():
    """Create test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    """Create test database session."""
    async_session = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        yield session


@pytest.fixture
async def client(db_session):
    """Create test HTTP client with database override."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


class TestOrganizations:
    """Test organization management endpoints."""

    @pytest.mark.asyncio
    async def test_create_organization(self, client: AsyncClient):
        """Test creating a new organization."""
        response = await client.post(
            "/api/v1/organizations",
            json={
                "name": "Test Restaurant Chain",
                "slug": "test-chain",
                "contact_email": "admin@testchain.com",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Restaurant Chain"
        assert data["slug"] == "test-chain"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_list_organizations(self, client: AsyncClient):
        """Test listing organizations."""
        # Create test organizations
        await client.post(
            "/api/v1/organizations",
            json={"name": "Chain A", "slug": "chain-a"},
        )
        await client.post(
            "/api/v1/organizations",
            json={"name": "Chain B", "slug": "chain-b"},
        )

        response = await client.get("/api/v1/organizations")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Chain A"
        assert data[1]["name"] == "Chain B"

    @pytest.mark.asyncio
    async def test_get_organization(self, client: AsyncClient):
        """Test getting a specific organization."""
        # Create organization
        create_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Test Org", "slug": "test-org"},
        )
        org_id = create_response.json()["id"]

        # Get organization
        response = await client.get(f"/api/v1/organizations/{org_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == org_id
        assert data["name"] == "Test Org"


class TestLocations:
    """Test location management endpoints."""

    @pytest.mark.asyncio
    async def test_create_location(self, client: AsyncClient):
        """Test creating a new location."""
        # Create organization first
        org_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Test Chain", "slug": "test-chain"},
        )
        org_id = org_response.json()["id"]

        # Create location
        response = await client.post(
            "/api/v1/locations",
            json={
                "organization_id": org_id,
                "name": "Downtown Bar",
                "address": "123 Main St",
                "city": "San Francisco",
                "state": "CA",
                "country": "USA",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Downtown Bar"
        assert data["organization_id"] == org_id
        assert "id" in data

    @pytest.mark.asyncio
    async def test_list_locations_by_organization(self, client: AsyncClient):
        """Test listing locations filtered by organization."""
        # Create organizations
        org1_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Chain 1", "slug": "chain-1"},
        )
        org1_id = org1_response.json()["id"]

        org2_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Chain 2", "slug": "chain-2"},
        )
        org2_id = org2_response.json()["id"]

        # Create locations
        await client.post(
            "/api/v1/locations",
            json={"organization_id": org1_id, "name": "Location 1A"},
        )
        await client.post(
            "/api/v1/locations",
            json={"organization_id": org1_id, "name": "Location 1B"},
        )
        await client.post(
            "/api/v1/locations",
            json={"organization_id": org2_id, "name": "Location 2A"},
        )

        # List locations for org 1
        response = await client.get(
            f"/api/v1/locations?organization_id={org1_id}"
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert all(loc["organization_id"] == org1_id for loc in data)


class TestDevices:
    """Test device management endpoints."""

    @pytest.mark.asyncio
    async def test_register_device(self, client: AsyncClient):
        """Test device registration."""
        # Create organization and location
        org_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Test Org", "slug": "test-org"},
        )
        org_id = org_response.json()["id"]

        loc_response = await client.post(
            "/api/v1/locations",
            json={"organization_id": org_id, "name": "Test Location"},
        )
        loc_id = loc_response.json()["id"]

        # Register device
        response = await client.post(
            "/api/v1/devices/register",
            json={
                "device_id": "rpi-test-001",
                "location_id": loc_id,
                "role": "coordinator",
                "hardware_model": "Raspberry Pi 5",
                "firmware_version": "1.0.0",
                "capabilities": ["ad_detection", "tv_control"],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["device_id"] == "rpi-test-001"
        assert data["location_id"] == loc_id
        assert data["status"] == "online"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_device_heartbeat(self, client: AsyncClient):
        """Test device heartbeat updates."""
        # Create and register device
        org_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Test Org", "slug": "test-org"},
        )
        loc_response = await client.post(
            "/api/v1/locations",
            json={
                "organization_id": org_response.json()["id"],
                "name": "Test Location",
            },
        )

        await client.post(
            "/api/v1/devices/register",
            json={
                "device_id": "rpi-test-002",
                "location_id": loc_response.json()["id"],
                "role": "worker",
            },
        )

        # Send heartbeat
        response = await client.post(
            "/api/v1/devices/heartbeat",
            json={
                "device_id": "rpi-test-002",
                "status": "online",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "last_heartbeat" in data

    @pytest.mark.asyncio
    async def test_list_devices_by_status(self, client: AsyncClient):
        """Test listing devices filtered by status."""
        # Create organization and location
        org_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Test Org", "slug": "test-org"},
        )
        loc_response = await client.post(
            "/api/v1/locations",
            json={
                "organization_id": org_response.json()["id"],
                "name": "Test Location",
            },
        )
        loc_id = loc_response.json()["id"]

        # Register devices with different statuses
        await client.post(
            "/api/v1/devices/register",
            json={"device_id": "rpi-online-1", "location_id": loc_id},
        )

        await client.post(
            "/api/v1/devices/register",
            json={"device_id": "rpi-online-2", "location_id": loc_id},
        )

        # List online devices
        response = await client.get("/api/v1/devices?status=online")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert all(dev["status"] == "online" for dev in data)


class TestHealthAndTelemetry:
    """Test health monitoring and telemetry endpoints."""

    @pytest.mark.asyncio
    async def test_submit_health_data(self, client: AsyncClient):
        """Test submitting device health data."""
        # Create and register device
        org_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Test Org", "slug": "test-org"},
        )
        loc_response = await client.post(
            "/api/v1/locations",
            json={
                "organization_id": org_response.json()["id"],
                "name": "Test Location",
            },
        )

        await client.post(
            "/api/v1/devices/register",
            json={
                "device_id": "rpi-health-001",
                "location_id": loc_response.json()["id"],
            },
        )

        # Submit health data
        response = await client.post(
            "/api/v1/health",
            json={
                "device_id": "rpi-health-001",
                "cpu_usage_percent": 45.2,
                "memory_used_mb": 2048.0,
                "memory_total_mb": 8192.0,
                "temperature_celsius": 55.3,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["device_id"] == "rpi-health-001"
        assert data["cpu_usage_percent"] == 45.2

    @pytest.mark.asyncio
    async def test_get_device_health_history(self, client: AsyncClient):
        """Test retrieving device health history."""
        # Create and register device
        org_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Test Org", "slug": "test-org"},
        )
        loc_response = await client.post(
            "/api/v1/locations",
            json={
                "organization_id": org_response.json()["id"],
                "name": "Test Location",
            },
        )

        device_response = await client.post(
            "/api/v1/devices/register",
            json={
                "device_id": "rpi-health-002",
                "location_id": loc_response.json()["id"],
            },
        )
        device_id = device_response.json()["id"]

        # Submit multiple health records
        for i in range(3):
            await client.post(
                "/api/v1/health",
                json={
                    "device_id": "rpi-health-002",
                    "cpu_usage_percent": 40.0 + i * 5,
                    "memory_used_mb": 2000.0,
                    "memory_total_mb": 8192.0,
                    "temperature_celsius": 50.0,
                },
            )

        # Get health history
        response = await client.get(f"/api/v1/devices/{device_id}/health")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

    @pytest.mark.asyncio
    async def test_submit_telemetry(self, client: AsyncClient):
        """Test submitting telemetry data."""
        # Create and register device
        org_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Test Org", "slug": "test-org"},
        )
        loc_response = await client.post(
            "/api/v1/locations",
            json={
                "organization_id": org_response.json()["id"],
                "name": "Test Location",
            },
        )

        await client.post(
            "/api/v1/devices/register",
            json={
                "device_id": "rpi-telemetry-001",
                "location_id": loc_response.json()["id"],
            },
        )

        # Submit telemetry
        now = datetime.utcnow()
        response = await client.post(
            "/api/v1/telemetry",
            json={
                "device_id": "rpi-telemetry-001",
                "total_ad_breaks": 42,
                "total_ad_duration_seconds": 1260,
                "average_fps": 30.1,
                "period_start": now.isoformat(),
                "period_end": (now + timedelta(hours=1)).isoformat(),
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["device_id"] == "rpi-telemetry-001"
        assert data["total_ad_breaks"] == 42


class TestFirmware:
    """Test firmware management endpoints."""

    @pytest.mark.asyncio
    async def test_create_firmware_version(self, client: AsyncClient):
        """Test creating a firmware version."""
        response = await client.post(
            "/api/v1/firmware",
            json={
                "version": "1.0.0",
                "release_notes": "Initial release",
                "download_url": "https://firmware.example.com/v1.0.0.tar.gz",
                "checksum": "abc123def456",
                "is_stable": True,
                "min_hardware_version": "rpi5",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["version"] == "1.0.0"
        assert data["is_stable"] is True

    @pytest.mark.asyncio
    async def test_list_firmware_versions(self, client: AsyncClient):
        """Test listing firmware versions."""
        # Create multiple versions
        await client.post(
            "/api/v1/firmware",
            json={
                "version": "1.0.0",
                "download_url": "https://example.com/v1.0.0.tar.gz",
                "checksum": "abc123",
                "is_stable": True,
            },
        )
        await client.post(
            "/api/v1/firmware",
            json={
                "version": "1.1.0-beta",
                "download_url": "https://example.com/v1.1.0.tar.gz",
                "checksum": "def456",
                "is_stable": False,
            },
        )

        response = await client.get("/api/v1/firmware")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    @pytest.mark.asyncio
    async def test_get_latest_stable_firmware(self, client: AsyncClient):
        """Test getting latest stable firmware."""
        # Create versions
        await client.post(
            "/api/v1/firmware",
            json={
                "version": "1.0.0",
                "download_url": "https://example.com/v1.0.0.tar.gz",
                "checksum": "abc",
                "is_stable": True,
            },
        )
        await client.post(
            "/api/v1/firmware",
            json={
                "version": "2.0.0-beta",
                "download_url": "https://example.com/v2.0.0.tar.gz",
                "checksum": "def",
                "is_stable": False,
            },
        )

        response = await client.get("/api/v1/firmware/latest")

        assert response.status_code == 200
        data = response.json()
        assert data["version"] == "1.0.0"
        assert data["is_stable"] is True


class TestAnalytics:
    """Test analytics endpoints."""

    @pytest.mark.asyncio
    async def test_organization_analytics(self, client: AsyncClient):
        """Test getting organization analytics."""
        # Create organization with locations and devices
        org_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Analytics Test", "slug": "analytics-test"},
        )
        org_id = org_response.json()["id"]

        # Create 2 locations
        loc1_response = await client.post(
            "/api/v1/locations",
            json={"organization_id": org_id, "name": "Location 1"},
        )
        loc2_response = await client.post(
            "/api/v1/locations",
            json={"organization_id": org_id, "name": "Location 2"},
        )

        loc1_id = loc1_response.json()["id"]
        loc2_id = loc2_response.json()["id"]

        # Create 3 devices
        await client.post(
            "/api/v1/devices/register",
            json={"device_id": "rpi-001", "location_id": loc1_id},
        )
        await client.post(
            "/api/v1/devices/register",
            json={"device_id": "rpi-002", "location_id": loc1_id},
        )
        await client.post(
            "/api/v1/devices/register",
            json={"device_id": "rpi-003", "location_id": loc2_id},
        )

        # Get analytics
        response = await client.get(f"/api/v1/analytics/organization/{org_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["total_locations"] == 2
        assert data["total_devices"] == 3
        assert data["devices_online"] == 3
        assert data["devices_offline"] == 0


class TestEdgeToCloudIntegration:
    """Test complete edge-to-cloud workflow."""

    @pytest.mark.asyncio
    async def test_full_device_lifecycle(self, client: AsyncClient):
        """Test complete device lifecycle: register → heartbeat → health → telemetry."""
        # Setup organization and location
        org_response = await client.post(
            "/api/v1/organizations",
            json={"name": "Integration Test", "slug": "integration-test"},
        )
        loc_response = await client.post(
            "/api/v1/locations",
            json={
                "organization_id": org_response.json()["id"],
                "name": "Test Bar",
                "city": "San Francisco",
            },
        )
        loc_id = loc_response.json()["id"]

        # 1. Device registers on startup
        register_response = await client.post(
            "/api/v1/devices/register",
            json={
                "device_id": "rpi-integration-001",
                "location_id": loc_id,
                "role": "coordinator",
                "firmware_version": "1.0.0",
            },
        )
        assert register_response.status_code == 200
        device_id = register_response.json()["id"]

        # 2. Device sends heartbeat every 30 seconds
        heartbeat_response = await client.post(
            "/api/v1/devices/heartbeat",
            json={"device_id": "rpi-integration-001", "status": "online"},
        )
        assert heartbeat_response.status_code == 200

        # 3. Device reports health every 5 minutes
        health_response = await client.post(
            "/api/v1/health",
            json={
                "device_id": "rpi-integration-001",
                "cpu_usage_percent": 35.5,
                "memory_used_mb": 1800.0,
                "memory_total_mb": 8192.0,
                "temperature_celsius": 52.0,
            },
        )
        assert health_response.status_code == 200

        # 4. Device submits telemetry every hour
        now = datetime.utcnow()
        telemetry_response = await client.post(
            "/api/v1/telemetry",
            json={
                "device_id": "rpi-integration-001",
                "total_ad_breaks": 15,
                "total_ad_duration_seconds": 450,
                "average_fps": 29.8,
                "period_start": now.isoformat(),
                "period_end": (now + timedelta(hours=1)).isoformat(),
            },
        )
        assert telemetry_response.status_code == 200

        # 5. Verify device appears in listings
        devices_response = await client.get("/api/v1/devices")
        devices = devices_response.json()
        assert any(d["device_id"] == "rpi-integration-001" for d in devices)

        # 6. Verify health history
        health_history_response = await client.get(
            f"/api/v1/devices/{device_id}/health"
        )
        health_history = health_history_response.json()
        assert len(health_history) == 1
        assert health_history[0]["cpu_usage_percent"] == 35.5
