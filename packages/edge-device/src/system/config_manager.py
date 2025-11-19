"""Centralized configuration management.

Provides unified configuration storage and access for all system components,
apps, and user preferences with automatic persistence and cloud sync support.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class ConfigManager:
    """Centralized configuration manager."""

    def __init__(self, config_dir: Optional[Path] = None):
        """Initialize configuration manager.

        Args:
            config_dir: Configuration directory (default: /var/lib/ad-detection/config)
        """
        self.config_dir = config_dir or Path("/var/lib/ad-detection/config")
        self.config_dir.mkdir(parents=True, exist_ok=True)

        # Configuration stores
        self.system_config: Dict[str, Any] = {}
        self.user_preferences: Dict[str, Any] = {}
        self.app_configs: Dict[str, Dict[str, Any]] = {}

        # Load existing configurations
        self._load_all()

    def _load_all(self) -> None:
        """Load all configuration files."""
        self._load_system_config()
        self._load_user_preferences()
        self._load_app_configs()

    def _load_system_config(self) -> None:
        """Load system configuration."""
        config_file = self.config_dir / "system.json"

        if config_file.exists():
            try:
                with open(config_file) as f:
                    self.system_config = json.load(f)
                logger.info("System configuration loaded")
            except Exception as e:
                logger.error(f"Failed to load system config: {e}")
                self.system_config = self._get_default_system_config()
        else:
            self.system_config = self._get_default_system_config()
            self._save_system_config()

    def _load_user_preferences(self) -> None:
        """Load user preferences."""
        prefs_file = self.config_dir / "user_preferences.json"

        if prefs_file.exists():
            try:
                with open(prefs_file) as f:
                    self.user_preferences = json.load(f)
                logger.info("User preferences loaded")
            except Exception as e:
                logger.error(f"Failed to load user preferences: {e}")
                self.user_preferences = self._get_default_user_preferences()
        else:
            self.user_preferences = self._get_default_user_preferences()
            self._save_user_preferences()

    def _load_app_configs(self) -> None:
        """Load app-specific configurations."""
        apps_dir = self.config_dir / "apps"
        apps_dir.mkdir(exist_ok=True)

        for app_file in apps_dir.glob("*.json"):
            app_id = app_file.stem
            try:
                with open(app_file) as f:
                    self.app_configs[app_id] = json.load(f)
                logger.debug(f"Loaded config for app: {app_id}")
            except Exception as e:
                logger.error(f"Failed to load config for {app_id}: {e}")

    def _get_default_system_config(self) -> Dict[str, Any]:
        """Get default system configuration.

        Returns:
            Default system config
        """
        return {
            "device_id": None,  # Set during first-time setup
            "device_name": "Ad Detection Device",
            "organization_id": None,
            "location_id": None,
            "timezone": "America/New_York",
            "language": "en_US",
            "display": {
                "resolution": "auto",  # "auto", "1920x1080", "1280x720", etc.
                "refresh_rate": 60,
                "overscan": False,
                "rotation": 0  # 0, 90, 180, 270
            },
            "network": {
                "hostname": "ad-detection",
                "enable_wifi": True,
                "enable_ethernet": True,
                "enable_mdns": True
            },
            "cluster": {
                "enable_clustering": True,
                "heartbeat_interval": 5,
                "election_timeout": 15
            },
            "remote_management": {
                "enable_cloud_api": True,
                "api_endpoint": "https://api.example.com",
                "api_key": None
            },
            "performance": {
                "enable_gpu": True,
                "max_cpu_percent": 80,
                "max_memory_mb": 512
            }
        }

    def _get_default_user_preferences(self) -> Dict[str, Any]:
        """Get default user preferences.

        Returns:
            Default user preferences
        """
        return {
            "theme": "dark",  # "dark", "light", "auto"
            "launcher": {
                "apps_per_row": 3,
                "show_clock": True,
                "show_system_info": False,
                "favorites": []  # List of app IDs
            },
            "apps": {
                "last_used": None,
                "favorites": [],
                "usage_stats": {}  # app_id -> {"launches": count, "last_used": timestamp}
            },
            "accessibility": {
                "large_text": False,
                "high_contrast": False,
                "reduce_motion": False,
                "screen_reader": False
            },
            "privacy": {
                "enable_usage_stats": True,
                "enable_crash_reports": True,
                "enable_cloud_sync": False
            }
        }

    def _save_system_config(self) -> bool:
        """Save system configuration.

        Returns:
            True if successful
        """
        try:
            config_file = self.config_dir / "system.json"
            with open(config_file, 'w') as f:
                json.dump(self.system_config, f, indent=2)
            logger.debug("System configuration saved")
            return True
        except Exception as e:
            logger.error(f"Failed to save system config: {e}")
            return False

    def _save_user_preferences(self) -> bool:
        """Save user preferences.

        Returns:
            True if successful
        """
        try:
            prefs_file = self.config_dir / "user_preferences.json"
            with open(prefs_file, 'w') as f:
                json.dump(self.user_preferences, f, indent=2)
            logger.debug("User preferences saved")
            return True
        except Exception as e:
            logger.error(f"Failed to save user preferences: {e}")
            return False

    def _save_app_config(self, app_id: str) -> bool:
        """Save app-specific configuration.

        Args:
            app_id: App identifier

        Returns:
            True if successful
        """
        try:
            apps_dir = self.config_dir / "apps"
            apps_dir.mkdir(exist_ok=True)

            app_file = apps_dir / f"{app_id}.json"
            with open(app_file, 'w') as f:
                json.dump(self.app_configs.get(app_id, {}), f, indent=2)
            logger.debug(f"Configuration saved for app: {app_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to save config for {app_id}: {e}")
            return False

    # System Configuration API

    def get_system(self, key: str, default: Any = None) -> Any:
        """Get system configuration value.

        Args:
            key: Configuration key (supports dot notation, e.g., "display.resolution")
            default: Default value if key not found

        Returns:
            Configuration value
        """
        keys = key.split('.')
        value = self.system_config

        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default

        return value

    def set_system(self, key: str, value: Any, save: bool = True) -> bool:
        """Set system configuration value.

        Args:
            key: Configuration key (supports dot notation)
            value: Value to set
            save: Whether to save to disk immediately

        Returns:
            True if successful
        """
        keys = key.split('.')
        config = self.system_config

        # Navigate to the parent dict
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]

        # Set the value
        config[keys[-1]] = value

        if save:
            return self._save_system_config()

        return True

    # User Preferences API

    def get_preference(self, key: str, default: Any = None) -> Any:
        """Get user preference value.

        Args:
            key: Preference key (supports dot notation)
            default: Default value if key not found

        Returns:
            Preference value
        """
        keys = key.split('.')
        value = self.user_preferences

        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default

        return value

    def set_preference(self, key: str, value: Any, save: bool = True) -> bool:
        """Set user preference value.

        Args:
            key: Preference key (supports dot notation)
            value: Value to set
            save: Whether to save to disk immediately

        Returns:
            True if successful
        """
        keys = key.split('.')
        prefs = self.user_preferences

        # Navigate to the parent dict
        for k in keys[:-1]:
            if k not in prefs:
                prefs[k] = {}
            prefs = prefs[k]

        # Set the value
        prefs[keys[-1]] = value

        if save:
            return self._save_user_preferences()

        return True

    # App Configuration API

    def get_app_config(self, app_id: str, key: Optional[str] = None, default: Any = None) -> Any:
        """Get app-specific configuration.

        Args:
            app_id: App identifier
            key: Configuration key (optional, supports dot notation)
            default: Default value if key not found

        Returns:
            Configuration value or entire app config
        """
        if app_id not in self.app_configs:
            self.app_configs[app_id] = {}

        if key is None:
            return self.app_configs[app_id]

        keys = key.split('.')
        value = self.app_configs[app_id]

        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default

        return value

    def set_app_config(self, app_id: str, key: str, value: Any, save: bool = True) -> bool:
        """Set app-specific configuration.

        Args:
            app_id: App identifier
            key: Configuration key (supports dot notation)
            value: Value to set
            save: Whether to save to disk immediately

        Returns:
            True if successful
        """
        if app_id not in self.app_configs:
            self.app_configs[app_id] = {}

        keys = key.split('.')
        config = self.app_configs[app_id]

        # Navigate to the parent dict
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]

        # Set the value
        config[keys[-1]] = value

        if save:
            return self._save_app_config(app_id)

        return True

    def update_app_config(self, app_id: str, config: Dict[str, Any], save: bool = True) -> bool:
        """Update entire app configuration.

        Args:
            app_id: App identifier
            config: New configuration dictionary
            save: Whether to save to disk immediately

        Returns:
            True if successful
        """
        self.app_configs[app_id] = config

        if save:
            return self._save_app_config(app_id)

        return True

    # Usage Statistics

    def record_app_launch(self, app_id: str) -> None:
        """Record app launch for usage statistics.

        Args:
            app_id: App identifier
        """
        usage_stats = self.get_preference("apps.usage_stats", {})

        if app_id not in usage_stats:
            usage_stats[app_id] = {"launches": 0, "last_used": None}

        usage_stats[app_id]["launches"] += 1
        usage_stats[app_id]["last_used"] = datetime.now().isoformat()

        self.set_preference("apps.usage_stats", usage_stats)
        self.set_preference("apps.last_used", app_id)

    def get_app_usage(self, app_id: str) -> Dict[str, Any]:
        """Get usage statistics for an app.

        Args:
            app_id: App identifier

        Returns:
            Usage statistics
        """
        usage_stats = self.get_preference("apps.usage_stats", {})
        return usage_stats.get(app_id, {"launches": 0, "last_used": None})

    # Favorites

    def add_favorite(self, app_id: str) -> bool:
        """Add app to favorites.

        Args:
            app_id: App identifier

        Returns:
            True if added
        """
        favorites = self.get_preference("launcher.favorites", [])

        if app_id not in favorites:
            favorites.append(app_id)
            return self.set_preference("launcher.favorites", favorites)

        return False

    def remove_favorite(self, app_id: str) -> bool:
        """Remove app from favorites.

        Args:
            app_id: App identifier

        Returns:
            True if removed
        """
        favorites = self.get_preference("launcher.favorites", [])

        if app_id in favorites:
            favorites.remove(app_id)
            return self.set_preference("launcher.favorites", favorites)

        return False

    def is_favorite(self, app_id: str) -> bool:
        """Check if app is in favorites.

        Args:
            app_id: App identifier

        Returns:
            True if favorite
        """
        favorites = self.get_preference("launcher.favorites", [])
        return app_id in favorites

    # Export/Import

    def export_config(self, export_file: Path) -> bool:
        """Export all configuration to a file.

        Args:
            export_file: Path to export file

        Returns:
            True if successful
        """
        try:
            export_data = {
                "system_config": self.system_config,
                "user_preferences": self.user_preferences,
                "app_configs": self.app_configs,
                "exported_at": datetime.now().isoformat()
            }

            with open(export_file, 'w') as f:
                json.dump(export_data, f, indent=2)

            logger.info(f"Configuration exported to: {export_file}")
            return True

        except Exception as e:
            logger.error(f"Failed to export configuration: {e}")
            return False

    def import_config(self, import_file: Path, merge: bool = True) -> bool:
        """Import configuration from a file.

        Args:
            import_file: Path to import file
            merge: If True, merge with existing config; if False, replace

        Returns:
            True if successful
        """
        try:
            with open(import_file) as f:
                import_data = json.load(f)

            if merge:
                # Merge configurations
                self.system_config.update(import_data.get("system_config", {}))
                self.user_preferences.update(import_data.get("user_preferences", {}))
                self.app_configs.update(import_data.get("app_configs", {}))
            else:
                # Replace configurations
                self.system_config = import_data.get("system_config", {})
                self.user_preferences = import_data.get("user_preferences", {})
                self.app_configs = import_data.get("app_configs", {})

            # Save all
            self._save_system_config()
            self._save_user_preferences()
            for app_id in self.app_configs.keys():
                self._save_app_config(app_id)

            logger.info(f"Configuration imported from: {import_file}")
            return True

        except Exception as e:
            logger.error(f"Failed to import configuration: {e}")
            return False


# Global configuration manager instance
config_manager = ConfigManager()
