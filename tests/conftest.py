"""Pytest configuration and shared fixtures."""

import asyncio
import os
import sys
from pathlib import Path
from typing import AsyncGenerator, Generator
from unittest.mock import MagicMock

import pytest

# Add packages to Python path
repo_root = Path(__file__).parent.parent
edge_device_src = repo_root / "packages" / "edge-device" / "src"
cloud_api_src = repo_root / "packages" / "cloud-api" / "src"

sys.path.insert(0, str(edge_device_src))
sys.path.insert(0, str(cloud_api_src))


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def temp_dir(tmp_path):
    """Provide a temporary directory for tests."""
    return tmp_path


@pytest.fixture
def mock_config_dir(temp_dir):
    """Provide a mock configuration directory."""
    config_dir = temp_dir / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


@pytest.fixture
def mock_data_dir(temp_dir):
    """Provide a mock data directory."""
    data_dir = temp_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


@pytest.fixture
def mock_log_dir(temp_dir):
    """Provide a mock log directory."""
    log_dir = temp_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir


@pytest.fixture
async def system_monitor():
    """Provide a system monitor instance."""
    from system.system_monitor import SystemMonitor

    monitor = SystemMonitor(history_size=10)
    await monitor.start(interval=1)
    yield monitor
    await monitor.stop()


@pytest.fixture
async def health_checker():
    """Provide a health checker instance."""
    from system.health_check import HealthChecker

    checker = HealthChecker()
    yield checker


@pytest.fixture
def diagnostics_collector(mock_log_dir):
    """Provide a diagnostics collector instance."""
    from system.diagnostics import DiagnosticsCollector

    collector = DiagnosticsCollector(log_dir=mock_log_dir)
    yield collector


@pytest.fixture
def boot_config(mock_config_dir):
    """Provide a boot configuration instance."""
    from system.boot_config import BootConfig

    config = BootConfig(config_file=mock_config_dir / "boot_config.json")
    yield config


@pytest.fixture
def config_manager(mock_config_dir):
    """Provide a configuration manager instance."""
    from system.config_manager import ConfigManager

    manager = ConfigManager(config_dir=mock_config_dir)
    yield manager


@pytest.fixture
def audio_manager():
    """Provide an audio manager instance (mocked)."""
    from system.audio_manager import AudioManager

    manager = AudioManager()

    # Mock actual audio system calls
    manager._detect_devices = MagicMock(return_value=[])
    manager.set_volume = MagicMock(return_value=True)
    manager.set_output = MagicMock(return_value=True)
    manager.mute = MagicMock(return_value=True)
    manager.unmute = MagicMock(return_value=True)

    yield manager


@pytest.fixture
def app_registry():
    """Provide an app registry instance."""
    from home_screen.app_framework import AppRegistry

    registry = AppRegistry()
    yield registry


@pytest.fixture
def sample_app():
    """Provide a sample test app."""
    from home_screen.app_framework import BaseApp, AppCategory, AppStatus

    class TestApp(BaseApp):
        def __init__(self):
            super().__init__(
                app_id="test_app",
                name="Test App",
                description="A test application",
                icon="🧪",
                category=AppCategory.UTILITIES,
                version="1.0.0"
            )

        async def start(self) -> bool:
            self.status = AppStatus.RUNNING
            return True

        async def stop(self) -> bool:
            self.status = AppStatus.STOPPED
            return True

    return TestApp()


@pytest.fixture
def sample_metrics():
    """Provide sample system metrics."""
    from datetime import datetime
    from system.system_monitor import SystemMetrics

    return SystemMetrics(
        timestamp=datetime.now(),
        cpu_percent=45.5,
        cpu_temp=55.0,
        memory_percent=60.2,
        memory_used_mb=1024,
        memory_total_mb=2048,
        disk_percent=70.1,
        disk_used_gb=25.5,
        disk_total_gb=32.0,
        network_sent_mb=100.5,
        network_recv_mb=250.3,
        process_count=150,
        uptime_seconds=3600
    )


@pytest.fixture
def sample_error():
    """Provide a sample error for testing."""
    return ValueError("Test error message")


@pytest.fixture
def mock_subprocess(monkeypatch):
    """Mock subprocess calls."""
    mock_run = MagicMock()
    mock_run.return_value.returncode = 0
    mock_run.return_value.stdout = "mock output"
    mock_run.return_value.stderr = ""

    import subprocess
    monkeypatch.setattr(subprocess, "run", mock_run)
    monkeypatch.setattr(subprocess, "Popen", MagicMock)

    return mock_run


@pytest.fixture
def mock_psutil(monkeypatch):
    """Mock psutil calls."""
    import psutil

    # Mock CPU
    monkeypatch.setattr(psutil, "cpu_percent", MagicMock(return_value=45.0))
    monkeypatch.setattr(psutil, "cpu_count", MagicMock(return_value=4))

    # Mock Memory
    memory_mock = MagicMock()
    memory_mock.percent = 60.0
    memory_mock.used = 1024 * 1024 * 1024  # 1GB
    memory_mock.total = 2048 * 1024 * 1024  # 2GB
    monkeypatch.setattr(psutil, "virtual_memory", MagicMock(return_value=memory_mock))

    # Mock Disk
    disk_mock = MagicMock()
    disk_mock.percent = 70.0
    disk_mock.used = 25 * 1024 * 1024 * 1024  # 25GB
    disk_mock.total = 32 * 1024 * 1024 * 1024  # 32GB
    monkeypatch.setattr(psutil, "disk_usage", MagicMock(return_value=disk_mock))

    # Mock Network
    net_mock = MagicMock()
    net_mock.bytes_sent = 100 * 1024 * 1024  # 100MB
    net_mock.bytes_recv = 250 * 1024 * 1024  # 250MB
    monkeypatch.setattr(psutil, "net_io_counters", MagicMock(return_value=net_mock))

    # Mock boot time
    monkeypatch.setattr(psutil, "boot_time", MagicMock(return_value=1000000))

    # Mock pids
    monkeypatch.setattr(psutil, "pids", MagicMock(return_value=list(range(150))))

    return psutil


@pytest.fixture(autouse=True)
def reset_singletons():
    """Reset global singleton instances between tests."""
    yield
    # Singletons will be recreated as needed in each test


# Markers for test categories
def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line("markers", "unit: Unit tests")
    config.addinivalue_line("markers", "integration: Integration tests")
    config.addinivalue_line("markers", "slow: Slow running tests")
    config.addinivalue_line("markers", "requires_hardware: Tests requiring actual hardware")
    config.addinivalue_line("markers", "requires_network: Tests requiring network")
