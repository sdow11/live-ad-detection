package com.liveaddetection.presentation

import android.graphics.Bitmap
import androidx.lifecycle.LiveData
import com.liveaddetection.domain.camera.CameraStatus
import com.liveaddetection.domain.detector.AdDetection
import com.liveaddetection.domain.detector.DetectorStatus
import com.liveaddetection.domain.tv.TvConnectionState
import com.liveaddetection.domain.tv.TvDevice

/**
 * UI Presentation Layer Interfaces
 * Following MVVM architecture with SOLID principles
 */

// ============= Data Models =============

data class VideoDisplayState(
    val frame: Bitmap? = null,
    val detections: List<AdDetection> = emptyList(),
    val fps: Float = 0f,
    val isProcessing: Boolean = false
)

data class CameraState(
    val status: CameraStatus,
    val deviceName: String? = null,
    val resolution: String? = null,
    val fps: Float = 0f
)

data class DetectorState(
    val status: DetectorStatus,
    val modelName: String? = null,
    val averageInferenceMs: Float = 0f,
    val totalDetections: Long = 0
)

data class PipState(
    val enabled: Boolean = false,
    val aspectRatio: Pair<Int, Int> = Pair(16, 9),
    val showDetectionOverlay: Boolean = true
)

data class TvControlState(
    val connectionState: TvConnectionState,
    val availableDevices: List<TvDevice> = emptyList(),
    val isDiscovering: Boolean = false
)

// ============= ViewModel Interfaces =============

/**
 * Interface: Main Screen ViewModel
 * Responsibility: Manage main video display and detection
 */
interface IMainViewModel {
    // Observable state
    fun getVideoDisplayState(): LiveData<VideoDisplayState>
    fun getCameraState(): LiveData<CameraState>
    fun getDetectorState(): LiveData<DetectorState>
    fun getPipState(): LiveData<PipState>

    // Camera actions
    suspend fun startCamera()
    suspend fun stopCamera()
    suspend fun switchCamera(deviceId: String)

    // Detector actions
    suspend fun startDetection()
    suspend fun stopDetection()
    suspend fun swapModel(modelPath: String)

    // PiP actions
    fun enablePip()
    fun disablePip()
    fun updatePipAspectRatio(width: Int, height: Int)
    fun toggleDetectionOverlay()

    // Lifecycle
    fun onResume()
    fun onPause()
    fun onDestroy()
}

/**
 * Interface: TV Control ViewModel
 * Responsibility: Manage TV device discovery and control
 */
interface ITvControlViewModel {
    // Observable state
    fun getTvControlState(): LiveData<TvControlState>

    // Discovery actions
    suspend fun startDiscovery()
    fun stopDiscovery()

    // Connection actions
    suspend fun connectToDevice(device: TvDevice): Boolean
    suspend fun disconnect()

    // Control actions
    suspend fun sendPowerToggle(): Boolean
    suspend fun sendVolumeUp(): Boolean
    suspend fun sendVolumeDown(): Boolean
    suspend fun sendChannelUp(): Boolean
    suspend fun sendChannelDown(): Boolean
    suspend fun sendMute(): Boolean

    // Lifecycle
    fun onDestroy()
}

/**
 * Interface: Settings ViewModel
 * Responsibility: Manage app settings and configuration
 */
interface ISettingsViewModel {
    data class Settings(
        val confidenceThreshold: Float = 0.8f,
        val iouThreshold: Float = 0.5f,
        val maxDetections: Int = 10,
        val enableHardwareAcceleration: Boolean = true,
        val showFps: Boolean = true,
        val enableNotifications: Boolean = false,
        val autoConnectTv: Boolean = false,
        val selectedModelPath: String = "models/ad_detector.tflite"
    )

    fun getSettings(): LiveData<Settings>
    suspend fun updateSettings(settings: Settings)
    suspend fun resetToDefaults()
}

// ============= View Interfaces (for testing) =============

/**
 * Interface: Video Display View
 * Responsibility: Display video and detection overlays
 */
interface IVideoDisplayView {
    fun showFrame(frame: Bitmap)
    fun showDetections(detections: List<AdDetection>)
    fun showFps(fps: Float)
    fun showError(message: String)
    fun enterPipMode()
    fun exitPipMode()
}

/**
 * Interface: TV Control View
 * Responsibility: Display TV control panel
 */
interface ITvControlView {
    fun showDevices(devices: List<TvDevice>)
    fun showConnectionStatus(state: TvConnectionState)
    fun showDiscovering(isDiscovering: Boolean)
    fun showError(message: String)
    fun enableControls(enabled: Boolean)
}

/**
 * Interface: Picture-in-Picture Manager
 * Responsibility: Manage PiP mode lifecycle
 */
interface IPictureInPictureManager {
    fun isPipSupported(): Boolean
    fun enterPipMode(aspectRatio: Pair<Int, Int>): Boolean
    fun exitPipMode()
    fun isPipActive(): Boolean
    fun updatePipParams(aspectRatio: Pair<Int, Int>)
}
