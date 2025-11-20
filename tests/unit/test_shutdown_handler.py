"""Tests for shutdown handler."""

import asyncio
import pytest
import signal
from unittest.mock import MagicMock, patch, AsyncMock

from system.shutdown_handler import ShutdownHandler, WatchdogNotifier, shutdown_handler


class TestShutdownHandler:
    """Test ShutdownHandler class."""

    def test_initialization(self):
        """Test shutdown handler initialization."""
        handler = ShutdownHandler()

        assert handler.shutdown_callbacks == []
        assert handler.is_shutting_down is False
        assert handler._shutdown_event is not None

    def test_register_callback(self):
        """Test registering shutdown callbacks."""
        handler = ShutdownHandler()

        def callback1():
            pass

        async def callback2():
            pass

        handler.register_callback(callback1)
        handler.register_callback(callback2)

        assert len(handler.shutdown_callbacks) == 2
        assert callback1 in handler.shutdown_callbacks
        assert callback2 in handler.shutdown_callbacks

    def test_register_multiple_callbacks(self):
        """Test registering multiple callbacks."""
        handler = ShutdownHandler()

        callbacks = [lambda: None for _ in range(5)]
        for cb in callbacks:
            handler.register_callback(cb)

        assert len(handler.shutdown_callbacks) == 5

    def test_is_shutdown_requested_initially_false(self):
        """Test is_shutdown_requested is initially false."""
        handler = ShutdownHandler()
        assert handler.is_shutdown_requested() is False

    def test_is_shutdown_requested_after_shutdown(self):
        """Test is_shutdown_requested after setting shutdown flag."""
        handler = ShutdownHandler()
        handler.is_shutting_down = True
        assert handler.is_shutdown_requested() is True

    def test_setup_signal_handlers(self):
        """Test setting up signal handlers."""
        handler = ShutdownHandler()

        with patch('signal.signal') as mock_signal:
            handler.setup_signal_handlers()

            # Should register handlers for SIGTERM, SIGINT, SIGHUP
            assert mock_signal.call_count == 3

            calls = mock_signal.call_args_list
            signals_registered = [call[0][0] for call in calls]

            assert signal.SIGTERM in signals_registered
            assert signal.SIGINT in signals_registered
            assert signal.SIGHUP in signals_registered

    def test_signal_handler_sets_shutdown_flag(self):
        """Test signal handler sets shutdown flag."""
        handler = ShutdownHandler()

        # Simulate receiving SIGTERM
        handler._signal_handler(signal.SIGTERM, None)

        assert handler.is_shutting_down is True
        assert handler._shutdown_event.is_set()

    def test_signal_handler_multiple_signals(self):
        """Test signal handler only processes first signal."""
        handler = ShutdownHandler()

        # First signal should set the flag
        handler._signal_handler(signal.SIGTERM, None)
        assert handler.is_shutting_down is True

        # Reset event to test it doesn't get set again
        handler._shutdown_event.clear()

        # Second signal should be ignored since already shutting down
        handler._signal_handler(signal.SIGINT, None)
        # Event should still be clear (not set again)
        assert handler._shutdown_event.is_set() is False

    @pytest.mark.asyncio
    async def test_wait_for_shutdown(self):
        """Test waiting for shutdown signal."""
        handler = ShutdownHandler()

        # Set the event after a short delay
        async def set_event():
            await asyncio.sleep(0.1)
            handler._shutdown_event.set()

        # Start both tasks
        asyncio.create_task(set_event())

        # This should wait until the event is set
        await asyncio.wait_for(handler.wait_for_shutdown(), timeout=1.0)

        assert handler._shutdown_event.is_set()

    @pytest.mark.asyncio
    async def test_shutdown_executes_sync_callbacks(self):
        """Test shutdown executes synchronous callbacks."""
        handler = ShutdownHandler()

        callback_executed = []

        def sync_callback():
            callback_executed.append('sync')

        handler.register_callback(sync_callback)
        await handler.shutdown()

        assert 'sync' in callback_executed
        assert handler.is_shutting_down is True

    @pytest.mark.asyncio
    async def test_shutdown_executes_async_callbacks(self):
        """Test shutdown executes async callbacks."""
        handler = ShutdownHandler()

        callback_executed = []

        async def async_callback():
            callback_executed.append('async')

        handler.register_callback(async_callback)
        await handler.shutdown()

        assert 'async' in callback_executed
        assert handler.is_shutting_down is True

    @pytest.mark.asyncio
    async def test_shutdown_executes_multiple_callbacks(self):
        """Test shutdown executes multiple callbacks in order."""
        handler = ShutdownHandler()

        execution_order = []

        def callback1():
            execution_order.append(1)

        async def callback2():
            execution_order.append(2)

        def callback3():
            execution_order.append(3)

        handler.register_callback(callback1)
        handler.register_callback(callback2)
        handler.register_callback(callback3)

        await handler.shutdown()

        assert execution_order == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_shutdown_handles_callback_errors(self):
        """Test shutdown handles errors in callbacks gracefully."""
        handler = ShutdownHandler()

        execution_order = []

        def failing_callback():
            execution_order.append('before_error')
            raise Exception("Test error")

        def successful_callback():
            execution_order.append('after_error')

        handler.register_callback(failing_callback)
        handler.register_callback(successful_callback)

        # Should not raise, should continue to next callback
        await handler.shutdown()

        assert 'before_error' in execution_order
        assert 'after_error' in execution_order

    @pytest.mark.asyncio
    async def test_shutdown_already_in_progress(self):
        """Test shutdown returns early if already in progress."""
        handler = ShutdownHandler()

        callback_count = []

        def callback():
            callback_count.append(1)

        handler.register_callback(callback)

        # First shutdown
        await handler.shutdown()
        assert len(callback_count) == 1

        # Second shutdown should return early
        await handler.shutdown()
        # Callback should still only have been called once
        assert len(callback_count) == 1


class TestWatchdogNotifier:
    """Test WatchdogNotifier class."""

    def test_initialization(self):
        """Test watchdog notifier initialization."""
        notifier = WatchdogNotifier(interval_seconds=30)

        assert notifier.interval == 30
        assert notifier.task is None
        assert notifier.running is False

    def test_initialization_default_interval(self):
        """Test watchdog notifier uses default interval."""
        notifier = WatchdogNotifier()
        assert notifier.interval == 15

    @pytest.mark.asyncio
    async def test_start(self):
        """Test starting watchdog notifier."""
        notifier = WatchdogNotifier(interval_seconds=1)

        await notifier.start()

        assert notifier.running is True
        assert notifier.task is not None

        # Clean up
        await notifier.stop()

    @pytest.mark.asyncio
    async def test_stop(self):
        """Test stopping watchdog notifier."""
        notifier = WatchdogNotifier(interval_seconds=1)

        await notifier.start()
        await notifier.stop()

        assert notifier.running is False

    @pytest.mark.asyncio
    async def test_stop_without_start(self):
        """Test stopping watchdog notifier that wasn't started."""
        notifier = WatchdogNotifier()

        # Should not raise
        await notifier.stop()

        assert notifier.running is False

    @pytest.mark.asyncio
    async def test_notify_loop_with_notify_socket(self):
        """Test notify loop sends watchdog notification when NOTIFY_SOCKET is set."""
        notifier = WatchdogNotifier(interval_seconds=0.1)

        with patch.dict('os.environ', {'NOTIFY_SOCKET': '/tmp/test.sock'}):
            with patch('socket.socket') as mock_socket_class:
                mock_sock = MagicMock()
                mock_socket_class.return_value = mock_sock

                await notifier.start()

                # Wait for at least one notification
                await asyncio.sleep(0.2)

                await notifier.stop()

                # Should have sent at least one watchdog notification
                assert mock_sock.sendto.called
                # Check the message sent
                call_args = mock_sock.sendto.call_args_list
                assert any(args[0][0] == b'WATCHDOG=1' for args in call_args)

    @pytest.mark.asyncio
    async def test_notify_loop_without_notify_socket(self):
        """Test notify loop skips notification when NOTIFY_SOCKET is not set."""
        notifier = WatchdogNotifier(interval_seconds=0.1)

        # Ensure NOTIFY_SOCKET is not set
        with patch.dict('os.environ', {}, clear=True):
            await notifier.start()

            # Wait for at least one iteration
            await asyncio.sleep(0.2)

            await notifier.stop()

            # Should complete without errors
            assert notifier.running is False

    @pytest.mark.asyncio
    async def test_notify_loop_handles_errors(self):
        """Test notify loop continues despite errors."""
        notifier = WatchdogNotifier(interval_seconds=0.1)

        with patch.dict('os.environ', {'NOTIFY_SOCKET': '/tmp/test.sock'}):
            with patch('socket.socket') as mock_socket_class:
                # Make socket.sendto raise an error
                mock_sock = MagicMock()
                mock_sock.sendto.side_effect = Exception("Socket error")
                mock_socket_class.return_value = mock_sock

                await notifier.start()

                # Wait for multiple iterations
                await asyncio.sleep(0.3)

                await notifier.stop()

                # Should have tried multiple times despite errors
                assert mock_sock.sendto.call_count >= 2


class TestGlobalShutdownHandler:
    """Test global shutdown handler instance."""

    def test_global_instance_exists(self):
        """Test global shutdown_handler instance exists."""
        assert shutdown_handler is not None
        assert isinstance(shutdown_handler, ShutdownHandler)

    def test_global_instance_is_initialized(self):
        """Test global instance is properly initialized."""
        # Create a fresh instance to check initialization
        assert hasattr(shutdown_handler, 'shutdown_callbacks')
        assert hasattr(shutdown_handler, 'is_shutting_down')
        assert hasattr(shutdown_handler, '_shutdown_event')
