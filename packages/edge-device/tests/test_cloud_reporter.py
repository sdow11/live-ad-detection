"""Tests for cloud reporter module."""

import pytest
import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from cloud_reporter import CloudReporter, CloudReporterConfig, TelemetryAggregator
from ad_detection_common.models.device import DeviceRole


class TestTelemetryAggregator:
    """Test telemetry aggregation."""

    def test_create_aggregator(self):
        """Test creating telemetry aggregator."""
        aggregator = TelemetryAggregator()

        period = aggregator.get_current_period()
        assert period.total_ad_breaks == 0
        assert period.total_frames_processed == 0

    def test_record_ad_break(self):
        """Test recording ad breaks."""
        aggregator = TelemetryAggregator()

        # Start ad break
        aggregator.record_ad_start()
        period = aggregator.get_current_period()
        assert period.total_ad_breaks == 1

        # End ad break
        aggregator.record_ad_end()
        period = aggregator.get_current_period()
        assert period.total_ad_duration_seconds > 0

    def test_record_frames(self):
        """Test recording frame metrics."""
        aggregator = TelemetryAggregator()

        # Record some frames
        for i in range(10):
            aggregator.record_frame(fps=30.0, latency_ms=50.0 + i)

        period = aggregator.get_current_period()
        assert period.total_frames_processed == 10
        assert period.average_fps == pytest.approx(30.0)
        assert 50.0 <= period.average_latency_ms <= 60.0

    def test_record_inference(self):
        """Test recording ML inference metrics."""
        aggregator = TelemetryAggregator()

        # Record inferences
        for i in range(5):
            aggregator.record_inference(
                inference_time_ms=10.0 + i,
                confidence=0.8 + i * 0.02
            )

        period = aggregator.get_current_period()
        assert period.total_inferences == 5
        assert 10.0 <= period.average_inference_time_ms <= 15.0
        assert 0.8 <= period.average_confidence <= 0.9

    def test_get_and_reset(self):
        """Test getting period and resetting."""
        aggregator = TelemetryAggregator()

        # Record some data
        aggregator.record_ad_start()
        aggregator.record_frame(fps=30.0, latency_ms=50.0)

        # Get and reset
        period = aggregator.get_and_reset()
        assert period.total_ad_breaks == 1
        assert period.total_frames_processed == 1

        # Verify reset
        new_period = aggregator.get_current_period()
        assert new_period.total_ad_breaks == 0
        assert new_period.total_frames_processed == 0


class TestCloudReporter:
    """Test cloud reporter service."""

    @pytest.fixture
    def config(self):
        """Create test configuration."""
        return CloudReporterConfig(
            cloud_api_url="http://localhost:8000",
            device_id="test-device-001",
            location_id=1,
            heartbeat_interval_sec=5.0,  # Minimum allowed
            health_interval_sec=60.0,
            telemetry_interval_sec=300.0,
            firmware_check_interval_sec=600.0
        )

    @pytest.fixture
    def reporter(self, config):
        """Create test cloud reporter."""
        return CloudReporter(
            config=config,
            role=DeviceRole.COORDINATOR,
            firmware_version="1.0.0-test"
        )

    def test_create_reporter(self, reporter, config):
        """Test creating cloud reporter."""
        assert reporter.config == config
        assert reporter.role == DeviceRole.COORDINATOR
        assert reporter.firmware_version == "1.0.0-test"
        assert not reporter._running

    @pytest.mark.asyncio
    async def test_start_stop_reporter(self, reporter):
        """Test starting and stopping cloud reporter."""
        with patch('httpx.AsyncClient') as mock_client:
            # Mock HTTP client
            mock_instance = AsyncMock()
            mock_client.return_value = mock_instance
            mock_instance.request = AsyncMock(return_value=AsyncMock(
                status_code=201,
                json=lambda: {"id": 1}
            ))

            # Start reporter
            await reporter.start()
            assert reporter._running
            assert len(reporter._tasks) == 4  # All 4 background tasks

            # Let it run briefly
            await asyncio.sleep(0.1)

            # Stop reporter
            await reporter.stop()
            assert not reporter._running
            assert len(reporter._tasks) == 0

    @pytest.mark.asyncio
    async def test_telemetry_recording(self, reporter):
        """Test telemetry recording."""
        # Record some telemetry
        reporter.telemetry.record_ad_start()
        reporter.telemetry.record_frame(fps=30.0, latency_ms=75.0)
        reporter.telemetry.record_inference(
            inference_time_ms=25.0,
            confidence=0.85
        )

        period = reporter.telemetry.get_current_period()
        assert period.total_ad_breaks == 1
        assert period.total_frames_processed == 1
        assert period.total_inferences == 1

    @pytest.mark.asyncio
    async def test_get_stats(self, reporter):
        """Test getting reporter statistics."""
        stats = reporter.get_stats()

        assert stats["device_id"] == "test-device-001"
        assert stats["firmware_version"] == "1.0.0-test"
        assert not stats["running"]
        assert not stats["registered"]
        assert stats["last_heartbeat"] is None


class TestCloudReporterConfig:
    """Test cloud reporter configuration."""

    def test_default_config(self):
        """Test default configuration values."""
        config = CloudReporterConfig(
            device_id="test-001",
            location_id=1
        )

        assert config.device_id == "test-001"
        assert config.location_id == 1
        assert config.heartbeat_interval_sec == 30.0
        assert config.health_interval_sec == 300.0
        assert config.telemetry_interval_sec == 3600.0
        assert config.enable_heartbeat is True

    def test_custom_config(self):
        """Test custom configuration."""
        config = CloudReporterConfig(
            cloud_api_url="https://api.example.com",
            device_id="custom-device",
            location_id=42,
            heartbeat_interval_sec=60.0,
            api_key="test-key-123",
            enable_telemetry_reporting=False
        )

        assert str(config.cloud_api_url) == "https://api.example.com/"
        assert config.device_id == "custom-device"
        assert config.location_id == 42
        assert config.heartbeat_interval_sec == 60.0
        assert config.api_key == "test-key-123"
        assert config.enable_telemetry_reporting is False

    def test_config_validation(self):
        """Test configuration validation."""
        # Should reject invalid intervals
        with pytest.raises(Exception):
            CloudReporterConfig(
                device_id="test",
                location_id=1,
                heartbeat_interval_sec=1.0  # Too low (min 5.0)
            )
