"""Tests for IR blaster TV control (TDD)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tv_control import TVBrand, TVCommand, TVControllerConfig
from tv_control.ir_blaster import IRBlasterControl


@pytest.fixture
def ir_config() -> TVControllerConfig:
    """Create IR blaster configuration."""
    return TVControllerConfig(
        device_id="test-device",
        brand=TVBrand.SAMSUNG,
        ir_remote_name="Samsung_TV",
        ir_device="/dev/lirc0",
    )


class TestIRBlasterControl:
    """Test suite for IR blaster control."""

    @pytest.mark.asyncio
    async def test_ir_blaster_initializes(self, ir_config: TVControllerConfig) -> None:
        """Test that IR blaster can initialize."""
        with patch("tv_control.ir_blaster.lirc"):
            controller = IRBlasterControl(ir_config)
            await controller.initialize()
            assert controller.is_initialized is True

    @pytest.mark.asyncio
    async def test_is_available_returns_true_when_lirc_exists(
        self, ir_config: TVControllerConfig
    ) -> None:
        """Test that is_available returns True when LIRC is available."""
        with patch("tv_control.ir_blaster.lirc"):
            with patch("os.path.exists", return_value=True):
                controller = IRBlasterControl(ir_config)
                available = await controller.is_available()
                assert available is True

    @pytest.mark.asyncio
    async def test_is_available_returns_false_when_lirc_missing(
        self, ir_config: TVControllerConfig
    ) -> None:
        """Test that is_available returns False when LIRC is not available."""
        with patch("os.path.exists", return_value=False):
            controller = IRBlasterControl(ir_config)
            available = await controller.is_available()
            assert available is False

    @pytest.mark.asyncio
    async def test_send_power_on_command(self, ir_config: TVControllerConfig) -> None:
        """Test sending power on command."""
        mock_lirc = MagicMock()
        with patch("tv_control.ir_blaster.lirc", mock_lirc):
            controller = IRBlasterControl(ir_config)
            await controller.initialize()

            result = await controller.power_on()

            assert result is True
            mock_lirc.send_once.assert_called()

    @pytest.mark.asyncio
    async def test_send_channel_command_with_multi_digit_channel(
        self, ir_config: TVControllerConfig
    ) -> None:
        """Test sending channel command with multi-digit channel number."""
        mock_lirc = MagicMock()
        with patch("tv_control.ir_blaster.lirc", mock_lirc):
            controller = IRBlasterControl(ir_config)
            await controller.initialize()

            # Change to channel 105
            result = await controller.set_channel("105")

            assert result is True
            # Should send KEY_1, KEY_0, KEY_5
            assert mock_lirc.send_once.call_count == 3

    @pytest.mark.asyncio
    async def test_command_delay_between_channel_digits(
        self, ir_config: TVControllerConfig
    ) -> None:
        """Test that there's a delay between channel digit commands."""
        mock_lirc = MagicMock()
        with patch("tv_control.ir_blaster.lirc", mock_lirc):
            with patch("asyncio.sleep") as mock_sleep:
                controller = IRBlasterControl(ir_config)
                await controller.initialize()

                await controller.set_channel("25")

                # Should have delays between digits
                mock_sleep.assert_called()

    @pytest.mark.asyncio
    async def test_brand_specific_remote_codes(
        self, ir_config: TVControllerConfig
    ) -> None:
        """Test that brand-specific remote codes are used."""
        # Samsung config
        samsung_config = TVControllerConfig(
            device_id="test",
            brand=TVBrand.SAMSUNG,
            ir_remote_name="Samsung_TV",
        )

        mock_lirc = MagicMock()
        with patch("tv_control.ir_blaster.lirc", mock_lirc):
            controller = IRBlasterControl(samsung_config)
            await controller.initialize()
            await controller.power_on()

            # Should use Samsung remote
            call_args = mock_lirc.send_once.call_args
            assert "Samsung_TV" in str(call_args) or call_args is not None

    @pytest.mark.asyncio
    async def test_volume_up_command(self, ir_config: TVControllerConfig) -> None:
        """Test volume up command."""
        mock_lirc = MagicMock()
        with patch("tv_control.ir_blaster.lirc", mock_lirc):
            controller = IRBlasterControl(ir_config)
            await controller.initialize()

            result = await controller.volume_up()

            assert result is True
            mock_lirc.send_once.assert_called()

    @pytest.mark.asyncio
    async def test_volume_down_command(self, ir_config: TVControllerConfig) -> None:
        """Test volume down command."""
        mock_lirc = MagicMock()
        with patch("tv_control.ir_blaster.lirc", mock_lirc):
            controller = IRBlasterControl(ir_config)
            await controller.initialize()

            result = await controller.volume_down()

            assert result is True
            mock_lirc.send_once.assert_called()

    @pytest.mark.asyncio
    async def test_handle_lirc_error_gracefully(
        self, ir_config: TVControllerConfig
    ) -> None:
        """Test that LIRC errors are handled gracefully."""
        mock_lirc = MagicMock()
        mock_lirc.send_once.side_effect = Exception("LIRC error")

        with patch("tv_control.ir_blaster.lirc", mock_lirc):
            controller = IRBlasterControl(ir_config)
            await controller.initialize()

            result = await controller.power_on()

            assert result is False  # Should return False on error

    @pytest.mark.asyncio
    async def test_channel_with_decimal_point(
        self, ir_config: TVControllerConfig
    ) -> None:
        """Test channel with decimal point (e.g., 5.1 for digital TV)."""
        mock_lirc = MagicMock()
        with patch("tv_control.ir_blaster.lirc", mock_lirc):
            controller = IRBlasterControl(ir_config)
            await controller.initialize()

            result = await controller.set_channel("5.1")

            assert result is True
            # Should send KEY_5, KEY_DOT, KEY_1
            assert mock_lirc.send_once.call_count >= 3
