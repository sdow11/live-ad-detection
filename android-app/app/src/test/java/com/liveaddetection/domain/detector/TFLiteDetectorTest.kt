package com.liveaddetection.domain.detector

import android.content.Context
import android.graphics.Bitmap
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.*
import org.robolectric.RobolectricTestRunner

/**
 * TFLite Detector Tests - TDD + SOLID
 * Tests written BEFORE implementation
 *
 * SOLID Principles Applied:
 * - Single Responsibility: Each test tests one behavior
 * - Dependency Inversion: Tests use interfaces, not concrete classes
 * - Interface Segregation: Tests verify each interface independently
 */
@RunWith(RobolectricTestRunner::class)
class TFLiteDetectorTest {

    private lateinit var context: Context
    private lateinit var detector: IAdDetector

    // Mocked dependencies (Dependency Inversion)
    private lateinit var mockModelLoader: IModelLoader
    private lateinit var mockPreprocessor: IFramePreprocessor
    private lateinit var mockParser: IDetectionParser
    private lateinit var mockAccelerator: IHardwareAccelerator

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()

        // Create mocks for dependencies
        mockModelLoader = mock()
        mockPreprocessor = mock()
        mockParser = mock()
        mockAccelerator = mock()

        // Create detector with injected dependencies (Dependency Inversion Principle)
        detector = TFLiteDetector(
            context = context,
            modelLoader = mockModelLoader,
            preprocessor = mockPreprocessor,
            parser = mockParser,
            accelerator = mockAccelerator
        )
    }

    // ===== INITIALIZATION TESTS =====

    @Test
    fun `initialize loads model successfully`() = runBlocking {
        // Given
        val modelPath = "models/ad_detector.tflite"
        val modelInfo = createMockModelInfo(modelPath)

        whenever(mockModelLoader.loadFromAsset(modelPath)).thenReturn(modelInfo)
        whenever(mockModelLoader.validateModel(modelInfo)).thenReturn(true)

        val config = DetectorConfig(confidenceThreshold = 0.8f)

        // When
        val result = detector.initialize(modelPath, config)

        // Then
        assertThat(result).isTrue()
        assertThat(detector.getStatus()).isEqualTo(DetectorStatus.READY)

        verify(mockModelLoader).loadFromAsset(modelPath)
        verify(mockModelLoader).validateModel(modelInfo)
    }

    @Test
    fun `initialize fails with invalid model`() = runBlocking {
        // Given
        val modelPath = "models/invalid.tflite"
        val modelInfo = createMockModelInfo(modelPath)

        whenever(mockModelLoader.loadFromAsset(modelPath)).thenReturn(modelInfo)
        whenever(mockModelLoader.validateModel(modelInfo)).thenReturn(false)

        val config = DetectorConfig()

        // When
        val result = detector.initialize(modelPath, config)

        // Then
        assertThat(result).isFalse()
        assertThat(detector.getStatus()).isEqualTo(DetectorStatus.ERROR)
    }

    @Test
    fun `initialize with NNAPI when available`() = runBlocking {
        // Given
        val modelPath = "models/ad_detector.tflite"
        val modelInfo = createMockModelInfo(modelPath)

        whenever(mockModelLoader.loadFromAsset(modelPath)).thenReturn(modelInfo)
        whenever(mockModelLoader.validateModel(modelInfo)).thenReturn(true)
        whenever(mockAccelerator.isNnapiAvailable()).thenReturn(true)
        whenever(mockAccelerator.getRecommendedAcceleration()).thenReturn(AccelerationType.NNAPI)

        val config = DetectorConfig(accelerationType = AccelerationType.AUTO)

        // When
        val result = detector.initialize(modelPath, config)

        // Then
        assertThat(result).isTrue()
        verify(mockAccelerator).isNnapiAvailable()
    }

    @Test
    fun `initialize fallback to CPU when NNAPI unavailable`() = runBlocking {
        // Given
        val modelPath = "models/ad_detector.tflite"
        val modelInfo = createMockModelInfo(modelPath)

        whenever(mockModelLoader.loadFromAsset(modelPath)).thenReturn(modelInfo)
        whenever(mockModelLoader.validateModel(modelInfo)).thenReturn(true)
        whenever(mockAccelerator.isNnapiAvailable()).thenReturn(false)
        whenever(mockAccelerator.isGpuAvailable()).thenReturn(false)
        whenever(mockAccelerator.getRecommendedAcceleration()).thenReturn(AccelerationType.CPU)

        val config = DetectorConfig(accelerationType = AccelerationType.AUTO)

        // When
        val result = detector.initialize(modelPath, config)

        // Then
        assertThat(result).isTrue()
        verify(mockAccelerator).getRecommendedAcceleration()
    }

    // ===== DETECTION TESTS =====

    @Test
    fun `detect returns detections above confidence threshold`() = runBlocking {
        // Given
        initializeDetector()
        val frame = createMockBitmap(1920, 1080)

        val preprocessed = FloatArray(1920 * 1080 * 3)
        whenever(mockPreprocessor.preprocess(any(), any(), any())).thenReturn(preprocessed)

        val detections = listOf(
            AdDetection("1", "commercial", 0.95f, BoundingBox(100f, 100f, 200f, 200f)),
            AdDetection("2", "banner", 0.85f, BoundingBox(300f, 300f, 400f, 400f))
        )
        whenever(mockParser.parse(any(), any(), any(), any())).thenReturn(detections)

        // When
        val result = detector.detect(frame)

        // Then
        assertThat(result.detections).hasSize(2)
        assertThat(result.detections[0].confidence).isEqualTo(0.95f)
        assertThat(result.detections[1].confidence).isEqualTo(0.85f)

        verify(mockPreprocessor).preprocess(eq(frame), any(), any())
        verify(mockParser).parse(any(), eq(0.8f), eq(1920), eq(1080))
    }

    @Test
    fun `detect filters detections below threshold`() = runBlocking {
        // Given
        initializeDetector()
        val frame = createMockBitmap(1920, 1080)

        whenever(mockPreprocessor.preprocess(any(), any(), any())).thenReturn(FloatArray(1920 * 1080 * 3))

        val allDetections = listOf(
            AdDetection("1", "commercial", 0.95f, BoundingBox(100f, 100f, 200f, 200f)),
            AdDetection("2", "banner", 0.75f, BoundingBox(300f, 300f, 400f, 400f)), // Below threshold
            AdDetection("3", "overlay", 0.85f, BoundingBox(500f, 500f, 600f, 600f))
        )

        val filteredDetections = allDetections.filter { it.confidence >= 0.8f }

        whenever(mockParser.parse(any(), any(), any(), any())).thenReturn(allDetections)
        whenever(mockParser.filter(allDetections, 0.8f)).thenReturn(filteredDetections)

        // When
        val result = detector.detect(frame)

        // Then
        assertThat(result.detections).hasSize(2)
        assertThat(result.detections.all { it.confidence >= 0.8f }).isTrue()
    }

    @Test
    fun `detect applies NMS to remove overlapping detections`() = runBlocking {
        // Given
        initializeDetector()
        val frame = createMockBitmap(1920, 1080)

        whenever(mockPreprocessor.preprocess(any(), any(), any())).thenReturn(FloatArray(1920 * 1080 * 3))

        val overlappingDetections = listOf(
            AdDetection("1", "commercial", 0.95f, BoundingBox(100f, 100f, 200f, 200f)),
            AdDetection("2", "commercial", 0.85f, BoundingBox(110f, 110f, 210f, 210f)) // Overlaps with #1
        )

        val nmsDetections = listOf(overlappingDetections[0]) // Keep highest confidence

        whenever(mockParser.parse(any(), any(), any(), any())).thenReturn(overlappingDetections)
        whenever(mockParser.filter(any(), any())).thenReturn(overlappingDetections)
        whenever(mockParser.applyNMS(overlappingDetections, 0.5f)).thenReturn(nmsDetections)

        // When
        val result = detector.detect(frame)

        // Then
        assertThat(result.detections).hasSize(1)
        assertThat(result.detections[0].id).isEqualTo("1")

        verify(mockParser).applyNMS(overlappingDetections, 0.5f)
    }

    @Test
    fun `detect tracks inference time`() = runBlocking {
        // Given
        initializeDetector()
        val frame = createMockBitmap(1920, 1080)

        whenever(mockPreprocessor.preprocess(any(), any(), any())).thenReturn(FloatArray(1920 * 1080 * 3))
        whenever(mockParser.parse(any(), any(), any(), any())).thenReturn(emptyList())

        // When
        val result = detector.detect(frame)

        // Then
        assertThat(result.inferenceTimeMs).isGreaterThan(0)
        assertThat(result.totalTimeMs).isGreaterThan(0)
        assertThat(result.totalTimeMs).isEqualTo(
            result.preprocessTimeMs + result.inferenceTimeMs + result.postprocessTimeMs
        )
    }

    @Test
    fun `detect fails when not initialized`() = runBlocking {
        // Given - detector NOT initialized

        // When/Then
        try {
            detector.detect(createMockBitmap(1920, 1080))
            assertThat(false).isTrue() // Should not reach here
        } catch (e: IllegalStateException) {
            assertThat(e.message).contains("not initialized")
        }
    }

    // ===== BATCH DETECTION TESTS =====

    @Test
    fun `detectBatch processes multiple frames`() = runBlocking {
        // Given
        initializeDetector()
        val frames = listOf(
            createMockBitmap(1920, 1080),
            createMockBitmap(1920, 1080),
            createMockBitmap(1920, 1080)
        )

        whenever(mockPreprocessor.preprocess(any(), any(), any())).thenReturn(FloatArray(1920 * 1080 * 3))
        whenever(mockParser.parse(any(), any(), any(), any())).thenReturn(emptyList())

        // When
        val results = detector.detectBatch(frames)

        // Then
        assertThat(results).hasSize(3)
        verify(mockPreprocessor, times(3)).preprocess(any(), any(), any())
    }

    @Test
    fun `detectBatch is faster than individual detects (batching optimization)`() = runBlocking {
        // Given
        initializeDetector()
        val frames = listOf(
            createMockBitmap(1920, 1080),
            createMockBitmap(1920, 1080),
            createMockBitmap(1920, 1080)
        )

        whenever(mockPreprocessor.preprocess(any(), any(), any())).thenReturn(FloatArray(1920 * 1080 * 3))
        whenever(mockParser.parse(any(), any(), any(), any())).thenReturn(emptyList())

        // When
        val batchStart = System.currentTimeMillis()
        val batchResults = detector.detectBatch(frames)
        val batchTime = System.currentTimeMillis() - batchStart

        val individualStart = System.currentTimeMillis()
        val individualResults = frames.map { detector.detect(it) }
        val individualTime = System.currentTimeMillis() - individualStart

        // Then
        assertThat(batchResults).hasSize(3)
        assertThat(individualResults).hasSize(3)
        // Batch should be faster (or at least not slower)
        assertThat(batchTime).isAtMost(individualTime)
    }

    // ===== MODEL SWAPPING TESTS =====

    @Test
    fun `swapModel replaces model without stopping detector`() = runBlocking {
        // Given
        initializeDetector()

        val newModelPath = "models/ad_detector_v2.tflite"
        val newModelInfo = createMockModelInfo(newModelPath)

        whenever(mockModelLoader.loadFromAsset(newModelPath)).thenReturn(newModelInfo)
        whenever(mockModelLoader.validateModel(newModelInfo)).thenReturn(true)

        // When
        val result = detector.swapModel(newModelPath)

        // Then
        assertThat(result).isTrue()
        assertThat(detector.getStatus()).isEqualTo(DetectorStatus.READY)

        verify(mockModelLoader).loadFromAsset(newModelPath)
    }

    @Test
    fun `swapModel can be called while detecting`() = runBlocking {
        // Given
        initializeDetector()

        whenever(mockPreprocessor.preprocess(any(), any(), any())).thenReturn(FloatArray(1920 * 1080 * 3))
        whenever(mockParser.parse(any(), any(), any(), any())).thenReturn(emptyList())

        val newModelPath = "models/ad_detector_v2.tflite"
        val newModelInfo = createMockModelInfo(newModelPath)
        whenever(mockModelLoader.loadFromAsset(newModelPath)).thenReturn(newModelInfo)
        whenever(mockModelLoader.validateModel(newModelInfo)).thenReturn(true)

        // When - detect and swap concurrently
        detector.detect(createMockBitmap(1920, 1080))
        val swapResult = detector.swapModel(newModelPath)

        // Then
        assertThat(swapResult).isTrue()
        // Detector should still be usable
        val detectResult = detector.detect(createMockBitmap(1920, 1080))
        assertThat(detectResult).isNotNull()
    }

    @Test
    fun `swapModel increments model swap counter`() = runBlocking {
        // Given
        initializeDetector()

        val initialMetrics = detector.getMetrics()
        val initialSwaps = initialMetrics.modelSwaps

        val newModelPath = "models/ad_detector_v2.tflite"
        val newModelInfo = createMockModelInfo(newModelPath)
        whenever(mockModelLoader.loadFromAsset(newModelPath)).thenReturn(newModelInfo)
        whenever(mockModelLoader.validateModel(newModelInfo)).thenReturn(true)

        // When
        detector.swapModel(newModelPath)
        val newMetrics = detector.getMetrics()

        // Then
        assertThat(newMetrics.modelSwaps).isEqualTo(initialSwaps + 1)
    }

    // ===== METRICS TESTS =====

    @Test
    fun `getMetrics tracks total frames processed`() = runBlocking {
        // Given
        initializeDetector()

        whenever(mockPreprocessor.preprocess(any(), any(), any())).thenReturn(FloatArray(1920 * 1080 * 3))
        whenever(mockParser.parse(any(), any(), any(), any())).thenReturn(emptyList())

        // When
        repeat(5) {
            detector.detect(createMockBitmap(1920, 1080))
        }

        val metrics = detector.getMetrics()

        // Then
        assertThat(metrics.totalFramesProcessed).isEqualTo(5)
    }

    @Test
    fun `getMetrics tracks total detections`() = runBlocking {
        // Given
        initializeDetector()

        whenever(mockPreprocessor.preprocess(any(), any(), any())).thenReturn(FloatArray(1920 * 1080 * 3))

        // First frame: 2 detections
        val detections1 = listOf(
            AdDetection("1", "commercial", 0.95f, BoundingBox(100f, 100f, 200f, 200f)),
            AdDetection("2", "banner", 0.85f, BoundingBox(300f, 300f, 400f, 400f))
        )
        // Second frame: 1 detection
        val detections2 = listOf(
            AdDetection("3", "overlay", 0.90f, BoundingBox(500f, 500f, 600f, 600f))
        )

        whenever(mockParser.parse(any(), any(), any(), any()))
            .thenReturn(detections1)
            .thenReturn(detections2)

        // When
        detector.detect(createMockBitmap(1920, 1080))
        detector.detect(createMockBitmap(1920, 1080))

        val metrics = detector.getMetrics()

        // Then
        assertThat(metrics.totalDetections).isEqualTo(3)
    }

    @Test
    fun `getMetrics calculates average inference time`() = runBlocking {
        // Given
        initializeDetector()

        whenever(mockPreprocessor.preprocess(any(), any(), any())).thenReturn(FloatArray(1920 * 1080 * 3))
        whenever(mockParser.parse(any(), any(), any(), any())).thenReturn(emptyList())

        // When
        repeat(10) {
            detector.detect(createMockBitmap(1920, 1080))
        }

        val metrics = detector.getMetrics()

        // Then
        assertThat(metrics.averageInferenceTimeMs).isGreaterThan(0f)
        assertThat(metrics.averageFps).isGreaterThan(0f)
    }

    // ===== RESOURCE CLEANUP TESTS =====

    @Test
    fun `release stops detector and frees resources`() = runBlocking {
        // Given
        initializeDetector()

        // When
        detector.release()

        // Then
        assertThat(detector.getStatus()).isEqualTo(DetectorStatus.UNINITIALIZED)

        // Should not be able to detect after release
        try {
            detector.detect(createMockBitmap(1920, 1080))
            assertThat(false).isTrue() // Should not reach here
        } catch (e: IllegalStateException) {
            assertThat(e.message).contains("not initialized")
        }
    }

    @Test
    fun `release can be called multiple times safely`() {
        // Given
        initializeDetector()

        // When - call release multiple times
        detector.release()
        detector.release()
        detector.release()

        // Then - should not crash
        assertThat(detector.getStatus()).isEqualTo(DetectorStatus.UNINITIALIZED)
    }

    // ===== HELPER METHODS =====

    private fun initializeDetector() = runBlocking {
        val modelPath = "models/ad_detector.tflite"
        val modelInfo = createMockModelInfo(modelPath)

        whenever(mockModelLoader.loadFromAsset(modelPath)).thenReturn(modelInfo)
        whenever(mockModelLoader.validateModel(modelInfo)).thenReturn(true)

        detector.initialize(modelPath, DetectorConfig())
    }

    private fun createMockModelInfo(path: String): ModelInfo {
        return ModelInfo(
            path = path,
            data = ByteArray(1024),
            size = 1024L,
            checksum = "mock_checksum"
        )
    }

    private fun createMockBitmap(width: Int, height: Int): Bitmap {
        return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    }
}
