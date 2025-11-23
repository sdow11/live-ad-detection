package com.liveaddetection.presentation

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import androidx.lifecycle.Observer
import com.google.common.truth.Truth.assertThat
import com.liveaddetection.domain.tv.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.*

/**
 * TvControlViewModel Tests - TDD Red Phase
 */
@ExperimentalCoroutinesApi
class TvControlViewModelTest {

    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()

    private lateinit var viewModel: ITvControlViewModel
    private lateinit var mockTvController: ITvController

    private val mockDevice = TvDevice(
        id = "tv-001",
        name = "Samsung TV",
        type = ConnectionType.NETWORK,
        address = "192.168.1.100",
        manufacturer = "Samsung",
        model = "QN90A"
    )

    @Before
    fun setUp() {
        mockTvController = mock()

        viewModel = TvControlViewModel(
            tvController = mockTvController
        )
    }

    // ========== Initial State Tests ==========

    @Test
    fun `initial state is disconnected`() {
        val state = viewModel.getTvControlState().value

        assertThat(state).isNotNull()
        assertThat(state?.connectionState?.status).isEqualTo(ConnectionStatus.DISCONNECTED)
    }

    @Test
    fun `initial available devices list is empty`() {
        val state = viewModel.getTvControlState().value

        assertThat(state?.availableDevices).isEmpty()
    }

    @Test
    fun `initial discovering state is false`() {
        val state = viewModel.getTvControlState().value

        assertThat(state?.isDiscovering).isFalse()
    }

    // ========== Discovery Tests ==========

    @Test
    fun `startDiscovery calls controller discoverDevices`() = runTest {
        whenever(mockTvController.discoverDevices()).thenReturn(emptyList())

        viewModel.startDiscovery()

        verify(mockTvController).discoverDevices()
    }

    @Test
    fun `startDiscovery updates isDiscovering to true`() = runTest {
        val observer = mock<Observer<TvControlState>>()
        viewModel.getTvControlState().observeForever(observer)

        whenever(mockTvController.discoverDevices()).thenReturn(emptyList())

        viewModel.startDiscovery()

        verify(observer, atLeastOnce()).onChanged(
            argThat { isDiscovering }
        )
    }

    @Test
    fun `startDiscovery populates available devices`() = runTest {
        val devices = listOf(mockDevice)
        whenever(mockTvController.discoverDevices()).thenReturn(devices)

        viewModel.startDiscovery()

        val state = viewModel.getTvControlState().value
        assertThat(state?.availableDevices).hasSize(1)
        assertThat(state?.availableDevices?.first()?.name).isEqualTo("Samsung TV")
    }

    @Test
    fun `startDiscovery sets isDiscovering to false when complete`() = runTest {
        whenever(mockTvController.discoverDevices()).thenReturn(emptyList())

        viewModel.startDiscovery()

        // After discovery completes
        val state = viewModel.getTvControlState().value
        assertThat(state?.isDiscovering).isFalse()
    }

    @Test
    fun `stopDiscovery stops ongoing discovery`() {
        viewModel.stopDiscovery()

        val state = viewModel.getTvControlState().value
        assertThat(state?.isDiscovering).isFalse()
    }

    // ========== Connection Tests ==========

    @Test
    fun `connectToDevice calls controller connectToDevice`() = runTest {
        whenever(mockTvController.connectToDevice(mockDevice)).thenReturn(true)

        viewModel.connectToDevice(mockDevice)

        verify(mockTvController).connectToDevice(mockDevice)
    }

    @Test
    fun `connectToDevice returns true on success`() = runTest {
        whenever(mockTvController.connectToDevice(mockDevice)).thenReturn(true)

        val result = viewModel.connectToDevice(mockDevice)

        assertThat(result).isTrue()
    }

    @Test
    fun `connectToDevice updates connection state to connected`() = runTest {
        val connectedState = TvConnectionState(
            device = mockDevice,
            status = ConnectionStatus.CONNECTED,
            connectedAt = System.currentTimeMillis()
        )
        whenever(mockTvController.connectToDevice(mockDevice)).thenReturn(true)
        whenever(mockTvController.getConnectionState()).thenReturn(connectedState)

        viewModel.connectToDevice(mockDevice)

        val state = viewModel.getTvControlState().value
        assertThat(state?.connectionState?.status).isEqualTo(ConnectionStatus.CONNECTED)
    }

    @Test
    fun `connectToDevice returns false on failure`() = runTest {
        whenever(mockTvController.connectToDevice(mockDevice)).thenReturn(false)

        val result = viewModel.connectToDevice(mockDevice)

        assertThat(result).isFalse()
    }

    @Test
    fun `disconnect calls controller disconnect`() = runTest {
        whenever(mockTvController.disconnect()).thenReturn(true)

        viewModel.disconnect()

        verify(mockTvController).disconnect()
    }

    @Test
    fun `disconnect updates connection state to disconnected`() = runTest {
        val disconnectedState = TvConnectionState(
            device = null,
            status = ConnectionStatus.DISCONNECTED
        )
        whenever(mockTvController.disconnect()).thenReturn(true)
        whenever(mockTvController.getConnectionState()).thenReturn(disconnectedState)

        viewModel.disconnect()

        val state = viewModel.getTvControlState().value
        assertThat(state?.connectionState?.status).isEqualTo(ConnectionStatus.DISCONNECTED)
    }

    // ========== Control Command Tests ==========

    @Test
    fun `sendPowerToggle sends POWER_TOGGLE command`() = runTest {
        whenever(mockTvController.sendCommand(TvCommand.POWER_TOGGLE))
            .thenReturn(TvCommandResult(true, TvCommand.POWER_TOGGLE, 50))

        viewModel.sendPowerToggle()

        verify(mockTvController).sendCommand(TvCommand.POWER_TOGGLE)
    }

    @Test
    fun `sendPowerToggle returns true on success`() = runTest {
        whenever(mockTvController.sendCommand(TvCommand.POWER_TOGGLE))
            .thenReturn(TvCommandResult(true, TvCommand.POWER_TOGGLE, 50))

        val result = viewModel.sendPowerToggle()

        assertThat(result).isTrue()
    }

    @Test
    fun `sendVolumeUp sends VOLUME_UP command`() = runTest {
        whenever(mockTvController.sendCommand(TvCommand.VOLUME_UP))
            .thenReturn(TvCommandResult(true, TvCommand.VOLUME_UP, 30))

        viewModel.sendVolumeUp()

        verify(mockTvController).sendCommand(TvCommand.VOLUME_UP)
    }

    @Test
    fun `sendVolumeDown sends VOLUME_DOWN command`() = runTest {
        whenever(mockTvController.sendCommand(TvCommand.VOLUME_DOWN))
            .thenReturn(TvCommandResult(true, TvCommand.VOLUME_DOWN, 30))

        viewModel.sendVolumeDown()

        verify(mockTvController).sendCommand(TvCommand.VOLUME_DOWN)
    }

    @Test
    fun `sendChannelUp sends CHANNEL_UP command`() = runTest {
        whenever(mockTvController.sendCommand(TvCommand.CHANNEL_UP))
            .thenReturn(TvCommandResult(true, TvCommand.CHANNEL_UP, 40))

        viewModel.sendChannelUp()

        verify(mockTvController).sendCommand(TvCommand.CHANNEL_UP)
    }

    @Test
    fun `sendChannelDown sends CHANNEL_DOWN command`() = runTest {
        whenever(mockTvController.sendCommand(TvCommand.CHANNEL_DOWN))
            .thenReturn(TvCommandResult(true, TvCommand.CHANNEL_DOWN, 40))

        viewModel.sendChannelDown()

        verify(mockTvController).sendCommand(TvCommand.CHANNEL_DOWN)
    }

    @Test
    fun `sendMute sends VOLUME_MUTE command`() = runTest {
        whenever(mockTvController.sendCommand(TvCommand.VOLUME_MUTE))
            .thenReturn(TvCommandResult(true, TvCommand.VOLUME_MUTE, 35))

        viewModel.sendMute()

        verify(mockTvController).sendCommand(TvCommand.VOLUME_MUTE)
    }

    @Test
    fun `commands return false when not connected`() = runTest {
        val disconnectedState = TvConnectionState(
            device = null,
            status = ConnectionStatus.DISCONNECTED
        )
        whenever(mockTvController.getConnectionState()).thenReturn(disconnectedState)
        whenever(mockTvController.sendCommand(any()))
            .thenReturn(TvCommandResult(false, TvCommand.POWER_TOGGLE, 0, "Not connected"))

        val result = viewModel.sendPowerToggle()

        assertThat(result).isFalse()
    }

    // ========== State Observation Tests ==========

    @Test
    fun `observing connection state receives updates`() = runTest {
        val observer = mock<Observer<TvControlState>>()
        viewModel.getTvControlState().observeForever(observer)

        // Connection state changes should trigger observer
        verify(observer, atLeastOnce()).onChanged(any())
    }

    // ========== Lifecycle Tests ==========

    @Test
    fun `onDestroy releases controller resources`() {
        viewModel.onDestroy()

        verify(mockTvController).release()
    }

    @Test
    fun `onDestroy stops discovery`() {
        viewModel.onDestroy()

        val state = viewModel.getTvControlState().value
        assertThat(state?.isDiscovering).isFalse()
    }
}
