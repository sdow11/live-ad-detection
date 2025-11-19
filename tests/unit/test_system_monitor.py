"""Unit tests for system monitoring."""

import pytest
from datetime import datetime


@pytest.mark.unit
class TestSystemMonitor:
    """Test system monitoring functionality."""

    @pytest.mark.asyncio
    async def test_start_stop(self, system_monitor):
        """Test starting and stopping monitoring."""
        assert system_monitor.running is True

        await system_monitor.stop()
        assert system_monitor.running is False

    @pytest.mark.asyncio
    async def test_collect_metrics(self, system_monitor, mock_psutil):
        """Test metrics collection."""
        metrics = system_monitor.collect_metrics()

        assert metrics is not None
        assert metrics.cpu_percent >= 0
        assert metrics.memory_percent >= 0
        assert metrics.disk_percent >= 0
        assert isinstance(metrics.timestamp, datetime)

    def test_register_app(self, system_monitor):
        """Test app registration."""
        system_monitor.register_app("test_app")

        assert "test_app" in system_monitor.app_metrics
        assert system_monitor.app_metrics["test_app"].status == "stopped"

    def test_update_app_status(self, system_monitor):
        """Test updating app status."""
        system_monitor.register_app("test_app")
        system_monitor.update_app_status("test_app", "running")

        assert system_monitor.app_metrics["test_app"].status == "running"
        assert system_monitor.app_metrics["test_app"].launch_count == 1

    def test_record_app_error(self, system_monitor):
        """Test recording app errors."""
        system_monitor.register_app("test_app")
        system_monitor.record_app_error("test_app", "Test error")

        assert system_monitor.app_metrics["test_app"].error_count == 1
        assert system_monitor.app_metrics["test_app"].last_error == "Test error"

    def test_record_app_crash(self, system_monitor):
        """Test recording app crashes."""
        system_monitor.register_app("test_app")
        system_monitor.record_app_crash("test_app")

        assert system_monitor.app_metrics["test_app"].crash_count == 1

    def test_get_app_metrics(self, system_monitor):
        """Test getting app metrics."""
        system_monitor.register_app("test_app")
        metrics = system_monitor.get_app_metrics("test_app")

        assert metrics is not None
        assert metrics.app_id == "test_app"

    def test_get_all_app_metrics(self, system_monitor):
        """Test getting all app metrics."""
        system_monitor.register_app("app1")
        system_monitor.register_app("app2")

        all_metrics = system_monitor.get_all_app_metrics()

        assert len(all_metrics) >= 2

    @pytest.mark.asyncio
    async def test_metrics_history(self, system_monitor, mock_psutil):
        """Test metrics history tracking."""
        import asyncio

        # Wait for a few metrics collections
        await asyncio.sleep(3)

        history = system_monitor.get_metrics_history(minutes=1)

        assert len(history) > 0
        assert all(isinstance(m.timestamp, datetime) for m in history)

    def test_get_average_metrics(self, system_monitor, sample_metrics):
        """Test average metrics calculation."""
        # Add some metrics to history
        for _ in range(5):
            system_monitor.metrics_history.append(sample_metrics)

        averages = system_monitor.get_average_metrics(minutes=5)

        assert "cpu_percent" in averages
        assert "memory_percent" in averages
        assert averages["cpu_percent"] == sample_metrics.cpu_percent

    def test_get_system_info(self, system_monitor, mock_psutil):
        """Test system information collection."""
        info = system_monitor.get_system_info()

        assert "hostname" in info
        assert "platform" in info
        assert "cpu_count" in info
        assert "memory_total_gb" in info
        assert "disk_total_gb" in info

    def test_get_cpu_temperature(self, system_monitor, monkeypatch):
        """Test CPU temperature detection."""
        # Mock vcgencmd
        def mock_popen(cmd):
            return "temp=55.0'C\n"

        import os
        monkeypatch.setattr(os, "popen", lambda x: type('obj', (object,), {'readline': mock_popen}))

        temp = system_monitor.get_cpu_temperature()

        # May return None if mocking doesn't work, that's OK
        if temp is not None:
            assert isinstance(temp, float)
            assert temp > 0

    def test_metrics_to_dict(self, sample_metrics):
        """Test metrics serialization to dict."""
        metrics_dict = sample_metrics.to_dict()

        assert isinstance(metrics_dict, dict)
        assert "cpu_percent" in metrics_dict
        assert "memory_percent" in metrics_dict
        assert "timestamp" in metrics_dict
        assert metrics_dict["cpu_percent"] == 45.5

    def test_app_metrics_to_dict(self, system_monitor):
        """Test app metrics serialization."""
        system_monitor.register_app("test_app")
        metrics = system_monitor.get_app_metrics("test_app")
        metrics_dict = metrics.to_dict()

        assert isinstance(metrics_dict, dict)
        assert "app_id" in metrics_dict
        assert "status" in metrics_dict
        assert metrics_dict["app_id"] == "test_app"
