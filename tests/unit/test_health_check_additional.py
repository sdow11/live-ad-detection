"""Additional tests for health checker to improve coverage."""

import pytest
from datetime import datetime

from system.health_check import HealthChecker, HealthStatus, HealthCheckResult


class TestHealthCheckResult:
    """Test HealthCheckResult dataclass."""

    def test_health_check_result_creation(self):
        """Test creating health check result."""
        result = HealthCheckResult(
            component="test_component",
            status=HealthStatus.HEALTHY,
            message="All good",
            timestamp=datetime.now(),
            details={"cpu": 45.0, "memory": 60.0}
        )

        assert result.component == "test_component"
        assert result.status == HealthStatus.HEALTHY
        assert result.message == "All good"
        assert result.details["cpu"] == 45.0

    def test_health_check_result_to_dict(self):
        """Test converting result to dictionary."""
        result = HealthCheckResult(
            component="test_component",
            status=HealthStatus.DEGRADED,
            message="High CPU",
            timestamp=datetime.now(),
            details={"cpu": 85.0}
        )

        result_dict = result.to_dict()

        assert result_dict["component"] == "test_component"
        assert result_dict["status"] == "degraded"
        assert result_dict["message"] == "High CPU"
        assert "timestamp" in result_dict
        assert result_dict["details"]["cpu"] == 85.0


class TestHealthCheckerAdditional:
    """Additional health checker tests for better coverage."""

    def test_get_health_summary_structure(self, health_checker):
        """Test health summary has correct structure."""
        summary = health_checker.get_health_summary()

        assert isinstance(summary, dict)
        assert "overall_status" in summary
        assert "components" in summary
        assert isinstance(summary["components"], dict)

    def test_multiple_health_checks(self, health_checker):
        """Test running health checks multiple times."""
        for i in range(3):
            summary = health_checker.get_health_summary()
            assert isinstance(summary, dict)
            assert "overall_status" in summary

    def test_health_status_enum_values(self):
        """Test HealthStatus enum has expected values."""
        assert hasattr(HealthStatus, "HEALTHY")
        assert hasattr(HealthStatus, "DEGRADED")
        assert hasattr(HealthStatus, "UNHEALTHY")

        # Test string conversion
        assert HealthStatus.HEALTHY.value == "healthy"
        assert HealthStatus.DEGRADED.value == "degraded"
        assert HealthStatus.UNHEALTHY.value == "unhealthy"

    @pytest.mark.asyncio
    async def test_async_health_check_operations(self, health_checker):
        """Test health checker works in async context."""
        # Start the health checker
        await health_checker.start(interval=60)

        # Get summary
        summary = health_checker.get_health_summary()
        assert isinstance(summary, dict)

        # Stop the health checker
        await health_checker.stop()

        assert not health_checker.running

    @pytest.mark.asyncio
    async def test_health_checker_start_stop_multiple_times(self, health_checker):
        """Test starting and stopping health checker multiple times."""
        # First start/stop
        await health_checker.start(interval=60)
        assert health_checker.running
        await health_checker.stop()
        assert not health_checker.running

        # Second start/stop
        await health_checker.start(interval=60)
        assert health_checker.running
        await health_checker.stop()
        assert not health_checker.running
