package com.liveaddetection.presentation

import android.graphics.Bitmap
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liveaddetection.domain.camera.CameraStatus
import com.liveaddetection.domain.camera.IUsbCameraManager
import com.liveaddetection.domain.detector.DetectorConfig
import com.liveaddetection.domain.detector.DetectorStatus
import com.liveaddetection.domain.detector.IAdDetector
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Main ViewModel Implementation
 * Single Responsibility: Manage video display and detection state
 * Follows MVVM architecture
 */
class MainViewModel(
    private val cameraManager: IUsbCameraManager,
    private val detector: IAdDetector
) : ViewModel(), IMainViewModel {

    // LiveData for observable state
    private val _videoDisplayState = MutableLiveData(VideoDisplayState())
    private val _cameraState = MutableLiveData(CameraState(CameraStatus.DISCONNECTED))
    private val _detectorState = MutableLiveData(DetectorState(DetectorStatus.UNINITIALIZED))
    private val _pipState = MutableLiveData(PipState())

    private var processingJob: Job? = null
    private var adMonitoringJob: Job? = null
    private var frameCount = 0L
    private var lastFpsTime = System.currentTimeMillis()

    // Ad detection state tracking
    @Volatile
    private var lastAdDetectionTime: Long = 0L
    @Volatile
    private var isAdCurrentlyPlaying = false
    private val adEndDelayMs = 3000L // Wait 3 seconds after last detection before exiting PiP

    override fun getVideoDisplayState(): LiveData<VideoDisplayState> = _videoDisplayState
    override fun getCameraState(): LiveData<CameraState> = _cameraState
    override fun getDetectorState(): LiveData<DetectorState> = _detectorState
    override fun getPipState(): LiveData<PipState> = _pipState

    // ========== Camera Control ==========

    override suspend fun startCamera() {
        _cameraState.postValue(_cameraState.value?.copy(status = CameraStatus.INITIALIZING))

        viewModelScope.launch(Dispatchers.IO) {
            try {
                // Detect and open first available camera
                val devices = cameraManager.detectUvcDevices()
                if (devices.isEmpty()) {
                    _cameraState.postValue(CameraState(CameraStatus.ERROR))
                    return@launch
                }

                val device = devices.first()
                val success = cameraManager.openCamera(device)

                if (success) {
                    val resolution = cameraManager.getCurrentResolution()
                    _cameraState.postValue(
                        CameraState(
                            status = CameraStatus.READY,
                            deviceName = device.deviceName,
                            resolution = "${resolution.width}x${resolution.height}"
                        )
                    )

                    // Start frame capture
                    startFrameCapture()
                } else {
                    _cameraState.postValue(CameraState(CameraStatus.ERROR))
                }
            } catch (e: Exception) {
                _cameraState.postValue(CameraState(CameraStatus.ERROR))
            }
        }
    }

    override suspend fun stopCamera() {
        processingJob?.cancel()
        cameraManager.closeCamera()
        _cameraState.postValue(CameraState(CameraStatus.DISCONNECTED))
        _videoDisplayState.postValue(_videoDisplayState.value?.copy(isProcessing = false))
    }

    override suspend fun switchCamera(deviceId: String) {
        stopCamera()

        viewModelScope.launch(Dispatchers.IO) {
            try {
                _cameraState.postValue(_cameraState.value?.copy(status = CameraStatus.INITIALIZING))

                // Find device by ID
                val devices = cameraManager.detectUvcDevices()
                val device = devices.find { it.deviceName == deviceId }

                if (device == null) {
                    _cameraState.postValue(CameraState(CameraStatus.ERROR))
                    return@launch
                }

                // Open specific device
                val success = cameraManager.openCamera(device)

                if (success) {
                    val resolution = cameraManager.getCurrentResolution()
                    _cameraState.postValue(
                        CameraState(
                            status = CameraStatus.READY,
                            deviceName = device.deviceName,
                            resolution = "${resolution.width}x${resolution.height}"
                        )
                    )
                    startFrameCapture()
                } else {
                    _cameraState.postValue(CameraState(CameraStatus.ERROR))
                }
            } catch (e: Exception) {
                _cameraState.postValue(CameraState(CameraStatus.ERROR))
            }
        }
    }

    // ========== Detection Control ==========

    override suspend fun startDetection() {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                _detectorState.postValue(
                    _detectorState.value?.copy(status = DetectorStatus.INITIALIZING)
                )

                val config = DetectorConfig(
                    confidenceThreshold = 0.8f,
                    iouThreshold = 0.5f,
                    maxDetections = 10
                )

                val success = detector.initialize("models/ad_detector.tflite", config)

                if (success) {
                    _detectorState.postValue(
                        DetectorState(
                            status = DetectorStatus.READY,
                            modelName = "ad_detector.tflite"
                        )
                    )

                    // If camera is capturing, start processing
                    if (_cameraState.value?.status == CameraStatus.CAPTURING) {
                        _videoDisplayState.postValue(
                            _videoDisplayState.value?.copy(isProcessing = true)
                        )
                    }

                    // Start ad monitoring for automatic PiP
                    startAdMonitoring()
                } else {
                    _detectorState.postValue(
                        DetectorState(status = DetectorStatus.ERROR)
                    )
                }
            } catch (e: Exception) {
                _detectorState.postValue(DetectorState(status = DetectorStatus.ERROR))
            }
        }
    }

    override suspend fun stopDetection() {
        _videoDisplayState.postValue(_videoDisplayState.value?.copy(isProcessing = false))
        adMonitoringJob?.cancel()
        detector.release()
        _detectorState.postValue(DetectorState(DetectorStatus.UNINITIALIZED))
    }

    override suspend fun swapModel(modelPath: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val success = detector.swapModel(modelPath)
            if (success) {
                val modelName = modelPath.substringAfterLast("/")
                _detectorState.postValue(
                    _detectorState.value?.copy(modelName = modelName)
                )
            }
        }
    }

    // ========== PiP Control ==========

    override fun enablePip() {
        _pipState.postValue(_pipState.value?.copy(enabled = true))
    }

    override fun disablePip() {
        _pipState.postValue(_pipState.value?.copy(enabled = false))
    }

    override fun updatePipAspectRatio(width: Int, height: Int) {
        _pipState.postValue(
            _pipState.value?.copy(aspectRatio = Pair(width, height))
        )
    }

    override fun toggleDetectionOverlay() {
        val currentValue = _pipState.value?.showDetectionOverlay ?: true
        _pipState.postValue(
            _pipState.value?.copy(showDetectionOverlay = !currentValue)
        )
    }

    // ========== Frame Processing ==========

    private fun startFrameCapture() {
        processingJob = viewModelScope.launch(Dispatchers.IO) {
            cameraManager.startCapture(30) { frame ->
                if (!isActive) return@startCapture

                processFrame(frame)
            }

            _cameraState.postValue(
                _cameraState.value?.copy(status = CameraStatus.CAPTURING)
            )
        }
    }

    private suspend fun processFrame(frame: Bitmap) {
        // Update FPS
        frameCount++
        val currentTime = System.currentTimeMillis()
        val elapsedTime = currentTime - lastFpsTime

        if (elapsedTime >= 1000) {
            val fps = (frameCount * 1000f) / elapsedTime
            _cameraState.postValue(_cameraState.value?.copy(fps = fps))

            frameCount = 0
            lastFpsTime = currentTime
        }

        // Run detection if enabled
        val detections = if (_videoDisplayState.value?.isProcessing == true &&
            detector.getStatus() == DetectorStatus.READY
        ) {
            val result = detector.detect(frame)

            // Update metrics
            val metrics = detector.getMetrics()
            _detectorState.postValue(
                _detectorState.value?.copy(
                    averageInferenceMs = metrics.averageInferenceTimeMs,
                    totalDetections = metrics.totalDetections
                )
            )

            result.detections
        } else {
            emptyList()
        }

        // ========== AUTOMATIC PiP BASED ON AD DETECTION ==========
        if (detections.isNotEmpty()) {
            // Ad detected! Update last detection time
            lastAdDetectionTime = currentTime

            // Enter PiP if not already in PiP
            if (!isAdCurrentlyPlaying) {
                isAdCurrentlyPlaying = true
                enablePip()
            }
        }
        // Note: Ad ending is handled by adMonitoringJob (checks periodically)

        // Update display state
        _videoDisplayState.postValue(
            VideoDisplayState(
                frame = frame,
                detections = detections,
                fps = _cameraState.value?.fps ?: 0f,
                isProcessing = _videoDisplayState.value?.isProcessing ?: false
            )
        )
    }

    // ========== Ad Monitoring for Automatic PiP ==========

    /**
     * Monitors ad detection state and automatically exits PiP when ad ends
     */
    private fun startAdMonitoring() {
        adMonitoringJob?.cancel()

        adMonitoringJob = viewModelScope.launch(Dispatchers.IO) {
            while (isActive) {
                kotlinx.coroutines.delay(500) // Check every 500ms

                val currentTime = System.currentTimeMillis()
                val timeSinceLastDetection = currentTime - lastAdDetectionTime

                // If ad was playing and no detection for adEndDelayMs, exit PiP
                if (isAdCurrentlyPlaying && timeSinceLastDetection > adEndDelayMs) {
                    isAdCurrentlyPlaying = false
                    disablePip()
                }
            }
        }
    }

    // ========== Lifecycle ==========

    override fun onResume() {
        // Resume if previously active
        val cameraStatus = _cameraState.value?.status
        if (cameraStatus == CameraStatus.READY || cameraStatus == CameraStatus.CAPTURING) {
            viewModelScope.launch {
                startCamera()
            }
        }
    }

    override fun onPause() {
        // Pause processing but don't destroy resources
        _videoDisplayState.postValue(_videoDisplayState.value?.copy(isProcessing = false))
        processingJob?.cancel()
    }

    override fun onDestroy() {
        processingJob?.cancel()
        adMonitoringJob?.cancel()
        viewModelScope.launch {
            cameraManager.closeCamera()
            detector.release()
        }
    }

    override fun onCleared() {
        super.onCleared()
        onDestroy()
    }
}
