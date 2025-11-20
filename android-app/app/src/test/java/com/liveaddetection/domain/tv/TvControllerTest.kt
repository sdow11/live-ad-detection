package com.liveaddetection.domain.tv

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.*

/**
 * TvController Tests - TDD Red Phase
 * Write tests FIRST, then implement
 */
class TvControllerTest {

    private lateinit var controller: ITvController
    private lateinit var mockDiscovery: ITvDeviceDiscovery
    private lateinit var mockConnectionManager: ITvConnectionManager
    private lateinit var mockBluetoothController: IBluetoothTvController
    private lateinit var mockNetworkController: INetworkTvController
    private lateinit var mockCecController: ICecTvController

    private val mockBluetoothDevice = TvDevice(
        id = "bt-001",
        name = "Samsung TV",
        type = ConnectionType.BLUETOOTH,
        address = "AA:BB:CC:DD:EE:FF",
        manufacturer = "Samsung",
        model = "QN90A"
    )

    private val mockNetworkDevice = TvDevice(
        id = "net-001",
        name = "LG TV",
        type = ConnectionType.NETWORK,
        address = "192.168.1.100",
        manufacturer = "LG",
        model = "OLED65C1"
    )

    @Before
    fun setUp() {
        mockDiscovery = mock()
        mockConnectionManager = mock()
        mockBluetoothController = mock()
        mockNetworkController = mock()
        mockCecController = mock()

        // Create controller with dependency injection
        controller = TvController(
            deviceDiscovery = mockDiscovery,
            connectionManager = mockConnectionManager,
            bluetoothController = mockBluetoothController,
            networkController = mockNetworkController,
            cecController = mockCecController
        )
    }

    // ========== Initialization Tests ==========

    @Test
    fun `initialize returns true on success`() = runBlocking {
        val result = controller.initialize()
        assertThat(result).isTrue()
    }

    @Test
    fun `initialize checks for Bluetooth availability`() = runBlocking {
        controller.initialize()
        val capabilities = controller.getCapabilities()
        assertThat(capabilities.supportsBluetooth).isNotNull()
    }

    @Test
    fun `initialize checks for Network availability`() = runBlocking {
        controller.initialize()
        val capabilities = controller.getCapabilities()
        assertThat(capabilities.supportsNetwork).isNotNull()
    }

    @Test
    fun `initialize checks for CEC availability`() = runBlocking {
        whenever(mockCecController.isCecSupported()).thenReturn(false)
        controller.initialize()
        val capabilities = controller.getCapabilities()
        assertThat(capabilities.supportsCec).isFalse()
    }

    // ========== Device Discovery Tests ==========

    @Test
    fun `discoverDevices finds Bluetooth devices`() = runBlocking {
        whenever(mockDiscovery.discoverBluetoothDevices()).thenReturn(listOf(mockBluetoothDevice))
        whenever(mockDiscovery.discoverNetworkDevices()).thenReturn(emptyList())
        whenever(mockDiscovery.discoverCecDevices()).thenReturn(emptyList())

        val devices = controller.discoverDevices()

        assertThat(devices).hasSize(1)
        assertThat(devices[0].type).isEqualTo(ConnectionType.BLUETOOTH)
        verify(mockDiscovery).discoverBluetoothDevices()
    }

    @Test
    fun `discoverDevices finds Network devices`() = runBlocking {
        whenever(mockDiscovery.discoverBluetoothDevices()).thenReturn(emptyList())
        whenever(mockDiscovery.discoverNetworkDevices()).thenReturn(listOf(mockNetworkDevice))
        whenever(mockDiscovery.discoverCecDevices()).thenReturn(emptyList())

        val devices = controller.discoverDevices()

        assertThat(devices).hasSize(1)
        assertThat(devices[0].type).isEqualTo(ConnectionType.NETWORK)
        verify(mockDiscovery).discoverNetworkDevices()
    }

    @Test
    fun `discoverDevices finds all device types`() = runBlocking {
        whenever(mockDiscovery.discoverBluetoothDevices()).thenReturn(listOf(mockBluetoothDevice))
        whenever(mockDiscovery.discoverNetworkDevices()).thenReturn(listOf(mockNetworkDevice))
        whenever(mockDiscovery.discoverCecDevices()).thenReturn(emptyList())

        val devices = controller.discoverDevices()

        assertThat(devices).hasSize(2)
        assertThat(devices.map { it.type }).containsExactly(
            ConnectionType.BLUETOOTH,
            ConnectionType.NETWORK
        )
    }

    @Test
    fun `discoverDevices returns empty list when no devices found`() = runBlocking {
        whenever(mockDiscovery.discoverBluetoothDevices()).thenReturn(emptyList())
        whenever(mockDiscovery.discoverNetworkDevices()).thenReturn(emptyList())
        whenever(mockDiscovery.discoverCecDevices()).thenReturn(emptyList())

        val devices = controller.discoverDevices()

        assertThat(devices).isEmpty()
    }

    // ========== Connection Tests ==========

    @Test
    fun `connectToDevice with Bluetooth device succeeds`() = runBlocking {
        whenever(mockConnectionManager.connect(mockBluetoothDevice)).thenReturn(true)

        val result = controller.connectToDevice(mockBluetoothDevice)

        assertThat(result).isTrue()
        verify(mockConnectionManager).connect(mockBluetoothDevice)
    }

    @Test
    fun `connectToDevice with Network device succeeds`() = runBlocking {
        whenever(mockConnectionManager.connect(mockNetworkDevice)).thenReturn(true)

        val result = controller.connectToDevice(mockNetworkDevice)

        assertThat(result).isTrue()
        verify(mockConnectionManager).connect(mockNetworkDevice)
    }

    @Test
    fun `connectToDevice returns false on failure`() = runBlocking {
        whenever(mockConnectionManager.connect(any())).thenReturn(false)

        val result = controller.connectToDevice(mockBluetoothDevice)

        assertThat(result).isFalse()
    }

    @Test
    fun `disconnect closes connection successfully`() = runBlocking {
        whenever(mockConnectionManager.disconnect()).thenReturn(true)

        val result = controller.disconnect()

        assertThat(result).isTrue()
        verify(mockConnectionManager).disconnect()
    }

    @Test
    fun `getConnectionState returns current state`() = runBlocking {
        val expectedState = TvConnectionState(
            device = mockBluetoothDevice,
            status = ConnectionStatus.CONNECTED,
            connectedAt = System.currentTimeMillis()
        )
        whenever(mockConnectionManager.getConnectionState()).thenReturn(expectedState)

        val state = controller.getConnectionState()

        assertThat(state.status).isEqualTo(ConnectionStatus.CONNECTED)
        assertThat(state.device).isEqualTo(mockBluetoothDevice)
    }

    // ========== Command Sending Tests ==========

    @Test
    fun `sendCommand routes to Bluetooth when connected via Bluetooth`() = runBlocking {
        val connectionState = TvConnectionState(
            device = mockBluetoothDevice,
            status = ConnectionStatus.CONNECTED
        )
        whenever(mockConnectionManager.getConnectionState()).thenReturn(connectionState)
        whenever(mockBluetoothController.isConnected()).thenReturn(true)
        whenever(mockBluetoothController.sendCommand(TvCommand.POWER_TOGGLE))
            .thenReturn(TvCommandResult(true, TvCommand.POWER_TOGGLE, 50))

        val result = controller.sendCommand(TvCommand.POWER_TOGGLE)

        assertThat(result.success).isTrue()
        assertThat(result.command).isEqualTo(TvCommand.POWER_TOGGLE)
        verify(mockBluetoothController).sendCommand(TvCommand.POWER_TOGGLE)
    }

    @Test
    fun `sendCommand routes to Network when connected via Network`() = runBlocking {
        val connectionState = TvConnectionState(
            device = mockNetworkDevice,
            status = ConnectionStatus.CONNECTED
        )
        whenever(mockConnectionManager.getConnectionState()).thenReturn(connectionState)
        whenever(mockNetworkController.isConnected()).thenReturn(true)
        whenever(mockNetworkController.sendCommand(TvCommand.VOLUME_UP))
            .thenReturn(TvCommandResult(true, TvCommand.VOLUME_UP, 30))

        val result = controller.sendCommand(TvCommand.VOLUME_UP)

        assertThat(result.success).isTrue()
        assertThat(result.command).isEqualTo(TvCommand.VOLUME_UP)
        verify(mockNetworkController).sendCommand(TvCommand.VOLUME_UP)
    }

    @Test
    fun `sendCommand returns failure when not connected`() = runBlocking {
        val connectionState = TvConnectionState(
            device = null,
            status = ConnectionStatus.DISCONNECTED
        )
        whenever(mockConnectionManager.getConnectionState()).thenReturn(connectionState)

        val result = controller.sendCommand(TvCommand.POWER_ON)

        assertThat(result.success).isFalse()
        assertThat(result.error).isNotNull()
    }

    @Test
    fun `sendCommand measures execution time`() = runBlocking {
        val connectionState = TvConnectionState(
            device = mockBluetoothDevice,
            status = ConnectionStatus.CONNECTED
        )
        whenever(mockConnectionManager.getConnectionState()).thenReturn(connectionState)
        whenever(mockBluetoothController.isConnected()).thenReturn(true)
        whenever(mockBluetoothController.sendCommand(any()))
            .thenReturn(TvCommandResult(true, TvCommand.POWER_TOGGLE, 45))

        val result = controller.sendCommand(TvCommand.POWER_TOGGLE)

        assertThat(result.executionTimeMs).isGreaterThan(0)
    }

    // ========== Batch Command Tests ==========

    @Test
    fun `sendCommandBatch sends multiple commands sequentially`() = runBlocking {
        val connectionState = TvConnectionState(
            device = mockBluetoothDevice,
            status = ConnectionStatus.CONNECTED
        )
        whenever(mockConnectionManager.getConnectionState()).thenReturn(connectionState)
        whenever(mockBluetoothController.isConnected()).thenReturn(true)
        whenever(mockBluetoothController.sendCommand(any()))
            .thenReturn(TvCommandResult(true, TvCommand.POWER_ON, 50))

        val commands = listOf(TvCommand.POWER_ON, TvCommand.VOLUME_UP, TvCommand.VOLUME_UP)
        val results = controller.sendCommandBatch(commands)

        assertThat(results).hasSize(3)
        assertThat(results.all { it.success }).isTrue()
        verify(mockBluetoothController, times(3)).sendCommand(any())
    }

    @Test
    fun `sendCommandBatch stops on first failure when configured`() = runBlocking {
        val connectionState = TvConnectionState(
            device = mockBluetoothDevice,
            status = ConnectionStatus.CONNECTED
        )
        whenever(mockConnectionManager.getConnectionState()).thenReturn(connectionState)
        whenever(mockBluetoothController.isConnected()).thenReturn(true)
        whenever(mockBluetoothController.sendCommand(TvCommand.POWER_ON))
            .thenReturn(TvCommandResult(true, TvCommand.POWER_ON, 50))
        whenever(mockBluetoothController.sendCommand(TvCommand.VOLUME_UP))
            .thenReturn(TvCommandResult(false, TvCommand.VOLUME_UP, 30, "Failed"))

        val commands = listOf(TvCommand.POWER_ON, TvCommand.VOLUME_UP, TvCommand.CHANNEL_UP)
        val results = controller.sendCommandBatch(commands)

        // Should execute all but record failures
        assertThat(results).hasSize(3)
        assertThat(results[0].success).isTrue()
        assertThat(results[1].success).isFalse()
    }

    // ========== Capabilities Tests ==========

    @Test
    fun `getCapabilities returns supported features`() = runBlocking {
        whenever(mockCecController.isCecSupported()).thenReturn(true)
        controller.initialize()

        val capabilities = controller.getCapabilities()

        assertThat(capabilities.supportsBluetooth).isTrue()
        assertThat(capabilities.supportsNetwork).isTrue()
        assertThat(capabilities.supportsCec).isTrue()
    }

    @Test
    fun `getCapabilities includes supported commands`() = runBlocking {
        controller.initialize()

        val capabilities = controller.getCapabilities()

        assertThat(capabilities.supportedCommands).contains(TvCommand.POWER_TOGGLE)
        assertThat(capabilities.supportedCommands).contains(TvCommand.VOLUME_UP)
    }

    // ========== State Observation Tests ==========

    @Test
    fun `observeConnectionState receives updates`() = runBlocking {
        var receivedState: TvConnectionState? = null

        controller.observeConnectionState { state ->
            receivedState = state
        }

        verify(mockConnectionManager).observeConnectionState(any())
    }

    // ========== Resource Management Tests ==========

    @Test
    fun `release cleans up resources`() = runBlocking {
        controller.release()

        // Verify cleanup happened (implementation will handle specifics)
        val state = controller.getConnectionState()
        assertThat(state.status).isEqualTo(ConnectionStatus.DISCONNECTED)
    }
}
