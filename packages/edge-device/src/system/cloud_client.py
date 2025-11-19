"""Cloud API client for fleet management.

Integrates edge device with cloud API for:
- Device registration and heartbeat
- Telemetry and metrics reporting
- Model updates
- Firmware updates
- Remote configuration
"""

import asyncio
import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Any

import aiohttp

logger = logging.getLogger(__name__)


@dataclass
class CloudConfig:
    """Cloud API configuration."""

    api_url: str
    api_key: str
    device_id: str
    location_id: int
    enabled: bool = True
    heartbeat_interval: int = 60  # seconds
    telemetry_interval: int = 300  # seconds


class CloudAPIClient:
    """Client for cloud API integration."""

    def __init__(self, config: CloudConfig):
        """Initialize cloud API client.

        Args:
            config: Cloud API configuration
        """
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        self.running = False
        self.heartbeat_task: Optional[asyncio.Task] = None
        self.telemetry_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start cloud API client."""
        if not self.config.enabled:
            logger.info("Cloud API integration disabled")
            return

        self.session = aiohttp.ClientSession(
            headers={
                "X-API-Key": self.config.api_key,
                "Content-Type": "application/json"
            }
        )

        self.running = True

        # Register device on startup
        try:
            await self.register_device()
        except Exception as e:
            logger.error(f"Failed to register device: {e}")

        # Start background tasks
        self.heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        self.telemetry_task = asyncio.create_task(self._telemetry_loop())

        logger.info("Cloud API client started")

    async def stop(self) -> None:
        """Stop cloud API client."""
        self.running = False

        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            try:
                await self.heartbeat_task
            except asyncio.CancelledError:
                pass

        if self.telemetry_task:
            self.telemetry_task.cancel()
            try:
                await self.telemetry_task
            except asyncio.CancelledError:
                pass

        if self.session:
            await self.session.close()

        logger.info("Cloud API client stopped")

    async def register_device(self) -> Dict[str, Any]:
        """Register device with cloud API.

        Returns:
            Registration response
        """
        from system.system_monitor import system_monitor

        system_info = system_monitor.get_system_info()

        data = {
            "device_id": self.config.device_id,
            "location_id": self.config.location_id,
            "device_type": "edge_device",
            "hostname": system_info["hostname"],
            "platform": system_info["platform"],
            "architecture": system_info["architecture"],
            "cpu_count": system_info["cpu_count"],
            "memory_total_gb": system_info["memory_total_gb"],
            "disk_total_gb": system_info["disk_total_gb"]
        }

        async with self.session.post(
            f"{self.config.api_url}/api/v1/devices/register",
            json=data
        ) as resp:
            resp.raise_for_status()
            result = await resp.json()
            logger.info("Device registered with cloud API")
            return result

    async def send_heartbeat(self) -> None:
        """Send heartbeat to cloud API."""
        from system.system_monitor import system_monitor

        metrics = system_monitor.get_latest_metrics()

        data = {
            "device_id": self.config.device_id,
            "status": "online" if metrics else "degraded",
            "ip_address": self._get_ip_address()
        }

        async with self.session.post(
            f"{self.config.api_url}/api/v1/devices/heartbeat",
            json=data
        ) as resp:
            resp.raise_for_status()
            logger.debug("Heartbeat sent")

    async def send_telemetry(self) -> None:
        """Send telemetry data to cloud API."""
        from system.system_monitor import system_monitor
        from system.health_checker import health_checker

        metrics = system_monitor.get_latest_metrics()
        if not metrics:
            return

        health_summary = health_checker.get_health_summary()

        data = {
            "device_id": self.config.device_id,
            "cpu_usage": metrics.cpu_percent,
            "cpu_temp": metrics.cpu_temp,
            "memory_usage": metrics.memory_percent,
            "disk_usage": metrics.disk_percent,
            "network_sent_mb": metrics.network_sent_mb,
            "network_recv_mb": metrics.network_recv_mb,
            "uptime_seconds": metrics.uptime_seconds,
            "health_status": health_summary.get("overall_status", "unknown"),
            "app_count": len(system_monitor.get_all_app_metrics())
        }

        async with self.session.post(
            f"{self.config.api_url}/api/v1/telemetry",
            json=data
        ) as resp:
            resp.raise_for_status()
            logger.debug("Telemetry sent")

    async def send_health_data(self) -> None:
        """Send detailed health data to cloud API."""
        from system.system_monitor import system_monitor
        from system.health_checker import health_checker

        metrics = system_monitor.get_latest_metrics()
        if not metrics:
            return

        health_summary = health_checker.get_health_summary()

        data = {
            "device_id": self.config.device_id,
            "overall_health": health_summary.get("overall_status", "unknown"),
            "components": health_summary.get("components", {}),
            "metrics": metrics.to_dict()
        }

        async with self.session.post(
            f"{self.config.api_url}/api/v1/health",
            json=data
        ) as resp:
            resp.raise_for_status()
            logger.debug("Health data sent")

    async def check_model_updates(self, model_name: str) -> Optional[Dict[str, Any]]:
        """Check for model updates.

        Args:
            model_name: Name of model to check

        Returns:
            Model update info if available
        """
        try:
            async with self.session.get(
                f"{self.config.api_url}/api/v1/models/{model_name}/production"
            ) as resp:
                if resp.status == 404:
                    return None
                resp.raise_for_status()
                return await resp.json()
        except Exception as e:
            logger.error(f"Failed to check model updates: {e}")
            return None

    async def download_model(
        self,
        model_name: str,
        version: str,
        output_path: Path
    ) -> bool:
        """Download model from cloud API.

        Args:
            model_name: Model name
            version: Model version
            output_path: Where to save the model

        Returns:
            True if successful
        """
        try:
            # Get download info
            async with self.session.get(
                f"{self.config.api_url}/api/v1/models/{model_name}/versions/{version}/download"
            ) as resp:
                resp.raise_for_status()
                info = await resp.json()

            file_url = info["file_url"]
            expected_checksum = info["checksum_sha256"]

            # Download file
            async with self.session.get(file_url) as resp:
                resp.raise_for_status()

                output_path.parent.mkdir(parents=True, exist_ok=True)

                with open(output_path, "wb") as f:
                    async for chunk in resp.content.iter_chunked(8192):
                        f.write(chunk)

            # Verify checksum
            sha256 = hashlib.sha256()
            with open(output_path, "rb") as f:
                for chunk in iter(lambda: f.read(8192), b""):
                    sha256.update(chunk)

            if sha256.hexdigest() != expected_checksum:
                output_path.unlink()
                logger.error("Model checksum mismatch")
                return False

            logger.info(f"Downloaded model {model_name} v{version}")
            return True

        except Exception as e:
            logger.error(f"Failed to download model: {e}")
            return False

    async def check_firmware_updates(self) -> Optional[Dict[str, Any]]:
        """Check for firmware updates.

        Returns:
            Firmware update info if available
        """
        try:
            async with self.session.get(
                f"{self.config.api_url}/api/v1/firmware/updates/pending",
                params={"device_id": self.config.device_id}
            ) as resp:
                resp.raise_for_status()
                result = await resp.json()

                if result.get("has_update"):
                    return result
                return None

        except Exception as e:
            logger.error(f"Failed to check firmware updates: {e}")
            return None

    async def get_pip_config(self) -> Optional[Dict[str, Any]]:
        """Get PiP content configuration from cloud.

        Returns:
            PiP configuration if available
        """
        try:
            async with self.session.get(
                f"{self.config.api_url}/api/v1/devices/{self.config.device_id}/pip-content"
            ) as resp:
                resp.raise_for_status()
                result = await resp.json()
                return result.get("pip_config")

        except Exception as e:
            logger.error(f"Failed to get PiP config: {e}")
            return None

    async def _heartbeat_loop(self) -> None:
        """Background heartbeat loop."""
        while self.running:
            try:
                await self.send_heartbeat()
                await asyncio.sleep(self.config.heartbeat_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Heartbeat error: {e}")
                await asyncio.sleep(self.config.heartbeat_interval)

    async def _telemetry_loop(self) -> None:
        """Background telemetry loop."""
        while self.running:
            try:
                await self.send_telemetry()
                await self.send_health_data()
                await asyncio.sleep(self.config.telemetry_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Telemetry error: {e}")
                await asyncio.sleep(self.config.telemetry_interval)

    def _get_ip_address(self) -> Optional[str]:
        """Get local IP address.

        Returns:
            IP address or None
        """
        import socket

        try:
            # Create a socket to determine local IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip_address = s.getsockname()[0]
            s.close()
            return ip_address
        except Exception:
            return None


# Global cloud API client instance
cloud_client: Optional[CloudAPIClient] = None


def initialize_cloud_client(config: CloudConfig) -> CloudAPIClient:
    """Initialize global cloud API client.

    Args:
        config: Cloud API configuration

    Returns:
        Cloud API client instance
    """
    global cloud_client
    cloud_client = CloudAPIClient(config)
    return cloud_client


def get_cloud_client() -> Optional[CloudAPIClient]:
    """Get global cloud API client instance.

    Returns:
        Cloud API client or None if not initialized
    """
    return cloud_client
