"""Health check system.

Monitors system health and component status.
Provides health endpoints for monitoring and alerts.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class HealthStatus(str, Enum):
    """Health status levels."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class HealthCheckResult:
    """Result of a health check."""

    component: str
    status: HealthStatus
    message: str
    timestamp: datetime
    details: Dict[str, any] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "component": self.component,
            "status": self.status.value,
            "message": self.message,
            "timestamp": self.timestamp.isoformat(),
            "details": self.details or {}
        }


class HealthChecker:
    """System health checker."""

    def __init__(self):
        """Initialize health checker."""
        self.check_results: Dict[str, HealthCheckResult] = {}
        self.check_interval = 30  # seconds
        self.running = False
        self.check_task: Optional[asyncio.Task] = None

    async def check_cpu_health(self) -> HealthCheckResult:
        """Check CPU health.

        Returns:
            HealthCheckResult
        """
        from system.system_monitor import system_monitor

        metrics = system_monitor.get_latest_metrics()

        if not metrics:
            return HealthCheckResult(
                component="cpu",
                status=HealthStatus.UNKNOWN,
                message="No metrics available",
                timestamp=datetime.now()
            )

        # Check CPU usage
        if metrics.cpu_percent > 95:
            status = HealthStatus.UNHEALTHY
            message = f"CPU usage critically high: {metrics.cpu_percent:.1f}%"
        elif metrics.cpu_percent > 80:
            status = HealthStatus.DEGRADED
            message = f"CPU usage high: {metrics.cpu_percent:.1f}%"
        else:
            status = HealthStatus.HEALTHY
            message = f"CPU usage normal: {metrics.cpu_percent:.1f}%"

        # Check temperature
        if metrics.cpu_temp:
            if metrics.cpu_temp > 85:
                status = HealthStatus.UNHEALTHY
                message += f", temperature critical: {metrics.cpu_temp:.1f}°C"
            elif metrics.cpu_temp > 75:
                if status == HealthStatus.HEALTHY:
                    status = HealthStatus.DEGRADED
                message += f", temperature high: {metrics.cpu_temp:.1f}°C"
            else:
                message += f", temperature normal: {metrics.cpu_temp:.1f}°C"

        return HealthCheckResult(
            component="cpu",
            status=status,
            message=message,
            timestamp=datetime.now(),
            details={
                "cpu_percent": metrics.cpu_percent,
                "cpu_temp": metrics.cpu_temp
            }
        )

    async def check_memory_health(self) -> HealthCheckResult:
        """Check memory health.

        Returns:
            HealthCheckResult
        """
        from system.system_monitor import system_monitor

        metrics = system_monitor.get_latest_metrics()

        if not metrics:
            return HealthCheckResult(
                component="memory",
                status=HealthStatus.UNKNOWN,
                message="No metrics available",
                timestamp=datetime.now()
            )

        if metrics.memory_percent > 95:
            status = HealthStatus.UNHEALTHY
            message = f"Memory usage critically high: {metrics.memory_percent:.1f}%"
        elif metrics.memory_percent > 85:
            status = HealthStatus.DEGRADED
            message = f"Memory usage high: {metrics.memory_percent:.1f}%"
        else:
            status = HealthStatus.HEALTHY
            message = f"Memory usage normal: {metrics.memory_percent:.1f}%"

        return HealthCheckResult(
            component="memory",
            status=status,
            message=message,
            timestamp=datetime.now(),
            details={
                "memory_percent": metrics.memory_percent,
                "memory_used_mb": metrics.memory_used_mb,
                "memory_total_mb": metrics.memory_total_mb
            }
        )

    async def check_disk_health(self) -> HealthCheckResult:
        """Check disk health.

        Returns:
            HealthCheckResult
        """
        from system.system_monitor import system_monitor

        metrics = system_monitor.get_latest_metrics()

        if not metrics:
            return HealthCheckResult(
                component="disk",
                status=HealthStatus.UNKNOWN,
                message="No metrics available",
                timestamp=datetime.now()
            )

        if metrics.disk_percent > 95:
            status = HealthStatus.UNHEALTHY
            message = f"Disk space critically low: {metrics.disk_percent:.1f}% used"
        elif metrics.disk_percent > 85:
            status = HealthStatus.DEGRADED
            message = f"Disk space low: {metrics.disk_percent:.1f}% used"
        else:
            status = HealthStatus.HEALTHY
            message = f"Disk space sufficient: {metrics.disk_percent:.1f}% used"

        return HealthCheckResult(
            component="disk",
            status=status,
            message=message,
            timestamp=datetime.now(),
            details={
                "disk_percent": metrics.disk_percent,
                "disk_used_gb": metrics.disk_used_gb,
                "disk_total_gb": metrics.disk_total_gb
            }
        )

    async def check_network_health(self) -> HealthCheckResult:
        """Check network health.

        Returns:
            HealthCheckResult
        """
        import subprocess

        try:
            # Ping local gateway
            result = subprocess.run(
                ["ping", "-c", "1", "-W", "2", "8.8.8.8"],
                capture_output=True,
                timeout=5
            )

            if result.returncode == 0:
                status = HealthStatus.HEALTHY
                message = "Network connectivity OK"
            else:
                status = HealthStatus.DEGRADED
                message = "Internet connectivity issues"

        except subprocess.TimeoutExpired:
            status = HealthStatus.DEGRADED
            message = "Network ping timeout"
        except Exception as e:
            status = HealthStatus.UNKNOWN
            message = f"Network check failed: {e}"

        return HealthCheckResult(
            component="network",
            status=status,
            message=message,
            timestamp=datetime.now()
        )

    async def check_cluster_health(self) -> HealthCheckResult:
        """Check cluster health.

        Returns:
            HealthCheckResult
        """
        try:
            from local_fleet.coordinator import coordinator

            cluster_info = coordinator.get_cluster_info()

            if cluster_info["is_leader"]:
                message = "Device is cluster leader"
                status = HealthStatus.HEALTHY
            elif cluster_info["leader_id"]:
                message = f"Device is follower (leader: {cluster_info['leader_id']})"
                status = HealthStatus.HEALTHY
            else:
                message = "No cluster leader elected"
                status = HealthStatus.DEGRADED

            return HealthCheckResult(
                component="cluster",
                status=status,
                message=message,
                timestamp=datetime.now(),
                details=cluster_info
            )

        except Exception as e:
            return HealthCheckResult(
                component="cluster",
                status=HealthStatus.UNKNOWN,
                message=f"Cluster check failed: {e}",
                timestamp=datetime.now()
            )

    async def check_apps_health(self) -> HealthCheckResult:
        """Check apps health.

        Returns:
            HealthCheckResult
        """
        from system.system_monitor import system_monitor

        app_metrics = system_monitor.get_all_app_metrics()

        total_apps = len(app_metrics)
        running_apps = sum(1 for m in app_metrics if m.status == "running")
        error_apps = sum(1 for m in app_metrics if m.error_count > 0)
        crashed_apps = sum(1 for m in app_metrics if m.crash_count > 0)

        if crashed_apps > 0:
            status = HealthStatus.DEGRADED
            message = f"{crashed_apps} app(s) have crashed"
        elif error_apps > total_apps // 2:
            status = HealthStatus.DEGRADED
            message = f"{error_apps}/{total_apps} apps have errors"
        else:
            status = HealthStatus.HEALTHY
            message = f"Apps healthy ({running_apps} running, {total_apps} total)"

        return HealthCheckResult(
            component="apps",
            status=status,
            message=message,
            timestamp=datetime.now(),
            details={
                "total_apps": total_apps,
                "running_apps": running_apps,
                "error_apps": error_apps,
                "crashed_apps": crashed_apps
            }
        )

    async def run_all_checks(self) -> Dict[str, HealthCheckResult]:
        """Run all health checks.

        Returns:
            Dictionary of component -> HealthCheckResult
        """
        checks = [
            self.check_cpu_health(),
            self.check_memory_health(),
            self.check_disk_health(),
            self.check_network_health(),
            self.check_cluster_health(),
            self.check_apps_health()
        ]

        results = await asyncio.gather(*checks, return_exceptions=True)

        health_results = {}
        for result in results:
            if isinstance(result, HealthCheckResult):
                health_results[result.component] = result
                self.check_results[result.component] = result
            elif isinstance(result, Exception):
                logger.error(f"Health check failed: {result}")

        return health_results

    def get_overall_health(self) -> HealthStatus:
        """Get overall system health status.

        Returns:
            Overall HealthStatus
        """
        if not self.check_results:
            return HealthStatus.UNKNOWN

        statuses = [r.status for r in self.check_results.values()]

        # If any component is unhealthy, system is unhealthy
        if HealthStatus.UNHEALTHY in statuses:
            return HealthStatus.UNHEALTHY

        # If any component is degraded, system is degraded
        if HealthStatus.DEGRADED in statuses:
            return HealthStatus.DEGRADED

        # If any component is unknown, system is unknown
        if HealthStatus.UNKNOWN in statuses:
            return HealthStatus.UNKNOWN

        return HealthStatus.HEALTHY

    def get_health_summary(self) -> dict:
        """Get health summary.

        Returns:
            Health summary dictionary
        """
        overall = self.get_overall_health()

        return {
            "overall_status": overall.value,
            "timestamp": datetime.now().isoformat(),
            "components": {
                name: result.to_dict()
                for name, result in self.check_results.items()
            }
        }

    async def start(self, interval: int = 30) -> None:
        """Start health checking.

        Args:
            interval: Check interval in seconds
        """
        self.check_interval = interval
        self.running = True
        self.check_task = asyncio.create_task(self._health_check_loop())
        logger.info(f"Health checking started (interval: {interval}s)")

    async def stop(self) -> None:
        """Stop health checking."""
        self.running = False

        if self.check_task:
            self.check_task.cancel()
            try:
                await self.check_task
            except asyncio.CancelledError:
                pass

        logger.info("Health checking stopped")

    async def _health_check_loop(self) -> None:
        """Background health check loop."""
        while self.running:
            try:
                await self.run_all_checks()

                # Log overall health
                overall = self.get_overall_health()
                if overall != HealthStatus.HEALTHY:
                    logger.warning(f"System health: {overall.value}")

                await asyncio.sleep(self.check_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in health check loop: {e}", exc_info=True)
                await asyncio.sleep(self.check_interval)


# Global health checker instance
health_checker = HealthChecker()
