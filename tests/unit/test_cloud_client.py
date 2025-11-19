"""Tests for cloud API client."""

import asyncio
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from system.cloud_client import CloudAPIClient, CloudConfig, initialize_cloud_client, get_cloud_client


@pytest.fixture
def cloud_config():
    """Create test cloud configuration."""
    return CloudConfig(
        api_url="https://api.example.com",
        api_key="test-api-key",
        device_id="test-device-123",
        location_id=1,
        enabled=True,
        heartbeat_interval=60,
        telemetry_interval=300
    )


@pytest.fixture
async def cloud_client(cloud_config):
    """Create test cloud client."""
    client = CloudAPIClient(cloud_config)
    yield client
    if client.running:
        await client.stop()


class TestCloudConfig:
    """Test CloudConfig dataclass."""

    def test_cloud_config_creation(self):
        """Test creating cloud configuration."""
        config = CloudConfig(
            api_url="https://api.test.com",
            api_key="key123",
            device_id="device456",
            location_id=42
        )

        assert config.api_url == "https://api.test.com"
        assert config.api_key == "key123"
        assert config.device_id == "device456"
        assert config.location_id == 42
        assert config.enabled is True  # Default
        assert config.heartbeat_interval == 60  # Default
        assert config.telemetry_interval == 300  # Default


class TestCloudAPIClient:
    """Test CloudAPIClient functionality."""

    def test_client_initialization(self, cloud_config):
        """Test client initialization."""
        client = CloudAPIClient(cloud_config)

        assert client.config == cloud_config
        assert client.session is None
        assert client.running is False
        assert client.heartbeat_task is None
        assert client.telemetry_task is None

    @pytest.mark.asyncio
    async def test_start_disabled(self):
        """Test starting client when disabled."""
        config = CloudConfig(
            api_url="https://api.test.com",
            api_key="key",
            device_id="device",
            location_id=1,
            enabled=False
        )

        client = CloudAPIClient(config)
        await client.start()

        assert client.session is None
        assert client.running is False

    @pytest.mark.asyncio
    async def test_start_enabled(self, cloud_client):
        """Test starting client when enabled."""
        with patch('aiohttp.ClientSession') as mock_session:
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session.return_value)
            mock_session.return_value.__aexit__ = AsyncMock()
            mock_session.return_value.post = AsyncMock()

            # Mock the register_device call
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.json = AsyncMock(return_value={"device_id": "test-device-123"})
            mock_response.__aenter__ = AsyncMock(return_value=mock_response)
            mock_response.__aexit__ = AsyncMock()

            mock_session.return_value.post.return_value = mock_response

            with patch('system.system_monitor.system_monitor') as mock_monitor:
                mock_monitor.get_system_info.return_value = {
                    "hostname": "test-host",
                    "platform": "linux",
                    "architecture": "x86_64",
                    "cpu_count": 4,
                    "memory_total_gb": 8.0,
                    "disk_total_gb": 100.0
                }

                await cloud_client.start()

                assert cloud_client.session is not None
                assert cloud_client.running is True

                await cloud_client.stop()

    @pytest.mark.asyncio
    async def test_stop(self, cloud_client):
        """Test stopping client."""
        # Start first
        cloud_client.running = True
        cloud_client.heartbeat_task = asyncio.create_task(asyncio.sleep(1))
        cloud_client.telemetry_task = asyncio.create_task(asyncio.sleep(1))
        cloud_client.session = MagicMock()
        cloud_client.session.close = AsyncMock()

        await cloud_client.stop()

        assert cloud_client.running is False
        assert cloud_client.heartbeat_task.cancelled()
        assert cloud_client.telemetry_task.cancelled()

    @pytest.mark.asyncio
    async def test_register_device(self, cloud_client):
        """Test device registration."""
        mock_session = MagicMock()
        cloud_client.session = mock_session

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = AsyncMock(return_value={"device_id": "test-device-123", "status": "registered"})
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock()

        mock_session.post.return_value = mock_response

        with patch('system.system_monitor.system_monitor') as mock_monitor:
            mock_monitor.get_system_info.return_value = {
                "hostname": "test-host",
                "platform": "linux",
                "architecture": "x86_64",
                "cpu_count": 4,
                "memory_total_gb": 8.0,
                "disk_total_gb": 100.0
            }

            result = await cloud_client.register_device()

            assert result["device_id"] == "test-device-123"
            assert result["status"] == "registered"
            mock_session.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_send_heartbeat(self, cloud_client):
        """Test sending heartbeat."""
        mock_session = MagicMock()
        cloud_client.session = mock_session

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock()

        mock_session.post.return_value = mock_response

        with patch('system.system_monitor.system_monitor') as mock_monitor:
            mock_monitor.get_latest_metrics.return_value = MagicMock()

            await cloud_client.send_heartbeat()

            mock_session.post.assert_called_once()
            call_args = mock_session.post.call_args
            assert "/api/v1/devices/heartbeat" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_send_telemetry(self, cloud_client):
        """Test sending telemetry data."""
        mock_session = MagicMock()
        cloud_client.session = mock_session

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock()

        mock_session.post.return_value = mock_response

        with patch('system.system_monitor.system_monitor') as mock_monitor, \
             patch('system.health_checker.health_checker') as mock_health:

            mock_metrics = MagicMock()
            mock_metrics.cpu_percent = 45.0
            mock_metrics.cpu_temp = 55.0
            mock_metrics.memory_percent = 60.0
            mock_metrics.disk_percent = 70.0
            mock_metrics.network_sent_mb = 100.0
            mock_metrics.network_recv_mb = 200.0
            mock_metrics.uptime_seconds = 3600

            mock_monitor.get_latest_metrics.return_value = mock_metrics
            mock_monitor.get_all_app_metrics.return_value = []
            mock_health.get_health_summary.return_value = {"overall_status": "healthy"}

            await cloud_client.send_telemetry()

            assert mock_session.post.call_count == 1

    @pytest.mark.asyncio
    async def test_check_model_updates(self, cloud_client):
        """Test checking for model updates."""
        mock_session = MagicMock()
        cloud_client.session = mock_session

        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json = AsyncMock(return_value={
            "version": "1.2.0",
            "rollout_percentage": 100.0
        })
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock()

        mock_session.get.return_value = mock_response

        result = await cloud_client.check_model_updates("ad_detection")

        assert result is not None
        assert result["version"] == "1.2.0"
        mock_session.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_check_model_updates_not_found(self, cloud_client):
        """Test checking for model updates when not found."""
        mock_session = MagicMock()
        cloud_client.session = mock_session

        mock_response = MagicMock()
        mock_response.status = 404
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock()

        mock_session.get.return_value = mock_response

        result = await cloud_client.check_model_updates("nonexistent_model")

        assert result is None

    @pytest.mark.asyncio
    async def test_download_model(self, cloud_client, tmp_path):
        """Test downloading a model."""
        mock_session = MagicMock()
        cloud_client.session = mock_session

        # Mock download info response
        info_response = MagicMock()
        info_response.raise_for_status = MagicMock()
        info_response.json = AsyncMock(return_value={
            "file_url": "https://example.com/model.tflite",
            "checksum_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        })
        info_response.__aenter__ = AsyncMock(return_value=info_response)
        info_response.__aexit__ = AsyncMock()

        # Mock file download response
        file_response = MagicMock()
        file_response.raise_for_status = MagicMock()

        # Mock content iterator
        async def mock_iter_chunked(size):
            yield b""  # Empty file for checksum match

        file_response.content.iter_chunked = mock_iter_chunked
        file_response.__aenter__ = AsyncMock(return_value=file_response)
        file_response.__aexit__ = AsyncMock()

        mock_session.get.side_effect = [info_response, file_response]

        output_path = tmp_path / "model.tflite"

        result = await cloud_client.download_model("ad_detection", "1.0.0", output_path)

        assert result is True
        assert output_path.exists()

    @pytest.mark.asyncio
    async def test_get_pip_config(self, cloud_client):
        """Test getting PiP configuration."""
        mock_session = MagicMock()
        cloud_client.session = mock_session

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = AsyncMock(return_value={
            "pip_config": {
                "default_content_id": "weather",
                "enabled": True
            }
        })
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock()

        mock_session.get.return_value = mock_response

        result = await cloud_client.get_pip_config()

        assert result is not None
        assert result["default_content_id"] == "weather"
        assert result["enabled"] is True

    def test_get_ip_address(self, cloud_client):
        """Test getting local IP address."""
        ip = cloud_client._get_ip_address()

        # Should return a valid IP or None
        if ip:
            parts = ip.split(".")
            assert len(parts) == 4
            assert all(part.isdigit() for part in parts)


class TestGlobalFunctions:
    """Test global helper functions."""

    def test_initialize_cloud_client(self, cloud_config):
        """Test initializing global cloud client."""
        client = initialize_cloud_client(cloud_config)

        assert client is not None
        assert isinstance(client, CloudAPIClient)
        assert get_cloud_client() == client

    def test_get_cloud_client_not_initialized(self):
        """Test getting cloud client when not initialized."""
        # Reset global
        import system.cloud_client
        system.cloud_client.cloud_client = None

        result = get_cloud_client()
        assert result is None
