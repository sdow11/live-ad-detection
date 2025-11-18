"""Tests for Device model (TDD)."""

from datetime import datetime, timedelta

import pytest
from pydantic import ValidationError

from ad_detection_common.models.device import (
    Device,
    DeviceCapability,
    DeviceHealth,
    DeviceRole,
    DeviceStatus,
)


class TestDeviceHealth:
    """Test suite for DeviceHealth model."""

    def test_create_device_health(self) -> None:
        """Test creating a valid DeviceHealth instance."""
        health = DeviceHealth(
            cpu_usage_percent=45.5,
            memory_used_mb=1200.0,
            memory_total_mb=4096.0,
            temperature_celsius=52.3,
            uptime_seconds=3600,
            disk_used_mb=5000.0,
            disk_total_mb=32000.0,
        )

        assert health.cpu_usage_percent == 45.5
        assert health.memory_used_mb == 1200.0
        assert health.temperature_celsius == 52.3

    def test_memory_usage_percent_calculation(self) -> None:
        """Test memory usage percentage is calculated correctly."""
        health = DeviceHealth(
            cpu_usage_percent=50.0,
            memory_used_mb=2048.0,
            memory_total_mb=4096.0,
            temperature_celsius=50.0,
            uptime_seconds=3600,
            disk_used_mb=16000.0,
            disk_total_mb=32000.0,
        )

        assert health.memory_usage_percent == 50.0

    def test_disk_usage_percent_calculation(self) -> None:
        """Test disk usage percentage is calculated correctly."""
        health = DeviceHealth(
            cpu_usage_percent=50.0,
            memory_used_mb=2048.0,
            memory_total_mb=4096.0,
            temperature_celsius=50.0,
            uptime_seconds=3600,
            disk_used_mb=24000.0,
            disk_total_mb=32000.0,
        )

        assert health.disk_usage_percent == 75.0

    def test_is_healthy_returns_true_when_within_limits(self) -> None:
        """Test is_healthy returns True when all metrics are within limits."""
        health = DeviceHealth(
            cpu_usage_percent=50.0,
            memory_used_mb=2048.0,
            memory_total_mb=4096.0,  # 50%
            temperature_celsius=60.0,
            uptime_seconds=3600,
            disk_used_mb=16000.0,
            disk_total_mb=32000.0,  # 50%
        )

        assert health.is_healthy() is True

    def test_is_healthy_returns_false_when_cpu_high(self) -> None:
        """Test is_healthy returns False when CPU usage is too high."""
        health = DeviceHealth(
            cpu_usage_percent=85.0,  # Over 80%
            memory_used_mb=2048.0,
            memory_total_mb=4096.0,
            temperature_celsius=60.0,
            uptime_seconds=3600,
            disk_used_mb=16000.0,
            disk_total_mb=32000.0,
        )

        assert health.is_healthy(max_cpu=80.0) is False

    def test_is_healthy_returns_false_when_temp_high(self) -> None:
        """Test is_healthy returns False when temperature is too high."""
        health = DeviceHealth(
            cpu_usage_percent=50.0,
            memory_used_mb=2048.0,
            memory_total_mb=4096.0,
            temperature_celsius=85.0,  # Over 80°C
            uptime_seconds=3600,
            disk_used_mb=16000.0,
            disk_total_mb=32000.0,
        )

        assert health.is_healthy(max_temp=80.0) is False

    def test_cpu_usage_must_be_between_0_and_100(self) -> None:
        """Test CPU usage validation."""
        with pytest.raises(ValidationError):
            DeviceHealth(
                cpu_usage_percent=150.0,  # Invalid
                memory_used_mb=2048.0,
                memory_total_mb=4096.0,
                temperature_celsius=50.0,
                uptime_seconds=3600,
                disk_used_mb=16000.0,
                disk_total_mb=32000.0,
            )


class TestDevice:
    """Test suite for Device model."""

    def test_create_valid_device(self) -> None:
        """Test creating a valid Device instance."""
        device = Device(
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

        assert device.device_id == "rpi-001"
        assert device.role == DeviceRole.WORKER
        assert device.status == DeviceStatus.ONLINE

    def test_device_with_capabilities(self) -> None:
        """Test device with hardware capabilities."""
        device = Device(
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

        assert len(device.capabilities) == 2
        assert DeviceCapability.HDMI_CAPTURE in device.capabilities
        assert DeviceCapability.IR_BLASTER in device.capabilities

    def test_invalid_mac_address_raises_error(self) -> None:
        """Test that invalid MAC address raises ValidationError."""
        with pytest.raises(ValidationError):
            Device(
                device_id="rpi-001",
                hostname="ad-detection-001",
                serial_number="10000000a3b2c1d0",
                mac_address="invalid-mac",  # Invalid format
                role=DeviceRole.WORKER,
                status=DeviceStatus.ONLINE,
                model="Raspberry Pi 4 Model B",
                ip_address="192.168.1.100",
                tv_location="Main Bar",
                firmware_version="v1.0.0",
                os_version="Raspberry Pi OS 11",
            )

    def test_invalid_ip_address_raises_error(self) -> None:
        """Test that invalid IP address raises ValidationError."""
        with pytest.raises(ValidationError):
            Device(
                device_id="rpi-001",
                hostname="ad-detection-001",
                serial_number="10000000a3b2c1d0",
                mac_address="dc:a6:32:12:34:56",
                role=DeviceRole.WORKER,
                status=DeviceStatus.ONLINE,
                model="Raspberry Pi 4 Model B",
                ip_address="999.999.999.999",  # Invalid IP
                tv_location="Main Bar",
                firmware_version="v1.0.0",
                os_version="Raspberry Pi OS 11",
            )

    def test_invalid_firmware_version_format_raises_error(self) -> None:
        """Test that invalid firmware version format raises ValidationError."""
        with pytest.raises(ValidationError):
            Device(
                device_id="rpi-001",
                hostname="ad-detection-001",
                serial_number="10000000a3b2c1d0",
                mac_address="dc:a6:32:12:34:56",
                role=DeviceRole.WORKER,
                status=DeviceStatus.ONLINE,
                model="Raspberry Pi 4 Model B",
                ip_address="192.168.1.100",
                tv_location="Main Bar",
                firmware_version="1.0.0",  # Missing 'v' prefix
                os_version="Raspberry Pi OS 11",
            )

    def test_is_online_returns_true_when_recently_seen(self) -> None:
        """Test is_online returns True when device was recently seen."""
        device = Device(
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
            last_seen=datetime.utcnow(),
        )

        assert device.is_online() is True

    def test_is_online_returns_false_when_not_seen_recently(self) -> None:
        """Test is_online returns False when device hasn't been seen recently."""
        device = Device(
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
            last_seen=datetime.utcnow() - timedelta(minutes=2),  # 2 minutes ago
        )

        assert device.is_online(timeout_seconds=60) is False

    def test_is_online_returns_false_when_status_offline(self) -> None:
        """Test is_online returns False when status is explicitly offline."""
        device = Device(
            device_id="rpi-001",
            hostname="ad-detection-001",
            serial_number="10000000a3b2c1d0",
            mac_address="dc:a6:32:12:34:56",
            role=DeviceRole.WORKER,
            status=DeviceStatus.OFFLINE,
            model="Raspberry Pi 4 Model B",
            ip_address="192.168.1.100",
            tv_location="Main Bar",
            firmware_version="v1.0.0",
            os_version="Raspberry Pi OS 11",
            last_seen=datetime.utcnow(),
        )

        assert device.is_online() is False

    def test_update_health_updates_last_seen(self) -> None:
        """Test that updating health updates last_seen timestamp."""
        device = Device(
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

        original_last_seen = device.last_seen

        health = DeviceHealth(
            cpu_usage_percent=50.0,
            memory_used_mb=2048.0,
            memory_total_mb=4096.0,
            temperature_celsius=50.0,
            uptime_seconds=3600,
            disk_used_mb=16000.0,
            disk_total_mb=32000.0,
        )

        device.update_health(health)

        assert device.health == health
        assert device.last_seen > original_last_seen

    def test_update_health_sets_status_to_error_when_unhealthy(self) -> None:
        """Test that updating with unhealthy metrics sets status to ERROR."""
        device = Device(
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

        unhealthy = DeviceHealth(
            cpu_usage_percent=95.0,  # Too high
            memory_used_mb=2048.0,
            memory_total_mb=4096.0,
            temperature_celsius=50.0,
            uptime_seconds=3600,
            disk_used_mb=16000.0,
            disk_total_mb=32000.0,
        )

        device.update_health(unhealthy)

        assert device.status == DeviceStatus.ERROR

    def test_mark_online_updates_status_and_timestamp(self) -> None:
        """Test mark_online updates status and last_seen."""
        device = Device(
            device_id="rpi-001",
            hostname="ad-detection-001",
            serial_number="10000000a3b2c1d0",
            mac_address="dc:a6:32:12:34:56",
            role=DeviceRole.WORKER,
            status=DeviceStatus.OFFLINE,
            model="Raspberry Pi 4 Model B",
            ip_address="192.168.1.100",
            tv_location="Main Bar",
            firmware_version="v1.0.0",
            os_version="Raspberry Pi OS 11",
        )

        device.mark_online()

        assert device.status == DeviceStatus.ONLINE
        assert (datetime.utcnow() - device.last_seen).total_seconds() < 1

    def test_mark_offline_updates_status(self) -> None:
        """Test mark_offline updates status."""
        device = Device(
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

        device.mark_offline()

        assert device.status == DeviceStatus.OFFLINE

    def test_has_capability_returns_true_when_capability_present(self) -> None:
        """Test has_capability returns True when device has capability."""
        device = Device(
            device_id="rpi-001",
            hostname="ad-detection-001",
            serial_number="10000000a3b2c1d0",
            mac_address="dc:a6:32:12:34:56",
            role=DeviceRole.WORKER,
            status=DeviceStatus.ONLINE,
            model="Raspberry Pi 4 Model B",
            capabilities=[DeviceCapability.IR_BLASTER],
            ip_address="192.168.1.100",
            tv_location="Main Bar",
            firmware_version="v1.0.0",
            os_version="Raspberry Pi OS 11",
        )

        assert device.has_capability(DeviceCapability.IR_BLASTER) is True

    def test_has_capability_returns_false_when_capability_absent(self) -> None:
        """Test has_capability returns False when device lacks capability."""
        device = Device(
            device_id="rpi-001",
            hostname="ad-detection-001",
            serial_number="10000000a3b2c1d0",
            mac_address="dc:a6:32:12:34:56",
            role=DeviceRole.WORKER,
            status=DeviceStatus.ONLINE,
            model="Raspberry Pi 4 Model B",
            capabilities=[DeviceCapability.IR_BLASTER],
            ip_address="192.168.1.100",
            tv_location="Main Bar",
            firmware_version="v1.0.0",
            os_version="Raspberry Pi OS 11",
        )

        assert device.has_capability(DeviceCapability.AI_HAT) is False
