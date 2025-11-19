"""Cloud reporter service for edge devices.

This module provides a background service that communicates with the
cloud fleet management API, reporting device status, health, and telemetry.
"""

import asyncio
import logging
import platform
import psutil
from datetime import datetime, timezone
from typing import Optional

import httpx

from ad_detection_common.models.device import DeviceRole, DeviceStatus
from cloud_reporter.config import CloudReporterConfig
from cloud_reporter.telemetry_aggregator import TelemetryAggregator


logger = logging.getLogger(__name__)


class CloudReporter:
    """Background service for cloud API communication.

    Handles device registration, heartbeats, health monitoring,
    and telemetry reporting to the cloud fleet management API.

    Example:
        >>> config = CloudReporterConfig(
        ...     cloud_api_url="https://api.example.com",
        ...     device_id="rpi-001",
        ...     location_id=1
        ... )
        >>> reporter = CloudReporter(config)
        >>> await reporter.start()
        >>> # ... run pipeline ...
        >>> await reporter.stop()
    """

    def __init__(
        self,
        config: CloudReporterConfig,
        role: DeviceRole = DeviceRole.WORKER,
        firmware_version: str = "1.0.0"
    ) -> None:
        """Initialize cloud reporter.

        Args:
            config: Cloud reporter configuration
            role: Device role (coordinator or worker)
            firmware_version: Current firmware version
        """
        self.config = config
        self.role = role
        self.firmware_version = firmware_version

        # HTTP client
        self._client: Optional[httpx.AsyncClient] = None

        # Background tasks
        self._running = False
        self._tasks: list[asyncio.Task] = []

        # Telemetry aggregator
        self.telemetry = TelemetryAggregator()

        # Device information
        self._hostname = platform.node()
        self._hardware_model = self._detect_hardware_model()
        self._os_version = platform.platform()
        self._python_version = platform.python_version()

        # Status
        self._registered = False
        self._last_heartbeat: Optional[datetime] = None
        self._last_health_report: Optional[datetime] = None
        self._last_telemetry_report: Optional[datetime] = None
        self._last_firmware_check: Optional[datetime] = None

    def _detect_hardware_model(self) -> str:
        """Detect Raspberry Pi hardware model.

        Returns:
            Hardware model string
        """
        try:
            with open("/proc/cpuinfo", "r") as f:
                for line in f:
                    if line.startswith("Model"):
                        return line.split(":")[-1].strip()
        except Exception:
            pass

        return platform.machine()

    async def start(self) -> None:
        """Start cloud reporter background service."""
        if self._running:
            logger.warning("Cloud reporter already running")
            return

        logger.info(
            f"Starting cloud reporter (device: {self.config.device_id}, "
            f"cloud: {self.config.cloud_api_url})"
        )

        # Create HTTP client
        self._client = httpx.AsyncClient(
            base_url=str(self.config.cloud_api_url),
            timeout=self.config.request_timeout_sec,
            headers=self._get_auth_headers()
        )

        # Register device
        try:
            await self._register_device()
        except Exception as e:
            logger.error(f"Failed to register device: {e}")
            # Continue anyway - will retry on heartbeat

        # Start background tasks
        self._running = True

        if self.config.enable_heartbeat:
            task = asyncio.create_task(self._heartbeat_loop())
            self._tasks.append(task)

        if self.config.enable_health_reporting:
            task = asyncio.create_task(self._health_reporting_loop())
            self._tasks.append(task)

        if self.config.enable_telemetry_reporting:
            task = asyncio.create_task(self._telemetry_reporting_loop())
            self._tasks.append(task)

        if self.config.enable_firmware_checks:
            task = asyncio.create_task(self._firmware_check_loop())
            self._tasks.append(task)

        logger.info("Cloud reporter started")

    async def stop(self) -> None:
        """Stop cloud reporter and cleanup."""
        if not self._running:
            return

        logger.info("Stopping cloud reporter...")

        self._running = False

        # Cancel background tasks
        for task in self._tasks:
            task.cancel()

        # Wait for tasks to complete
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

        # Close HTTP client
        if self._client:
            await self._client.aclose()
            self._client = None

        logger.info("Cloud reporter stopped")

    def _get_auth_headers(self) -> dict[str, str]:
        """Get authentication headers for API requests.

        Returns:
            Headers dictionary
        """
        headers = {
            "User-Agent": f"LiveTV-EdgeDevice/{self.firmware_version}"
        }

        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"

        return headers

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        json_data: Optional[dict] = None,
        retries: Optional[int] = None
    ) -> Optional[dict]:
        """Make HTTP request to cloud API with retry logic.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            json_data: JSON request body
            retries: Number of retries (uses config default if None)

        Returns:
            Response JSON data or None on failure
        """
        if not self._client:
            logger.error("HTTP client not initialized")
            return None

        if retries is None:
            retries = self.config.max_retries

        last_error = None

        for attempt in range(retries + 1):
            try:
                response = await self._client.request(
                    method=method,
                    url=endpoint,
                    json=json_data
                )

                response.raise_for_status()
                return response.json()

            except httpx.HTTPStatusError as e:
                last_error = e
                logger.warning(
                    f"HTTP error {e.response.status_code} on {method} {endpoint}: {e}"
                )

                # Don't retry client errors (4xx)
                if 400 <= e.response.status_code < 500:
                    break

            except Exception as e:
                last_error = e
                logger.warning(f"Request failed ({attempt + 1}/{retries + 1}): {e}")

            # Wait before retry
            if attempt < retries:
                await asyncio.sleep(self.config.retry_delay_sec)

        logger.error(
            f"Request failed after {retries + 1} attempts: {last_error}"
        )
        return None

    async def _register_device(self) -> bool:
        """Register device with cloud API.

        Returns:
            True if registration successful
        """
        logger.info("Registering device with cloud API...")

        data = {
            "device_id": self.config.device_id,
            "location_id": self.config.location_id,
            "role": self.role.value,
            "hostname": self._hostname,
            "hardware_model": self._hardware_model,
            "firmware_version": self.firmware_version,
            "os_version": self._os_version,
            "python_version": self._python_version,
            "capabilities": [
                "ad_detection",
                "tv_control",
                "video_passthrough"
            ]
        }

        result = await self._make_request(
            "POST",
            "/api/v1/devices/register",
            json_data=data
        )

        if result:
            self._registered = True
            logger.info(f"Device registered successfully (ID: {result.get('id')})")
            return True

        logger.error("Device registration failed")
        return False

    async def _heartbeat_loop(self) -> None:
        """Background task for sending heartbeats."""
        logger.info(
            f"Starting heartbeat loop (interval: {self.config.heartbeat_interval_sec}s)"
        )

        while self._running:
            try:
                await self._send_heartbeat()
            except Exception as e:
                logger.error(f"Heartbeat error: {e}")

            await asyncio.sleep(self.config.heartbeat_interval_sec)

    async def _send_heartbeat(self) -> bool:
        """Send heartbeat to cloud API.

        Returns:
            True if heartbeat successful
        """
        data = {
            "device_id": self.config.device_id,
            "status": DeviceStatus.ONLINE.value
        }

        result = await self._make_request(
            "POST",
            "/api/v1/devices/heartbeat",
            json_data=data
        )

        if result:
            self._last_heartbeat = datetime.now(timezone.utc)
            logger.debug("Heartbeat sent successfully")
            return True

        return False

    async def _health_reporting_loop(self) -> None:
        """Background task for health monitoring reports."""
        logger.info(
            f"Starting health reporting loop (interval: {self.config.health_interval_sec}s)"
        )

        # Initial delay to stagger with heartbeat
        await asyncio.sleep(10.0)

        while self._running:
            try:
                await self._report_health()
            except Exception as e:
                logger.error(f"Health reporting error: {e}")

            await asyncio.sleep(self.config.health_interval_sec)

    async def _report_health(self) -> bool:
        """Report device health to cloud API.

        Returns:
            True if report successful
        """
        # Gather health metrics
        cpu_percent = psutil.cpu_percent(interval=1.0)
        memory = psutil.virtual_memory()
        temperature = self._get_cpu_temperature()

        data = {
            "device_id": self.config.device_id,
            "cpu_usage_percent": cpu_percent,
            "memory_used_mb": memory.used / (1024 * 1024),
            "memory_total_mb": memory.total / (1024 * 1024),
            "temperature_celsius": temperature
        }

        result = await self._make_request(
            "POST",
            "/api/v1/health",
            json_data=data
        )

        if result:
            self._last_health_report = datetime.now(timezone.utc)
            logger.info(
                f"Health reported: CPU {cpu_percent:.1f}%, "
                f"Mem {memory.percent:.1f}%, Temp {temperature:.1f}°C"
            )
            return True

        return False

    def _get_cpu_temperature(self) -> float:
        """Get CPU temperature.

        Returns:
            Temperature in Celsius
        """
        try:
            # Raspberry Pi temperature
            with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
                temp = float(f.read().strip()) / 1000.0
                return temp
        except Exception:
            # Fallback - use sensors if available
            try:
                temps = psutil.sensors_temperatures()
                if "cpu_thermal" in temps:
                    return temps["cpu_thermal"][0].current
            except Exception:
                pass

        return 0.0

    async def _telemetry_reporting_loop(self) -> None:
        """Background task for telemetry reporting."""
        logger.info(
            f"Starting telemetry reporting loop (interval: {self.config.telemetry_interval_sec}s)"
        )

        # Initial delay to stagger with other tasks
        await asyncio.sleep(20.0)

        while self._running:
            try:
                await self._report_telemetry()
            except Exception as e:
                logger.error(f"Telemetry reporting error: {e}")

            await asyncio.sleep(self.config.telemetry_interval_sec)

    async def _report_telemetry(self) -> bool:
        """Report telemetry to cloud API.

        Returns:
            True if report successful
        """
        # Get aggregated telemetry
        period = self.telemetry.get_and_reset()

        # Skip if no data
        if period.total_frames_processed == 0:
            logger.debug("No telemetry data to report")
            return True

        data = {
            "device_id": self.config.device_id,
            "total_ad_breaks": period.total_ad_breaks,
            "total_ad_duration_seconds": period.total_ad_duration_seconds,
            "average_fps": period.average_fps,
            "average_latency_ms": period.average_latency_ms,
            "total_frames_processed": period.total_frames_processed,
            "total_frames_dropped": period.total_frames_dropped,
            "period_start": period.period_start.isoformat(),
            "period_end": period.period_end.isoformat()
        }

        result = await self._make_request(
            "POST",
            "/api/v1/telemetry",
            json_data=data
        )

        if result:
            self._last_telemetry_report = datetime.now(timezone.utc)
            logger.info(
                f"Telemetry reported: {period.total_ad_breaks} ad breaks, "
                f"{period.total_frames_processed} frames, "
                f"{period.average_fps:.1f} avg FPS"
            )
            return True

        return False

    async def _firmware_check_loop(self) -> None:
        """Background task for firmware update checks."""
        logger.info(
            f"Starting firmware check loop (interval: {self.config.firmware_check_interval_sec}s)"
        )

        # Initial delay
        await asyncio.sleep(30.0)

        while self._running:
            try:
                await self._check_firmware_updates()
            except Exception as e:
                logger.error(f"Firmware check error: {e}")

            await asyncio.sleep(self.config.firmware_check_interval_sec)

    async def _check_firmware_updates(self) -> Optional[dict]:
        """Check for firmware updates.

        Returns:
            Latest firmware info or None
        """
        result = await self._make_request(
            "GET",
            "/api/v1/firmware/latest"
        )

        if result:
            self._last_firmware_check = datetime.now(timezone.utc)
            latest_version = result.get("version")

            if latest_version and latest_version != self.firmware_version:
                logger.warning(
                    f"Firmware update available: {self.firmware_version} → {latest_version}"
                )
                logger.info(f"Download URL: {result.get('download_url')}")
            else:
                logger.debug(f"Firmware up to date: {self.firmware_version}")

            return result

        return None

    def get_stats(self) -> dict:
        """Get cloud reporter statistics.

        Returns:
            Statistics dictionary
        """
        return {
            "registered": self._registered,
            "running": self._running,
            "device_id": self.config.device_id,
            "firmware_version": self.firmware_version,
            "last_heartbeat": self._last_heartbeat,
            "last_health_report": self._last_health_report,
            "last_telemetry_report": self._last_telemetry_report,
            "last_firmware_check": self._last_firmware_check,
        }
