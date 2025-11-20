"""WiFi Manager for handling network connections."""

import subprocess
import time
import logging
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)


class WiFiManager:
    """Manages WiFi connections and access point configuration."""

    def __init__(self, interface: str = "wlan0"):
        """Initialize WiFi manager.

        Args:
            interface: Network interface to use (default: wlan0)
        """
        self.interface = interface
        self.ap_interface = "wlan1"  # For cluster nodes with dual WiFi

    def scan_networks(self) -> List[Dict[str, any]]:
        """Scan for available WiFi networks.

        Returns:
            List of dictionaries containing network information
        """
        try:
            # Use nmcli for scanning
            result = subprocess.run(
                ["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "dev", "wifi", "list"],
                capture_output=True,
                text=True,
                timeout=10
            )

            networks = []
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split(':')
                if len(parts) >= 3:
                    networks.append({
                        'ssid': parts[0],
                        'signal': int(parts[1]) if parts[1].isdigit() else 0,
                        'security': parts[2] if len(parts) > 2 else 'Open'
                    })

            # Sort by signal strength
            networks.sort(key=lambda x: x['signal'], reverse=True)
            return networks

        except subprocess.TimeoutExpired:
            logger.error("WiFi scan timed out")
            return []
        except Exception as e:
            logger.error(f"Error scanning networks: {e}")
            return []

    def connect_to_network(self, ssid: str, password: Optional[str] = None) -> bool:
        """Connect to a WiFi network.

        Args:
            ssid: Network SSID to connect to
            password: Network password (None for open networks)

        Returns:
            True if connection successful, False otherwise
        """
        try:
            # First, forget any existing connection to this SSID
            subprocess.run(
                ["nmcli", "connection", "delete", ssid],
                capture_output=True,
                timeout=5
            )
        except Exception:
            pass  # Ignore errors if connection doesn't exist

        try:
            # Connect to network
            if password:
                result = subprocess.run(
                    ["nmcli", "dev", "wifi", "connect", ssid, "password", password],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
            else:
                result = subprocess.run(
                    ["nmcli", "dev", "wifi", "connect", ssid],
                    capture_output=True,
                    text=True,
                    timeout=30
                )

            if result.returncode == 0:
                logger.info(f"Successfully connected to {ssid}")
                return True
            else:
                logger.error(f"Failed to connect to {ssid}: {result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            logger.error(f"Connection to {ssid} timed out")
            return False
        except Exception as e:
            logger.error(f"Error connecting to network: {e}")
            return False

    def get_current_network(self) -> Optional[Dict[str, str]]:
        """Get currently connected network information.

        Returns:
            Dictionary with current network info or None if not connected
        """
        try:
            result = subprocess.run(
                ["nmcli", "-t", "-f", "ACTIVE,SSID,SIGNAL", "dev", "wifi"],
                capture_output=True,
                text=True,
                timeout=5
            )

            for line in result.stdout.strip().split('\n'):
                parts = line.split(':')
                if len(parts) >= 2 and parts[0] == 'yes':
                    return {
                        'ssid': parts[1] if len(parts) > 1 else '',
                        'signal': parts[2] if len(parts) > 2 else '0'
                    }
            return None

        except Exception as e:
            logger.error(f"Error getting current network: {e}")
            return None

    def start_access_point(self, ssid: str = "LiveAdDetection", password: Optional[str] = None) -> bool:
        """Start WiFi access point for configuration.

        Args:
            ssid: Access point SSID
            password: Access point password (None for open AP)

        Returns:
            True if AP started successfully
        """
        try:
            # Check if we have a second WiFi interface
            result = subprocess.run(
                ["nmcli", "device", "status"],
                capture_output=True,
                text=True,
                timeout=5
            )

            # Use the AP interface if available, otherwise use main interface
            interface = self.ap_interface if self.ap_interface in result.stdout else self.interface

            # Create hotspot
            if password and len(password) >= 8:
                cmd = [
                    "nmcli", "dev", "wifi", "hotspot",
                    "ifname", interface,
                    "ssid", ssid,
                    "password", password
                ]
            else:
                cmd = [
                    "nmcli", "dev", "wifi", "hotspot",
                    "ifname", interface,
                    "ssid", ssid
                ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            if result.returncode == 0:
                logger.info(f"Access point '{ssid}' started on {interface}")
                return True
            else:
                logger.error(f"Failed to start AP: {result.stderr}")
                return False

        except Exception as e:
            logger.error(f"Error starting access point: {e}")
            return False

    def stop_access_point(self) -> bool:
        """Stop the WiFi access point.

        Returns:
            True if AP stopped successfully
        """
        try:
            # Find and stop hotspot connection
            result = subprocess.run(
                ["nmcli", "connection", "show", "--active"],
                capture_output=True,
                text=True,
                timeout=5
            )

            # Look for hotspot connection
            for line in result.stdout.split('\n'):
                if 'Hotspot' in line or 'hotspot' in line:
                    conn_name = line.split()[0]
                    subprocess.run(
                        ["nmcli", "connection", "down", conn_name],
                        capture_output=True,
                        timeout=5
                    )
                    logger.info(f"Stopped access point: {conn_name}")
                    return True

            return True

        except Exception as e:
            logger.error(f"Error stopping access point: {e}")
            return False

    def get_ip_address(self, interface: Optional[str] = None) -> Optional[str]:
        """Get IP address of specified interface.

        Args:
            interface: Network interface (uses default if None)

        Returns:
            IP address string or None
        """
        import netifaces

        if_name = interface or self.interface

        try:
            addrs = netifaces.ifaddresses(if_name)
            if netifaces.AF_INET in addrs:
                return addrs[netifaces.AF_INET][0]['addr']
            return None
        except Exception as e:
            logger.error(f"Error getting IP address: {e}")
            return None
