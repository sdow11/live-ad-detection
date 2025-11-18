"""Device discovery service using mDNS/Avahi.

This module implements zero-configuration networking for device discovery
on the local network using mDNS (Avahi/Bonjour).
"""

import asyncio
import logging
import socket
from dataclasses import dataclass
from typing import Dict, List, Optional, Protocol

from zeroconf import ServiceBrowser, ServiceInfo, ServiceListener, Zeroconf
from zeroconf.asyncio import AsyncServiceBrowser, AsyncServiceInfo, AsyncZeroconf

logger = logging.getLogger(__name__)


SERVICE_TYPE = "_ad-detection._tcp.local."


@dataclass
class DiscoveredDevice:
    """Information about a discovered device."""

    device_id: str
    hostname: str
    ip_address: str
    port: int
    role: str  # "coordinator" or "worker"
    version: str
    service_info: ServiceInfo


class DiscoveryListener(Protocol):
    """Protocol for discovery event listeners."""

    async def on_device_discovered(self, device: DiscoveredDevice) -> None:
        """Called when a device is discovered."""
        ...

    async def on_device_removed(self, device_id: str) -> None:
        """Called when a device is removed/offline."""
        ...

    async def on_device_updated(self, device: DiscoveredDevice) -> None:
        """Called when a device is updated."""
        ...


class DeviceServiceListener(ServiceListener):
    """Listener for mDNS service events."""

    def __init__(self, callback_handler: "DeviceDiscoveryService") -> None:
        """Initialize listener with callback handler."""
        self.handler = callback_handler

    def add_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        """Called when a service is discovered."""
        info = zc.get_service_info(type_, name)
        if info:
            asyncio.create_task(self.handler._handle_service_added(info))

    def remove_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        """Called when a service is removed."""
        device_id = self._extract_device_id(name)
        if device_id:
            asyncio.create_task(self.handler._handle_service_removed(device_id))

    def update_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        """Called when a service is updated."""
        info = zc.get_service_info(type_, name)
        if info:
            asyncio.create_task(self.handler._handle_service_updated(info))

    def _extract_device_id(self, name: str) -> Optional[str]:
        """Extract device ID from service name."""
        # Service name format: "device-id._ad-detection._tcp.local."
        return name.split(".")[0] if name else None


class DeviceDiscoveryService:
    """Service for discovering devices on the local network.

    Uses mDNS (Avahi/Bonjour) for zero-configuration networking.
    Implements both service announcement and discovery.

    Example:
        >>> discovery = DeviceDiscoveryService()
        >>> await discovery.start()
        >>> await discovery.announce(
        ...     device_id="rpi-001",
        ...     role="worker",
        ...     port=8081,
        ...     version="v1.0.0"
        ... )
        >>> devices = await discovery.get_discovered_devices()
    """

    def __init__(self) -> None:
        """Initialize discovery service."""
        self.zeroconf: Optional[AsyncZeroconf] = None
        self.browser: Optional[AsyncServiceBrowser] = None
        self.announced_services: List[ServiceInfo] = []
        self.discovered_devices: Dict[str, DiscoveredDevice] = {}
        self.listeners: List[DiscoveryListener] = []
        self._running = False

    async def start(self) -> None:
        """Start the discovery service."""
        if self._running:
            logger.warning("Discovery service already running")
            return

        logger.info("Starting device discovery service")
        self.zeroconf = AsyncZeroconf()

        # Start browsing for services
        listener = DeviceServiceListener(self)
        self.browser = AsyncServiceBrowser(
            self.zeroconf.zeroconf, SERVICE_TYPE, handlers=[listener]
        )

        self._running = True
        logger.info("Device discovery service started")

    async def stop(self) -> None:
        """Stop the discovery service."""
        if not self._running:
            return

        logger.info("Stopping device discovery service")

        # Unregister announced services
        for service_info in self.announced_services:
            try:
                await self.zeroconf.async_unregister_service(service_info)
            except Exception as e:
                logger.error(f"Error unregistering service: {e}")

        # Close zeroconf
        if self.zeroconf:
            await self.zeroconf.async_close()

        self._running = False
        self.discovered_devices.clear()
        logger.info("Device discovery service stopped")

    async def announce(
        self,
        device_id: str,
        role: str,
        port: int,
        version: str,
        capabilities: Optional[List[str]] = None,
    ) -> None:
        """Announce this device on the network.

        Args:
            device_id: Unique device identifier
            role: Device role ("coordinator" or "worker")
            port: Port this device is listening on
            version: Firmware version
            capabilities: Optional list of device capabilities

        Raises:
            RuntimeError: If service is not started
        """
        if not self._running or not self.zeroconf:
            raise RuntimeError("Discovery service not started")

        logger.info(f"Announcing device {device_id} as {role} on port {port}")

        # Get local IP address
        hostname = socket.gethostname()
        ip_address = self._get_local_ip()

        # Create service info
        properties = {
            "device_id": device_id.encode("utf-8"),
            "role": role.encode("utf-8"),
            "version": version.encode("utf-8"),
        }

        if capabilities:
            properties["capabilities"] = ",".join(capabilities).encode("utf-8")

        service_info = ServiceInfo(
            type_=SERVICE_TYPE,
            name=f"{device_id}.{SERVICE_TYPE}",
            addresses=[socket.inet_aton(ip_address)],
            port=port,
            properties=properties,
            server=f"{hostname}.local.",
        )

        # Register service
        await self.zeroconf.async_register_service(service_info)
        self.announced_services.append(service_info)

        logger.info(f"Device {device_id} announced successfully")

    def add_listener(self, listener: DiscoveryListener) -> None:
        """Add a discovery event listener.

        Args:
            listener: Listener to add
        """
        self.listeners.append(listener)

    def remove_listener(self, listener: DiscoveryListener) -> None:
        """Remove a discovery event listener.

        Args:
            listener: Listener to remove
        """
        if listener in self.listeners:
            self.listeners.remove(listener)

    async def get_discovered_devices(self) -> List[DiscoveredDevice]:
        """Get list of all discovered devices.

        Returns:
            List of discovered devices
        """
        return list(self.discovered_devices.values())

    async def find_coordinator(self) -> Optional[DiscoveredDevice]:
        """Find the coordinator device.

        Returns:
            Coordinator device if found, None otherwise
        """
        for device in self.discovered_devices.values():
            if device.role == "coordinator":
                return device
        return None

    async def find_device_by_id(self, device_id: str) -> Optional[DiscoveredDevice]:
        """Find a specific device by ID.

        Args:
            device_id: Device ID to search for

        Returns:
            Device if found, None otherwise
        """
        return self.discovered_devices.get(device_id)

    # Internal methods

    async def _handle_service_added(self, service_info: ServiceInfo) -> None:
        """Handle a newly discovered service."""
        device = self._parse_service_info(service_info)
        if not device:
            return

        logger.info(f"Discovered device: {device.device_id} ({device.role})")
        self.discovered_devices[device.device_id] = device

        # Notify listeners
        for listener in self.listeners:
            try:
                await listener.on_device_discovered(device)
            except Exception as e:
                logger.error(f"Error in discovery listener: {e}")

    async def _handle_service_removed(self, device_id: str) -> None:
        """Handle a removed service."""
        if device_id in self.discovered_devices:
            logger.info(f"Device removed: {device_id}")
            del self.discovered_devices[device_id]

            # Notify listeners
            for listener in self.listeners:
                try:
                    await listener.on_device_removed(device_id)
                except Exception as e:
                    logger.error(f"Error in discovery listener: {e}")

    async def _handle_service_updated(self, service_info: ServiceInfo) -> None:
        """Handle an updated service."""
        device = self._parse_service_info(service_info)
        if not device:
            return

        logger.debug(f"Device updated: {device.device_id}")
        self.discovered_devices[device.device_id] = device

        # Notify listeners
        for listener in self.listeners:
            try:
                await listener.on_device_updated(device)
            except Exception as e:
                logger.error(f"Error in discovery listener: {e}")

    def _parse_service_info(self, service_info: ServiceInfo) -> Optional[DiscoveredDevice]:
        """Parse service info into a DiscoveredDevice."""
        try:
            properties = service_info.properties

            device_id = properties.get(b"device_id", b"").decode("utf-8")
            role = properties.get(b"role", b"").decode("utf-8")
            version = properties.get(b"version", b"").decode("utf-8")

            if not all([device_id, role, version]):
                logger.warning(f"Incomplete service info: {service_info.name}")
                return None

            # Get IP address
            ip_address = socket.inet_ntoa(service_info.addresses[0])

            return DiscoveredDevice(
                device_id=device_id,
                hostname=service_info.server.rstrip("."),
                ip_address=ip_address,
                port=service_info.port,
                role=role,
                version=version,
                service_info=service_info,
            )

        except Exception as e:
            logger.error(f"Error parsing service info: {e}")
            return None

    def _get_local_ip(self) -> str:
        """Get the local IP address.

        Returns:
            Local IP address as string
        """
        try:
            # Create a socket to get the local IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))  # Google DNS
            ip_address = s.getsockname()[0]
            s.close()
            return ip_address
        except Exception:
            return "127.0.0.1"
