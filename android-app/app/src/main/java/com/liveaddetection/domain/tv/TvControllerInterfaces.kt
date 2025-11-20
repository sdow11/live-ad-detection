package com.liveaddetection.domain.tv

/**
 * TV Controller Domain Interfaces
 * Following SOLID principles - Interface Segregation
 */

// ============= Data Models =============

enum class TvCommand {
    POWER_ON,
    POWER_OFF,
    POWER_TOGGLE,
    VOLUME_UP,
    VOLUME_DOWN,
    VOLUME_MUTE,
    CHANNEL_UP,
    CHANNEL_DOWN,
    INPUT_HDMI1,
    INPUT_HDMI2,
    INPUT_HDMI3,
    INPUT_HDMI4,
    MENU,
    HOME,
    BACK,
    UP,
    DOWN,
    LEFT,
    RIGHT,
    SELECT,
    PLAY,
    PAUSE,
    STOP,
    REWIND,
    FAST_FORWARD
}

enum class ConnectionType {
    BLUETOOTH,
    NETWORK,
    CEC,
    NONE
}

enum class ConnectionStatus {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
}

data class TvDevice(
    val id: String,
    val name: String,
    val type: ConnectionType,
    val address: String, // MAC address for Bluetooth, IP for Network
    val manufacturer: String = "Unknown",
    val model: String = "Unknown"
)

data class TvConnectionState(
    val device: TvDevice?,
    val status: ConnectionStatus,
    val lastError: String? = null,
    val connectedAt: Long? = null
)

data class TvCommandResult(
    val success: Boolean,
    val command: TvCommand,
    val executionTimeMs: Long,
    val error: String? = null
)

// ============= Interfaces =============

/**
 * Interface: Device Discovery
 * Responsibility: Find available TV devices
 */
interface ITvDeviceDiscovery {
    suspend fun discoverBluetoothDevices(): List<TvDevice>
    suspend fun discoverNetworkDevices(): List<TvDevice>
    suspend fun discoverCecDevices(): List<TvDevice>
    suspend fun startContinuousDiscovery(callback: (List<TvDevice>) -> Unit)
    fun stopDiscovery()
}

/**
 * Interface: Connection Management
 * Responsibility: Connect/disconnect to TV devices
 */
interface ITvConnectionManager {
    suspend fun connect(device: TvDevice): Boolean
    suspend fun disconnect(): Boolean
    fun getConnectionState(): TvConnectionState
    fun observeConnectionState(callback: (TvConnectionState) -> Unit)
}

/**
 * Interface: Bluetooth HID Controller
 * Responsibility: Send Bluetooth HID commands
 */
interface IBluetoothTvController {
    suspend fun sendCommand(command: TvCommand): TvCommandResult
    suspend fun sendRawHidReport(report: ByteArray): Boolean
    fun isConnected(): Boolean
}

/**
 * Interface: Network TV Controller
 * Responsibility: Send network commands (HTTP/TCP)
 */
interface INetworkTvController {
    suspend fun sendCommand(command: TvCommand): TvCommandResult
    suspend fun sendRawCommand(endpoint: String, payload: String): Boolean
    suspend fun getDeviceInfo(): Map<String, String>
    fun isConnected(): Boolean
}

/**
 * Interface: CEC Controller
 * Responsibility: Send HDMI-CEC commands
 */
interface ICecTvController {
    suspend fun sendCommand(command: TvCommand): TvCommandResult
    suspend fun sendRawCecCommand(opcode: Int, params: ByteArray): Boolean
    fun isCecSupported(): Boolean
    fun isConnected(): Boolean
}

/**
 * Interface: Unified TV Controller
 * Responsibility: Orchestrate all TV control methods
 * Depends on: ITvConnectionManager, IBluetoothTvController, INetworkTvController, ICecTvController
 */
interface ITvController {
    suspend fun initialize(): Boolean
    suspend fun discoverDevices(): List<TvDevice>
    suspend fun connectToDevice(device: TvDevice): Boolean
    suspend fun disconnect(): Boolean
    suspend fun sendCommand(command: TvCommand): TvCommandResult
    suspend fun sendCommandBatch(commands: List<TvCommand>): List<TvCommandResult>
    fun getConnectionState(): TvConnectionState
    fun getCapabilities(): TvCapabilities
    fun observeConnectionState(callback: (TvConnectionState) -> Unit)
    fun release()
}

/**
 * TV Capabilities
 */
data class TvCapabilities(
    val supportsBluetooth: Boolean,
    val supportsNetwork: Boolean,
    val supportsCec: Boolean,
    val supportedCommands: Set<TvCommand>
)

/**
 * Interface: Command Mapper
 * Responsibility: Map TvCommand to protocol-specific commands
 */
interface ITvCommandMapper {
    fun mapToBluetoothHid(command: TvCommand): ByteArray?
    fun mapToNetworkCommand(command: TvCommand, deviceModel: String): Pair<String, String>? // endpoint, payload
    fun mapToCecCommand(command: TvCommand): Pair<Int, ByteArray>? // opcode, params
}
