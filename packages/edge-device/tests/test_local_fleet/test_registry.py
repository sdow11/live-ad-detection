"""Tests for device registry (TDD)."""

import os
import tempfile
from datetime import datetime

import pytest

from ad_detection_common.models.device import (
    Device,
    DeviceCapability,
    DeviceHealth,
    DeviceRole,
    DeviceStatus,
)
from ad_detection_edge.local_fleet.registry import DeviceRegistry


@pytest.fixture
async def temp_db():
    """Create a temporary database for testing."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    yield path
    # Cleanup
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def sample_device() -> Device:
    """Create a sample device for testing."""
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
def sample_health() -> DeviceHealth:
    """Create sample device health metrics."""
    return DeviceHealth(
        cpu_usage_percent=45.0,
        memory_used_mb=1200.0,
        memory_total_mb=4096.0,
        temperature_celsius=52.0,
        uptime_seconds=3600,
        disk_used_mb=5000.0,
        disk_total_mb=32000.0,
    )


class TestDeviceRegistry:
    """Test suite for DeviceRegistry."""

    @pytest.mark.asyncio
    async def test_registry_initializes(self, temp_db: str) -> None:
        """Test that registry initializes successfully."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        assert registry.is_initialized is True

        await registry.close()

    @pytest.mark.asyncio
    async def test_registry_creates_database_file(self, temp_db: str) -> None:
        """Test that registry creates database file."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        assert os.path.exists(temp_db)

        await registry.close()

    @pytest.mark.asyncio
    async def test_register_device_stores_device(
        self, temp_db: str, sample_device: Device
    ) -> None:
        """Test that registering a device stores it in the database."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        await registry.register_device(sample_device)

        # Retrieve device
        retrieved = await registry.get_device(sample_device.device_id)

        assert retrieved is not None
        assert retrieved.device_id == sample_device.device_id
        assert retrieved.hostname == sample_device.hostname
        assert retrieved.role == sample_device.role

        await registry.close()

    @pytest.mark.asyncio
    async def test_register_device_updates_existing(
        self, temp_db: str, sample_device: Device
    ) -> None:
        """Test that registering an existing device updates it."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        # Register first time
        await registry.register_device(sample_device)

        # Update device
        sample_device.role = DeviceRole.COORDINATOR
        sample_device.ip_address = "192.168.1.200"

        # Register again (update)
        await registry.register_device(sample_device)

        # Retrieve
        retrieved = await registry.get_device(sample_device.device_id)

        assert retrieved.role == DeviceRole.COORDINATOR
        assert retrieved.ip_address == "192.168.1.200"

        await registry.close()

    @pytest.mark.asyncio
    async def test_get_device_returns_none_for_nonexistent(self, temp_db: str) -> None:
        """Test that getting a nonexistent device returns None."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        device = await registry.get_device("nonexistent")

        assert device is None

        await registry.close()

    @pytest.mark.asyncio
    async def test_get_all_devices_returns_all(
        self, temp_db: str, sample_device: Device
    ) -> None:
        """Test that get_all_devices returns all registered devices."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        # Register multiple devices
        devices = []
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
            devices.append(device)
            await registry.register_device(device)

        # Retrieve all
        all_devices = await registry.get_all_devices()

        assert len(all_devices) == 3
        assert all(d.device_id in [dev.device_id for dev in devices] for d in all_devices)

        await registry.close()

    @pytest.mark.asyncio
    async def test_get_devices_by_role(
        self, temp_db: str, sample_device: Device
    ) -> None:
        """Test filtering devices by role."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        # Register coordinator
        coordinator = Device(
            device_id="rpi-coordinator",
            hostname="ad-detection-coordinator",
            serial_number="10000001",
            mac_address="dc:a6:32:12:34:01",
            role=DeviceRole.COORDINATOR,
            status=DeviceStatus.ONLINE,
            model="Raspberry Pi 4 Model B",
            ip_address="192.168.1.101",
            tv_location="Coordinator",
            firmware_version="v1.0.0",
            os_version="Raspberry Pi OS 11",
        )
        await registry.register_device(coordinator)

        # Register workers
        worker1 = Device(
            device_id="rpi-worker-1",
            hostname="ad-detection-worker-1",
            serial_number="10000002",
            mac_address="dc:a6:32:12:34:02",
            role=DeviceRole.WORKER,
            status=DeviceStatus.ONLINE,
            model="Raspberry Pi 4 Model B",
            ip_address="192.168.1.102",
            tv_location="Worker 1",
            firmware_version="v1.0.0",
            os_version="Raspberry Pi OS 11",
        )
        await registry.register_device(worker1)

        # Get coordinators
        coordinators = await registry.get_devices_by_role(DeviceRole.COORDINATOR)
        assert len(coordinators) == 1
        assert coordinators[0].device_id == "rpi-coordinator"

        # Get workers
        workers = await registry.get_devices_by_role(DeviceRole.WORKER)
        assert len(workers) == 1
        assert workers[0].device_id == "rpi-worker-1"

        await registry.close()

    @pytest.mark.asyncio
    async def test_get_online_devices(self, temp_db: str) -> None:
        """Test filtering devices by online status."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        # Register online device
        online = Device(
            device_id="rpi-online",
            hostname="ad-detection-online",
            serial_number="10000001",
            mac_address="dc:a6:32:12:34:01",
            role=DeviceRole.WORKER,
            status=DeviceStatus.ONLINE,
            model="Raspberry Pi 4 Model B",
            ip_address="192.168.1.101",
            tv_location="Online",
            firmware_version="v1.0.0",
            os_version="Raspberry Pi OS 11",
        )
        await registry.register_device(online)

        # Register offline device
        offline = Device(
            device_id="rpi-offline",
            hostname="ad-detection-offline",
            serial_number="10000002",
            mac_address="dc:a6:32:12:34:02",
            role=DeviceRole.WORKER,
            status=DeviceStatus.OFFLINE,
            model="Raspberry Pi 4 Model B",
            ip_address="192.168.1.102",
            tv_location="Offline",
            firmware_version="v1.0.0",
            os_version="Raspberry Pi OS 11",
        )
        await registry.register_device(offline)

        # Get online devices
        online_devices = await registry.get_online_devices()

        assert len(online_devices) == 1
        assert online_devices[0].device_id == "rpi-online"

        await registry.close()

    @pytest.mark.asyncio
    async def test_update_device_health(
        self, temp_db: str, sample_device: Device, sample_health: DeviceHealth
    ) -> None:
        """Test updating device health metrics."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        # Register device
        await registry.register_device(sample_device)

        # Update health
        await registry.update_device_health(sample_device.device_id, sample_health)

        # Retrieve device
        device = await registry.get_device(sample_device.device_id)

        assert device.health is not None
        assert device.health.cpu_usage_percent == sample_health.cpu_usage_percent
        assert device.health.temperature_celsius == sample_health.temperature_celsius

        await registry.close()

    @pytest.mark.asyncio
    async def test_update_device_status(
        self, temp_db: str, sample_device: Device
    ) -> None:
        """Test updating device status."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        # Register device
        await registry.register_device(sample_device)

        # Update status
        await registry.update_device_status(sample_device.device_id, DeviceStatus.OFFLINE)

        # Retrieve device
        device = await registry.get_device(sample_device.device_id)

        assert device.status == DeviceStatus.OFFLINE

        await registry.close()

    @pytest.mark.asyncio
    async def test_remove_device(self, temp_db: str, sample_device: Device) -> None:
        """Test removing a device from registry."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        # Register device
        await registry.register_device(sample_device)

        # Verify it exists
        device = await registry.get_device(sample_device.device_id)
        assert device is not None

        # Remove device
        await registry.remove_device(sample_device.device_id)

        # Verify it's gone
        device = await registry.get_device(sample_device.device_id)
        assert device is None

        await registry.close()

    @pytest.mark.asyncio
    async def test_get_coordinator_returns_coordinator(
        self, temp_db: str
    ) -> None:
        """Test getting the coordinator device."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        # Register coordinator
        coordinator = Device(
            device_id="rpi-coordinator",
            hostname="ad-detection-coordinator",
            serial_number="10000001",
            mac_address="dc:a6:32:12:34:01",
            role=DeviceRole.COORDINATOR,
            status=DeviceStatus.ONLINE,
            model="Raspberry Pi 4 Model B",
            ip_address="192.168.1.101",
            tv_location="Coordinator",
            firmware_version="v1.0.0",
            os_version="Raspberry Pi OS 11",
        )
        await registry.register_device(coordinator)

        # Get coordinator
        coord = await registry.get_coordinator()

        assert coord is not None
        assert coord.device_id == "rpi-coordinator"
        assert coord.role == DeviceRole.COORDINATOR

        await registry.close()

    @pytest.mark.asyncio
    async def test_get_coordinator_returns_none_when_no_coordinator(
        self, temp_db: str, sample_device: Device
    ) -> None:
        """Test that get_coordinator returns None when no coordinator exists."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        # Register only workers
        await registry.register_device(sample_device)

        # Get coordinator
        coord = await registry.get_coordinator()

        assert coord is None

        await registry.close()

    @pytest.mark.asyncio
    async def test_device_count(self, temp_db: str) -> None:
        """Test getting device count."""
        registry = DeviceRegistry(db_path=temp_db)
        await registry.initialize()

        # Initially zero
        count = await registry.get_device_count()
        assert count == 0

        # Register devices
        for i in range(5):
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
            await registry.register_device(device)

        # Check count
        count = await registry.get_device_count()
        assert count == 5

        await registry.close()
