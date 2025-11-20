package com.liveaddetection

import android.Manifest
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Bundle
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.liveaddetection.domain.camera.UsbCameraManager
import com.liveaddetection.domain.detector.*
import com.liveaddetection.domain.tv.*
import com.liveaddetection.presentation.*
import kotlinx.coroutines.launch

/**
 * Main Activity
 * - Displays fullscreen USB camera feed
 * - Shows detection overlay with bounding boxes
 * - Supports Picture-in-Picture mode
 * - Integrates with TV control
 */
class MainActivity : ComponentActivity() {

    private lateinit var mainViewModel: MainViewModel
    private lateinit var tvControlViewModel: TvControlViewModel
    private lateinit var pipManager: PictureInPictureManager

    // Request camera permission
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            startCamera()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize managers
        initializeComponents()

        // Set fullscreen flags
        window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                )

        // Check camera permission
        checkCameraPermission()

        // Observe states
        observeStates()
    }

    private fun initializeComponents() {
        // Initialize PiP manager
        pipManager = PictureInPictureManager(this)

        // Initialize domain components
        val cameraManager = UsbCameraManager(this)

        val commandMapper = TvCommandMapper()
        val bluetoothController = BluetoothTvController(commandMapper, this)
        val networkController = NetworkTvController(commandMapper)
        val cecController = CecTvController(commandMapper)
        val connectionManager = TvConnectionManager(
            bluetoothController,
            networkController,
            cecController
        )
        val deviceDiscovery = TvDeviceDiscovery(this)
        val tvController = TvController(
            deviceDiscovery,
            connectionManager,
            bluetoothController,
            networkController,
            cecController
        )

        // Create detector components with dependency injection
        val modelLoader = ModelLoader(this)
        val preprocessor = FramePreprocessor()
        val parser = DetectionParser()
        val accelerator = HardwareAccelerator()
        val detector = TFLiteDetector(
            modelLoader,
            preprocessor,
            parser,
            accelerator
        )

        // Initialize ViewModels
        mainViewModel = MainViewModel(cameraManager, detector)
        tvControlViewModel = TvControlViewModel(tvController)
    }

    private fun checkCameraPermission() {
        when {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED -> {
                startCamera()
            }
            else -> {
                requestPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }
    }

    private fun startCamera() {
        lifecycleScope.launch {
            mainViewModel.startCamera()
            mainViewModel.startDetection()
        }
    }

    private fun observeStates() {
        // Observe video display state
        mainViewModel.getVideoDisplayState().observe(this) { state ->
            // Update UI with frame and detections
            // In a real app, this would render to SurfaceView or TextureView
        }

        // Observe camera state
        mainViewModel.getCameraState().observe(this) { state ->
            // Update camera status UI
        }

        // Observe detector state
        mainViewModel.getDetectorState().observe(this) { state ->
            // Update detection status UI
        }

        // Observe PiP state
        mainViewModel.getPipState().observe(this) { state ->
            if (state.enabled && !pipManager.isPipActive()) {
                pipManager.enterPipMode(state.aspectRatio)
            }
        }

        // Observe TV control state
        tvControlViewModel.getTvControlState().observe(this) { state ->
            // Update TV control UI
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)

        pipManager.onPipModeChanged(isInPictureInPictureMode)

        if (isInPictureInPictureMode) {
            // Hide controls in PiP mode
            mainViewModel.disablePip()
        } else {
            // Show controls in fullscreen mode
        }
    }

    override fun onResume() {
        super.onResume()
        mainViewModel.onResume()
    }

    override fun onPause() {
        super.onPause()
        mainViewModel.onPause()
    }

    override fun onDestroy() {
        super.onDestroy()
        mainViewModel.onDestroy()
        tvControlViewModel.onDestroy()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()

        // Enter PiP when user navigates away (e.g., home button)
        if (pipManager.isPipSupported()) {
            mainViewModel.enablePip()
        }
    }
}
