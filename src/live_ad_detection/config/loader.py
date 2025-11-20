"""Configuration loader and manager."""

import os
import yaml
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class ConfigLoader:
    """Loads and manages device configuration."""

    DEFAULT_CONFIG_PATHS = [
        "/etc/live-ad-detection/device_config.yaml",
        "./config/device_config.yaml",
        "~/.config/live-ad-detection/device_config.yaml"
    ]

    def __init__(self, config_path: Optional[str] = None):
        """Initialize configuration loader.

        Args:
            config_path: Path to configuration file (optional)
        """
        self.config_path = config_path
        self.config = {}
        self.load_config()

    def load_config(self) -> Dict[str, Any]:
        """Load configuration from file.

        Returns:
            Configuration dictionary
        """
        # Determine config path
        if self.config_path:
            paths = [self.config_path]
        else:
            paths = self.DEFAULT_CONFIG_PATHS

        # Try to load config from each path
        for path in paths:
            expanded_path = Path(path).expanduser()
            if expanded_path.exists():
                try:
                    with open(expanded_path, 'r') as f:
                        self.config = yaml.safe_load(f) or {}
                    logger.info(f"Loaded configuration from {expanded_path}")
                    return self.config
                except Exception as e:
                    logger.error(f"Error loading config from {expanded_path}: {e}")

        # If no config found, use defaults
        logger.warning("No configuration file found, using defaults")
        self.config = self._get_default_config()
        return self.config

    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value by dot-notation key.

        Args:
            key: Configuration key (e.g., 'wifi.primary_interface')
            default: Default value if key not found

        Returns:
            Configuration value or default
        """
        keys = key.split('.')
        value = self.config

        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default

        return value

    def set(self, key: str, value: Any) -> None:
        """Set configuration value by dot-notation key.

        Args:
            key: Configuration key (e.g., 'wifi.primary_interface')
            value: Value to set
        """
        keys = key.split('.')
        config = self.config

        for k in keys[:-1]:
            if k not in config or not isinstance(config[k], dict):
                config[k] = {}
            config = config[k]

        config[keys[-1]] = value

    def save_config(self, path: Optional[str] = None) -> bool:
        """Save configuration to file.

        Args:
            path: Path to save configuration (uses loaded path if None)

        Returns:
            True if successful, False otherwise
        """
        save_path = path or self.config_path or self.DEFAULT_CONFIG_PATHS[1]
        save_path = Path(save_path).expanduser()

        try:
            # Create directory if it doesn't exist
            save_path.parent.mkdir(parents=True, exist_ok=True)

            with open(save_path, 'w') as f:
                yaml.dump(self.config, f, default_flow_style=False, sort_keys=False)

            logger.info(f"Configuration saved to {save_path}")
            return True

        except Exception as e:
            logger.error(f"Error saving configuration to {save_path}: {e}")
            return False

    def is_head_device(self) -> bool:
        """Check if this is a head device.

        Returns:
            True if head device, False otherwise
        """
        return self.get('device_role', 'node') == 'head'

    def is_touchscreen_enabled(self) -> bool:
        """Check if touchscreen UI is enabled.

        Returns:
            True if enabled, False otherwise
        """
        return self.get('touchscreen.enabled', False)

    def is_web_interface_enabled(self) -> bool:
        """Check if web interface is enabled.

        Returns:
            True if enabled, False otherwise
        """
        return self.get('web_interface.enabled', True)

    def _get_default_config(self) -> Dict[str, Any]:
        """Get default configuration.

        Returns:
            Default configuration dictionary
        """
        return {
            'device_role': 'node',
            'wifi': {
                'primary_interface': 'wlan0',
                'ap_interface': 'wlan1',
                'ap_ssid': 'LiveAdDetection',
                'ap_password': '',
                'auto_start_ap': False
            },
            'web_interface': {
                'enabled': True,
                'host': '0.0.0.0',
                'port': 5000,
                'auto_start': True
            },
            'touchscreen': {
                'enabled': False,
                'auto_start': False,
                'fullscreen': True
            },
            'display': {
                'enabled': False
            },
            'logging': {
                'level': 'INFO'
            }
        }
