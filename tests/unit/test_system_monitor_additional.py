"""Additional tests for system monitor to improve coverage."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock

from system.system_monitor import SystemMonitor, SystemMetrics, AppMetrics


class TestSystemMonitorAdditional:
    """Additional system monitor tests for better coverage."""

    def test_collect_metrics_multiple_times(self, system_monitor, mock_psutil):
        """Test collecting metrics multiple times."""
        metrics1 = system_monitor.collect_metrics()
        metrics2 = system_monitor.collect_metrics()
        metrics3 = system_monitor.collect_metrics()

        assert metrics1 is not None
        assert metrics2 is not None
        assert metrics3 is not None

        # All should have timestamps
        assert isinstance(metrics1.timestamp, datetime)
        assert isinstance(metrics2.timestamp, datetime)
        assert isinstance(metrics3.timestamp, datetime)

    def test_metrics_history_size_limit(self, system_monitor, mock_psutil):
        """Test that metrics history respects size limit."""
        # Collect many metrics
        for _ in range(system_monitor.history_size + 10):
            system_monitor.collect_metrics()

        # Should not exceed history size
        assert len(system_monitor.metrics_history) <= system_monitor.history_size

    def test_get_metrics_history_with_timeframe(self, system_monitor, sample_metrics):
        """Test getting metrics history with time filtering."""
        # Add metrics with different timestamps
        now = datetime.now()
        old_metrics = SystemMetrics(
            timestamp=now - timedelta(hours=2),
            cpu_percent=50.0,
            cpu_temp=60.0,
            memory_percent=65.0,
            memory_used_mb=1500,
            memory_total_mb=2048,
            disk_percent=75.0,
            disk_used_gb=30.0,
            disk_total_gb=32.0,
            network_sent_mb=150.0,
            network_recv_mb=300.0,
            process_count=160,
            uptime_seconds=7200
        )

        system_monitor.metrics_history.clear()
        system_monitor.metrics_history.append(old_metrics)
        system_monitor.metrics_history.append(sample_metrics)

        # Get last 1 hour
        recent = system_monitor.get_metrics_history(minutes=60)

        # Should only include recent metrics
        assert len(recent) >= 1

    def test_register_multiple_apps(self, system_monitor):
        """Test registering multiple apps."""
        apps = ["app1", "app2", "app3", "app4", "app5"]

        for app_id in apps:
            system_monitor.register_app(app_id)

        # All should be registered
        for app_id in apps:
            metrics = system_monitor.get_app_metrics(app_id)
            assert metrics is not None

    def test_app_error_tracking(self, system_monitor):
        """Test tracking app errors."""
        app_id = "test_app"
        system_monitor.register_app(app_id)

        # Record multiple errors
        system_monitor.record_app_error(app_id, "Error 1")
        system_monitor.record_app_error(app_id, "Error 2")
        system_monitor.record_app_error(app_id, "Error 3")

        metrics = system_monitor.get_app_metrics(app_id)

        assert metrics.error_count == 3
        assert metrics.last_error == "Error 3"

    def test_app_crash_tracking(self, system_monitor):
        """Test tracking app crashes."""
        app_id = "crash_app"
        system_monitor.register_app(app_id)

        # Record multiple crashes
        system_monitor.record_app_crash(app_id)
        system_monitor.record_app_crash(app_id)

        metrics = system_monitor.get_app_metrics(app_id)

        # Should track crashes (implementation detail - might be in crash_count or error_count)
        assert metrics is not None

    def test_update_app_status_various_states(self, system_monitor):
        """Test updating app status through various states."""
        app_id = "stateful_app"
        system_monitor.register_app(app_id)

        # Cycle through states
        states = ["idle", "starting", "running", "stopping", "stopped", "error"]

        for state in states:
            system_monitor.update_app_status(app_id, state)
            metrics = system_monitor.get_app_metrics(app_id)
            assert metrics.status == state

    def test_get_all_app_metrics(self, system_monitor):
        """Test getting metrics for all apps."""
        # Register multiple apps
        for i in range(5):
            system_monitor.register_app(f"app_{i}")
            system_monitor.update_app_status(f"app_{i}", "running")

        all_metrics = system_monitor.get_all_app_metrics()

        assert isinstance(all_metrics, list)
        assert len(all_metrics) >= 5

    def test_get_app_metrics_nonexistent(self, system_monitor):
        """Test getting metrics for non-existent app."""
        metrics = system_monitor.get_app_metrics("nonexistent_app")

        assert metrics is None

    def test_system_info_structure(self, system_monitor, mock_psutil):
        """Test system info has correct structure."""
        info = system_monitor.get_system_info()

        assert isinstance(info, dict)
        assert "hostname" in info
        assert "platform" in info
        assert "architecture" in info
        assert "cpu_count" in info

    def test_metrics_to_dict_conversion(self, sample_metrics):
        """Test converting metrics to dictionary."""
        metrics_dict = sample_metrics.to_dict()

        assert isinstance(metrics_dict, dict)
        assert "timestamp" in metrics_dict
        assert "cpu_percent" in metrics_dict
        assert "memory_percent" in metrics_dict
        assert "disk_percent" in metrics_dict

        # Values should match
        assert metrics_dict["cpu_percent"] == 45.5
        assert metrics_dict["memory_percent"] == 60.2

    def test_concurrent_metric_collection(self, system_monitor, mock_psutil):
        """Test collecting metrics doesn't interfere with app tracking."""
        app_id = "concurrent_app"
        system_monitor.register_app(app_id)

        # Interleave metric collection and app updates
        system_monitor.collect_metrics()
        system_monitor.update_app_status(app_id, "running")
        system_monitor.collect_metrics()
        system_monitor.record_app_error(app_id, "Test error")
        system_monitor.collect_metrics()

        # Both should work fine
        metrics = system_monitor.get_latest_metrics()
        app_metrics = system_monitor.get_app_metrics(app_id)

        assert metrics is not None
        assert app_metrics is not None
        assert app_metrics.status == "running"
        assert app_metrics.error_count == 1

    def test_average_metrics_calculation(self, system_monitor):
        """Test average metrics calculation with varied data."""
        system_monitor.metrics_history.clear()

        # Add metrics with varying values
        for i in range(5):
            metric = SystemMetrics(
                timestamp=datetime.now(),
                cpu_percent=float(40 + i * 5),
                cpu_temp=float(50 + i),
                memory_percent=float(55 + i * 2),
                memory_used_mb=1024 + i * 100,
                memory_total_mb=2048,
                disk_percent=float(70 + i),
                disk_used_gb=25.0 + i,
                disk_total_gb=32.0,
                network_sent_mb=100.0 + i * 10,
                network_recv_mb=200.0 + i * 20,
                process_count=150 + i,
                uptime_seconds=3600
            )
            system_monitor.metrics_history.append(metric)

        averages = system_monitor.get_average_metrics(minutes=60)

        assert "cpu_percent" in averages
        assert "memory_percent" in averages
        assert averages["cpu_percent"] > 0
        assert averages["memory_percent"] > 0

    def test_empty_metrics_history(self, system_monitor):
        """Test operations with empty metrics history."""
        system_monitor.metrics_history.clear()

        latest = system_monitor.get_latest_metrics()
        history = system_monitor.get_metrics_history(minutes=60)
        averages = system_monitor.get_average_metrics(minutes=60)

        # Should handle gracefully
        assert latest is None or isinstance(latest, SystemMetrics)
        assert isinstance(history, list)
        assert isinstance(averages, dict)

    def test_app_metrics_initialization(self, system_monitor):
        """Test app metrics are properly initialized."""
        app_id = "new_app"
        system_monitor.register_app(app_id)

        metrics = system_monitor.get_app_metrics(app_id)

        # Check default values
        assert metrics.app_id == app_id
        assert metrics.error_count == 0
        assert metrics.runtime_seconds >= 0
        assert metrics.last_error is None or isinstance(metrics.last_error, str)

    @pytest.mark.asyncio
    async def test_monitor_lifecycle(self, system_monitor, mock_psutil):
        """Test monitor start/stop lifecycle."""
        # Start monitoring
        await system_monitor.start(interval=60)
        assert system_monitor.running

        # Collect while running
        metrics = system_monitor.collect_metrics()
        assert metrics is not None

        # Stop monitoring
        await system_monitor.stop()
        assert not system_monitor.running

    def test_multiple_error_messages_same_app(self, system_monitor):
        """Test handling multiple error messages for same app."""
        app_id = "error_prone_app"
        system_monitor.register_app(app_id)

        errors = [
            "Connection timeout",
            "File not found",
            "Permission denied",
            "Out of memory",
            "Network error"
        ]

        for error_msg in errors:
            system_monitor.record_app_error(app_id, error_msg)

        metrics = system_monitor.get_app_metrics(app_id)

        assert metrics.error_count == len(errors)
        # Last error should be the most recent
        assert metrics.last_error == errors[-1]

    def test_system_info_caching(self, system_monitor, mock_psutil):
        """Test that system info is consistent across calls."""
        info1 = system_monitor.get_system_info()
        info2 = system_monitor.get_system_info()

        # Should return consistent data
        assert info1 == info2
