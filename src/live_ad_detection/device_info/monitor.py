"""Device monitoring and information gathering."""

import psutil
import platform
import socket
import logging
from typing import Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class DeviceMonitor:
    """Monitors device status and provides system information."""

    def __init__(self):
        """Initialize device monitor."""
        self.hostname = socket.gethostname()

    def get_system_info(self) -> Dict[str, Any]:
        """Get basic system information.

        Returns:
            Dictionary containing system information
        """
        try:
            return {
                'hostname': self.hostname,
                'platform': platform.system(),
                'platform_release': platform.release(),
                'platform_version': platform.version(),
                'architecture': platform.machine(),
                'processor': platform.processor(),
                'python_version': platform.python_version(),
                'uptime': self._get_uptime()
            }
        except Exception as e:
            logger.error(f"Error getting system info: {e}")
            return {}

    def get_cpu_info(self) -> Dict[str, Any]:
        """Get CPU usage information.

        Returns:
            Dictionary containing CPU information
        """
        try:
            cpu_freq = psutil.cpu_freq()
            return {
                'percent': psutil.cpu_percent(interval=1, percpu=False),
                'count': psutil.cpu_count(),
                'frequency_current': cpu_freq.current if cpu_freq else 0,
                'frequency_max': cpu_freq.max if cpu_freq else 0,
                'load_avg': psutil.getloadavg() if hasattr(psutil, 'getloadavg') else [0, 0, 0]
            }
        except Exception as e:
            logger.error(f"Error getting CPU info: {e}")
            return {}

    def get_memory_info(self) -> Dict[str, Any]:
        """Get memory usage information.

        Returns:
            Dictionary containing memory information
        """
        try:
            mem = psutil.virtual_memory()
            return {
                'total': mem.total,
                'available': mem.available,
                'used': mem.used,
                'percent': mem.percent,
                'total_gb': round(mem.total / (1024 ** 3), 2),
                'available_gb': round(mem.available / (1024 ** 3), 2),
                'used_gb': round(mem.used / (1024 ** 3), 2)
            }
        except Exception as e:
            logger.error(f"Error getting memory info: {e}")
            return {}

    def get_disk_info(self) -> Dict[str, Any]:
        """Get disk usage information.

        Returns:
            Dictionary containing disk information
        """
        try:
            disk = psutil.disk_usage('/')
            return {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': disk.percent,
                'total_gb': round(disk.total / (1024 ** 3), 2),
                'used_gb': round(disk.used / (1024 ** 3), 2),
                'free_gb': round(disk.free / (1024 ** 3), 2)
            }
        except Exception as e:
            logger.error(f"Error getting disk info: {e}")
            return {}

    def get_network_info(self) -> Dict[str, Any]:
        """Get network information.

        Returns:
            Dictionary containing network information
        """
        try:
            net_io = psutil.net_io_counters()
            interfaces = psutil.net_if_addrs()

            interface_info = {}
            for interface, addrs in interfaces.items():
                for addr in addrs:
                    if addr.family == socket.AF_INET:
                        interface_info[interface] = {
                            'ip': addr.address,
                            'netmask': addr.netmask
                        }

            return {
                'bytes_sent': net_io.bytes_sent,
                'bytes_recv': net_io.bytes_recv,
                'bytes_sent_mb': round(net_io.bytes_sent / (1024 ** 2), 2),
                'bytes_recv_mb': round(net_io.bytes_recv / (1024 ** 2), 2),
                'interfaces': interface_info
            }
        except Exception as e:
            logger.error(f"Error getting network info: {e}")
            return {}

    def get_temperature(self) -> Dict[str, Any]:
        """Get temperature information if available.

        Returns:
            Dictionary containing temperature information
        """
        try:
            if hasattr(psutil, 'sensors_temperatures'):
                temps = psutil.sensors_temperatures()
                if temps:
                    temp_info = {}
                    for name, entries in temps.items():
                        temp_info[name] = [
                            {
                                'label': entry.label or name,
                                'current': entry.current,
                                'high': entry.high,
                                'critical': entry.critical
                            }
                            for entry in entries
                        ]
                    return temp_info
            return {}
        except Exception as e:
            logger.error(f"Error getting temperature info: {e}")
            return {}

    def get_all_info(self) -> Dict[str, Any]:
        """Get all device information.

        Returns:
            Dictionary containing all device information
        """
        return {
            'system': self.get_system_info(),
            'cpu': self.get_cpu_info(),
            'memory': self.get_memory_info(),
            'disk': self.get_disk_info(),
            'network': self.get_network_info(),
            'temperature': self.get_temperature(),
            'timestamp': datetime.now().isoformat()
        }

    def _get_uptime(self) -> str:
        """Get system uptime.

        Returns:
            Uptime as a formatted string
        """
        try:
            boot_time = psutil.boot_time()
            uptime_seconds = datetime.now().timestamp() - boot_time
            days = int(uptime_seconds // 86400)
            hours = int((uptime_seconds % 86400) // 3600)
            minutes = int((uptime_seconds % 3600) // 60)
            return f"{days}d {hours}h {minutes}m"
        except Exception:
            return "Unknown"
