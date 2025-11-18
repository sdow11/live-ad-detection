"""Device registry with SQLite persistence.

This module provides persistent storage for device information using SQLite.
The registry stores device metadata, health metrics, and status information.

Example:
    >>> registry = DeviceRegistry()
    >>> await registry.initialize()
    >>> await registry.register_device(device)
    >>> devices = await registry.get_all_devices()
"""

import json
import logging
import os
from typing import List, Optional

import aiosqlite

from ad_detection_common.models.device import Device, DeviceHealth, DeviceRole, DeviceStatus

logger = logging.getLogger(__name__)


class DeviceRegistry:
    """Persistent storage for device information using SQLite.

    This class provides async SQLite-based storage for devices in the local fleet.
    It supports CRUD operations and various query methods.

    Example:
        >>> registry = DeviceRegistry(db_path="/var/lib/ad-detection/devices.db")
        >>> await registry.initialize()
        >>> await registry.register_device(device)
        >>> coordinator = await registry.get_coordinator()
    """

    def __init__(self, db_path: str = "/var/lib/ad-detection/devices.db") -> None:
        """Initialize device registry.

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.db: Optional[aiosqlite.Connection] = None
        self.is_initialized = False

    async def initialize(self) -> None:
        """Initialize the database and create tables if needed."""
        if self.is_initialized:
            logger.warning("Registry already initialized")
            return

        logger.info(f"Initializing device registry at {self.db_path}")

        # Create directory if it doesn't exist
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)

        # Connect to database
        self.db = await aiosqlite.connect(self.db_path)

        # Enable foreign keys
        await self.db.execute("PRAGMA foreign_keys = ON")

        # Create tables
        await self._create_tables()

        self.is_initialized = True
        logger.info("Device registry initialized")

    async def close(self) -> None:
        """Close the database connection."""
        if self.db:
            await self.db.close()
            self.db = None
            self.is_initialized = False
            logger.info("Device registry closed")

    async def _create_tables(self) -> None:
        """Create database tables if they don't exist."""
        # Devices table
        await self.db.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                device_id TEXT PRIMARY KEY,
                hostname TEXT NOT NULL,
                serial_number TEXT NOT NULL,
                mac_address TEXT NOT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL,
                model TEXT NOT NULL,
                capabilities TEXT,
                ip_address TEXT NOT NULL,
                local_port INTEGER NOT NULL DEFAULT 8081,
                location_id TEXT,
                tv_location TEXT NOT NULL,
                firmware_version TEXT NOT NULL,
                os_version TEXT NOT NULL,
                health_json TEXT,
                last_seen TEXT NOT NULL,
                registered_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        # Create indexes
        await self.db.execute(
            "CREATE INDEX IF NOT EXISTS idx_devices_role ON devices(role)"
        )
        await self.db.execute(
            "CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)"
        )

        await self.db.commit()

    async def register_device(self, device: Device) -> None:
        """Register or update a device in the registry.

        Args:
            device: Device to register
        """
        if not self.is_initialized or not self.db:
            raise RuntimeError("Registry not initialized")

        # Serialize capabilities and health
        capabilities_json = json.dumps([c.value for c in device.capabilities])
        health_json = device.health.model_dump_json() if device.health else None

        # Insert or replace
        await self.db.execute(
            """
            INSERT OR REPLACE INTO devices (
                device_id, hostname, serial_number, mac_address,
                role, status, model, capabilities,
                ip_address, local_port, location_id, tv_location,
                firmware_version, os_version, health_json,
                last_seen, registered_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                device.device_id,
                device.hostname,
                device.serial_number,
                device.mac_address,
                device.role.value,
                device.status.value,
                device.model,
                capabilities_json,
                device.ip_address,
                device.local_port,
                device.location_id,
                device.tv_location,
                device.firmware_version,
                device.os_version,
                health_json,
                device.last_seen.isoformat(),
                device.registered_at.isoformat(),
                device.updated_at.isoformat(),
            ),
        )

        await self.db.commit()
        logger.debug(f"Registered device: {device.device_id}")

    async def get_device(self, device_id: str) -> Optional[Device]:
        """Get a device by ID.

        Args:
            device_id: Device ID to retrieve

        Returns:
            Device if found, None otherwise
        """
        if not self.is_initialized or not self.db:
            raise RuntimeError("Registry not initialized")

        async with self.db.execute(
            "SELECT * FROM devices WHERE device_id = ?", (device_id,)
        ) as cursor:
            row = await cursor.fetchone()

            if row:
                return self._device_from_row(row)
            return None

    async def get_all_devices(self) -> List[Device]:
        """Get all registered devices.

        Returns:
            List of all devices
        """
        if not self.is_initialized or not self.db:
            raise RuntimeError("Registry not initialized")

        async with self.db.execute("SELECT * FROM devices ORDER BY device_id") as cursor:
            rows = await cursor.fetchall()
            return [self._device_from_row(row) for row in rows]

    async def get_devices_by_role(self, role: DeviceRole) -> List[Device]:
        """Get devices by role.

        Args:
            role: Device role to filter by

        Returns:
            List of devices with the specified role
        """
        if not self.is_initialized or not self.db:
            raise RuntimeError("Registry not initialized")

        async with self.db.execute(
            "SELECT * FROM devices WHERE role = ? ORDER BY device_id", (role.value,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [self._device_from_row(row) for row in rows]

    async def get_online_devices(self) -> List[Device]:
        """Get all online devices.

        Returns:
            List of online devices
        """
        if not self.is_initialized or not self.db:
            raise RuntimeError("Registry not initialized")

        async with self.db.execute(
            "SELECT * FROM devices WHERE status = ? ORDER BY device_id",
            (DeviceStatus.ONLINE.value,),
        ) as cursor:
            rows = await cursor.fetchall()
            return [self._device_from_row(row) for row in rows]

    async def get_coordinator(self) -> Optional[Device]:
        """Get the coordinator device.

        Returns:
            Coordinator device if exists, None otherwise
        """
        coordinators = await self.get_devices_by_role(DeviceRole.COORDINATOR)
        return coordinators[0] if coordinators else None

    async def update_device_health(
        self, device_id: str, health: DeviceHealth
    ) -> None:
        """Update device health metrics.

        Args:
            device_id: Device ID to update
            health: New health metrics
        """
        if not self.is_initialized or not self.db:
            raise RuntimeError("Registry not initialized")

        health_json = health.model_dump_json()

        await self.db.execute(
            "UPDATE devices SET health_json = ?, last_seen = datetime('now') WHERE device_id = ?",
            (health_json, device_id),
        )

        await self.db.commit()

    async def update_device_status(
        self, device_id: str, status: DeviceStatus
    ) -> None:
        """Update device status.

        Args:
            device_id: Device ID to update
            status: New status
        """
        if not self.is_initialized or not self.db:
            raise RuntimeError("Registry not initialized")

        await self.db.execute(
            "UPDATE devices SET status = ?, updated_at = datetime('now') WHERE device_id = ?",
            (status.value, device_id),
        )

        await self.db.commit()

    async def remove_device(self, device_id: str) -> None:
        """Remove a device from the registry.

        Args:
            device_id: Device ID to remove
        """
        if not self.is_initialized or not self.db:
            raise RuntimeError("Registry not initialized")

        await self.db.execute("DELETE FROM devices WHERE device_id = ?", (device_id,))
        await self.db.commit()
        logger.info(f"Removed device: {device_id}")

    async def get_device_count(self) -> int:
        """Get total number of registered devices.

        Returns:
            Count of devices
        """
        if not self.is_initialized or not self.db:
            raise RuntimeError("Registry not initialized")

        async with self.db.execute("SELECT COUNT(*) FROM devices") as cursor:
            row = await cursor.fetchone()
            return row[0] if row else 0

    def _device_from_row(self, row: tuple) -> Device:
        """Convert database row to Device object.

        Args:
            row: Database row tuple

        Returns:
            Device object
        """
        from datetime import datetime as dt
        from ad_detection_common.models.device import DeviceCapability

        # Parse capabilities
        capabilities = []
        if row[7]:  # capabilities column
            cap_list = json.loads(row[7])
            capabilities = [DeviceCapability(c) for c in cap_list]

        # Parse health
        health = None
        if row[14]:  # health_json column
            health_data = json.loads(row[14])
            health = DeviceHealth(**health_data)

        return Device(
            device_id=row[0],
            hostname=row[1],
            serial_number=row[2],
            mac_address=row[3],
            role=DeviceRole(row[4]),
            status=DeviceStatus(row[5]),
            model=row[6],
            capabilities=capabilities,
            ip_address=row[8],
            local_port=row[9],
            location_id=row[10],
            tv_location=row[11],
            firmware_version=row[12],
            os_version=row[13],
            health=health,
            last_seen=dt.fromisoformat(row[15]),
            registered_at=dt.fromisoformat(row[16]),
            updated_at=dt.fromisoformat(row[17]),
        )
