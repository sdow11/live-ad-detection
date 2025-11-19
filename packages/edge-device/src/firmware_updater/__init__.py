"""Firmware updater for edge devices.

Provides OTA (Over-The-Air) firmware update capabilities including:
- Checking for available updates
- Downloading and verifying firmware
- Applying updates with rollback capability
- Reporting status to cloud API
"""

from firmware_updater.updater import FirmwareUpdater

__all__ = ["FirmwareUpdater"]
