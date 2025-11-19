"""Audio management system.

Handles audio routing, volume control, mixing, and per-app audio settings.
Supports multiple audio outputs: HDMI, analog, Bluetooth, USB.
"""

import asyncio
import logging
import subprocess
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class AudioOutput(str, Enum):
    """Audio output types."""

    HDMI = "hdmi"
    ANALOG = "analog"  # 3.5mm jack
    BLUETOOTH = "bluetooth"
    USB = "usb"
    AUTO = "auto"  # Automatic selection


class AudioDevice:
    """Represents an audio device."""

    def __init__(self, device_id: str, name: str, output_type: AudioOutput):
        """Initialize audio device.

        Args:
            device_id: System device ID
            name: Human-readable name
            output_type: Output type
        """
        self.device_id = device_id
        self.name = name
        self.output_type = output_type


@dataclass
class AudioSettings:
    """Audio settings for an app or system."""

    volume: int = 100  # 0-100
    muted: bool = False
    output: AudioOutput = AudioOutput.AUTO
    enable_ducking: bool = False  # Lower volume when alerts play
    ducking_level: int = 30  # Volume level when ducked (%)


class AudioManager:
    """Manages system audio."""

    def __init__(self):
        """Initialize audio manager."""
        self.system_volume = 100
        self.system_muted = False
        self.current_output = AudioOutput.AUTO
        self.app_settings: Dict[str, AudioSettings] = {}
        self.available_devices: List[AudioDevice] = []

        # Detect available audio devices
        self._detect_devices()

    def _detect_devices(self) -> None:
        """Detect available audio output devices."""
        try:
            # Check for HDMI audio
            result = subprocess.run(
                ["aplay", "-l"],
                capture_output=True,
                text=True,
                timeout=5
            )

            if "bcm2835 HDMI" in result.stdout:
                self.available_devices.append(AudioDevice(
                    device_id="hw:0,1",
                    name="HDMI Audio",
                    output_type=AudioOutput.HDMI
                ))

            if "bcm2835 Headphones" in result.stdout or "bcm2835 Analog" in result.stdout:
                self.available_devices.append(AudioDevice(
                    device_id="hw:0,0",
                    name="3.5mm Jack",
                    output_type=AudioOutput.ANALOG
                ))

            # Check for USB audio devices
            if "USB Audio" in result.stdout:
                self.available_devices.append(AudioDevice(
                    device_id="hw:1,0",
                    name="USB Audio",
                    output_type=AudioOutput.USB
                ))

            logger.info(f"Detected {len(self.available_devices)} audio devices")

        except Exception as e:
            logger.error(f"Failed to detect audio devices: {e}")

    def get_available_devices(self) -> List[AudioDevice]:
        """Get list of available audio devices.

        Returns:
            List of audio devices
        """
        return self.available_devices.copy()

    def set_output(self, output: AudioOutput) -> bool:
        """Set audio output.

        Args:
            output: Output type

        Returns:
            True if successful
        """
        try:
            # Use amixer to route audio
            if output == AudioOutput.HDMI:
                cmd = ["amixer", "cset", "numid=3", "2"]  # Force HDMI
            elif output == AudioOutput.ANALOG:
                cmd = ["amixer", "cset", "numid=3", "1"]  # Force 3.5mm
            elif output == AudioOutput.AUTO:
                cmd = ["amixer", "cset", "numid=3", "0"]  # Auto select
            else:
                logger.warning(f"Unsupported output type for routing: {output}")
                return False

            result = subprocess.run(cmd, capture_output=True, timeout=5)

            if result.returncode == 0:
                self.current_output = output
                logger.info(f"Audio output set to: {output}")
                return True
            else:
                logger.error(f"Failed to set audio output: {result.stderr}")
                return False

        except Exception as e:
            logger.error(f"Error setting audio output: {e}")
            return False

    def get_volume(self) -> int:
        """Get current system volume.

        Returns:
            Volume level (0-100)
        """
        try:
            result = subprocess.run(
                ["amixer", "get", "PCM"],
                capture_output=True,
                text=True,
                timeout=5
            )

            # Parse output like: [78%]
            import re
            match = re.search(r'\[(\d+)%\]', result.stdout)
            if match:
                self.system_volume = int(match.group(1))
                return self.system_volume

        except Exception as e:
            logger.error(f"Failed to get volume: {e}")

        return self.system_volume

    def set_volume(self, volume: int) -> bool:
        """Set system volume.

        Args:
            volume: Volume level (0-100)

        Returns:
            True if successful
        """
        try:
            volume = max(0, min(100, volume))  # Clamp to 0-100

            result = subprocess.run(
                ["amixer", "set", "PCM", f"{volume}%"],
                capture_output=True,
                timeout=5
            )

            if result.returncode == 0:
                self.system_volume = volume
                logger.info(f"Volume set to: {volume}%")
                return True
            else:
                logger.error(f"Failed to set volume: {result.stderr}")
                return False

        except Exception as e:
            logger.error(f"Error setting volume: {e}")
            return False

    def volume_up(self, step: int = 5) -> int:
        """Increase volume.

        Args:
            step: Volume step

        Returns:
            New volume level
        """
        new_volume = min(100, self.system_volume + step)
        self.set_volume(new_volume)
        return new_volume

    def volume_down(self, step: int = 5) -> int:
        """Decrease volume.

        Args:
            step: Volume step

        Returns:
            New volume level
        """
        new_volume = max(0, self.system_volume - step)
        self.set_volume(new_volume)
        return new_volume

    def mute(self) -> bool:
        """Mute audio.

        Returns:
            True if successful
        """
        try:
            result = subprocess.run(
                ["amixer", "set", "PCM", "mute"],
                capture_output=True,
                timeout=5
            )

            if result.returncode == 0:
                self.system_muted = True
                logger.info("Audio muted")
                return True
            else:
                return False

        except Exception as e:
            logger.error(f"Error muting audio: {e}")
            return False

    def unmute(self) -> bool:
        """Unmute audio.

        Returns:
            True if successful
        """
        try:
            result = subprocess.run(
                ["amixer", "set", "PCM", "unmute"],
                capture_output=True,
                timeout=5
            )

            if result.returncode == 0:
                self.system_muted = False
                logger.info("Audio unmuted")
                return True
            else:
                return False

        except Exception as e:
            logger.error(f"Error unmuting audio: {e}")
            return False

    def toggle_mute(self) -> bool:
        """Toggle mute state.

        Returns:
            New mute state (True = muted)
        """
        if self.system_muted:
            self.unmute()
        else:
            self.mute()
        return self.system_muted

    def get_app_settings(self, app_id: str) -> AudioSettings:
        """Get audio settings for an app.

        Args:
            app_id: App identifier

        Returns:
            Audio settings for the app
        """
        if app_id not in self.app_settings:
            self.app_settings[app_id] = AudioSettings()

        return self.app_settings[app_id]

    def set_app_settings(self, app_id: str, settings: AudioSettings) -> None:
        """Set audio settings for an app.

        Args:
            app_id: App identifier
            settings: Audio settings
        """
        self.app_settings[app_id] = settings
        logger.info(f"Audio settings updated for app: {app_id}")

    def apply_app_settings(self, app_id: str) -> bool:
        """Apply audio settings for an app.

        Args:
            app_id: App identifier

        Returns:
            True if successful
        """
        settings = self.get_app_settings(app_id)

        success = True

        # Set volume
        if not settings.muted:
            success &= self.set_volume(settings.volume)
        else:
            success &= self.mute()

        # Set output
        if settings.output != AudioOutput.AUTO:
            success &= self.set_output(settings.output)

        logger.info(f"Applied audio settings for app: {app_id}")
        return success

    async def play_sound(self, sound_file: str, volume: Optional[int] = None) -> bool:
        """Play a sound file.

        Args:
            sound_file: Path to sound file
            volume: Optional volume override

        Returns:
            True if successful
        """
        try:
            # Use aplay for simple playback
            cmd = ["aplay"]

            if volume is not None:
                # TODO: Per-file volume control would require mixing
                pass

            cmd.append(sound_file)

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL
            )

            await process.wait()

            return process.returncode == 0

        except Exception as e:
            logger.error(f"Failed to play sound: {e}")
            return False

    def save_settings(self, config_file: str = "/var/lib/ad-detection/audio_config.json") -> bool:
        """Save audio settings to file.

        Args:
            config_file: Path to config file

        Returns:
            True if successful
        """
        try:
            import json
            from pathlib import Path

            config = {
                "system_volume": self.system_volume,
                "system_muted": self.system_muted,
                "current_output": self.current_output.value,
                "app_settings": {
                    app_id: {
                        "volume": settings.volume,
                        "muted": settings.muted,
                        "output": settings.output.value,
                        "enable_ducking": settings.enable_ducking,
                        "ducking_level": settings.ducking_level
                    }
                    for app_id, settings in self.app_settings.items()
                }
            }

            Path(config_file).parent.mkdir(parents=True, exist_ok=True)
            with open(config_file, 'w') as f:
                json.dump(config, f, indent=2)

            logger.info("Audio settings saved")
            return True

        except Exception as e:
            logger.error(f"Failed to save audio settings: {e}")
            return False

    def load_settings(self, config_file: str = "/var/lib/ad-detection/audio_config.json") -> bool:
        """Load audio settings from file.

        Args:
            config_file: Path to config file

        Returns:
            True if successful
        """
        try:
            import json
            from pathlib import Path

            if not Path(config_file).exists():
                logger.info("No audio config file found, using defaults")
                return False

            with open(config_file) as f:
                config = json.load(f)

            self.system_volume = config.get("system_volume", 100)
            self.system_muted = config.get("system_muted", False)
            self.current_output = AudioOutput(config.get("current_output", "auto"))

            # Load app settings
            app_settings_data = config.get("app_settings", {})
            for app_id, settings_data in app_settings_data.items():
                self.app_settings[app_id] = AudioSettings(
                    volume=settings_data.get("volume", 100),
                    muted=settings_data.get("muted", False),
                    output=AudioOutput(settings_data.get("output", "auto")),
                    enable_ducking=settings_data.get("enable_ducking", False),
                    ducking_level=settings_data.get("ducking_level", 30)
                )

            logger.info("Audio settings loaded")

            # Apply loaded settings
            self.set_volume(self.system_volume)
            if self.system_muted:
                self.mute()
            self.set_output(self.current_output)

            return True

        except Exception as e:
            logger.error(f"Failed to load audio settings: {e}")
            return False


# Global audio manager instance
audio_manager = AudioManager()
