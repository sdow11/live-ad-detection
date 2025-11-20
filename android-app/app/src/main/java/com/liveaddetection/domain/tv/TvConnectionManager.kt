package com.liveaddetection.domain.tv

import android.bluetooth.BluetoothAdapter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * TV Connection Manager Implementation
 * Single Responsibility: Manage connections to TV devices
 */
class TvConnectionManager(
    private val bluetoothController: BluetoothTvController,
    private val networkController: NetworkTvController,
    private val cecController: CecTvController
) : ITvConnectionManager {

    @Volatile
    private var currentState = TvConnectionState(
        device = null,
        status = ConnectionStatus.DISCONNECTED
    )

    private var stateObservers = mutableListOf<(TvConnectionState) -> Unit>()

    override suspend fun connect(device: TvDevice): Boolean =
        withContext(Dispatchers.IO) {
            try {
                updateState(
                    currentState.copy(
                        device = device,
                        status = ConnectionStatus.CONNECTING
                    )
                )

                val success = when (device.type) {
                    ConnectionType.BLUETOOTH -> {
                        // Convert TvDevice to BluetoothDevice using MAC address
                        try {
                            val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
                            val bluetoothDevice = bluetoothAdapter?.getRemoteDevice(device.address)
                            if (bluetoothDevice != null) {
                                bluetoothController.connect(bluetoothDevice)
                            } else {
                                false
                            }
                        } catch (e: Exception) {
                            false
                        }
                    }
                    ConnectionType.NETWORK -> {
                        networkController.connect(device)
                    }
                    ConnectionType.CEC -> {
                        // CEC doesn't require explicit connection, just check if supported
                        cecController.isCecSupported()
                    }
                    ConnectionType.NONE -> false
                }

                if (success) {
                    updateState(
                        TvConnectionState(
                            device = device,
                            status = ConnectionStatus.CONNECTED,
                            connectedAt = System.currentTimeMillis()
                        )
                    )
                } else {
                    updateState(
                        TvConnectionState(
                            device = null,
                            status = ConnectionStatus.ERROR,
                            lastError = "Failed to connect to ${device.name}"
                        )
                    )
                }

                success
            } catch (e: Exception) {
                updateState(
                    TvConnectionState(
                        device = null,
                        status = ConnectionStatus.ERROR,
                        lastError = e.message
                    )
                )
                false
            }
        }

    override suspend fun disconnect(): Boolean =
        withContext(Dispatchers.IO) {
            try {
                // Disconnect all controllers
                bluetoothController.disconnect()
                networkController.disconnect()

                updateState(
                    TvConnectionState(
                        device = null,
                        status = ConnectionStatus.DISCONNECTED
                    )
                )

                true
            } catch (e: Exception) {
                false
            }
        }

    override fun getConnectionState(): TvConnectionState = currentState

    override fun observeConnectionState(callback: (TvConnectionState) -> Unit) {
        stateObservers.add(callback)
        // Immediately send current state
        callback(currentState)
    }

    private fun updateState(newState: TvConnectionState) {
        currentState = newState
        stateObservers.forEach { it(newState) }
    }
}
