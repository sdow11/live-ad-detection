package com.liveaddetection.domain.tv

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

/**
 * TV Device Discovery Implementation
 * Single Responsibility: Discover TV devices on Bluetooth, Network, and CEC
 */
class TvDeviceDiscovery(private val context: Context? = null) : ITvDeviceDiscovery {

    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var isDiscovering = false

    private val tvManufacturers = setOf(
        "Samsung", "LG", "Sony", "Vizio", "TCL", "Hisense",
        "Philips", "Panasonic", "Sharp", "Toshiba", "TV"
    )

    override suspend fun discoverBluetoothDevices(): List<TvDevice> =
        withContext(Dispatchers.IO) {
            val devices = mutableListOf<TvDevice>()

            try {
                // Get paired Bluetooth devices
                val pairedDevices = bluetoothAdapter?.bondedDevices ?: emptySet()

                for (btDevice in pairedDevices) {
                    // Filter for TV-related devices
                    if (isTvDevice(btDevice)) {
                        devices.add(
                            TvDevice(
                                id = "bt-${btDevice.address.replace(":", "")}",
                                name = btDevice.name ?: "Unknown TV",
                                type = ConnectionType.BLUETOOTH,
                                address = btDevice.address,
                                manufacturer = extractManufacturer(btDevice.name),
                                model = btDevice.name ?: "Unknown"
                            )
                        )
                    }
                }
            } catch (e: Exception) {
                // Bluetooth not available or permission denied
            }

            devices
        }

    override suspend fun discoverNetworkDevices(): List<TvDevice> =
        withContext(Dispatchers.IO) {
            val devices = mutableListOf<TvDevice>()

            try {
                // Use UPnP/SSDP discovery for smart TVs
                devices.addAll(discoverUPnPDevices())

                // Optionally scan common TV ports
                // devices.addAll(scanCommonTvPorts())
            } catch (e: Exception) {
                // Network discovery failed
            }

            devices
        }

    override suspend fun discoverCecDevices(): List<TvDevice> =
        withContext(Dispatchers.IO) {
            val devices = mutableListOf<TvDevice>()

            // HDMI-CEC discovery
            // Most Android devices don't support CEC, so return empty
            // In devices with HDMI output (Android TV boxes), use HdmiControlManager

            devices
        }

    override suspend fun startContinuousDiscovery(callback: (List<TvDevice>) -> Unit) {
        isDiscovering = true

        // In a real implementation, this would run in a coroutine loop
        // For now, do a one-time discovery
        val allDevices = discoverBluetoothDevices() +
                discoverNetworkDevices() +
                discoverCecDevices()

        callback(allDevices)
    }

    override fun stopDiscovery() {
        isDiscovering = false
        bluetoothAdapter?.cancelDiscovery()
    }

    // ========== Helper Methods ==========

    private fun isTvDevice(device: BluetoothDevice): Boolean {
        val name = device.name?.lowercase() ?: return false

        // Check if name contains TV manufacturer or "TV" keyword
        return tvManufacturers.any { manufacturer ->
            name.contains(manufacturer, ignoreCase = true)
        } || name.contains("tv") || name.contains("display")
    }

    private fun extractManufacturer(deviceName: String?): String {
        if (deviceName == null) return "Unknown"

        for (manufacturer in tvManufacturers) {
            if (deviceName.contains(manufacturer, ignoreCase = true)) {
                return manufacturer
            }
        }

        return "Unknown"
    }

    private suspend fun discoverUPnPDevices(): List<TvDevice> =
        withContext(Dispatchers.IO) {
            val devices = mutableListOf<TvDevice>()

            try {
                // Send SSDP M-SEARCH multicast
                val ssdpRequest = """
                    M-SEARCH * HTTP/1.1
                    HOST: 239.255.255.250:1900
                    MAN: "ssdp:discover"
                    MX: 3
                    ST: urn:schemas-upnp-org:device:MediaRenderer:1

                """.trimIndent()

                val socket = DatagramSocket()
                socket.soTimeout = 3000 // 3 second timeout

                val group = InetAddress.getByName("239.255.255.250")
                val packet = DatagramPacket(
                    ssdpRequest.toByteArray(),
                    ssdpRequest.length,
                    group,
                    1900
                )

                socket.send(packet)

                // Listen for responses
                val buffer = ByteArray(1024)
                val responsePacket = DatagramPacket(buffer, buffer.size)

                try {
                    while (true) {
                        socket.receive(responsePacket)

                        val response = String(responsePacket.data, 0, responsePacket.length)
                        val device = parseUPnPResponse(response, responsePacket.address.hostAddress)

                        device?.let { devices.add(it) }
                    }
                } catch (e: Exception) {
                    // Timeout or error - normal for discovery
                }

                socket.close()
            } catch (e: Exception) {
                // UPnP discovery failed
            }

            devices
        }

    private fun parseUPnPResponse(response: String, ipAddress: String): TvDevice? {
        // Parse SSDP response headers
        if (!response.contains("MediaRenderer") && !response.contains("TV")) {
            return null
        }

        // Extract device name from response
        val deviceName = extractFromHeader(response, "SERVER") ?: "Network TV"
        val manufacturer = extractManufacturer(deviceName)

        return TvDevice(
            id = "net-${ipAddress.replace(".", "")}",
            name = deviceName,
            type = ConnectionType.NETWORK,
            address = ipAddress,
            manufacturer = manufacturer,
            model = deviceName
        )
    }

    private fun extractFromHeader(response: String, headerName: String): String? {
        val lines = response.split("\r\n")
        for (line in lines) {
            if (line.startsWith(headerName, ignoreCase = true)) {
                return line.substringAfter(":").trim()
            }
        }
        return null
    }
}
