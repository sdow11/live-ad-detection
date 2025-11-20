package com.liveaddetection.domain.tv

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * CEC TV Controller Implementation
 * Single Responsibility: Send HDMI-CEC commands
 * Note: Most Android devices don't support CEC. This is primarily for Android TV boxes.
 */
class CecTvController(
    private val commandMapper: ITvCommandMapper
) : ICecTvController {

    @Volatile
    private var cecSupported = false

    @Volatile
    private var connected = false

    override suspend fun sendCommand(command: TvCommand): TvCommandResult =
        withContext(Dispatchers.IO) {
            val startTime = System.currentTimeMillis()

            if (!isCecSupported()) {
                return@withContext TvCommandResult(
                    success = false,
                    command = command,
                    executionTimeMs = System.currentTimeMillis() - startTime,
                    error = "HDMI-CEC not supported on this device"
                )
            }

            if (!isConnected()) {
                return@withContext TvCommandResult(
                    success = false,
                    command = command,
                    executionTimeMs = System.currentTimeMillis() - startTime,
                    error = "CEC not connected"
                )
            }

            // Map command to CEC
            val (opcode, params) = commandMapper.mapToCecCommand(command)
                ?: return@withContext TvCommandResult(
                    success = false,
                    command = command,
                    executionTimeMs = System.currentTimeMillis() - startTime,
                    error = "Command not supported via CEC"
                )

            // Send CEC command
            val success = sendRawCecCommand(opcode, params)
            val executionTime = System.currentTimeMillis() - startTime

            TvCommandResult(
                success = success,
                command = command,
                executionTimeMs = executionTime,
                error = if (!success) "CEC command failed" else null
            )
        }

    override suspend fun sendRawCecCommand(opcode: Int, params: ByteArray): Boolean =
        withContext(Dispatchers.IO) {
            if (!cecSupported || !connected) {
                return@withContext false
            }

            // In a real implementation, use HdmiControlManager
            // val hdmiControlManager = context.getSystemService(Context.HDMI_CONTROL_SERVICE)
            // hdmiControlManager.sendCecCommand(...)

            // For now, return false as most devices don't support it
            false
        }

    override fun isCecSupported(): Boolean = cecSupported

    override fun isConnected(): Boolean = connected

    /**
     * Internal: Initialize CEC
     */
    fun initialize(): Boolean {
        // Check if device supports HDMI-CEC
        // Most phones/tablets don't have HDMI output
        cecSupported = false
        return cecSupported
    }
}
