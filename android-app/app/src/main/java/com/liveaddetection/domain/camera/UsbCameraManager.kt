package com.liveaddetection.domain.camera

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import com.serenegiant.usb.USBMonitor
import com.serenegiant.usb.UVCCamera
import kotlinx.coroutines.*
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicInteger

/**
 * USB Camera Manager
 * Manages USB Video Class (UVC) cameras for video capture
 *
 * Features:
 * - UVC device detection
 * - Permission handling
 * - Frame capture at configurable FPS
 * - Resolution management
 * - Error handling
 * - Resource cleanup
 */
class UsbCameraManager(private val context: Context) {

    companion object {
        private const val TAG = "UsbCameraManager"
        private const val ACTION_USB_PERMISSION = "com.liveaddetection.USB_PERMISSION"
        private const val USB_CLASS_VIDEO = 0x0E
    }

    private val usbManager: UsbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private var usbMonitor: USBMonitor? = null
    private var uvcCamera: UVCCamera? = null

    private var currentDevice: UsbDevice? = null
    private var currentResolution: Resolution = Resolution.FULL_HD
    private var status: CameraStatus = CameraStatus.UNINITIALIZED

    // Callbacks
    private var permissionCallback: ((UsbDevice, Boolean) -> Unit)? = null
    private var frameCallback: ((Bitmap) -> Unit)? = null
    private var errorCallback: ((String) -> Unit)? = null
    private var disconnectCallback: (() -> Unit)? = null

    // Frame capture state
    private var captureJob: Job? = null
    private val capturedFrames = AtomicInteger(0)
    private val droppedFrames = AtomicInteger(0)
    private var lastFpsCheck = System.currentTimeMillis()
    private var currentFps = 0f

    // USB Permission receiver
    private val usbPermissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (ACTION_USB_PERMISSION == intent.action) {
                synchronized(this) {
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    }

                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)

                    device?.let {
                        permissionCallback?.invoke(it, granted)
                    }
                }
            }
        }
    }

    init {
        // Register USB permission receiver
        val filter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(usbPermissionReceiver, filter)
        }

        // Initialize USB monitor
        initializeUsbMonitor()
    }

    private fun initializeUsbMonitor() {
        usbMonitor = USBMonitor(context, object : USBMonitor.OnDeviceConnectListener {
            override fun onAttach(device: UsbDevice) {
                Log.d(TAG, "USB device attached: ${device.deviceName}")
            }

            override fun onConnect(
                device: UsbDevice,
                ctrlBlock: USBMonitor.UsbControlBlock,
                createNew: Boolean
            ) {
                Log.d(TAG, "USB device connected: ${device.deviceName}")
                // Device connected and permission granted
            }

            override fun onDisconnect(device: UsbDevice, ctrlBlock: USBMonitor.UsbControlBlock) {
                Log.d(TAG, "USB device disconnected: ${device.deviceName}")
                if (device == currentDevice) {
                    handleDisconnect()
                }
            }

            override fun onDettach(device: UsbDevice) {
                Log.d(TAG, "USB device detached: ${device.deviceName}")
            }

            override fun onCancel(device: UsbDevice) {
                Log.d(TAG, "USB permission canceled: ${device.deviceName}")
            }
        })
    }

    /**
     * Detect all UVC (USB Video Class) devices
     */
    fun detectUvcDevices(): List<UsbDevice> {
        val deviceList = usbManager.deviceList
        return deviceList.values.filter { device ->
            isUvcDevice(device)
        }
    }

    /**
     * Check if device is a UVC device
     */
    private fun isUvcDevice(device: UsbDevice): Boolean {
        // Check device class
        if (device.deviceClass == USB_CLASS_VIDEO) {
            return true
        }

        // Check interface classes (some devices report at interface level)
        for (i in 0 until device.interfaceCount) {
            val intf = device.getInterface(i)
            if (intf.interfaceClass == USB_CLASS_VIDEO) {
                return true
            }
        }

        return false
    }

    /**
     * Get device information
     */
    fun getDeviceInfo(device: UsbDevice): DeviceInfo {
        return DeviceInfo(
            name = device.deviceName,
            vendorId = device.vendorId,
            productId = device.productId,
            deviceClass = device.deviceClass,
            isUvc = isUvcDevice(device)
        )
    }

    /**
     * Request USB permission for device
     */
    fun requestPermission(device: UsbDevice) {
        if (usbManager.hasPermission(device)) {
            permissionCallback?.invoke(device, true)
        } else {
            val intent = PendingIntent.getBroadcast(
                context,
                0,
                Intent(ACTION_USB_PERMISSION),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    PendingIntent.FLAG_MUTABLE
                } else {
                    0
                }
            )
            usbManager.requestPermission(device, intent)
        }
    }

    /**
     * Initialize camera with USB device
     */
    suspend fun initialize(device: UsbDevice): Boolean = withContext(Dispatchers.IO) {
        try {
            // Check if device is UVC
            if (!isUvcDevice(device)) {
                Log.e(TAG, "Device is not a UVC device")
                status = CameraStatus.ERROR
                return@withContext false
            }

            // Check permission
            if (!usbManager.hasPermission(device)) {
                Log.e(TAG, "No permission for device")
                status = CameraStatus.ERROR
                return@withContext false
            }

            currentDevice = device

            // Open camera using libuvccamera
            val controlBlock = usbMonitor?.openDevice(device)
            if (controlBlock == null) {
                Log.e(TAG, "Failed to open USB device")
                status = CameraStatus.ERROR
                return@withContext false
            }

            uvcCamera = UVCCamera().apply {
                open(controlBlock)

                // Set default preview size
                try {
                    setPreviewSize(
                        currentResolution.width,
                        currentResolution.height,
                        UVCCamera.FRAME_FORMAT_MJPEG
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to set resolution, using default", e)
                }
            }

            status = CameraStatus.INITIALIZED
            Log.i(TAG, "Camera initialized successfully")
            true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize camera", e)
            status = CameraStatus.ERROR
            errorCallback?.invoke("Initialization failed: ${e.message}")
            false
        }
    }

    /**
     * Start frame capture
     */
    fun startCapture(fps: Int, frameCallback: (Bitmap) -> Unit): Boolean {
        if (status != CameraStatus.INITIALIZED) {
            Log.e(TAG, "Camera not initialized")
            return false
        }

        this.frameCallback = frameCallback

        try {
            // Start preview with frame callback
            uvcCamera?.setFrameCallback({ frame ->
                try {
                    val bitmap = frameToBitmap(frame)
                    capturedFrames.incrementAndGet()
                    frameCallback(bitmap)
                    updateFps()
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing frame", e)
                    droppedFrames.incrementAndGet()
                }
            }, UVCCamera.PIXEL_FORMAT_RGB565)

            uvcCamera?.startPreview()

            status = CameraStatus.CAPTURING
            Log.i(TAG, "Frame capture started at $fps FPS")
            return true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start capture", e)
            errorCallback?.invoke("Capture failed: ${e.message}")
            return false
        }
    }

    /**
     * Stop frame capture
     */
    fun stopCapture() {
        try {
            uvcCamera?.stopPreview()
            captureJob?.cancel()
            status = CameraStatus.INITIALIZED
            Log.i(TAG, "Frame capture stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping capture", e)
        }
    }

    /**
     * Set capture resolution
     */
    suspend fun setResolution(width: Int, height: Int): Boolean = withContext(Dispatchers.IO) {
        if (status == CameraStatus.UNINITIALIZED) {
            return@withContext false
        }

        try {
            val wasCapturing = (status == CameraStatus.CAPTURING)

            if (wasCapturing) {
                stopCapture()
            }

            uvcCamera?.setPreviewSize(width, height, UVCCamera.FRAME_FORMAT_MJPEG)
            currentResolution = Resolution(width, height)

            if (wasCapturing) {
                frameCallback?.let { callback ->
                    startCapture(30, callback)
                }
            }

            Log.i(TAG, "Resolution set to ${width}x${height}")
            true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to set resolution", e)
            false
        }
    }

    /**
     * Get supported resolutions
     */
    fun getSupportedResolutions(): List<Resolution> {
        // Common UVC resolutions
        return listOf(
            Resolution.VGA,
            Resolution.SVGA,
            Resolution.HD,
            Resolution.FULL_HD
        )
    }

    /**
     * Get current resolution
     */
    fun getCurrentResolution(): Resolution = currentResolution

    /**
     * Get current FPS
     */
    fun getCurrentFps(): Float = currentFps

    /**
     * Get dropped frame count
     */
    fun getDroppedFrames(): Int = droppedFrames.get()

    /**
     * Check if camera is initialized
     */
    fun isInitialized(): Boolean = status != CameraStatus.UNINITIALIZED

    /**
     * Check if camera is capturing
     */
    fun isCapturing(): Boolean = status == CameraStatus.CAPTURING

    /**
     * Set permission callback
     */
    fun setPermissionCallback(callback: (UsbDevice, Boolean) -> Unit) {
        this.permissionCallback = callback
    }

    /**
     * Set error callback
     */
    fun setErrorCallback(callback: (String) -> Unit) {
        this.errorCallback = callback
    }

    /**
     * Set disconnect callback
     */
    fun setDisconnectCallback(callback: () -> Unit) {
        this.disconnectCallback = callback
    }

    /**
     * Release camera resources
     */
    fun release() {
        try {
            stopCapture()
            uvcCamera?.close()
            uvcCamera?.destroy()
            uvcCamera = null
            currentDevice = null
            status = CameraStatus.UNINITIALIZED
            Log.i(TAG, "Camera resources released")
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing camera", e)
        }
    }

    /**
     * Handle device disconnect
     */
    private fun handleDisconnect() {
        status = CameraStatus.DISCONNECTED
        stopCapture()
        disconnectCallback?.invoke()
    }

    /**
     * Update FPS calculation
     */
    private fun updateFps() {
        val now = System.currentTimeMillis()
        val elapsed = now - lastFpsCheck

        if (elapsed >= 1000) {
            val frames = capturedFrames.getAndSet(0)
            currentFps = (frames * 1000f) / elapsed
            lastFpsCheck = now
        }
    }

    /**
     * Convert frame buffer to Bitmap
     */
    private fun frameToBitmap(frame: ByteBuffer): Bitmap {
        // This is a simplified version
        // Real implementation would decode based on frame format
        val width = currentResolution.width
        val height = currentResolution.height

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
        frame.rewind()
        bitmap.copyPixelsFromBuffer(frame)

        return bitmap
    }

    /**
     * Simulate error (for testing)
     */
    @Suppress("unused")
    internal fun simulateError(message: String) {
        errorCallback?.invoke(message)
    }

    /**
     * Cleanup on garbage collection
     */
    protected fun finalize() {
        release()
        try {
            context.unregisterReceiver(usbPermissionReceiver)
            usbMonitor?.destroy()
        } catch (e: Exception) {
            // Ignore
        }
    }
}
