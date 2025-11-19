"""Firmware updater implementation for edge devices.

Handles OTA firmware updates with verification and rollback capabilities.
"""

import hashlib
import logging
import os
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class UpdateStatus:
    """Update status constants."""
    PENDING = "pending"
    DOWNLOADING = "downloading"
    VERIFYING = "verifying"
    INSTALLING = "installing"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class FirmwareUpdater:
    """Handles firmware updates for edge devices.

    Features:
    - Check for available updates from cloud API
    - Download firmware with progress tracking
    - Verify checksums before installation
    - Apply updates with automatic rollback on failure
    - Report status to cloud API
    """

    def __init__(
        self,
        cloud_api_url: str,
        api_key: str,
        device_id: str,
        current_version: str,
        firmware_dir: str = "/opt/ad-detection/firmware",
        backup_dir: str = "/opt/ad-detection/firmware-backup"
    ):
        """Initialize firmware updater.

        Args:
            cloud_api_url: Cloud API base URL
            api_key: Device API key for authentication
            device_id: Device identifier
            current_version: Current firmware version
            firmware_dir: Directory containing current firmware
            backup_dir: Directory for firmware backups
        """
        self.cloud_api_url = cloud_api_url.rstrip("/")
        self.api_key = api_key
        self.device_id = device_id
        self.current_version = current_version
        self.firmware_dir = Path(firmware_dir)
        self.backup_dir = Path(backup_dir)

        # Ensure directories exist
        self.firmware_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)

        # HTTP client
        self.client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=300.0  # 5 minutes for large downloads
        )

    async def check_for_update(self) -> Optional[dict]:
        """Check if firmware update is available.

        Returns:
            Update info dict or None if no update available
        """
        try:
            response = await self.client.get(
                f"{self.cloud_api_url}/api/v1/firmware/updates/pending",
                params={"device_id": self.device_id}
            )
            response.raise_for_status()

            data = response.json()

            if not data.get("has_update"):
                logger.info("No firmware update available")
                return None

            logger.info(
                f"Firmware update available: "
                f"{self.current_version} -> {data['target_version']}"
            )

            return data

        except Exception as e:
            logger.error(f"Failed to check for firmware update: {e}")
            return None

    async def download_firmware(
        self,
        update_info: dict,
        progress_callback: Optional[callable] = None
    ) -> Optional[Path]:
        """Download firmware file.

        Args:
            update_info: Update information from check_for_update()
            progress_callback: Optional callback for progress updates (percent: int)

        Returns:
            Path to downloaded file or None on failure
        """
        update_id = update_info["update_id"]
        file_url = update_info.get("file_url") or update_info.get("file_path")

        if not file_url:
            logger.error("No file URL or path in update info")
            return None

        # Report download started
        await self._report_status(
            update_id,
            UpdateStatus.DOWNLOADING,
            progress=0
        )

        try:
            # Create temporary file for download
            temp_file = tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".bin",
                dir=self.firmware_dir
            )
            temp_path = Path(temp_file.name)

            # Download firmware
            logger.info(f"Downloading firmware from {file_url}")

            # If it's a local file path, copy it
            if file_url.startswith("/"):
                with open(file_url, "rb") as src:
                    shutil.copyfileobj(src, temp_file)
                temp_file.close()
                logger.info("Copied firmware from local path")

                if progress_callback:
                    progress_callback(100)

                await self._report_status(
                    update_id,
                    UpdateStatus.DOWNLOADING,
                    progress=100
                )

            else:
                # Download from URL
                async with self.client.stream("GET", file_url) as response:
                    response.raise_for_status()

                    total_size = int(response.headers.get("content-length", 0))
                    downloaded = 0

                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        temp_file.write(chunk)
                        downloaded += len(chunk)

                        # Report progress
                        if total_size > 0:
                            progress = int((downloaded / total_size) * 100)

                            if progress_callback:
                                progress_callback(progress)

                            # Report to cloud every 10%
                            if progress % 10 == 0:
                                await self._report_status(
                                    update_id,
                                    UpdateStatus.DOWNLOADING,
                                    progress=progress
                                )

                temp_file.close()
                logger.info(f"Downloaded {downloaded} bytes")

            return temp_path

        except Exception as e:
            logger.error(f"Failed to download firmware: {e}")

            await self._report_status(
                update_id,
                UpdateStatus.FAILED,
                error_message=f"Download failed: {str(e)}"
            )

            if temp_path.exists():
                temp_path.unlink()

            return None

    async def verify_firmware(
        self,
        firmware_file: Path,
        expected_checksum: str,
        update_id: int
    ) -> bool:
        """Verify firmware checksum.

        Args:
            firmware_file: Path to firmware file
            expected_checksum: Expected SHA-256 checksum
            update_id: Update ID for status reporting

        Returns:
            True if verification successful
        """
        await self._report_status(
            update_id,
            UpdateStatus.VERIFYING,
            progress=0
        )

        try:
            logger.info("Verifying firmware checksum")

            # Calculate SHA-256 checksum
            sha256 = hashlib.sha256()
            with open(firmware_file, "rb") as f:
                while chunk := f.read(65536):
                    sha256.update(chunk)

            actual_checksum = sha256.hexdigest()

            if actual_checksum != expected_checksum:
                logger.error(
                    f"Checksum mismatch: expected {expected_checksum}, "
                    f"got {actual_checksum}"
                )

                await self._report_status(
                    update_id,
                    UpdateStatus.FAILED,
                    error_message="Checksum verification failed"
                )

                return False

            logger.info("Firmware checksum verified successfully")

            await self._report_status(
                update_id,
                UpdateStatus.VERIFYING,
                progress=100
            )

            return True

        except Exception as e:
            logger.error(f"Failed to verify firmware: {e}")

            await self._report_status(
                update_id,
                UpdateStatus.FAILED,
                error_message=f"Verification failed: {str(e)}"
            )

            return False

    async def backup_current_firmware(self) -> bool:
        """Backup current firmware before updating.

        Returns:
            True if backup successful
        """
        try:
            logger.info("Backing up current firmware")

            # Create timestamped backup
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = f"firmware_v{self.current_version}_{timestamp}"
            backup_path = self.backup_dir / backup_name

            # Backup firmware directory
            if self.firmware_dir.exists():
                shutil.copytree(
                    self.firmware_dir,
                    backup_path,
                    symlinks=True,
                    ignore=shutil.ignore_patterns("*.tmp", "*.download")
                )

                logger.info(f"Backup created at {backup_path}")
                return True
            else:
                logger.warning("Firmware directory doesn't exist, skipping backup")
                return True

        except Exception as e:
            logger.error(f"Failed to backup firmware: {e}")
            return False

    async def install_firmware(
        self,
        firmware_file: Path,
        update_id: int,
        target_version: str
    ) -> bool:
        """Install firmware update.

        Args:
            firmware_file: Path to verified firmware file
            update_id: Update ID for status reporting
            target_version: Target firmware version

        Returns:
            True if installation successful
        """
        await self._report_status(
            update_id,
            UpdateStatus.INSTALLING,
            progress=0
        )

        try:
            logger.info("Installing firmware update")

            # Backup current firmware
            if not await self.backup_current_firmware():
                raise Exception("Failed to backup current firmware")

            await self._report_status(update_id, UpdateStatus.INSTALLING, progress=25)

            # Extract/install firmware (implementation depends on firmware format)
            # For now, we'll assume it's a simple binary replacement

            # Stop running services
            logger.info("Stopping services for update")
            self._stop_services()

            await self._report_status(update_id, UpdateStatus.INSTALLING, progress=50)

            # Replace firmware binary
            target_binary = self.firmware_dir / "ad-detection"
            if target_binary.exists():
                target_binary.unlink()

            shutil.copy2(firmware_file, target_binary)
            target_binary.chmod(0o755)  # Make executable

            await self._report_status(update_id, UpdateStatus.INSTALLING, progress=75)

            # Update version file
            version_file = self.firmware_dir / "VERSION"
            version_file.write_text(target_version)

            logger.info("Firmware installed successfully")

            await self._report_status(update_id, UpdateStatus.INSTALLING, progress=100)

            # Start services with new firmware
            logger.info("Starting services with new firmware")
            self._start_services()

            # Give services time to start
            import asyncio
            await asyncio.sleep(5)

            # Verify services started successfully
            if not self._verify_services():
                raise Exception("Services failed to start with new firmware")

            # Report success
            await self._report_status(
                update_id,
                UpdateStatus.COMPLETED,
                progress=100
            )

            logger.info(f"Firmware update to {target_version} completed successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to install firmware: {e}")

            await self._report_status(
                update_id,
                UpdateStatus.FAILED,
                error_message=f"Installation failed: {str(e)}"
            )

            # Attempt rollback
            logger.warning("Attempting rollback to previous firmware")
            await self.rollback_firmware()

            return False

    async def rollback_firmware(self) -> bool:
        """Rollback to previous firmware version.

        Returns:
            True if rollback successful
        """
        try:
            logger.info("Rolling back to previous firmware")

            # Find most recent backup
            backups = sorted(
                self.backup_dir.glob(f"firmware_v{self.current_version}_*"),
                reverse=True
            )

            if not backups:
                logger.error("No backup found for rollback")
                return False

            latest_backup = backups[0]
            logger.info(f"Restoring from backup: {latest_backup}")

            # Stop services
            self._stop_services()

            # Restore backup
            if self.firmware_dir.exists():
                shutil.rmtree(self.firmware_dir)

            shutil.copytree(latest_backup, self.firmware_dir, symlinks=True)

            # Start services
            self._start_services()

            logger.info("Rollback completed successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to rollback firmware: {e}")
            return False

    async def perform_update(self) -> bool:
        """Check for and perform firmware update if available.

        Returns:
            True if update was performed successfully (or no update needed)
        """
        # Check for update
        update_info = await self.check_for_update()

        if not update_info:
            return True  # No update available is not an error

        update_id = update_info["update_id"]
        target_version = update_info["target_version"]
        expected_checksum = update_info["checksum"]

        logger.info(f"Starting firmware update to version {target_version}")

        # Download firmware
        firmware_file = await self.download_firmware(update_info)

        if not firmware_file:
            return False

        # Verify firmware
        if not await self.verify_firmware(firmware_file, expected_checksum, update_id):
            firmware_file.unlink()
            return False

        # Install firmware
        success = await self.install_firmware(firmware_file, update_id, target_version)

        # Cleanup downloaded file
        if firmware_file.exists():
            firmware_file.unlink()

        return success

    async def _report_status(
        self,
        update_id: int,
        status: str,
        progress: Optional[int] = None,
        error_message: Optional[str] = None
    ) -> None:
        """Report update status to cloud API.

        Args:
            update_id: Update ID
            status: Current status
            progress: Progress percentage (0-100)
            error_message: Error message if failed
        """
        try:
            payload = {"status": status}

            if progress is not None:
                payload["progress"] = progress

            if error_message:
                payload["error_message"] = error_message

            response = await self.client.post(
                f"{self.cloud_api_url}/api/v1/firmware/updates/{update_id}/status",
                json=payload
            )
            response.raise_for_status()

            logger.debug(f"Reported status: {status} ({progress}%)")

        except Exception as e:
            logger.warning(f"Failed to report status to cloud: {e}")

    def _stop_services(self) -> None:
        """Stop running services for update."""
        try:
            # Stop systemd service if it exists
            subprocess.run(
                ["systemctl", "stop", "ad-detection"],
                check=False,
                capture_output=True
            )
            logger.info("Stopped ad-detection service")

        except Exception as e:
            logger.warning(f"Failed to stop services: {e}")

    def _start_services(self) -> None:
        """Start services after update."""
        try:
            # Start systemd service if it exists
            subprocess.run(
                ["systemctl", "start", "ad-detection"],
                check=False,
                capture_output=True
            )
            logger.info("Started ad-detection service")

        except Exception as e:
            logger.warning(f"Failed to start services: {e}")

    def _verify_services(self) -> bool:
        """Verify services are running correctly.

        Returns:
            True if services are healthy
        """
        try:
            # Check systemd service status
            result = subprocess.run(
                ["systemctl", "is-active", "ad-detection"],
                capture_output=True,
                text=True
            )

            is_active = result.stdout.strip() == "active"

            if is_active:
                logger.info("Services verified as running")
            else:
                logger.warning("Services not running")

            return is_active

        except Exception as e:
            logger.error(f"Failed to verify services: {e}")
            return False

    async def close(self) -> None:
        """Close HTTP client."""
        await self.client.aclose()
