package com.liveaddetection.domain.tv

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Network TV Controller Implementation
 * Single Responsibility: Send network commands to smart TVs
 */
class NetworkTvController(
    private val commandMapper: ITvCommandMapper
) : INetworkTvController {

    private var connectedDevice: TvDevice? = null
    private var baseUrl: String? = null

    @Volatile
    private var connected = false

    override suspend fun sendCommand(command: TvCommand): TvCommandResult =
        withContext(Dispatchers.IO) {
            val startTime = System.currentTimeMillis()

            if (!isConnected() || connectedDevice == null) {
                return@withContext TvCommandResult(
                    success = false,
                    command = command,
                    executionTimeMs = System.currentTimeMillis() - startTime,
                    error = "Not connected to network device"
                )
            }

            // Map command to network request
            val (endpoint, payload) = commandMapper.mapToNetworkCommand(
                command,
                connectedDevice!!.model
            ) ?: return@withContext TvCommandResult(
                success = false,
                command = command,
                executionTimeMs = System.currentTimeMillis() - startTime,
                error = "Command not supported for this device"
            )

            // Send HTTP request
            val success = sendRawCommand(endpoint, payload)
            val executionTime = System.currentTimeMillis() - startTime

            TvCommandResult(
                success = success,
                command = command,
                executionTimeMs = executionTime,
                error = if (!success) "HTTP request failed" else null
            )
        }

    override suspend fun sendRawCommand(endpoint: String, payload: String): Boolean =
        withContext(Dispatchers.IO) {
            if (baseUrl == null) return@withContext false

            try {
                val url = URL("$baseUrl$endpoint")
                val connection = url.openConnection() as HttpURLConnection

                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                connection.connectTimeout = 5000
                connection.readTimeout = 5000

                // Send payload
                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(payload)
                    writer.flush()
                }

                // Check response
                val responseCode = connection.responseCode
                connection.disconnect()

                responseCode in 200..299
            } catch (e: Exception) {
                false
            }
        }

    override suspend fun getDeviceInfo(): Map<String, String> =
        withContext(Dispatchers.IO) {
            val info = mutableMapOf<String, String>()

            connectedDevice?.let {
                info["name"] = it.name
                info["manufacturer"] = it.manufacturer
                info["model"] = it.model
                info["address"] = it.address
            }

            info
        }

    override fun isConnected(): Boolean = connected

    /**
     * Internal: Connect to network device
     */
    suspend fun connect(device: TvDevice): Boolean = withContext(Dispatchers.IO) {
        try {
            connectedDevice = device
            baseUrl = "http://${device.address}:8001" // Samsung default port
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
        baseUrl = null
        connected = false
    }
}
