"""Boot configuration management.

Manages boot-to-app configuration, default app selection,
and auto-start behavior.
"""

import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class BootConfig:
    """Boot configuration manager."""

    def __init__(self, config_file: Optional[Path] = None):
        """Initialize boot config.

        Args:
            config_file: Path to config file (default: /var/lib/ad-detection/boot_config.json)
        """
        self.config_file = config_file or Path("/var/lib/ad-detection/boot_config.json")
        self.config = self._load_config()

    def _load_config(self) -> dict:
        """Load configuration from file.

        Returns:
            Configuration dictionary
        """
        if self.config_file.exists():
            try:
                with open(self.config_file) as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load boot config: {e}")

        # Return defaults
        return {
            "auto_start": True,
            "default_app": None,  # None = show launcher, or app_id to auto-launch
            "boot_delay_seconds": 5,
            "enable_splash_screen": True,
            "auto_launch_delay": 3,  # Delay before auto-launching default app
            "restore_last_app": False,  # Restore last running app on boot
            "last_app": None,
            "kiosk_mode": False,  # If true, cannot exit to launcher
        }

    def save_config(self) -> bool:
        """Save configuration to file.

        Returns:
            True if saved successfully
        """
        try:
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.config_file, 'w') as f:
                json.dump(self.config, f, indent=2)
            logger.info("Boot configuration saved")
            return True
        except Exception as e:
            logger.error(f"Failed to save boot config: {e}")
            return False

    def get_auto_start(self) -> bool:
        """Get auto-start setting.

        Returns:
            True if home screen should auto-start
        """
        return self.config.get("auto_start", True)

    def set_auto_start(self, enabled: bool) -> None:
        """Set auto-start setting.

        Args:
            enabled: Enable auto-start
        """
        self.config["auto_start"] = enabled
        self.save_config()

    def get_default_app(self) -> Optional[str]:
        """Get default app to launch on boot.

        Returns:
            App ID or None for launcher
        """
        if self.config.get("restore_last_app", False):
            return self.config.get("last_app")
        return self.config.get("default_app")

    def set_default_app(self, app_id: Optional[str]) -> None:
        """Set default app to launch on boot.

        Args:
            app_id: App ID or None for launcher
        """
        self.config["default_app"] = app_id
        self.save_config()

    def set_last_app(self, app_id: Optional[str]) -> None:
        """Set last running app.

        Args:
            app_id: App ID
        """
        self.config["last_app"] = app_id
        self.save_config()

    def get_boot_delay(self) -> int:
        """Get boot delay in seconds.

        Returns:
            Delay in seconds
        """
        return self.config.get("boot_delay_seconds", 5)

    def get_auto_launch_delay(self) -> int:
        """Get auto-launch delay in seconds.

        Returns:
            Delay in seconds before auto-launching default app
        """
        return self.config.get("auto_launch_delay", 3)

    def is_kiosk_mode(self) -> bool:
        """Check if kiosk mode is enabled.

        Returns:
            True if kiosk mode is enabled
        """
        return self.config.get("kiosk_mode", False)

    def set_kiosk_mode(self, enabled: bool) -> None:
        """Set kiosk mode.

        Args:
            enabled: Enable kiosk mode
        """
        self.config["kiosk_mode"] = enabled
        self.save_config()

    def is_splash_enabled(self) -> bool:
        """Check if splash screen is enabled.

        Returns:
            True if splash screen should be shown
        """
        return self.config.get("enable_splash_screen", True)

    def to_dict(self) -> dict:
        """Get configuration as dictionary.

        Returns:
            Configuration dictionary
        """
        return self.config.copy()


# Global boot config instance
boot_config = BootConfig()
