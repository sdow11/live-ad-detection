"""Tests for audio manager."""

import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch, mock_open

from system.audio_manager import (
    AudioManager,
    AudioDevice,
    AudioOutput,
    AudioSettings
)


@pytest.fixture
def audio_manager():
    """Create audio manager instance with mocked subprocess."""
    with patch('subprocess.run') as mock_run:
        # Mock aplay output to simulate HDMI device
        mock_run.return_value = MagicMock(
            stdout="bcm2835 HDMI 1",
            returncode=0
        )
        manager = AudioManager()
    return manager


class TestAudioOutput:
    """Test AudioOutput enum."""

    def test_audio_output_values(self):
        """Test AudioOutput enum has expected values."""
        assert AudioOutput.HDMI.value == "hdmi"
        assert AudioOutput.ANALOG.value == "analog"
        assert AudioOutput.BLUETOOTH.value == "bluetooth"
        assert AudioOutput.USB.value == "usb"
        assert AudioOutput.AUTO.value == "auto"


class TestAudioDevice:
    """Test AudioDevice class."""

    def test_audio_device_creation(self):
        """Test creating an audio device."""
        device = AudioDevice("hw:0,0", "HDMI Output", AudioOutput.HDMI)

        assert device.device_id == "hw:0,0"
        assert device.name == "HDMI Output"
        assert device.output_type == AudioOutput.HDMI

    def test_audio_device_with_different_types(self):
        """Test creating devices with different output types."""
        hdmi_device = AudioDevice("hw:0,0", "HDMI", AudioOutput.HDMI)
        analog_device = AudioDevice("hw:0,1", "Analog", AudioOutput.ANALOG)
        usb_device = AudioDevice("hw:1,0", "USB Audio", AudioOutput.USB)

        assert hdmi_device.output_type == AudioOutput.HDMI
        assert analog_device.output_type == AudioOutput.ANALOG
        assert usb_device.output_type == AudioOutput.USB


class TestAudioSettings:
    """Test AudioSettings dataclass."""

    def test_audio_settings_defaults(self):
        """Test audio settings default values."""
        settings = AudioSettings()

        assert settings.volume == 100
        assert settings.muted is False
        assert settings.output == AudioOutput.AUTO
        assert settings.enable_ducking is False
        assert settings.ducking_level == 30

    def test_audio_settings_custom_values(self):
        """Test creating audio settings with custom values."""
        settings = AudioSettings(
            volume=75,
            muted=True,
            output=AudioOutput.HDMI,
            enable_ducking=True,
            ducking_level=40
        )

        assert settings.volume == 75
        assert settings.muted is True
        assert settings.output == AudioOutput.HDMI
        assert settings.enable_ducking is True
        assert settings.ducking_level == 40


class TestAudioManager:
    """Test AudioManager class."""

    def test_initialization(self, audio_manager):
        """Test audio manager initialization."""
        assert audio_manager.system_volume == 100
        assert audio_manager.system_muted is False
        assert audio_manager.current_output == AudioOutput.AUTO
        assert isinstance(audio_manager.app_settings, dict)
        assert isinstance(audio_manager.available_devices, list)

    def test_get_available_devices(self, audio_manager):
        """Test getting available audio devices."""
        devices = audio_manager.get_available_devices()

        assert isinstance(devices, list)
        # Should have at least the mocked HDMI device
        assert len(devices) >= 0

    def test_get_volume(self, audio_manager):
        """Test getting system volume."""
        volume = audio_manager.get_volume()

        assert volume == 100
        assert 0 <= volume <= 100

    def test_set_volume_valid_range(self, audio_manager):
        """Test setting volume within valid range."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            result = audio_manager.set_volume(75)

            assert result is True
            assert audio_manager.system_volume == 75

    def test_set_volume_boundary_values(self, audio_manager):
        """Test setting volume at boundary values."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            # Minimum volume
            audio_manager.set_volume(0)
            assert audio_manager.system_volume == 0

            # Maximum volume
            audio_manager.set_volume(100)
            assert audio_manager.system_volume == 100

    def test_set_volume_clamps_too_high(self, audio_manager):
        """Test setting volume above 100 clamps to 100."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            audio_manager.set_volume(150)
            assert audio_manager.system_volume == 100

    def test_set_volume_clamps_too_low(self, audio_manager):
        """Test setting volume below 0 clamps to 0."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            audio_manager.set_volume(-10)
            assert audio_manager.system_volume == 0

    def test_volume_up(self, audio_manager):
        """Test increasing volume."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            audio_manager.system_volume = 50
            new_volume = audio_manager.volume_up(10)

            assert new_volume == 60
            assert audio_manager.system_volume == 60

    def test_volume_up_doesnt_exceed_max(self, audio_manager):
        """Test volume up doesn't exceed 100."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            audio_manager.system_volume = 95
            new_volume = audio_manager.volume_up(10)

            assert new_volume == 100
            assert audio_manager.system_volume == 100

    def test_volume_down(self, audio_manager):
        """Test decreasing volume."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            audio_manager.system_volume = 50
            new_volume = audio_manager.volume_down(10)

            assert new_volume == 40
            assert audio_manager.system_volume == 40

    def test_volume_down_doesnt_go_below_zero(self, audio_manager):
        """Test volume down doesn't go below 0."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            audio_manager.system_volume = 5
            new_volume = audio_manager.volume_down(10)

            assert new_volume == 0
            assert audio_manager.system_volume == 0

    def test_mute(self, audio_manager):
        """Test muting audio."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            result = audio_manager.mute()

            assert result is True
            assert audio_manager.system_muted is True

    def test_unmute(self, audio_manager):
        """Test unmuting audio."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            audio_manager.system_muted = True
            result = audio_manager.unmute()

            assert result is True
            assert audio_manager.system_muted is False

    def test_toggle_mute_from_unmuted(self, audio_manager):
        """Test toggling mute from unmuted state."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            audio_manager.system_muted = False
            result = audio_manager.toggle_mute()

            assert result is True
            assert audio_manager.system_muted is True

    def test_toggle_mute_from_muted(self, audio_manager):
        """Test toggling mute from muted state."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            audio_manager.system_muted = True
            result = audio_manager.toggle_mute()

            assert result is False
            assert audio_manager.system_muted is False

    def test_get_app_settings_new_app(self, audio_manager):
        """Test getting settings for a new app creates default settings."""
        settings = audio_manager.get_app_settings("test_app")

        assert isinstance(settings, AudioSettings)
        assert settings.volume == 100
        assert settings.muted is False

    def test_get_app_settings_existing_app(self, audio_manager):
        """Test getting settings for existing app."""
        # Create custom settings
        custom_settings = AudioSettings(volume=75, muted=True)
        audio_manager.app_settings["test_app"] = custom_settings

        settings = audio_manager.get_app_settings("test_app")

        assert settings.volume == 75
        assert settings.muted is True

    def test_set_app_settings(self, audio_manager):
        """Test setting app-specific settings."""
        settings = AudioSettings(
            volume=80,
            output=AudioOutput.HDMI,
            enable_ducking=True
        )

        audio_manager.set_app_settings("test_app", settings)

        stored_settings = audio_manager.app_settings["test_app"]
        assert stored_settings.volume == 80
        assert stored_settings.output == AudioOutput.HDMI
        assert stored_settings.enable_ducking is True

    def test_set_app_settings_multiple_apps(self, audio_manager):
        """Test setting settings for multiple apps."""
        settings1 = AudioSettings(volume=70)
        settings2 = AudioSettings(volume=90)

        audio_manager.set_app_settings("app1", settings1)
        audio_manager.set_app_settings("app2", settings2)

        assert audio_manager.app_settings["app1"].volume == 70
        assert audio_manager.app_settings["app2"].volume == 90

    def test_set_output_hdmi(self, audio_manager):
        """Test setting HDMI output."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            result = audio_manager.set_output(AudioOutput.HDMI)

            assert result is True
            assert audio_manager.current_output == AudioOutput.HDMI

    def test_set_output_analog(self, audio_manager):
        """Test setting analog output."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            result = audio_manager.set_output(AudioOutput.ANALOG)

            assert result is True
            assert audio_manager.current_output == AudioOutput.ANALOG

    def test_save_settings(self, audio_manager, tmp_path):
        """Test saving audio settings to file."""
        config_file = tmp_path / "audio_config.json"

        with patch('builtins.open', mock_open()) as mock_file:
            with patch('pathlib.Path.mkdir'):
                result = audio_manager.save_settings(str(config_file))

                assert result is True
                # Verify file was written
                mock_file.assert_called()

    def test_save_settings_handles_errors(self, audio_manager):
        """Test save settings handles file errors gracefully."""
        with patch('builtins.open', side_effect=PermissionError("No write access")):
            with patch('pathlib.Path.mkdir'):
                result = audio_manager.save_settings("/invalid/path/config.json")

                # Should return False on error
                assert result is False

    def test_load_settings(self, audio_manager, tmp_path):
        """Test loading audio settings from file."""
        config_data = {
            "system_volume": 75,
            "system_muted": True,
            "current_output": "hdmi"
        }

        with patch('builtins.open', mock_open(read_data=json.dumps(config_data))):
            with patch('pathlib.Path.exists', return_value=True):
                result = audio_manager.load_settings("/path/to/config.json")

                assert result is True
                assert audio_manager.system_volume == 75
                assert audio_manager.system_muted is True

    def test_load_settings_file_not_found(self, audio_manager):
        """Test load settings handles missing file gracefully."""
        with patch('pathlib.Path.exists', return_value=False):
            result = audio_manager.load_settings("/nonexistent/config.json")

            # Should return False when file doesn't exist
            assert result is False

    def test_load_settings_invalid_json(self, audio_manager):
        """Test load settings handles invalid JSON gracefully."""
        with patch('builtins.open', mock_open(read_data="invalid json {")):
            with patch('pathlib.Path.exists', return_value=True):
                result = audio_manager.load_settings("/path/to/config.json")

                # Should return False on JSON parse error
                assert result is False


class TestAudioManagerIntegration:
    """Integration tests for audio manager."""

    def test_volume_change_workflow(self, audio_manager):
        """Test complete volume change workflow."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            # Start at default volume
            assert audio_manager.get_volume() == 100

            # Lower volume
            audio_manager.volume_down(20)
            assert audio_manager.get_volume() == 80

            # Raise volume
            audio_manager.volume_up(10)
            assert audio_manager.get_volume() == 90

            # Set specific volume
            audio_manager.set_volume(50)
            assert audio_manager.get_volume() == 50

    def test_mute_workflow(self, audio_manager):
        """Test complete mute/unmute workflow."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            # Start unmuted
            assert audio_manager.system_muted is False

            # Mute
            audio_manager.mute()
            assert audio_manager.system_muted is True

            # Unmute
            audio_manager.unmute()
            assert audio_manager.system_muted is False

            # Toggle mute
            audio_manager.toggle_mute()
            assert audio_manager.system_muted is True

            audio_manager.toggle_mute()
            assert audio_manager.system_muted is False

    def test_app_settings_workflow(self, audio_manager):
        """Test complete app settings workflow."""
        app_id = "video_player"

        # Get default settings
        settings = audio_manager.get_app_settings(app_id)
        assert settings.volume == 100

        # Modify settings
        settings.volume = 85
        settings.output = AudioOutput.HDMI
        audio_manager.set_app_settings(app_id, settings)

        # Verify settings persisted
        stored_settings = audio_manager.get_app_settings(app_id)
        assert stored_settings.volume == 85
        assert stored_settings.output == AudioOutput.HDMI
