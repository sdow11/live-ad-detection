"""Firmware update service for OTA updates.

Provides firmware distribution, version management, and rollout strategies
for edge devices.
"""

import hashlib
import logging
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import List, Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from cloud_api.models import Device, FirmwareVersion, FirmwareUpdate, UpdateStatus

logger = logging.getLogger(__name__)


class RolloutStrategy(str, Enum):
    """Firmware rollout strategy."""
    IMMEDIATE = "immediate"  # Update all devices immediately
    CANARY = "canary"  # Update a small percentage first
    STAGED = "staged"  # Gradual rollout over time
    MANUAL = "manual"  # Require manual approval per device


class UpdateStage(str, Enum):
    """Current stage of firmware update."""
    PENDING = "pending"
    DOWNLOADING = "downloading"
    VERIFYING = "verifying"
    INSTALLING = "installing"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class FirmwareService:
    """Service for managing firmware updates."""

    def __init__(self, firmware_storage_path: str = "/var/lib/ad-detection/firmware"):
        """Initialize firmware service.

        Args:
            firmware_storage_path: Path to store firmware files
        """
        self.storage_path = Path(firmware_storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)

    async def upload_firmware(
        self,
        session: AsyncSession,
        version: str,
        file_content: bytes,
        description: str = "",
        min_device_version: Optional[str] = None
    ) -> FirmwareVersion:
        """Upload new firmware version.

        Args:
            session: Database session
            version: Firmware version (e.g., "1.2.3")
            file_content: Firmware file content
            description: Version description
            min_device_version: Minimum device version compatible

        Returns:
            Created firmware version

        Raises:
            ValueError: If version already exists or file is invalid
        """
        # Check if version already exists
        result = await session.execute(
            select(FirmwareVersion).where(FirmwareVersion.version == version)
        )
        if result.scalar_one_or_none():
            raise ValueError(f"Firmware version {version} already exists")

        # Calculate checksum
        checksum = hashlib.sha256(file_content).hexdigest()

        # Save firmware file
        file_path = self.storage_path / f"firmware-{version}.bin"
        file_path.write_bytes(file_content)

        # Create database record
        firmware = FirmwareVersion(
            version=version,
            file_path=str(file_path),
            file_size=len(file_content),
            checksum=checksum,
            description=description,
            min_device_version=min_device_version,
            uploaded_at=datetime.utcnow(),
            is_active=False  # Require explicit activation
        )

        session.add(firmware)
        await session.commit()
        await session.refresh(firmware)

        logger.info(f"Uploaded firmware version {version} ({len(file_content)} bytes)")
        return firmware

    async def activate_firmware(
        self,
        session: AsyncSession,
        version: str
    ) -> FirmwareVersion:
        """Activate firmware version for distribution.

        Args:
            session: Database session
            version: Firmware version to activate

        Returns:
            Activated firmware version

        Raises:
            ValueError: If version not found
        """
        result = await session.execute(
            select(FirmwareVersion).where(FirmwareVersion.version == version)
        )
        firmware = result.scalar_one_or_none()

        if not firmware:
            raise ValueError(f"Firmware version {version} not found")

        firmware.is_active = True
        await session.commit()
        await session.refresh(firmware)

        logger.info(f"Activated firmware version {version}")
        return firmware

    async def deactivate_firmware(
        self,
        session: AsyncSession,
        version: str
    ) -> FirmwareVersion:
        """Deactivate firmware version.

        Args:
            session: Database session
            version: Firmware version to deactivate

        Returns:
            Deactivated firmware version

        Raises:
            ValueError: If version not found
        """
        result = await session.execute(
            select(FirmwareVersion).where(FirmwareVersion.version == version)
        )
        firmware = result.scalar_one_or_none()

        if not firmware:
            raise ValueError(f"Firmware version {version} not found")

        firmware.is_active = False
        await session.commit()
        await session.refresh(firmware)

        logger.info(f"Deactivated firmware version {version}")
        return firmware

    async def create_update(
        self,
        session: AsyncSession,
        firmware_version: str,
        device_ids: Optional[List[str]] = None,
        organization_id: Optional[int] = None,
        location_id: Optional[int] = None,
        strategy: RolloutStrategy = RolloutStrategy.STAGED,
        canary_percentage: int = 10
    ) -> List[FirmwareUpdate]:
        """Create firmware update for devices.

        Args:
            session: Database session
            firmware_version: Target firmware version
            device_ids: Specific device IDs (optional)
            organization_id: Update all devices in organization (optional)
            location_id: Update all devices in location (optional)
            strategy: Rollout strategy
            canary_percentage: Percentage for canary rollout (1-100)

        Returns:
            List of created firmware updates

        Raises:
            ValueError: If firmware version not found or no devices selected
        """
        # Get firmware version
        result = await session.execute(
            select(FirmwareVersion).where(
                and_(
                    FirmwareVersion.version == firmware_version,
                    FirmwareVersion.is_active == True
                )
            )
        )
        firmware = result.scalar_one_or_none()

        if not firmware:
            raise ValueError(
                f"Firmware version {firmware_version} not found or not active"
            )

        # Build device query
        query = select(Device)
        conditions = []

        if device_ids:
            conditions.append(Device.device_id.in_(device_ids))
        if organization_id:
            conditions.append(Device.organization_id == organization_id)
        if location_id:
            conditions.append(Device.location_id == location_id)

        if not conditions:
            raise ValueError("Must specify device_ids, organization_id, or location_id")

        query = query.where(or_(*conditions))

        # Get devices
        result = await session.execute(query)
        devices = result.scalars().all()

        if not devices:
            raise ValueError("No devices found matching criteria")

        # Filter devices by version compatibility
        compatible_devices = []
        for device in devices:
            if self._is_compatible(device.firmware_version, firmware.min_device_version):
                compatible_devices.append(device)
            else:
                logger.warning(
                    f"Device {device.device_id} (version {device.firmware_version}) "
                    f"incompatible with firmware {firmware_version} "
                    f"(requires {firmware.min_device_version})"
                )

        if not compatible_devices:
            raise ValueError("No compatible devices found")

        # Create updates based on strategy
        updates = []

        if strategy == RolloutStrategy.IMMEDIATE:
            # Update all devices immediately
            for device in compatible_devices:
                update = await self._create_device_update(
                    session, device, firmware, scheduled_for=datetime.utcnow()
                )
                updates.append(update)

        elif strategy == RolloutStrategy.CANARY:
            # Update canary percentage first
            canary_count = max(1, len(compatible_devices) * canary_percentage // 100)
            canary_devices = compatible_devices[:canary_count]
            remaining_devices = compatible_devices[canary_count:]

            for device in canary_devices:
                update = await self._create_device_update(
                    session, device, firmware,
                    scheduled_for=datetime.utcnow(),
                    is_canary=True
                )
                updates.append(update)

            # Remaining devices in manual mode
            for device in remaining_devices:
                update = await self._create_device_update(
                    session, device, firmware,
                    scheduled_for=None,  # Manual approval required
                    is_canary=False
                )
                updates.append(update)

        elif strategy == RolloutStrategy.STAGED:
            # Gradual rollout in stages
            # Stage 1: 10% immediately
            # Stage 2: 40% after 1 hour
            # Stage 3: 100% after 4 hours
            stage1_count = max(1, len(compatible_devices) * 10 // 100)
            stage2_count = len(compatible_devices) * 40 // 100

            from datetime import timedelta

            for i, device in enumerate(compatible_devices):
                if i < stage1_count:
                    scheduled = datetime.utcnow()
                elif i < stage1_count + stage2_count:
                    scheduled = datetime.utcnow() + timedelta(hours=1)
                else:
                    scheduled = datetime.utcnow() + timedelta(hours=4)

                update = await self._create_device_update(
                    session, device, firmware, scheduled_for=scheduled
                )
                updates.append(update)

        elif strategy == RolloutStrategy.MANUAL:
            # All devices require manual approval
            for device in compatible_devices:
                update = await self._create_device_update(
                    session, device, firmware, scheduled_for=None
                )
                updates.append(update)

        await session.commit()

        logger.info(
            f"Created {len(updates)} firmware updates for version {firmware_version} "
            f"using {strategy} strategy"
        )

        return updates

    async def _create_device_update(
        self,
        session: AsyncSession,
        device: Device,
        firmware: FirmwareVersion,
        scheduled_for: Optional[datetime] = None,
        is_canary: bool = False
    ) -> FirmwareUpdate:
        """Create firmware update for single device.

        Args:
            session: Database session
            device: Target device
            firmware: Firmware version
            scheduled_for: When to schedule update (None for manual)
            is_canary: Whether this is a canary update

        Returns:
            Created firmware update
        """
        update = FirmwareUpdate(
            device_id=device.id,
            firmware_version_id=firmware.id,
            current_version=device.firmware_version,
            target_version=firmware.version,
            status=UpdateStatus.PENDING,
            scheduled_for=scheduled_for,
            is_canary=is_canary,
            created_at=datetime.utcnow()
        )

        session.add(update)
        return update

    def _is_compatible(
        self,
        current_version: Optional[str],
        min_version: Optional[str]
    ) -> bool:
        """Check if current version is compatible with minimum version.

        Args:
            current_version: Current device version
            min_version: Minimum required version

        Returns:
            True if compatible
        """
        if not min_version:
            return True

        if not current_version:
            return False

        # Simple semantic version comparison
        try:
            current_parts = [int(x) for x in current_version.split(".")]
            min_parts = [int(x) for x in min_version.split(".")]

            # Pad to same length
            while len(current_parts) < len(min_parts):
                current_parts.append(0)
            while len(min_parts) < len(current_parts):
                min_parts.append(0)

            return current_parts >= min_parts

        except (ValueError, AttributeError):
            logger.warning(
                f"Invalid version format: current={current_version}, min={min_version}"
            )
            return False

    async def get_pending_update(
        self,
        session: AsyncSession,
        device_id: str
    ) -> Optional[FirmwareUpdate]:
        """Get pending firmware update for device.

        Args:
            session: Database session
            device_id: Device ID

        Returns:
            Pending update or None
        """
        result = await session.execute(
            select(FirmwareUpdate)
            .join(Device)
            .join(FirmwareVersion)
            .where(
                and_(
                    Device.device_id == device_id,
                    FirmwareUpdate.status == UpdateStatus.PENDING,
                    or_(
                        FirmwareUpdate.scheduled_for == None,
                        FirmwareUpdate.scheduled_for <= datetime.utcnow()
                    )
                )
            )
        )

        return result.scalar_one_or_none()

    async def update_status(
        self,
        session: AsyncSession,
        update_id: int,
        status: UpdateStatus,
        progress: Optional[int] = None,
        error_message: Optional[str] = None
    ) -> FirmwareUpdate:
        """Update firmware update status.

        Args:
            session: Database session
            update_id: Update ID
            status: New status
            progress: Progress percentage (0-100)
            error_message: Error message if failed

        Returns:
            Updated firmware update

        Raises:
            ValueError: If update not found
        """
        result = await session.execute(
            select(FirmwareUpdate).where(FirmwareUpdate.id == update_id)
        )
        update = result.scalar_one_or_none()

        if not update:
            raise ValueError(f"Firmware update {update_id} not found")

        update.status = status

        if progress is not None:
            update.progress = progress

        if error_message:
            update.error_message = error_message

        if status == UpdateStatus.DOWNLOADING:
            update.started_at = update.started_at or datetime.utcnow()
        elif status == UpdateStatus.COMPLETED:
            update.completed_at = datetime.utcnow()
            update.progress = 100
            # Update device firmware version
            result = await session.execute(
                select(Device).where(Device.id == update.device_id)
            )
            device = result.scalar_one()
            device.firmware_version = update.target_version
        elif status == UpdateStatus.FAILED:
            update.completed_at = datetime.utcnow()

        await session.commit()
        await session.refresh(update)

        logger.info(
            f"Updated firmware update {update_id} status to {status} "
            f"(progress: {progress}%)"
        )

        return update

    async def rollback_update(
        self,
        session: AsyncSession,
        update_id: int
    ) -> FirmwareUpdate:
        """Rollback firmware update.

        Args:
            session: Database session
            update_id: Update ID to rollback

        Returns:
            Updated firmware update

        Raises:
            ValueError: If update not found or can't be rolled back
        """
        result = await session.execute(
            select(FirmwareUpdate).where(FirmwareUpdate.id == update_id)
        )
        update = result.scalar_one_or_none()

        if not update:
            raise ValueError(f"Firmware update {update_id} not found")

        if update.status not in [UpdateStatus.FAILED, UpdateStatus.COMPLETED]:
            raise ValueError(
                f"Can only rollback failed or completed updates, "
                f"current status: {update.status}"
            )

        update.status = UpdateStatus.ROLLED_BACK
        update.completed_at = datetime.utcnow()

        # Revert device firmware version
        result = await session.execute(
            select(Device).where(Device.id == update.device_id)
        )
        device = result.scalar_one()
        device.firmware_version = update.current_version

        await session.commit()
        await session.refresh(update)

        logger.info(f"Rolled back firmware update {update_id}")

        return update

    async def get_update_stats(
        self,
        session: AsyncSession,
        firmware_version: Optional[str] = None,
        organization_id: Optional[int] = None
    ) -> dict:
        """Get firmware update statistics.

        Args:
            session: Database session
            firmware_version: Filter by firmware version
            organization_id: Filter by organization

        Returns:
            Update statistics
        """
        from sqlalchemy import func

        query = select(
            FirmwareUpdate.status,
            func.count(FirmwareUpdate.id).label("count")
        )

        conditions = []
        if firmware_version:
            conditions.append(FirmwareUpdate.target_version == firmware_version)
        if organization_id:
            query = query.join(Device)
            conditions.append(Device.organization_id == organization_id)

        if conditions:
            query = query.where(and_(*conditions))

        query = query.group_by(FirmwareUpdate.status)

        result = await session.execute(query)
        stats = {row.status: row.count for row in result}

        return {
            "pending": stats.get(UpdateStatus.PENDING, 0),
            "downloading": stats.get(UpdateStatus.DOWNLOADING, 0),
            "verifying": stats.get(UpdateStatus.VERIFYING, 0),
            "installing": stats.get(UpdateStatus.INSTALLING, 0),
            "completed": stats.get(UpdateStatus.COMPLETED, 0),
            "failed": stats.get(UpdateStatus.FAILED, 0),
            "rolled_back": stats.get(UpdateStatus.ROLLED_BACK, 0),
            "total": sum(stats.values())
        }


# Global firmware service instance
firmware_service = FirmwareService()
