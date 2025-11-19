"""Cluster content synchronization.

Synchronizes content, models, and configurations across devices
in the local cluster using the fleet coordinator.
"""

import asyncio
import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Set

import aiohttp

logger = logging.getLogger(__name__)


class SyncStatus(str, Enum):
    """Content sync status."""

    PENDING = "pending"
    SYNCING = "syncing"
    SYNCED = "synced"
    FAILED = "failed"


@dataclass
class ContentItem:
    """Content item to sync."""

    content_id: str
    content_type: str
    source_uri: str
    file_path: Optional[Path] = None
    checksum: Optional[str] = None
    size_bytes: int = 0
    last_synced: Optional[datetime] = None


class ContentSyncService:
    """Content synchronization service for cluster."""

    def __init__(
        self,
        content_dir: Path,
        models_dir: Path,
        sync_interval: int = 600  # 10 minutes
    ):
        """Initialize content sync service.

        Args:
            content_dir: Directory for content files
            models_dir: Directory for model files
            sync_interval: Interval between sync checks (seconds)
        """
        self.content_dir = content_dir
        self.models_dir = models_dir
        self.sync_interval = sync_interval

        self.content_dir.mkdir(parents=True, exist_ok=True)
        self.models_dir.mkdir(parents=True, exist_ok=True)

        self.synced_content: Dict[str, ContentItem] = {}
        self.sync_status: Dict[str, SyncStatus] = {}

        self.running = False
        self.sync_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start content sync service."""
        self.running = True

        # Load existing synced content
        self._load_synced_content()

        # Start background sync
        self.sync_task = asyncio.create_task(self._sync_loop())

        logger.info("Content sync service started")

    async def stop(self) -> None:
        """Stop content sync service."""
        self.running = False

        if self.sync_task:
            self.sync_task.cancel()
            try:
                await self.sync_task
            except asyncio.CancelledError:
                pass

        logger.info("Content sync service stopped")

    async def sync_from_leader(self) -> None:
        """Sync content from cluster leader."""
        from local_fleet.coordinator import coordinator

        # Check if we're the leader
        if coordinator.is_leader():
            logger.debug("Device is leader, no sync needed")
            return

        # Get leader info
        cluster_info = coordinator.get_cluster_info()
        leader_id = cluster_info.get("leader_id")

        if not leader_id:
            logger.warning("No cluster leader elected")
            return

        # Get leader device info
        from local_fleet.registry import device_registry
        devices = device_registry.get_all_devices()
        leader_device = None

        for device in devices:
            if device.get("device_id") == leader_id:
                leader_device = device
                break

        if not leader_device:
            logger.error(f"Leader device {leader_id} not found in registry")
            return

        leader_url = f"http://{leader_device.get('ip_address')}:8080"

        try:
            await self._sync_content_list(leader_url)
            await self._sync_pip_config(leader_url)

        except Exception as e:
            logger.error(f"Failed to sync from leader: {e}")

    async def sync_to_followers(self) -> None:
        """Sync content to follower devices (leader only)."""
        from local_fleet.coordinator import coordinator
        from local_fleet.registry import device_registry

        # Check if we're the leader
        if not coordinator.is_leader():
            logger.debug("Device is not leader, skipping follower sync")
            return

        # Get follower devices
        cluster_info = coordinator.get_cluster_info()
        my_device_id = cluster_info.get("device_id")
        devices = device_registry.get_all_devices()

        followers = [
            d for d in devices
            if d.get("device_id") != my_device_id
        ]

        if not followers:
            logger.debug("No follower devices to sync to")
            return

        # Notify followers to sync
        for follower in followers:
            try:
                follower_url = f"http://{follower.get('ip_address')}:8080"

                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{follower_url}/api/cluster/sync-content",
                        timeout=aiohttp.ClientTimeout(total=30)
                    ) as resp:
                        if resp.status == 200:
                            logger.info(f"Triggered sync on {follower.get('device_id')}")
                        else:
                            logger.warning(
                                f"Failed to trigger sync on {follower.get('device_id')}: {resp.status}"
                            )

            except Exception as e:
                logger.error(f"Failed to notify follower {follower.get('device_id')}: {e}")

    async def _sync_content_list(self, leader_url: str) -> None:
        """Sync content list from leader.

        Args:
            leader_url: Leader device URL
        """
        try:
            async with aiohttp.ClientSession() as session:
                # Get content list from leader
                async with session.get(
                    f"{leader_url}/api/content",
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    resp.raise_for_status()
                    data = await resp.json()
                    content_sources = data.get("content_sources", [])

                logger.info(f"Found {len(content_sources)} content items on leader")

                # Sync each content item
                for content_data in content_sources:
                    await self._sync_content_item(leader_url, content_data, session)

        except Exception as e:
            logger.error(f"Failed to sync content list: {e}")

    async def _sync_content_item(
        self,
        leader_url: str,
        content_data: dict,
        session: aiohttp.ClientSession
    ) -> None:
        """Sync a single content item.

        Args:
            leader_url: Leader device URL
            content_data: Content metadata
            session: HTTP session
        """
        content_id = content_data.get("content_id")
        content_type = content_data.get("content_type")
        source_uri = content_data.get("source_uri")

        if not all([content_id, content_type, source_uri]):
            logger.warning(f"Incomplete content data: {content_data}")
            return

        # Check if we already have this content
        if content_id in self.synced_content:
            existing = self.synced_content[content_id]

            # Check if content has changed
            if existing.checksum == content_data.get("checksum"):
                logger.debug(f"Content {content_id} already synced and up to date")
                return

        self.sync_status[content_id] = SyncStatus.SYNCING

        try:
            # For local files, download from leader
            if content_type in ["video_file", "image", "slideshow"]:
                await self._download_content_file(
                    leader_url, content_id, source_uri, session
                )

            # Update synced content info
            content_item = ContentItem(
                content_id=content_id,
                content_type=content_type,
                source_uri=source_uri,
                checksum=content_data.get("checksum"),
                last_synced=datetime.now()
            )

            self.synced_content[content_id] = content_item
            self.sync_status[content_id] = SyncStatus.SYNCED

            logger.info(f"Synced content: {content_id}")

        except Exception as e:
            logger.error(f"Failed to sync content {content_id}: {e}")
            self.sync_status[content_id] = SyncStatus.FAILED

    async def _download_content_file(
        self,
        leader_url: str,
        content_id: str,
        source_uri: str,
        session: aiohttp.ClientSession
    ) -> None:
        """Download content file from leader.

        Args:
            leader_url: Leader device URL
            content_id: Content ID
            source_uri: Source URI (path on leader)
            session: HTTP session
        """
        # For now, we would need to implement file transfer endpoint
        # on the web interface to serve content files
        # This is a placeholder for the implementation

        logger.debug(f"Would download {content_id} from {source_uri}")

        # TODO: Implement file transfer endpoint on leader
        # and download logic here

    async def _sync_pip_config(self, leader_url: str) -> None:
        """Sync PiP configuration from leader.

        Args:
            leader_url: Leader device URL
        """
        try:
            from pip_content import pip_content_manager
            from local_fleet.coordinator import coordinator

            cluster_info = coordinator.get_cluster_info()
            device_id = cluster_info.get("device_id")

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{leader_url}/api/device/{device_id}/pip-config",
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()

                        # Apply PiP configuration locally
                        if "default_content_id" in data:
                            pip_content_manager.set_device_config(
                                device_id=device_id,
                                default_content_id=data.get("default_content_id"),
                                enabled=data.get("enabled", True)
                            )

                            logger.info("Synced PiP configuration from leader")

        except Exception as e:
            logger.error(f"Failed to sync PiP config: {e}")

    async def sync_models_in_cluster(self) -> None:
        """Sync models across cluster."""
        from local_fleet.coordinator import coordinator

        if not coordinator.is_leader():
            # Followers can request model from leader if needed
            await self._request_models_from_leader()
        else:
            # Leader can distribute models to followers
            await self._distribute_models_to_followers()

    async def _request_models_from_leader(self) -> None:
        """Request models from cluster leader."""
        from local_fleet.coordinator import coordinator
        from local_fleet.registry import device_registry
        from system.model_deployment import get_model_deployment_service

        deployment_service = get_model_deployment_service()
        if not deployment_service:
            return

        cluster_info = coordinator.get_cluster_info()
        leader_id = cluster_info.get("leader_id")

        if not leader_id:
            return

        # Get leader device
        devices = device_registry.get_all_devices()
        leader_device = None

        for device in devices:
            if device.get("device_id") == leader_id:
                leader_device = device
                break

        if not leader_device:
            return

        # Would implement model transfer from leader here
        # For now, models come from cloud API via model_deployment service
        logger.debug("Model sync from leader not yet implemented")

    async def _distribute_models_to_followers(self) -> None:
        """Distribute models to follower devices (leader only)."""
        # Would implement model distribution to followers here
        # For now, each device gets models from cloud API independently
        logger.debug("Model distribution to followers not yet implemented")

    def _load_synced_content(self) -> None:
        """Load information about synced content."""
        import json

        manifest_file = self.content_dir / "sync_manifest.json"

        if not manifest_file.exists():
            return

        try:
            with open(manifest_file) as f:
                data = json.load(f)

            for content_id, item_data in data.items():
                content_item = ContentItem(
                    content_id=content_id,
                    content_type=item_data["content_type"],
                    source_uri=item_data["source_uri"],
                    file_path=Path(item_data["file_path"]) if item_data.get("file_path") else None,
                    checksum=item_data.get("checksum"),
                    size_bytes=item_data.get("size_bytes", 0),
                    last_synced=datetime.fromisoformat(item_data["last_synced"]) if item_data.get("last_synced") else None
                )

                self.synced_content[content_id] = content_item
                self.sync_status[content_id] = SyncStatus.SYNCED

            logger.info(f"Loaded {len(self.synced_content)} synced content items")

        except Exception as e:
            logger.error(f"Failed to load sync manifest: {e}")

    def _save_sync_manifest(self) -> None:
        """Save sync manifest to file."""
        import json

        manifest_file = self.content_dir / "sync_manifest.json"

        data = {}
        for content_id, item in self.synced_content.items():
            data[content_id] = {
                "content_id": item.content_id,
                "content_type": item.content_type,
                "source_uri": item.source_uri,
                "file_path": str(item.file_path) if item.file_path else None,
                "checksum": item.checksum,
                "size_bytes": item.size_bytes,
                "last_synced": item.last_synced.isoformat() if item.last_synced else None
            }

        try:
            with open(manifest_file, "w") as f:
                json.dump(data, f, indent=2)

        except Exception as e:
            logger.error(f"Failed to save sync manifest: {e}")

    async def _sync_loop(self) -> None:
        """Background sync loop."""
        while self.running:
            try:
                from local_fleet.coordinator import coordinator

                if coordinator.is_leader():
                    # Leader pushes updates to followers
                    await self.sync_to_followers()
                else:
                    # Follower pulls from leader
                    await self.sync_from_leader()

                # Save manifest
                self._save_sync_manifest()

                await asyncio.sleep(self.sync_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in sync loop: {e}", exc_info=True)
                await asyncio.sleep(self.sync_interval)


# Global content sync service instance
content_sync_service: Optional[ContentSyncService] = None


def initialize_content_sync(
    content_dir: Path,
    models_dir: Path,
    sync_interval: int = 600
) -> ContentSyncService:
    """Initialize global content sync service.

    Args:
        content_dir: Directory for content files
        models_dir: Directory for model files
        sync_interval: Interval between sync checks

    Returns:
        Content sync service instance
    """
    global content_sync_service
    content_sync_service = ContentSyncService(
        content_dir, models_dir, sync_interval
    )
    return content_sync_service


def get_content_sync_service() -> Optional[ContentSyncService]:
    """Get global content sync service instance.

    Returns:
        Content sync service or None if not initialized
    """
    return content_sync_service
