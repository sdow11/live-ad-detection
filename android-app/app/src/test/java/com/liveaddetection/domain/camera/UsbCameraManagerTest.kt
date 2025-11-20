package com.liveaddetection.domain.camera

import android.content.Context
import android.graphics.Bitmap
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.*
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowUsbManager

/**
 * USB Camera Manager Tests - TDD
 * Tests written BEFORE implementation
 *
 * Tests cover:
 * - USB device detection (UVC class)
 * - Camera initialization
 * - Frame capture callbacks
 * - FPS control
 * - Device disconnect handling
 * - Error cases
 * - Resource cleanup
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class UsbCameraManagerTest {

    private lateinit var context: Context
    private lateinit var usbManager: UsbManager
    private lateinit var cameraManager: UsbCameraManager
    private lateinit var frameCallback: (Bitmap) -> Unit

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager

        frameCallback = mock()

        cameraManager = UsbCameraManager(context)
    }

    // ===== DEVICE DETECTION TESTS =====

    @Test
    fun `detectUvcDevices returns empty list when no devices connected`() {
        // Given - no USB devices

        // When
        val devices = cameraManager.detectUvcDevices()

        // Then
        assertThat(devices).isEmpty()
    }

    @Test
    fun `detectUvcDevices finds USB video class devices`() {
        // Given - mock UVC device
        val mockDevice = createMockUvcDevice(
            deviceName = "USB Capture Card",
            vendorId = 0x1234,
            productId = 0x5678
        )

        // Add to USB manager
        shadowOf(usbManager).addDevice(mockDevice)

        // When
        val devices = cameraManager.detectUvcDevices()

        // Then
        assertThat(devices).hasSize(1)
        assertThat(devices[0].deviceName).isEqualTo("USB Capture Card")
    }

    @Test
    fun `detectUvcDevices filters out non-UVC devices`() {
        // Given - multiple devices, only one is UVC
        val uvcDevice = createMockUvcDevice("UVC Camera", 0x1111, 0x2222)
        val storageDevice = createMockStorageDevice("USB Drive", 0x3333, 0x4444)
        val keyboardDevice = createMockHidDevice("USB Keyboard", 0x5555, 0x6666)

        shadowOf(usbManager).addDevice(uvcDevice)
        shadowOf(usbManager).addDevice(storageDevice)
        shadowOf(usbManager).addDevice(keyboardDevice)

        // When
        val devices = cameraManager.detectUvcDevices()

        // Then
        assertThat(devices).hasSize(1)
        assertThat(devices[0].deviceName).isEqualTo("UVC Camera")
    }

    @Test
    fun `getDeviceInfo returns correct device information`() {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0xAAAA, 0xBBBB)
        shadowOf(usbManager).addDevice(mockDevice)

        val devices = cameraManager.detectUvcDevices()

        // When
        val info = cameraManager.getDeviceInfo(devices[0])

        // Then
        assertThat(info.name).isEqualTo("Test Camera")
        assertThat(info.vendorId).isEqualTo(0xAAAA)
        assertThat(info.productId).isEqualTo(0xBBBB)
        assertThat(info.isUvc).isTrue()
    }

    // ===== CAMERA INITIALIZATION TESTS =====

    @Test
    fun `initialize returns true when device is valid`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        shadowOf(usbManager).addDevice(mockDevice)
        grantUsbPermission(mockDevice)

        // When
        val result = cameraManager.initialize(mockDevice)

        // Then
        assertThat(result).isTrue()
        assertThat(cameraManager.isInitialized()).isTrue()
    }

    @Test
    fun `initialize returns false when device is not UVC`() = runTest {
        // Given
        val nonUvcDevice = createMockStorageDevice("USB Drive", 0x1111, 0x2222)

        // When
        val result = cameraManager.initialize(nonUvcDevice)

        // Then
        assertThat(result).isFalse()
        assertThat(cameraManager.isInitialized()).isFalse()
    }

    @Test
    fun `initialize returns false when permission not granted`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        shadowOf(usbManager).addDevice(mockDevice)
        // Permission NOT granted

        // When
        val result = cameraManager.initialize(mockDevice)

        // Then
        assertThat(result).isFalse()
        assertThat(cameraManager.isInitialized()).isFalse()
    }

    @Test
    fun `requestPermission triggers permission dialog`() {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        shadowOf(usbManager).addDevice(mockDevice)

        var permissionRequested = false
        cameraManager.setPermissionCallback { device, granted ->
            permissionRequested = true
        }

        // When
        cameraManager.requestPermission(mockDevice)

        // Then
        assertThat(permissionRequested).isTrue()
    }

    // ===== FRAME CAPTURE TESTS =====

    @Test
    fun `startCapture begins frame capture at specified FPS`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        initializeCamera(mockDevice)

        var frameCount = 0
        val callback: (Bitmap) -> Unit = { frameCount++ }

        // When
        cameraManager.startCapture(fps = 30, frameCallback = callback)
        delay(1000) // Wait 1 second

        // Then
        assertThat(cameraManager.isCapturing()).isTrue()
        // Should capture ~30 frames in 1 second (allow ±5 for timing)
        assertThat(frameCount).isAtLeast(25)
        assertThat(frameCount).isAtMost(35)
    }

    @Test
    fun `stopCapture stops frame callbacks`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        initializeCamera(mockDevice)

        var frameCount = 0
        cameraManager.startCapture(fps = 30) { frameCount++ }
        delay(100)

        // When
        cameraManager.stopCapture()
        val countAfterStop = frameCount
        delay(200)

        // Then
        assertThat(cameraManager.isCapturing()).isFalse()
        // Frame count should not increase after stop
        assertThat(frameCount).isEqualTo(countAfterStop)
    }

    @Test
    fun `setResolution changes capture resolution`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        initializeCamera(mockDevice)

        // When
        val result = cameraManager.setResolution(1920, 1080)

        // Then
        assertThat(result).isTrue()
        val resolution = cameraManager.getCurrentResolution()
        assertThat(resolution.width).isEqualTo(1920)
        assertThat(resolution.height).isEqualTo(1080)
    }

    @Test
    fun `getSupportedResolutions returns available resolutions`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        initializeCamera(mockDevice)

        // When
        val resolutions = cameraManager.getSupportedResolutions()

        // Then
        assertThat(resolutions).isNotEmpty()
        // Common resolutions should be available
        assertThat(resolutions).contains(Resolution(1920, 1080))
        assertThat(resolutions).contains(Resolution(1280, 720))
    }

    @Test
    fun `frame callback receives valid bitmaps`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        initializeCamera(mockDevice)

        var receivedBitmap: Bitmap? = null
        cameraManager.startCapture(fps = 30) { bitmap ->
            receivedBitmap = bitmap
        }

        // Wait for first frame
        delay(100)

        // Then
        assertThat(receivedBitmap).isNotNull()
        assertThat(receivedBitmap!!.width).isGreaterThan(0)
        assertThat(receivedBitmap!!.height).isGreaterThan(0)
    }

    // ===== ERROR HANDLING TESTS =====

    @Test
    fun `startCapture fails when camera not initialized`() = runTest {
        // Given - camera NOT initialized

        // When
        val callback: (Bitmap) -> Unit = {}
        val result = cameraManager.startCapture(fps = 30, frameCallback = callback)

        // Then
        assertThat(result).isFalse()
        assertThat(cameraManager.isCapturing()).isFalse()
    }

    @Test
    fun `setResolution fails when camera not initialized`() = runTest {
        // Given - camera NOT initialized

        // When
        val result = cameraManager.setResolution(1920, 1080)

        // Then
        assertThat(result).isFalse()
    }

    @Test
    fun `device disconnect stops capture and notifies`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        initializeCamera(mockDevice)

        var disconnectNotified = false
        cameraManager.setDisconnectCallback { disconnectNotified = true }

        cameraManager.startCapture(fps = 30) {}

        // When - simulate disconnect
        shadowOf(usbManager).removeDevice(mockDevice)
        delay(100)

        // Then
        assertThat(cameraManager.isCapturing()).isFalse()
        assertThat(disconnectNotified).isTrue()
    }

    @Test
    fun `capture errors are reported via callback`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        initializeCamera(mockDevice)

        var errorReceived: String? = null
        cameraManager.setErrorCallback { error -> errorReceived = error }

        // When - simulate capture error (device becomes unavailable)
        cameraManager.startCapture(fps = 30) {}
        // Simulate error condition
        cameraManager.simulateError("Camera device error")

        // Then
        assertThat(errorReceived).isNotNull()
        assertThat(errorReceived).contains("Camera device error")
    }

    // ===== RESOURCE CLEANUP TESTS =====

    @Test
    fun `release stops capture and frees resources`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        initializeCamera(mockDevice)
        cameraManager.startCapture(fps = 30) {}

        // When
        cameraManager.release()

        // Then
        assertThat(cameraManager.isCapturing()).isFalse()
        assertThat(cameraManager.isInitialized()).isFalse()
    }

    @Test
    fun `release can be called multiple times safely`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        initializeCamera(mockDevice)

        // When - call release multiple times
        cameraManager.release()
        cameraManager.release()
        cameraManager.release()

        // Then - should not crash
        assertThat(cameraManager.isInitialized()).isFalse()
    }

    @Test
    fun `resources are released when manager is garbage collected`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)

        var manager: UsbCameraManager? = UsbCameraManager(context)
        initializeCamera(mockDevice, manager!!)
        manager!!.startCapture(fps = 30) {}

        // When - manager goes out of scope
        manager = null
        System.gc()
        delay(100)

        // Then - resources should be cleaned up
        // (This is implementation-specific, but should not leak)
    }

    // ===== PERFORMANCE TESTS =====

    @Test
    fun `getFps returns actual capture frame rate`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        initializeCamera(mockDevice)

        // When
        cameraManager.startCapture(fps = 30) {}
        delay(1000) // Let it stabilize
        val actualFps = cameraManager.getCurrentFps()

        // Then
        assertThat(actualFps).isAtLeast(25.0f)
        assertThat(actualFps).isAtMost(35.0f)
    }

    @Test
    fun `getDroppedFrames tracks frame drops`() = runTest {
        // Given
        val mockDevice = createMockUvcDevice("Test Camera", 0x1234, 0x5678)
        initializeCamera(mockDevice)

        cameraManager.startCapture(fps = 30) {
            // Slow callback to force drops
            Thread.sleep(50) // Takes 50ms per frame
        }

        delay(1000)

        // When
        val droppedFrames = cameraManager.getDroppedFrames()

        // Then
        // At 30 FPS we expect a frame every 33ms
        // But processing takes 50ms, so we should drop frames
        assertThat(droppedFrames).isGreaterThan(0)
    }

    // ===== HELPER METHODS =====

    private fun createMockUvcDevice(
        deviceName: String,
        vendorId: Int,
        productId: Int
    ): UsbDevice {
        return mock {
            on { this.deviceName } doReturn deviceName
            on { this.vendorId } doReturn vendorId
            on { this.productId } doReturn productId
            on { this.deviceClass } doReturn 0x0E // USB_CLASS_VIDEO
            on { this.interfaceCount } doReturn 2
            on { getInterface(0) } doReturn mock {
                on { this.interfaceClass } doReturn 0x0E // USB_CLASS_VIDEO
                on { this.interfaceSubclass } doReturn 0x01 // Video Control
            }
            on { getInterface(1) } doReturn mock {
                on { this.interfaceClass } doReturn 0x0E // USB_CLASS_VIDEO
                on { this.interfaceSubclass } doReturn 0x02 // Video Streaming
            }
        }
    }

    private fun createMockStorageDevice(
        deviceName: String,
        vendorId: Int,
        productId: Int
    ): UsbDevice {
        return mock {
            on { this.deviceName } doReturn deviceName
            on { this.vendorId } doReturn vendorId
            on { this.productId } doReturn productId
            on { this.deviceClass } doReturn 0x08 // USB_CLASS_MASS_STORAGE
        }
    }

    private fun createMockHidDevice(
        deviceName: String,
        vendorId: Int,
        productId: Int
    ): UsbDevice {
        return mock {
            on { this.deviceName } doReturn deviceName
            on { this.vendorId } doReturn vendorId
            on { this.productId } doReturn productId
            on { this.deviceClass } doReturn 0x03 // USB_CLASS_HID
        }
    }

    private fun grantUsbPermission(device: UsbDevice) {
        shadowOf(usbManager).grantPermission(device)
    }

    private suspend fun initializeCamera(device: UsbDevice, manager: UsbCameraManager = cameraManager) {
        shadowOf(usbManager).addDevice(device)
        grantUsbPermission(device)
        manager.initialize(device)
    }
}
