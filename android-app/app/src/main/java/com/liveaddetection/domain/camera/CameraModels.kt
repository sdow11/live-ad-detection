package com.liveaddetection.domain.camera

/**
 * Video resolution
 */
data class Resolution(
    val width: Int,
    val height: Int
) {
    override fun toString(): String = "${width}x${height}"

    companion object {
        // Common resolutions
        val HD = Resolution(1280, 720)
        val FULL_HD = Resolution(1920, 1080)
        val UHD_4K = Resolution(3840, 2160)
        val VGA = Resolution(640, 480)
        val SVGA = Resolution(800, 600)
    }
}

/**
 * USB device information
 */
data class DeviceInfo(
    val name: String,
    val vendorId: Int,
    val productId: Int,
    val deviceClass: Int,
    val isUvc: Boolean
) {
    fun getVendorIdHex(): String = "0x${vendorId.toString(16).uppercase()}"
    fun getProductIdHex(): String = "0x${productId.toString(16).uppercase()}"

    override fun toString(): String {
        return "$name (VID: ${getVendorIdHex()}, PID: ${getProductIdHex()})"
    }
}

/**
 * Camera status
 */
enum class CameraStatus {
    UNINITIALIZED,
    INITIALIZED,
    CAPTURING,
    ERROR,
    DISCONNECTED
}

/**
 * Camera error types
 */
sealed class CameraError(val message: String) {
    class DeviceNotFound(message: String = "USB device not found") : CameraError(message)
    class PermissionDenied(message: String = "USB permission denied") : CameraError(message)
    class InitializationFailed(message: String = "Camera initialization failed") : CameraError(message)
    class CaptureFailed(message: String = "Frame capture failed") : CameraError(message)
    class DeviceDisconnected(message: String = "Device disconnected") : CameraError(message)
    class UnsupportedDevice(message: String = "Device not supported") : CameraError(message)
}
