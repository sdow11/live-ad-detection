"""Unit tests for health checking."""

import pytest
from datetime import datetime


@pytest.mark.unit
class TestHealthChecker:
    """Test health checking functionality."""

    @pytest.mark.asyncio
    async def test_check_cpu_health(self, health_checker, system_monitor, mock_psutil):
        """Test CPU health check."""
        # Ensure monitor has metrics
        system_monitor.collect_metrics()

        result = await health_checker.check_cpu_health()

        assert result is not None
        assert result.component == "cpu"
        assert result.status in ["healthy", "degraded", "unhealthy", "unknown"]
        assert isinstance(result.timestamp, datetime)

    @pytest.mark.asyncio
    async def test_check_memory_health(self, health_checker, system_monitor, mock_psutil):
        """Test memory health check."""
        system_monitor.collect_metrics()

        result = await health_checker.check_memory_health()

        assert result is not None
        assert result.component == "memory"
        assert result.status in ["healthy", "degraded", "unhealthy", "unknown"]

    @pytest.mark.asyncio
    async def test_check_disk_health(self, health_checker, system_monitor, mock_psutil):
        """Test disk health check."""
        system_monitor.collect_metrics()

        result = await health_checker.check_disk_health()

        assert result is not None
        assert result.component == "disk"
        assert result.status in ["healthy", "degraded", "unhealthy", "unknown"]

    @pytest.mark.asyncio
    @pytest.mark.requires_network
    async def test_check_network_health(self, health_checker):
        """Test network health check."""
        result = await health_checker.check_network_health()

        assert result is not None
        assert result.component == "network"
        assert result.status in ["healthy", "degraded", "unhealthy", "unknown"]

    @pytest.mark.asyncio
    async def test_check_apps_health(self, health_checker, system_monitor):
        """Test apps health check."""
        # Register some test apps
        system_monitor.register_app("app1")
        system_monitor.register_app("app2")

        result = await health_checker.check_apps_health()

        assert result is not None
        assert result.component == "apps"
        assert result.status in ["healthy", "degraded", "unhealthy"]

    @pytest.mark.asyncio
    async def test_run_all_checks(self, health_checker, system_monitor, mock_psutil):
        """Test running all health checks."""
        system_monitor.collect_metrics()

        results = await health_checker.run_all_checks()

        assert isinstance(results, dict)
        assert len(results) > 0
        assert "cpu" in results
        assert "memory" in results
        assert "disk" in results

    def test_get_overall_health(self, health_checker):
        """Test overall health status calculation."""
        from system.health_check import HealthStatus, HealthCheckResult

        # Add some health results
        health_checker.check_results = {
            "cpu": HealthCheckResult(
                component="cpu",
                status=HealthStatus.HEALTHY,
                message="CPU OK",
                timestamp=datetime.now()
            ),
            "memory": HealthCheckResult(
                component="memory",
                status=HealthStatus.HEALTHY,
                message="Memory OK",
                timestamp=datetime.now()
            )
        }

        overall = health_checker.get_overall_health()
        assert overall == HealthStatus.HEALTHY

        # Add a degraded component
        health_checker.check_results["disk"] = HealthCheckResult(
            component="disk",
            status=HealthStatus.DEGRADED,
            message="Disk high",
            timestamp=datetime.now()
        )

        overall = health_checker.get_overall_health()
        assert overall == HealthStatus.DEGRADED

        # Add an unhealthy component
        health_checker.check_results["network"] = HealthCheckResult(
            component="network",
            status=HealthStatus.UNHEALTHY,
            message="Network down",
            timestamp=datetime.now()
        )

        overall = health_checker.get_overall_health()
        assert overall == HealthStatus.UNHEALTHY

    def test_get_health_summary(self, health_checker):
        """Test health summary generation."""
        from system.health_check import HealthStatus, HealthCheckResult

        health_checker.check_results = {
            "cpu": HealthCheckResult(
                component="cpu",
                status=HealthStatus.HEALTHY,
                message="CPU OK",
                timestamp=datetime.now()
            )
        }

        summary = health_checker.get_health_summary()

        assert isinstance(summary, dict)
        assert "overall_status" in summary
        assert "timestamp" in summary
        assert "components" in summary
        assert "cpu" in summary["components"]

    def test_health_check_result_to_dict(self):
        """Test health check result serialization."""
        from system.health_check import HealthStatus, HealthCheckResult

        result = HealthCheckResult(
            component="test",
            status=HealthStatus.HEALTHY,
            message="Test OK",
            timestamp=datetime.now(),
            details={"key": "value"}
        )

        result_dict = result.to_dict()

        assert isinstance(result_dict, dict)
        assert result_dict["component"] == "test"
        assert result_dict["status"] == "healthy"
        assert result_dict["message"] == "Test OK"
        assert "timestamp" in result_dict
        assert result_dict["details"]["key"] == "value"

    @pytest.mark.asyncio
    async def test_start_stop(self, health_checker):
        """Test starting and stopping health checks."""
        await health_checker.start(interval=5)
        assert health_checker.running is True

        await health_checker.stop()
        assert health_checker.running is False
