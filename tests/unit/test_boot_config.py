"""Unit tests for boot configuration."""

import pytest
from pathlib import Path


@pytest.mark.unit
class TestBootConfig:
    """Test boot configuration management."""

    def test_default_config(self, boot_config):
        """Test default configuration values."""
        assert boot_config.get_auto_start() is True
        assert boot_config.get_default_app() is None
        assert boot_config.get_boot_delay() == 5
        assert boot_config.get_auto_launch_delay() == 3
        assert boot_config.is_kiosk_mode() is False
        assert boot_config.is_splash_enabled() is True

    def test_set_auto_start(self, boot_config):
        """Test setting auto-start."""
        boot_config.set_auto_start(False)
        assert boot_config.get_auto_start() is False

        boot_config.set_auto_start(True)
        assert boot_config.get_auto_start() is True

    def test_set_default_app(self, boot_config):
        """Test setting default app."""
        boot_config.set_default_app("test_app")
        assert boot_config.get_default_app() == "test_app"

        boot_config.set_default_app(None)
        assert boot_config.get_default_app() is None

    def test_set_last_app(self, boot_config):
        """Test recording last app."""
        boot_config.set_last_app("last_app")
        assert boot_config.config["last_app"] == "last_app"

    def test_kiosk_mode(self, boot_config):
        """Test kiosk mode setting."""
        boot_config.set_kiosk_mode(True)
        assert boot_config.is_kiosk_mode() is True

        boot_config.set_kiosk_mode(False)
        assert boot_config.is_kiosk_mode() is False

    def test_save_and_load(self, boot_config, mock_config_dir):
        """Test saving and loading configuration."""
        # Set some values
        boot_config.set_auto_start(False)
        boot_config.set_default_app("my_app")
        boot_config.set_kiosk_mode(True)

        # Save
        assert boot_config.save_config() is True

        # Create new instance and load
        from system.boot_config import BootConfig
        new_config = BootConfig(config_file=mock_config_dir / "boot_config.json")

        assert new_config.get_auto_start() is False
        assert new_config.get_default_app() == "my_app"
        assert new_config.is_kiosk_mode() is True

    def test_restore_last_app(self, boot_config):
        """Test restore last app functionality."""
        # Enable restore last app
        boot_config.config["restore_last_app"] = True
        boot_config.set_last_app("last_app")

        # Should return last app instead of default
        assert boot_config.get_default_app() == "last_app"

    def test_to_dict(self, boot_config):
        """Test configuration dictionary export."""
        config_dict = boot_config.to_dict()

        assert isinstance(config_dict, dict)
        assert "auto_start" in config_dict
        assert "default_app" in config_dict
        assert "kiosk_mode" in config_dict
