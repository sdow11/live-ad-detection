package com.liveaddetection.domain.detector

import android.graphics.Bitmap

/**
 * SOLID Principles Applied:
 * - Interface Segregation: Each interface has a single, specific purpose
 * - Dependency Inversion: Depend on abstractions, not concrete implementations
 * - Single Responsibility: Each interface defines one responsibility
 */

/**
 * Model Loader Interface
 * Single Responsibility: Load and validate TFLite models
 */
interface IModelLoader {
    /**
     * Load model from asset file
     */
    suspend fun loadFromAsset(assetPath: String): ModelInfo

    /**
     * Load model from file path
     */
    suspend fun loadFromFile(filePath: String): ModelInfo

    /**
     * Validate model format and structure
     */
    suspend fun validateModel(modelInfo: ModelInfo): Boolean

    /**
     * Get model metadata
     */
    fun getModelMetadata(modelInfo: ModelInfo): ModelMetadata
}

/**
 * Frame Preprocessor Interface
 * Single Responsibility: Prepare frames for inference
 */
interface IFramePreprocessor {
    /**
     * Preprocess bitmap for model input
     */
    fun preprocess(bitmap: Bitmap, targetWidth: Int, targetHeight: Int): FloatArray

    /**
     * Resize bitmap to target dimensions
     */
    fun resize(bitmap: Bitmap, width: Int, height: Int): Bitmap

    /**
     * Normalize pixel values
     */
    fun normalize(pixels: FloatArray): FloatArray

    /**
     * Convert to required color space
     */
    fun convertColorSpace(bitmap: Bitmap, format: ColorFormat): Bitmap
}

/**
 * Detection Parser Interface
 * Single Responsibility: Parse inference results into detections
 */
interface IDetectionParser {
    /**
     * Parse raw output into detections
     */
    fun parse(
        output: Array<FloatArray>,
        confidenceThreshold: Float,
        imageWidth: Int,
        imageHeight: Int
    ): List<AdDetection>

    /**
     * Filter detections by confidence
     */
    fun filter(detections: List<AdDetection>, threshold: Float): List<AdDetection>

    /**
     * Apply Non-Maximum Suppression (NMS)
     */
    fun applyNMS(detections: List<AdDetection>, iouThreshold: Float): List<AdDetection>
}

/**
 * Hardware Accelerator Interface
 * Single Responsibility: Manage hardware acceleration
 */
interface IHardwareAccelerator {
    /**
     * Check if NNAPI is available
     */
    fun isNnapiAvailable(): Boolean

    /**
     * Check if GPU is available
     */
    fun isGpuAvailable(): Boolean

    /**
     * Get recommended acceleration type
     */
    fun getRecommendedAcceleration(): AccelerationType

    /**
     * Get acceleration capabilities
     */
    fun getCapabilities(): AccelerationCapabilities
}

/**
 * Main Detector Interface
 * Open/Closed: Open for extension through interfaces, closed for modification
 */
interface IAdDetector {
    /**
     * Initialize detector with model
     */
    suspend fun initialize(modelPath: String, config: DetectorConfig): Boolean

    /**
     * Detect ads in single frame
     */
    suspend fun detect(frame: Bitmap): DetectionResult

    /**
     * Detect ads in batch of frames
     */
    suspend fun detectBatch(frames: List<Bitmap>): List<DetectionResult>

    /**
     * Hot-swap model without stopping
     */
    suspend fun swapModel(modelPath: String): Boolean

    /**
     * Get current detector status
     */
    fun getStatus(): DetectorStatus

    /**
     * Get performance metrics
     */
    fun getMetrics(): DetectorMetrics

    /**
     * Release resources
     */
    fun release()
}

/**
 * Data Models
 */

data class ModelInfo(
    val path: String,
    val data: ByteArray,
    val size: Long,
    val checksum: String
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as ModelInfo
        if (path != other.path) return false
        if (!data.contentEquals(other.data)) return false
        if (size != other.size) return false
        if (checksum != other.checksum) return false
        return true
    }

    override fun hashCode(): Int {
        var result = path.hashCode()
        result = 31 * result + data.contentHashCode()
        result = 31 * result + size.hashCode()
        result = 31 * result + checksum.hashCode()
        return result
    }
}

data class ModelMetadata(
    val name: String,
    val version: String,
    val inputShape: IntArray,
    val outputShape: IntArray,
    val labels: List<String>
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as ModelMetadata
        if (name != other.name) return false
        if (version != other.version) return false
        if (!inputShape.contentEquals(other.inputShape)) return false
        if (!outputShape.contentEquals(other.outputShape)) return false
        if (labels != other.labels) return false
        return true
    }

    override fun hashCode(): Int {
        var result = name.hashCode()
        result = 31 * result + version.hashCode()
        result = 31 * result + inputShape.contentHashCode()
        result = 31 * result + outputShape.contentHashCode()
        result = 31 * result + labels.hashCode()
        return result
    }
}

data class AdDetection(
    val id: String,
    val adType: String,
    val confidence: Float,
    val boundingBox: BoundingBox,
    val timestamp: Long = System.currentTimeMillis()
)

data class BoundingBox(
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float
) {
    fun toRectF() = android.graphics.RectF(x, y, x + width, y + height)

    fun intersectionOverUnion(other: BoundingBox): Float {
        val intersectionArea = intersectionArea(other)
        val unionArea = area() + other.area() - intersectionArea
        return if (unionArea > 0) intersectionArea / unionArea else 0f
    }

    private fun area(): Float = width * height

    private fun intersectionArea(other: BoundingBox): Float {
        val xOverlap = maxOf(0f, minOf(x + width, other.x + other.width) - maxOf(x, other.x))
        val yOverlap = maxOf(0f, minOf(y + height, other.y + other.height) - maxOf(y, other.y))
        return xOverlap * yOverlap
    }
}

data class DetectionResult(
    val detections: List<AdDetection>,
    val inferenceTimeMs: Long,
    val preprocessTimeMs: Long,
    val postprocessTimeMs: Long,
    val totalTimeMs: Long
) {
    val fps: Float get() = if (totalTimeMs > 0) 1000f / totalTimeMs else 0f
}

data class DetectorConfig(
    val confidenceThreshold: Float = 0.8f,
    val iouThreshold: Float = 0.5f,
    val accelerationType: AccelerationType = AccelerationType.AUTO,
    val numThreads: Int = 4,
    val maxDetections: Int = 10
)

data class DetectorMetrics(
    val totalFramesProcessed: Long,
    val totalDetections: Long,
    val averageInferenceTimeMs: Float,
    val averageFps: Float,
    val modelSwaps: Int
)

enum class ColorFormat {
    RGB,
    BGR,
    RGBA,
    BGRA
}

enum class AccelerationType {
    AUTO,
    CPU,
    GPU,
    NNAPI,
    HEXAGON
}

data class AccelerationCapabilities(
    val nnapi: Boolean,
    val gpu: Boolean,
    val hexagon: Boolean,
    val recommendedType: AccelerationType
)

enum class DetectorStatus {
    UNINITIALIZED,
    INITIALIZING,
    READY,
    DETECTING,
    ERROR,
    SWAPPING_MODEL
}
