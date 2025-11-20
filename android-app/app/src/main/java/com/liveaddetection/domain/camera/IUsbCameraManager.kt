package com.liveaddetection.domain.camera

import android.graphics.Bitmap
import android.hardware.usb.UsbDevice

/**
 * USB Camera Manager Interface
 * Manages USB Video Class (UVC) camera devices
 */
interface IUsbCameraManager {
    // Device detection
    fun detectUvcDevices(): List<UsbDevice>
    fun getDeviceInfo(device: UsbDevice): DeviceInfo

    // Connection management
    fun openCamera(device: UsbDevice): Boolean
    fun closeCamera()

    // Permission handling
    fun requestPermission(device: UsbDevice)
    fun setPermissionCallback(callback: (UsbDevice, Boolean) -> Unit)

    // Capture control
    fun startCapture(fps: Int, frameCallback: (Bitmap) -> Unit): Boolean
    fun stopCapture()

    // State queries
    fun getStatus(): CameraStatus
    fun isInitialized(): Boolean
    fun isCapturing(): Boolean

    // Resolution management
    fun getSupportedResolutions(): List<Resolution>
    fun getCurrentResolution(): Resolution

    // Metrics
    fun getCurrentFps(): Float
    fun getDroppedFrames(): Int

    // Callbacks
    fun setErrorCallback(callback: (String) -> Unit)
    fun setDisconnectCallback(callback: () -> Unit)

    // Cleanup
    fun release()
}
