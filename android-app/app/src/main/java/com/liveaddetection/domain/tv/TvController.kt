package com.liveaddetection.domain.tv

import android.bluetooth.BluetoothAdapter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * TV Controller Implementation
 * Single Responsibility: Orchestrate all TV control methods
 * Dependency Inversion: Depends on abstractions (interfaces), not concrete classes
 * Open/Closed: Extensible through dependency injection
 */
class TvController(
    private val deviceDiscovery: ITvDeviceDiscovery,
    private val connectionManager: ITvConnectionManager,
    private val bluetoothController: IBluetoothTvController,
    private val networkController: INetworkTvController,
    private val cecController: ICecTvController
) : ITvController {

    private var capabilities: TvCapabilities? = null

    override suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        try {
            // Determine capabilities
            val bluetoothAvailable = BluetoothAdapter.getDefaultAdapter() != null
            val networkAvailable = true // Always available on Android
            val cecAvailable = cecController.isCecSupported()

            capabilities = TvCapabilities(
                supportsBluetooth = bluetoothAvailable,
                supportsNetwork = networkAvailable,
                supportsCec = cecAvailable,
                supportedCommands = getAllSupportedCommands()
            )

            true
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun discoverDevices(): List<TvDevice> =
        withContext(Dispatchers.IO) {
            val allDevices = mutableListOf<TvDevice>()

            // Discover from all sources
            allDevices.addAll(deviceDiscovery.discoverBluetoothDevices())
            allDevices.addAll(deviceDiscovery.discoverNetworkDevices())
            allDevices.addAll(deviceDiscovery.discoverCecDevices())

            allDevices
        }

    override suspend fun connectToDevice(device: TvDevice): Boolean =
        withContext(Dispatchers.IO) {
            connectionManager.connect(device)
        }

    override suspend fun disconnect(): Boolean =
        withContext(Dispatchers.IO) {
            connectionManager.disconnect()
        }

    override suspend fun sendCommand(command: TvCommand): TvCommandResult =
        withContext(Dispatchers.IO) {
            val connectionState = connectionManager.getConnectionState()

            // Check if connected
            if (connectionState.status != ConnectionStatus.CONNECTED || connectionState.device == null) {
                return@withContext TvCommandResult(
                    success = false,
                    command = command,
                    executionTimeMs = 0,
                    error = "Not connected to any TV device"
                )
            }

            // Route to appropriate controller based on connection type
            when (connectionState.device.type) {
                ConnectionType.BLUETOOTH -> {
                    if (bluetoothController.isConnected()) {
                        bluetoothController.sendCommand(command)
                    } else {
                        TvCommandResult(
                            success = false,
                            command = command,
                            executionTimeMs = 0,
                            error = "Bluetooth controller not connected"
                        )
                    }
                }
                ConnectionType.NETWORK -> {
                    if (networkController.isConnected()) {
                        networkController.sendCommand(command)
                    } else {
                        TvCommandResult(
                            success = false,
                            command = command,
                            executionTimeMs = 0,
                            error = "Network controller not connected"
                        )
                    }
                }
                ConnectionType.CEC -> {
                    if (cecController.isConnected()) {
                        cecController.sendCommand(command)
                    } else {
                        TvCommandResult(
                            success = false,
                            command = command,
                            executionTimeMs = 0,
                            error = "CEC controller not connected"
                        )
                    }
                }
                ConnectionType.NONE -> {
                    TvCommandResult(
                        success = false,
                        command = command,
                        executionTimeMs = 0,
                        error = "Invalid connection type"
                    )
                }
            }
        }

    override suspend fun sendCommandBatch(commands: List<TvCommand>): List<TvCommandResult> =
        withContext(Dispatchers.IO) {
            val results = mutableListOf<TvCommandResult>()

            for (command in commands) {
                val result = sendCommand(command)
                results.add(result)

                // Add small delay between commands to avoid overwhelming the TV
                kotlinx.coroutines.delay(100)
            }

            results
        }

    override fun getConnectionState(): TvConnectionState {
        return connectionManager.getConnectionState()
    }

    override fun getCapabilities(): TvCapabilities {
        return capabilities ?: TvCapabilities(
            supportsBluetooth = false,
            supportsNetwork = false,
            supportsCec = false,
            supportedCommands = emptySet()
        )
    }

    override fun observeConnectionState(callback: (TvConnectionState) -> Unit) {
        connectionManager.observeConnectionState(callback)
    }

    override fun release() {
        // Disconnect and clean up
        kotlinx.coroutines.runBlocking {
            disconnect()
        }
        deviceDiscovery.stopDiscovery()
    }

    // ========== Helper Methods ==========

    private fun getAllSupportedCommands(): Set<TvCommand> {
        // Return all commands that can be sent
        return setOf(
            TvCommand.POWER_ON,
            TvCommand.POWER_OFF,
            TvCommand.POWER_TOGGLE,
            TvCommand.VOLUME_UP,
            TvCommand.VOLUME_DOWN,
            TvCommand.VOLUME_MUTE,
            TvCommand.CHANNEL_UP,
            TvCommand.CHANNEL_DOWN,
            TvCommand.MENU,
            TvCommand.HOME,
            TvCommand.BACK,
            TvCommand.UP,
            TvCommand.DOWN,
            TvCommand.LEFT,
            TvCommand.RIGHT,
            TvCommand.SELECT,
            TvCommand.PLAY,
            TvCommand.PAUSE,
            TvCommand.STOP,
            TvCommand.REWIND,
            TvCommand.FAST_FORWARD
        )
    }
}
