"""System management components.

Boot configuration, shutdown handling, audio management, configuration persistence,
remote control integration, monitoring, diagnostics, and system services.
"""

from system.boot_config import BootConfig, boot_config
from system.shutdown_handler import (
    ShutdownHandler,
    WatchdogNotifier,
    shutdown_handler,
    shutdown_callback,
)
from system.audio_manager import (
    AudioManager,
    AudioOutput,
    AudioDevice,
    AudioSettings,
    audio_manager,
)
from system.config_manager import ConfigManager, config_manager
from system.remote_control import RemoteControlHandler, RemoteKey, remote_control
from system.system_monitor import SystemMonitor, SystemMetrics, AppMetrics, system_monitor
from system.health_check import HealthChecker, HealthStatus, HealthCheckResult, health_checker
from system.diagnostics import DiagnosticsCollector, ErrorReport, diagnostics_collector

__all__ = [
    "BootConfig",
    "boot_config",
    "ShutdownHandler",
    "WatchdogNotifier",
    "shutdown_handler",
    "shutdown_callback",
    "AudioManager",
    "AudioOutput",
    "AudioDevice",
    "AudioSettings",
    "audio_manager",
    "ConfigManager",
    "config_manager",
    "RemoteControlHandler",
    "RemoteKey",
    "remote_control",
    "SystemMonitor",
    "SystemMetrics",
    "AppMetrics",
    "system_monitor",
    "HealthChecker",
    "HealthStatus",
    "HealthCheckResult",
    "health_checker",
    "DiagnosticsCollector",
    "ErrorReport",
    "diagnostics_collector",
]
