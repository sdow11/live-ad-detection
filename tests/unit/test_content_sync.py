"""Tests for cluster content synchronization."""

import asyncio
import pytest
from pathlib import Path
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from system.content_sync import (
    ContentSyncService,
    ContentItem,
    SyncStatus,
    initialize_content_sync,
    get_content_sync_service
)


@pytest.fixture
def content_dir(tmp_path):
    """Create temporary content directory."""
    return tmp_path / "content"


@pytest.fixture
def models_dir(tmp_path):
    """Create temporary models directory."""
    return tmp_path / "models"


@pytest.fixture
def sync_service(content_dir, models_dir):
    """Create test sync service."""
    return ContentSyncService(
        content_dir=content_dir,
        models_dir=models_dir,
        sync_interval=600
    )


class TestContentItem:
    """Test ContentItem dataclass."""

    def test_content_item_creation(self):
        """Test creating content item."""
        item = ContentItem(
            content_id="weather-video",
            content_type="video_file",
            source_uri="/content/weather.mp4",
            file_path=Path("/content/weather.mp4"),
            checksum="abc123",
            size_bytes=1024000,
            last_synced=datetime.now()
        )

        assert item.content_id == "weather-video"
        assert item.content_type == "video_file"
        assert item.checksum == "abc123"


class TestContentSyncService:
    """Test ContentSyncService functionality."""

    def test_initialization(self, sync_service, content_dir, models_dir):
        """Test service initialization."""
        assert sync_service.content_dir == content_dir
        assert sync_service.models_dir == models_dir
        assert sync_service.sync_interval == 600
        assert sync_service.running is False

        # Directories should be created
        assert content_dir.exists()
        assert models_dir.exists()

    @pytest.mark.asyncio
    async def test_start_stop(self, sync_service):
        """Test starting and stopping service."""
        await sync_service.start()

        assert sync_service.running is True
        assert sync_service.sync_task is not None

        await sync_service.stop()

        assert sync_service.running is False
        assert sync_service.sync_task.cancelled()

    @pytest.mark.asyncio
    async def test_sync_from_leader_as_leader(self, sync_service):
        """Test sync from leader when device is leader."""
        with patch('local_fleet.coordinator.coordinator') as mock_coordinator:
            mock_coordinator.is_leader.return_value = True

            await sync_service.sync_from_leader()

            # Should return early without syncing
            assert len(sync_service.synced_content) == 0

    @pytest.mark.asyncio
    async def test_sync_from_leader_no_leader(self, sync_service):
        """Test sync from leader when no leader elected."""
        with patch('local_fleet.coordinator.coordinator') as mock_coordinator:
            mock_coordinator.is_leader.return_value = False
            mock_coordinator.get_cluster_info.return_value = {
                "leader_id": None
            }

            await sync_service.sync_from_leader()

            # Should handle gracefully
            assert len(sync_service.synced_content) == 0

    @pytest.mark.asyncio
    async def test_sync_to_followers_not_leader(self, sync_service):
        """Test sync to followers when not leader."""
        with patch('local_fleet.coordinator.coordinator') as mock_coordinator:
            mock_coordinator.is_leader.return_value = False

            await sync_service.sync_to_followers()

            # Should return early

    @pytest.mark.asyncio
    async def test_sync_to_followers_no_followers(self, sync_service):
        """Test sync to followers when no followers exist."""
        with patch('local_fleet.coordinator.coordinator') as mock_coordinator, \
             patch('local_fleet.registry.device_registry') as mock_registry:

            mock_coordinator.is_leader.return_value = True
            mock_coordinator.get_cluster_info.return_value = {
                "device_id": "leader-device"
            }
            mock_registry.get_all_devices.return_value = [
                {"device_id": "leader-device", "ip_address": "192.168.1.100"}
            ]

            await sync_service.sync_to_followers()

            # Should handle gracefully (no followers to sync to)

    @pytest.mark.asyncio
    async def test_sync_content_list(self, sync_service):
        """Test syncing content list from leader."""
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_class.return_value.__aexit__ = AsyncMock()

            # Mock content list response
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.json = AsyncMock(return_value={
                "content_sources": [
                    {
                        "content_id": "weather",
                        "content_type": "stream",
                        "source_uri": "http://stream.example.com/weather",
                        "checksum": "abc123"
                    }
                ]
            })
            mock_response.__aenter__ = AsyncMock(return_value=mock_response)
            mock_response.__aexit__ = AsyncMock()

            mock_session.get.return_value = mock_response

            await sync_service._sync_content_list("http://leader:8080")

            # Should have processed the content item
            assert "weather" in sync_service.synced_content

    @pytest.mark.asyncio
    async def test_sync_content_item_stream(self, sync_service):
        """Test syncing stream content item."""
        mock_session = MagicMock()

        content_data = {
            "content_id": "news-stream",
            "content_type": "stream",
            "source_uri": "http://stream.example.com/news",
            "checksum": "def456"
        }

        await sync_service._sync_content_item(
            "http://leader:8080",
            content_data,
            mock_session
        )

        # Should mark as synced
        assert "news-stream" in sync_service.synced_content
        assert sync_service.sync_status["news-stream"] == SyncStatus.SYNCED

    @pytest.mark.asyncio
    async def test_sync_content_item_already_synced(self, sync_service):
        """Test syncing content that's already up to date."""
        # Pre-populate with existing content
        existing_item = ContentItem(
            content_id="weather",
            content_type="stream",
            source_uri="http://stream.example.com/weather",
            checksum="abc123"
        )

        sync_service.synced_content["weather"] = existing_item

        mock_session = MagicMock()

        content_data = {
            "content_id": "weather",
            "content_type": "stream",
            "source_uri": "http://stream.example.com/weather",
            "checksum": "abc123"  # Same checksum
        }

        await sync_service._sync_content_item(
            "http://leader:8080",
            content_data,
            mock_session
        )

        # Should skip syncing

    @pytest.mark.asyncio
    async def test_sync_pip_config(self, sync_service):
        """Test syncing PiP configuration."""
        with patch('aiohttp.ClientSession') as mock_session_class, \
             patch('pip_content.pip_content_manager') as mock_pip_manager, \
             patch('local_fleet.coordinator.coordinator') as mock_coordinator:

            mock_session = MagicMock()
            mock_session_class.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_class.return_value.__aexit__ = AsyncMock()

            mock_coordinator.get_cluster_info.return_value = {
                "device_id": "test-device-123"
            }

            # Mock PiP config response
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.json = AsyncMock(return_value={
                "default_content_id": "weather",
                "enabled": True
            })
            mock_response.__aenter__ = AsyncMock(return_value=mock_response)
            mock_response.__aexit__ = AsyncMock()

            mock_session.get.return_value = mock_response

            await sync_service._sync_pip_config("http://leader:8080")

            # Should have called pip_content_manager
            mock_pip_manager.set_device_config.assert_called_once()

    def test_save_load_sync_manifest(self, sync_service, content_dir):
        """Test saving and loading sync manifest."""
        # Add content items
        item1 = ContentItem(
            content_id="weather",
            content_type="stream",
            source_uri="http://stream.example.com/weather",
            checksum="abc123",
            size_bytes=0,
            last_synced=datetime.now()
        )

        item2 = ContentItem(
            content_id="news",
            content_type="video_file",
            source_uri="/content/news.mp4",
            file_path=content_dir / "news.mp4",
            checksum="def456",
            size_bytes=1024000,
            last_synced=datetime.now()
        )

        sync_service.synced_content["weather"] = item1
        sync_service.synced_content["news"] = item2

        # Save manifest
        sync_service._save_sync_manifest()

        # Verify file created
        manifest_file = content_dir / "sync_manifest.json"
        assert manifest_file.exists()

        # Clear and reload
        sync_service.synced_content.clear()
        sync_service._load_synced_content()

        # Verify loaded
        assert len(sync_service.synced_content) == 2
        assert "weather" in sync_service.synced_content
        assert "news" in sync_service.synced_content

        loaded_weather = sync_service.synced_content["weather"]
        assert loaded_weather.content_id == "weather"
        assert loaded_weather.content_type == "stream"
        assert loaded_weather.checksum == "abc123"

    @pytest.mark.asyncio
    async def test_sync_models_in_cluster_as_follower(self, sync_service):
        """Test model sync as follower."""
        with patch('local_fleet.coordinator.coordinator') as mock_coordinator:
            mock_coordinator.is_leader.return_value = False
            mock_coordinator.get_cluster_info.return_value = {
                "leader_id": "leader-device"
            }

            with patch('local_fleet.registry.device_registry') as mock_registry:
                mock_registry.get_all_devices.return_value = []

                await sync_service.sync_models_in_cluster()

                # Should attempt to get models from leader

    @pytest.mark.asyncio
    async def test_sync_models_in_cluster_as_leader(self, sync_service):
        """Test model sync as leader."""
        with patch('local_fleet.coordinator.coordinator') as mock_coordinator:
            mock_coordinator.is_leader.return_value = True

            await sync_service.sync_models_in_cluster()

            # Should attempt to distribute to followers

    def test_load_synced_content_no_manifest(self, sync_service):
        """Test loading when no manifest exists."""
        sync_service._load_synced_content()

        # Should handle gracefully
        assert len(sync_service.synced_content) == 0

    def test_load_synced_content_corrupt_manifest(self, sync_service, content_dir):
        """Test loading corrupt manifest."""
        # Create corrupt manifest
        manifest_file = content_dir / "sync_manifest.json"
        content_dir.mkdir(parents=True, exist_ok=True)
        manifest_file.write_text("{ invalid json")

        sync_service._load_synced_content()

        # Should handle gracefully
        assert len(sync_service.synced_content) == 0

    @pytest.mark.asyncio
    async def test_sync_content_item_incomplete_data(self, sync_service):
        """Test syncing with incomplete content data."""
        mock_session = MagicMock()

        # Missing required fields
        content_data = {
            "content_id": "incomplete"
            # Missing content_type and source_uri
        }

        await sync_service._sync_content_item(
            "http://leader:8080",
            content_data,
            mock_session
        )

        # Should handle gracefully without crashing
        assert "incomplete" not in sync_service.synced_content


class TestGlobalFunctions:
    """Test global helper functions."""

    def test_initialize_content_sync(self, content_dir, models_dir):
        """Test initializing global content sync service."""
        service = initialize_content_sync(
            content_dir=content_dir,
            models_dir=models_dir,
            sync_interval=300
        )

        assert service is not None
        assert isinstance(service, ContentSyncService)
        assert get_content_sync_service() == service

    def test_get_content_sync_service_not_initialized(self):
        """Test getting service when not initialized."""
        # Reset global
        import system.content_sync
        system.content_sync.content_sync_service = None

        result = get_content_sync_service()
        assert result is None
