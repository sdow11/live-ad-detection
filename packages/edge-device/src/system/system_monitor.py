"""System monitoring and resource tracking.

Monitors CPU, memory, disk, temperature, and application performance.
Provides real-time metrics and historical data for diagnostics.
"""

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import psutil

logger = logging.getLogger(__name__)


@dataclass
class SystemMetrics:
    """System resource metrics snapshot."""

    timestamp: datetime
    cpu_percent: float
    cpu_temp: Optional[float]
    memory_percent: float
    memory_used_mb: int
    memory_total_mb: int
    disk_percent: float
    disk_used_gb: float
    disk_total_gb: float
    network_sent_mb: float
    network_recv_mb: float
    process_count: int
    uptime_seconds: int

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "cpu_percent": self.cpu_percent,
            "cpu_temp": self.cpu_temp,
            "memory_percent": self.memory_percent,
            "memory_used_mb": self.memory_used_mb,
            "memory_total_mb": self.memory_total_mb,
            "disk_percent": self.disk_percent,
            "disk_used_gb": self.disk_used_gb,
            "disk_total_gb": self.disk_total_gb,
            "network_sent_mb": self.network_sent_mb,
            "network_recv_mb": self.network_recv_mb,
            "process_count": self.process_count,
            "uptime_seconds": self.uptime_seconds
        }


@dataclass
class AppMetrics:
    """Application performance metrics."""

    app_id: str
    status: str
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    runtime_seconds: int = 0
    error_count: int = 0
    last_error: Optional[str] = None
    launch_count: int = 0
    crash_count: int = 0

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "app_id": self.app_id,
            "status": self.status,
            "cpu_percent": self.cpu_percent,
            "memory_mb": self.memory_mb,
            "runtime_seconds": self.runtime_seconds,
            "error_count": self.error_count,
            "last_error": self.last_error,
            "launch_count": self.launch_count,
            "crash_count": self.crash_count
        }


class SystemMonitor:
    """System resource monitor."""

    def __init__(self, history_size: int = 60):
        """Initialize system monitor.

        Args:
            history_size: Number of metrics snapshots to keep in history
        """
        self.history_size = history_size
        self.metrics_history: List[SystemMetrics] = []
        self.app_metrics: Dict[str, AppMetrics] = {}

        self.monitoring_task: Optional[asyncio.Task] = None
        self.running = False
        self.update_interval = 5  # seconds

        # Boot time
        self.boot_time = datetime.fromtimestamp(psutil.boot_time())

        # Network baseline
        net_io = psutil.net_io_counters()
        self.baseline_sent = net_io.bytes_sent / (1024 * 1024)  # MB
        self.baseline_recv = net_io.bytes_recv / (1024 * 1024)  # MB

    def get_cpu_temperature(self) -> Optional[float]:
        """Get CPU temperature.

        Returns:
            Temperature in Celsius or None if unavailable
        """
        try:
            # Try vcgencmd on Raspberry Pi
            result = os.popen('vcgencmd measure_temp').readline()
            if result:
                temp_str = result.replace("temp=", "").replace("'C\n", "")
                return float(temp_str)
        except:
            pass

        try:
            # Try reading from thermal zone (Linux)
            with open('/sys/class/thermal/thermal_zone0/temp') as f:
                temp = int(f.read().strip())
                return temp / 1000.0  # Convert millidegrees to degrees
        except:
            pass

        # Try psutil sensors (if available)
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                # Get first available temperature
                for name, entries in temps.items():
                    if entries:
                        return entries[0].current
        except:
            pass

        return None

    def collect_metrics(self) -> SystemMetrics:
        """Collect current system metrics.

        Returns:
            SystemMetrics snapshot
        """
        # CPU
        cpu_percent = psutil.cpu_percent(interval=1)
        cpu_temp = self.get_cpu_temperature()

        # Memory
        memory = psutil.virtual_memory()
        memory_percent = memory.percent
        memory_used_mb = memory.used // (1024 * 1024)
        memory_total_mb = memory.total // (1024 * 1024)

        # Disk
        disk = psutil.disk_usage('/')
        disk_percent = disk.percent
        disk_used_gb = disk.used / (1024 * 1024 * 1024)
        disk_total_gb = disk.total / (1024 * 1024 * 1024)

        # Network
        net_io = psutil.net_io_counters()
        network_sent_mb = (net_io.bytes_sent / (1024 * 1024)) - self.baseline_sent
        network_recv_mb = (net_io.bytes_recv / (1024 * 1024)) - self.baseline_recv

        # Processes
        process_count = len(psutil.pids())

        # Uptime
        uptime_seconds = int((datetime.now() - self.boot_time).total_seconds())

        return SystemMetrics(
            timestamp=datetime.now(),
            cpu_percent=cpu_percent,
            cpu_temp=cpu_temp,
            memory_percent=memory_percent,
            memory_used_mb=memory_used_mb,
            memory_total_mb=memory_total_mb,
            disk_percent=disk_percent,
            disk_used_gb=disk_used_gb,
            disk_total_gb=disk_total_gb,
            network_sent_mb=network_sent_mb,
            network_recv_mb=network_recv_mb,
            process_count=process_count,
            uptime_seconds=uptime_seconds
        )

    def get_latest_metrics(self) -> Optional[SystemMetrics]:
        """Get the most recent metrics snapshot.

        Returns:
            Latest SystemMetrics or None
        """
        if self.metrics_history:
            return self.metrics_history[-1]
        return None

    def get_metrics_history(self, minutes: int = 5) -> List[SystemMetrics]:
        """Get metrics history for the last N minutes.

        Args:
            minutes: Number of minutes of history to return

        Returns:
            List of SystemMetrics
        """
        cutoff = datetime.now().timestamp() - (minutes * 60)
        return [
            m for m in self.metrics_history
            if m.timestamp.timestamp() >= cutoff
        ]

    def get_average_metrics(self, minutes: int = 5) -> Dict[str, float]:
        """Calculate average metrics over time period.

        Args:
            minutes: Time period in minutes

        Returns:
            Dictionary of averaged metrics
        """
        history = self.get_metrics_history(minutes)

        if not history:
            return {}

        return {
            "cpu_percent": sum(m.cpu_percent for m in history) / len(history),
            "memory_percent": sum(m.memory_percent for m in history) / len(history),
            "disk_percent": sum(m.disk_percent for m in history) / len(history),
            "cpu_temp": sum(m.cpu_temp for m in history if m.cpu_temp) / len([m for m in history if m.cpu_temp]) if any(m.cpu_temp for m in history) else None
        }

    def register_app(self, app_id: str) -> None:
        """Register an app for monitoring.

        Args:
            app_id: App identifier
        """
        if app_id not in self.app_metrics:
            self.app_metrics[app_id] = AppMetrics(
                app_id=app_id,
                status="stopped"
            )
            logger.debug(f"Registered app for monitoring: {app_id}")

    def update_app_status(self, app_id: str, status: str) -> None:
        """Update app status.

        Args:
            app_id: App identifier
            status: New status
        """
        if app_id not in self.app_metrics:
            self.register_app(app_id)

        self.app_metrics[app_id].status = status

        if status == "running":
            self.app_metrics[app_id].launch_count += 1

    def record_app_error(self, app_id: str, error: str) -> None:
        """Record an app error.

        Args:
            app_id: App identifier
            error: Error message
        """
        if app_id not in self.app_metrics:
            self.register_app(app_id)

        self.app_metrics[app_id].error_count += 1
        self.app_metrics[app_id].last_error = error
        logger.warning(f"App error recorded for {app_id}: {error}")

    def record_app_crash(self, app_id: str) -> None:
        """Record an app crash.

        Args:
            app_id: App identifier
        """
        if app_id not in self.app_metrics:
            self.register_app(app_id)

        self.app_metrics[app_id].crash_count += 1
        logger.error(f"App crash recorded for {app_id}")

    def get_app_metrics(self, app_id: str) -> Optional[AppMetrics]:
        """Get metrics for a specific app.

        Args:
            app_id: App identifier

        Returns:
            AppMetrics or None
        """
        return self.app_metrics.get(app_id)

    def get_all_app_metrics(self) -> List[AppMetrics]:
        """Get metrics for all apps.

        Returns:
            List of AppMetrics
        """
        return list(self.app_metrics.values())

    async def start(self, interval: int = 5) -> None:
        """Start monitoring.

        Args:
            interval: Update interval in seconds
        """
        self.update_interval = interval
        self.running = True
        self.monitoring_task = asyncio.create_task(self._monitoring_loop())
        logger.info(f"System monitoring started (interval: {interval}s)")

    async def stop(self) -> None:
        """Stop monitoring."""
        self.running = False

        if self.monitoring_task:
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass

        logger.info("System monitoring stopped")

    async def _monitoring_loop(self) -> None:
        """Background monitoring loop."""
        while self.running:
            try:
                # Collect metrics
                metrics = self.collect_metrics()

                # Add to history
                self.metrics_history.append(metrics)

                # Trim history
                if len(self.metrics_history) > self.history_size:
                    self.metrics_history = self.metrics_history[-self.history_size:]

                # Log warnings for high resource usage
                if metrics.cpu_percent > 90:
                    logger.warning(f"High CPU usage: {metrics.cpu_percent:.1f}%")

                if metrics.memory_percent > 90:
                    logger.warning(f"High memory usage: {metrics.memory_percent:.1f}%")

                if metrics.cpu_temp and metrics.cpu_temp > 80:
                    logger.warning(f"High CPU temperature: {metrics.cpu_temp:.1f}°C")

                if metrics.disk_percent > 90:
                    logger.warning(f"Low disk space: {metrics.disk_percent:.1f}% used")

                await asyncio.sleep(self.update_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}", exc_info=True)
                await asyncio.sleep(self.update_interval)

    def get_system_info(self) -> Dict[str, any]:
        """Get static system information.

        Returns:
            System information dictionary
        """
        return {
            "hostname": os.uname().nodename,
            "platform": os.uname().sysname,
            "architecture": os.uname().machine,
            "cpu_count": psutil.cpu_count(),
            "memory_total_gb": psutil.virtual_memory().total / (1024 ** 3),
            "disk_total_gb": psutil.disk_usage('/').total / (1024 ** 3),
            "boot_time": self.boot_time.isoformat(),
            "python_version": os.sys.version.split()[0]
        }


# Global system monitor instance
system_monitor = SystemMonitor()
