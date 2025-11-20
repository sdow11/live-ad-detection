package com.liveaddetection.domain.tv

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHidDevice
import android.bluetooth.BluetoothProfile
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.Executor

/**
 * Bluetooth TV Controller Implementation
 * Single Responsibility: Send Bluetooth HID commands to TV
 */
class BluetoothTvController(
    private val commandMapper: ITvCommandMapper,
    private val context: Context? = null
) : IBluetoothTvController {

    private var bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var hidDevice: BluetoothHidDevice? = null
    private var connectedDevice: BluetoothDevice? = null

    @Volatile
    private var connected = false

    override suspend fun sendCommand(command: TvCommand): TvCommandResult =
        withContext(Dispatchers.IO) {
            val startTime = System.currentTimeMillis()

            // Check connection
            if (!isConnected()) {
                return@withContext TvCommandResult(
                    success = false,
                    command = command,
                    executionTimeMs = System.currentTimeMillis() - startTime,
                    error = "Bluetooth not connected"
                )
            }

            // Map command to HID report
            val hidReport = commandMapper.mapToBluetoothHid(command)
            if (hidReport == null) {
                return@withContext TvCommandResult(
                    success = false,
                    command = command,
                    executionTimeMs = System.currentTimeMillis() - startTime,
                    error = "Command not supported via Bluetooth"
                )
            }

            // Send HID report
            val success = sendRawHidReport(hidReport)
            val executionTime = System.currentTimeMillis() - startTime

            TvCommandResult(
                success = success,
                command = command,
                executionTimeMs = executionTime,
                error = if (!success) "Failed to send HID report" else null
            )
        }

    override suspend fun sendRawHidReport(report: ByteArray): Boolean =
        withContext(Dispatchers.IO) {
            if (!isConnected() || hidDevice == null || connectedDevice == null) {
                return@withContext false
            }

            try {
                // Send interrupt report (0x02 = interrupt, report[0] = report ID)
                val reportId = 0x02
                hidDevice?.sendReport(connectedDevice, reportId, report)
                true
            } catch (e: Exception) {
                false
            }
        }

    override fun isConnected(): Boolean = connected

    /**
     * Internal: Connect to Bluetooth device
     */
    suspend fun connect(device: BluetoothDevice): Boolean = withContext(Dispatchers.IO) {
        try {
            connectedDevice = device

            // Get HID Device profile
            val profileListener = object : BluetoothProfile.ServiceListener {
                override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
                    if (profile == BluetoothProfile.HID_DEVICE) {
                        hidDevice = proxy as BluetoothHidDevice
                        connected = true
                    }
                }

                override fun onServiceDisconnected(profile: Int) {
                    if (profile == BluetoothProfile.HID_DEVICE) {
                        hidDevice = null
                        connected = false
                    }
                }
            }

            context?.let {
                bluetoothAdapter?.getProfileProxy(it, profileListener, BluetoothProfile.HID_DEVICE)
            }

            // Wait for connection (in real impl, use callback)
            connected = true
            true
        } catch (e: Exception) {
            connected = false
            false
        }
    }

    /**
     * Internal: Disconnect
     */
    fun disconnect() {
        connectedDevice = null
        hidDevice = null
        connected = false
    }
}
