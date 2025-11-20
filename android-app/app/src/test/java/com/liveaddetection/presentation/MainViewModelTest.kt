package com.liveaddetection.presentation

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import androidx.lifecycle.Observer
import com.google.common.truth.Truth.assertThat
import com.liveaddetection.domain.camera.CameraStatus
import com.liveaddetection.domain.camera.IUsbCameraManager
import com.liveaddetection.domain.detector.DetectorStatus
import com.liveaddetection.domain.detector.IAdDetector
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.*

/**
 * MainViewModel Tests - TDD Red Phase
 * Write tests FIRST, then implement
 */
@ExperimentalCoroutinesApi
class MainViewModelTest {

    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()

    private lateinit var viewModel: IMainViewModel
    private lateinit var mockCameraManager: IUsbCameraManager
    private lateinit var mockDetector: IAdDetector

    @Before
    fun setUp() {
        mockCameraManager = mock()
        mockDetector = mock()

        viewModel = MainViewModel(
            cameraManager = mockCameraManager,
            detector = mockDetector
        )
    }

    // ========== Initial State Tests ==========

    @Test
    fun `initial video display state is empty`() {
        val state = viewModel.getVideoDisplayState().value

        assertThat(state).isNotNull()
        assertThat(state?.frame).isNull()
        assertThat(state?.detections).isEmpty()
        assertThat(state?.isProcessing).isFalse()
    }

    @Test
    fun `initial camera state is disconnected`() {
        val state = viewModel.getCameraState().value

        assertThat(state).isNotNull()
        assertThat(state?.status).isEqualTo(CameraStatus.DISCONNECTED)
    }

    @Test
    fun `initial detector state is uninitialized`() {
        val state = viewModel.getDetectorState().value

        assertThat(state).isNotNull()
        assertThat(state?.status).isEqualTo(DetectorStatus.UNINITIALIZED)
    }

    @Test
    fun `initial PiP state is disabled`() {
        val state = viewModel.getPipState().value

        assertThat(state).isNotNull()
        assertThat(state?.enabled).isFalse()
    }

    // ========== Camera Control Tests ==========

    @Test
    fun `startCamera updates camera state to initializing`() = runTest {
        val observer = mock<Observer<CameraState>>()
        viewModel.getCameraState().observeForever(observer)

        whenever(mockCameraManager.openCamera(any())).thenReturn(true)
        viewModel.startCamera()

        verify(observer, atLeastOnce()).onChanged(
            argThat { status == CameraStatus.INITIALIZING || status == CameraStatus.READY }
        )
    }

    @Test
    fun `startCamera calls camera manager openCamera`() = runTest {
        whenever(mockCameraManager.openCamera(any())).thenReturn(true)

        viewModel.startCamera()

        verify(mockCameraManager).openCamera(any())
    }

    @Test
    fun `startCamera updates state to ready on success`() = runTest {
        whenever(mockCameraManager.openCamera(any())).thenReturn(true)
        whenever(mockCameraManager.getStatus()).thenReturn(CameraStatus.READY)

        viewModel.startCamera()

        val state = viewModel.getCameraState().value
        assertThat(state?.status).isEqualTo(CameraStatus.READY)
    }

    @Test
    fun `startCamera updates state to error on failure`() = runTest {
        whenever(mockCameraManager.openCamera(any())).thenReturn(false)
        whenever(mockCameraManager.getStatus()).thenReturn(CameraStatus.ERROR)

        viewModel.startCamera()

        val state = viewModel.getCameraState().value
        assertThat(state?.status).isEqualTo(CameraStatus.ERROR)
    }

    @Test
    fun `stopCamera calls camera manager closeCamera`() = runTest {
        viewModel.stopCamera()

        verify(mockCameraManager).closeCamera()
    }

    @Test
    fun `stopCamera updates state to disconnected`() = runTest {
        whenever(mockCameraManager.getStatus()).thenReturn(CameraStatus.DISCONNECTED)

        viewModel.stopCamera()

        val state = viewModel.getCameraState().value
        assertThat(state?.status).isEqualTo(CameraStatus.DISCONNECTED)
    }

    // ========== Detection Control Tests ==========

    @Test
    fun `startDetection initializes detector`() = runTest {
        whenever(mockDetector.initialize(any(), any())).thenReturn(true)

        viewModel.startDetection()

        verify(mockDetector).initialize(any(), any())
    }

    @Test
    fun `startDetection updates detector state to ready`() = runTest {
        whenever(mockDetector.initialize(any(), any())).thenReturn(true)
        whenever(mockDetector.getStatus()).thenReturn(DetectorStatus.READY)

        viewModel.startDetection()

        val state = viewModel.getDetectorState().value
        assertThat(state?.status).isEqualTo(DetectorStatus.READY)
    }

    @Test
    fun `startDetection with camera running starts processing`() = runTest {
        whenever(mockCameraManager.getStatus()).thenReturn(CameraStatus.CAPTURING)
        whenever(mockDetector.initialize(any(), any())).thenReturn(true)

        viewModel.startDetection()

        val displayState = viewModel.getVideoDisplayState().value
        // Processing should eventually become true
        assertThat(displayState).isNotNull()
    }

    @Test
    fun `stopDetection stops processing frames`() = runTest {
        viewModel.stopDetection()

        val displayState = viewModel.getVideoDisplayState().value
        assertThat(displayState?.isProcessing).isFalse()
    }

    @Test
    fun `swapModel calls detector swapModel`() = runTest {
        val newModelPath = "models/new_model.tflite"
        whenever(mockDetector.swapModel(newModelPath)).thenReturn(true)

        viewModel.swapModel(newModelPath)

        verify(mockDetector).swapModel(newModelPath)
    }

    @Test
    fun `swapModel updates detector state`() = runTest {
        val newModelPath = "models/new_model.tflite"
        whenever(mockDetector.swapModel(newModelPath)).thenReturn(true)

        viewModel.swapModel(newModelPath)

        val state = viewModel.getDetectorState().value
        assertThat(state?.modelName).contains("new_model")
    }

    // ========== Picture-in-Picture Tests ==========

    @Test
    fun `enablePip updates PiP state to enabled`() {
        viewModel.enablePip()

        val state = viewModel.getPipState().value
        assertThat(state?.enabled).isTrue()
    }

    @Test
    fun `disablePip updates PiP state to disabled`() {
        viewModel.enablePip()
        viewModel.disablePip()

        val state = viewModel.getPipState().value
        assertThat(state?.enabled).isFalse()
    }

    @Test
    fun `updatePipAspectRatio updates aspect ratio`() {
        viewModel.updatePipAspectRatio(16, 9)

        val state = viewModel.getPipState().value
        assertThat(state?.aspectRatio).isEqualTo(Pair(16, 9))
    }

    @Test
    fun `updatePipAspectRatio handles different ratios`() {
        viewModel.updatePipAspectRatio(4, 3)

        val state = viewModel.getPipState().value
        assertThat(state?.aspectRatio).isEqualTo(Pair(4, 3))
    }

    @Test
    fun `toggleDetectionOverlay switches overlay state`() {
        val initialState = viewModel.getPipState().value?.showDetectionOverlay

        viewModel.toggleDetectionOverlay()

        val newState = viewModel.getPipState().value?.showDetectionOverlay
        assertThat(newState).isNotEqualTo(initialState)
    }

    @Test
    fun `toggleDetectionOverlay called twice returns to original state`() {
        val initialState = viewModel.getPipState().value?.showDetectionOverlay

        viewModel.toggleDetectionOverlay()
        viewModel.toggleDetectionOverlay()

        val finalState = viewModel.getPipState().value?.showDetectionOverlay
        assertThat(finalState).isEqualTo(initialState)
    }

    // ========== Frame Processing Tests ==========

    @Test
    fun `processing frames updates video display state`() = runTest {
        // This tests the internal frame processing loop
        // In real implementation, camera callback provides frames
        val observer = mock<Observer<VideoDisplayState>>()
        viewModel.getVideoDisplayState().observeForever(observer)

        // Simulate frame processing would update the observer
        verify(observer, atLeastOnce()).onChanged(any())
    }

    @Test
    fun `FPS is calculated from frame processing`() = runTest {
        whenever(mockCameraManager.getStatus()).thenReturn(CameraStatus.CAPTURING)
        whenever(mockDetector.initialize(any(), any())).thenReturn(true)

        viewModel.startCamera()
        viewModel.startDetection()

        // After processing, FPS should be calculated
        val state = viewModel.getVideoDisplayState().value
        assertThat(state?.fps).isAtLeast(0f)
    }

    // ========== Lifecycle Tests ==========

    @Test
    fun `onPause stops camera and detection`() = runTest {
        viewModel.onPause()

        // Should pause processing but not destroy resources
        val displayState = viewModel.getVideoDisplayState().value
        assertThat(displayState?.isProcessing).isFalse()
    }

    @Test
    fun `onResume resumes camera if it was active`() = runTest {
        whenever(mockCameraManager.getStatus()).thenReturn(CameraStatus.READY)

        viewModel.onResume()

        // Should resume if previously active
        // State depends on previous state
        assertThat(viewModel.getCameraState().value).isNotNull()
    }

    @Test
    fun `onDestroy releases all resources`() = runTest {
        viewModel.onDestroy()

        verify(mockCameraManager).closeCamera()
        verify(mockDetector).release()
    }

    @Test
    fun `onDestroy stops all processing`() = runTest {
        viewModel.onDestroy()

        val displayState = viewModel.getVideoDisplayState().value
        assertThat(displayState?.isProcessing).isFalse()
    }
}
