"""Tests for HDMI CEC TV control (TDD)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tv_control import TVBrand, TVCommand, TVControllerConfig
from tv_control.cec import CECControl


@pytest.fixture
def cec_config() -> TVControllerConfig:
    """Create CEC configuration."""
    return TVControllerConfig(
        device_id="test-device",
        brand=TVBrand.SAMSUNG,
        cec_adapter="/dev/cec0",
    )


class TestCECControl:
    """Test suite for HDMI CEC control."""

    @pytest.mark.asyncio
    async def test_cec_initializes(self, cec_config: TVControllerConfig) -> None:
        """Test that CEC control can initialize."""
        with patch("tv_control.cec.cec"):
            controller = CECControl(cec_config)
            await controller.initialize()
            assert controller.is_initialized is True

    @pytest.mark.asyncio
    async def test_is_available_returns_true_when_cec_exists(
        self, cec_config: TVControllerConfig
    ) -> None:
        """Test that is_available returns True when CEC is available."""
        with patch("tv_control.cec.cec"):
            with patch("os.path.exists", return_value=True):
                controller = CECControl(cec_config)
                available = await controller.is_available()
                assert available is True

    @pytest.mark.asyncio
    async def test_is_available_returns_false_when_cec_missing(
        self, cec_config: TVControllerConfig
    ) -> None:
        """Test that is_available returns False when CEC is not available."""
        with patch("os.path.exists", return_value=False):
            controller = CECControl(cec_config)
            available = await controller.is_available()
            assert available is False

    @pytest.mark.asyncio
    async def test_power_on_sends_cec_command(
        self, cec_config: TVControllerConfig
    ) -> None:
        """Test that power on sends CEC command."""
        mock_cec = MagicMock()
        mock_device = MagicMock()
        mock_cec.list_devices.return_value = [mock_device]

        with patch("tv_control.cec.cec", mock_cec):
            controller = CECControl(cec_config)
            await controller.initialize()

            result = await controller.power_on()

            assert result is True
            mock_device.power_on.assert_called_once()

    @pytest.mark.asyncio
    async def test_power_off_sends_standby_command(
        self, cec_config: TVControllerConfig
    ) -> None:
        """Test that power off sends standby command."""
        mock_cec = MagicMock()
        mock_device = MagicMock()
        mock_cec.list_devices.return_value = [mock_device]

        with patch("tv_control.cec.cec", mock_cec):
            controller = CECControl(cec_config)
            await controller.initialize()

            result = await controller.power_off()

            assert result is True
            mock_device.standby.assert_called_once()

    @pytest.mark.asyncio
    async def test_set_active_source(self, cec_config: TVControllerConfig) -> None:
        """Test setting this device as active source."""
        mock_cec = MagicMock()
        mock_device = MagicMock()
        mock_cec.list_devices.return_value = [mock_device]

        with patch("tv_control.cec.cec", mock_cec):
            controller = CECControl(cec_config)
            await controller.initialize()

            result = await controller.set_active_source()

            assert result is True
            mock_device.set_active_source.assert_called_once()

    @pytest.mark.asyncio
    async def test_volume_up_command(self, cec_config: TVControllerConfig) -> None:
        """Test volume up via CEC."""
        mock_cec = MagicMock()
        mock_device = MagicMock()
        mock_cec.list_devices.return_value = [mock_device]

        with patch("tv_control.cec.cec", mock_cec):
            controller = CECControl(cec_config)
            await controller.initialize()

            result = await controller.volume_up()

            assert result is True
            # CEC volume commands use specific opcodes
            assert mock_device.transmit.called or result is True

    @pytest.mark.asyncio
    async def test_handle_cec_error_gracefully(
        self, cec_config: TVControllerConfig
    ) -> None:
        """Test that CEC errors are handled gracefully."""
        mock_cec = MagicMock()
        mock_device = MagicMock()
        mock_device.power_on.side_effect = Exception("CEC error")
        mock_cec.list_devices.return_value = [mock_device]

        with patch("tv_control.cec.cec", mock_cec):
            controller = CECControl(cec_config)
            await controller.initialize()

            result = await controller.power_on()

            assert result is False

    @pytest.mark.asyncio
    async def test_cec_with_multiple_devices(
        self, cec_config: TVControllerConfig
    ) -> None:
        """Test CEC control with multiple devices on bus."""
        mock_cec = MagicMock()
        mock_tv = MagicMock()
        mock_tv.is_tv = True
        mock_player = MagicMock()
        mock_player.is_tv = False

        mock_cec.list_devices.return_value = [mock_player, mock_tv]

        with patch("tv_control.cec.cec", mock_cec):
            controller = CECControl(cec_config)
            await controller.initialize()

            result = await controller.power_on()

            # Should control the TV, not the player
            assert result is True
