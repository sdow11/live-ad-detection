package com.liveaddetection.domain.detector

import android.graphics.Bitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import org.tensorflow.lite.nnapi.NnApiDelegate
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * TFLite Detector Implementation
 * Single Responsibility: Orchestrate detection pipeline
 * Open/Closed: Extensible through injected dependencies
 * Dependency Inversion: Depends on abstractions (interfaces)
 */
class TFLiteDetector(
    private val modelLoader: IModelLoader,
    private val preprocessor: IFramePreprocessor,
    private val parser: IDetectionParser,
    private val accelerator: IHardwareAccelerator
) : IAdDetector {

    private var currentInterpreter: Interpreter? = null
    private var currentModelInfo: ModelInfo? = null
    private var currentConfig: DetectorConfig? = null
    private var currentMetadata: ModelMetadata? = null

    @Volatile
    private var status: DetectorStatus = DetectorStatus.UNINITIALIZED

    private val interpreterLock = Mutex()
    private val metrics = DetectorMetricsTracker()

    // GPU and NNAPI delegates (must be released)
    private var gpuDelegate: GpuDelegate? = null
    private var nnApiDelegate: NnApiDelegate? = null

    override suspend fun initialize(modelPath: String, config: DetectorConfig): Boolean =
        withContext(Dispatchers.IO) {
            try {
                status = DetectorStatus.INITIALIZING

                // 1. Load model
                val modelInfo = modelLoader.loadFromAsset(modelPath)

                // 2. Validate model
                if (!modelLoader.validateModel(modelInfo)) {
                    status = DetectorStatus.ERROR
                    return@withContext false
                }

                // 3. Get metadata
                val metadata = modelLoader.getModelMetadata(modelInfo)

                // 4. Create interpreter with acceleration
                val interpreter = createInterpreter(modelInfo, config)

                // 5. Store state
                interpreterLock.withLock {
                    currentInterpreter?.close()
                    releaseAccelerators()

                    currentInterpreter = interpreter
                    currentModelInfo = modelInfo
                    currentConfig = config
                    currentMetadata = metadata
                }

                status = DetectorStatus.READY
                true
            } catch (e: Exception) {
                status = DetectorStatus.ERROR
                false
            }
        }

    override suspend fun detect(frame: Bitmap): DetectionResult =
        withContext(Dispatchers.IO) {
            if (status != DetectorStatus.READY) {
                return@withContext DetectionResult(
                    detections = emptyList(),
                    inferenceTimeMs = 0,
                    preprocessTimeMs = 0,
                    postprocessTimeMs = 0,
                    totalTimeMs = 0
                )
            }

            val totalStart = System.currentTimeMillis()
            status = DetectorStatus.DETECTING

            try {
                // 1. Preprocess
                val preprocessStart = System.currentTimeMillis()
                val metadata = currentMetadata ?: throw IllegalStateException("Model not initialized")
                val inputShape = metadata.inputShape
                val targetWidth = inputShape[2] // Assuming [batch, height, width, channels]
                val targetHeight = inputShape[1]

                val preprocessedData = preprocessor.preprocess(frame, targetWidth, targetHeight)
                val preprocessTime = System.currentTimeMillis() - preprocessStart

                // 2. Run inference
                val inferenceStart = System.currentTimeMillis()
                val output = runInference(preprocessedData, inputShape)
                val inferenceTime = System.currentTimeMillis() - inferenceStart

                // 3. Parse detections
                val postprocessStart = System.currentTimeMillis()
                val config = currentConfig ?: throw IllegalStateException("Config not initialized")
                val detections = parser.parse(
                    output,
                    config.confidenceThreshold,
                    frame.width,
                    frame.height
                )

                // 4. Apply NMS
                val filteredDetections = parser.applyNMS(detections, config.iouThreshold)
                    .take(config.maxDetections)
                val postprocessTime = System.currentTimeMillis() - postprocessStart

                val totalTime = System.currentTimeMillis() - totalStart

                // Update metrics
                metrics.recordFrame(inferenceTime, filteredDetections.size)

                status = DetectorStatus.READY

                DetectionResult(
                    detections = filteredDetections,
                    inferenceTimeMs = inferenceTime,
                    preprocessTimeMs = preprocessTime,
                    postprocessTimeMs = postprocessTime,
                    totalTimeMs = totalTime
                )
            } catch (e: Exception) {
                status = DetectorStatus.ERROR
                DetectionResult(
                    detections = emptyList(),
                    inferenceTimeMs = 0,
                    preprocessTimeMs = 0,
                    postprocessTimeMs = 0,
                    totalTimeMs = 0
                )
            }
        }

    override suspend fun detectBatch(frames: List<Bitmap>): List<DetectionResult> =
        withContext(Dispatchers.IO) {
            frames.map { detect(it) }
        }

    override suspend fun swapModel(modelPath: String): Boolean =
        withContext(Dispatchers.IO) {
            try {
                status = DetectorStatus.SWAPPING_MODEL

                // 1. Load new model
                val newModelInfo = modelLoader.loadFromAsset(modelPath)

                // 2. Validate
                if (!modelLoader.validateModel(newModelInfo)) {
                    status = DetectorStatus.READY
                    return@withContext false
                }

                // 3. Get metadata
                val newMetadata = modelLoader.getModelMetadata(newModelInfo)

                // 4. Create new interpreter
                val config = currentConfig ?: throw IllegalStateException("Config not initialized")
                val newInterpreter = createInterpreter(newModelInfo, config)

                // 5. Atomic swap
                interpreterLock.withLock {
                    currentInterpreter?.close()
                    releaseAccelerators()

                    currentInterpreter = newInterpreter
                    currentModelInfo = newModelInfo
                    currentMetadata = newMetadata
                }

                metrics.recordModelSwap()
                status = DetectorStatus.READY
                true
            } catch (e: Exception) {
                status = DetectorStatus.ERROR
                false
            }
        }

    override fun getStatus(): DetectorStatus = status

    override fun getMetrics(): DetectorMetrics = metrics.getMetrics()

    override fun release() {
        interpreterLock.tryLock()
        try {
            currentInterpreter?.close()
            releaseAccelerators()
            status = DetectorStatus.UNINITIALIZED
        } finally {
            interpreterLock.unlock()
        }
    }

    private fun createInterpreter(modelInfo: ModelInfo, config: DetectorConfig): Interpreter {
        val buffer = ByteBuffer.wrap(modelInfo.data)
        val options = Interpreter.Options()

        // Set number of threads
        options.setNumThreads(config.numThreads)

        // Configure acceleration
        val accelerationType = if (config.accelerationType == AccelerationType.AUTO) {
            accelerator.getRecommendedAcceleration()
        } else {
            config.accelerationType
        }

        when (accelerationType) {
            AccelerationType.GPU -> {
                if (accelerator.isGpuAvailable()) {
                    gpuDelegate = GpuDelegate()
                    options.addDelegate(gpuDelegate)
                }
            }
            AccelerationType.NNAPI -> {
                if (accelerator.isNnapiAvailable()) {
                    nnApiDelegate = NnApiDelegate()
                    options.addDelegate(nnApiDelegate)
                }
            }
            AccelerationType.CPU, AccelerationType.AUTO -> {
                // Use CPU with specified threads
            }
            AccelerationType.HEXAGON -> {
                // Hexagon DSP not implemented yet
            }
        }

        return Interpreter(buffer, options)
    }

    private fun runInference(inputData: FloatArray, inputShape: IntArray): Array<FloatArray> {
        val interpreter = currentInterpreter ?: throw IllegalStateException("Interpreter not initialized")

        // Prepare input buffer
        val inputBuffer = ByteBuffer.allocateDirect(inputData.size * 4).apply {
            order(ByteOrder.nativeOrder())
            asFloatBuffer().put(inputData)
            rewind()
        }

        // Prepare output buffer
        val outputShape = currentMetadata?.outputShape ?: throw IllegalStateException("Metadata not initialized")
        val outputSize = outputShape.fold(1) { acc, dim -> acc * dim }
        val outputBuffer = ByteBuffer.allocateDirect(outputSize * 4).apply {
            order(ByteOrder.nativeOrder())
        }

        // Run inference
        interpreter.run(inputBuffer, outputBuffer)

        // Parse output
        outputBuffer.rewind()
        val outputArray = FloatArray(outputSize)
        outputBuffer.asFloatBuffer().get(outputArray)

        // Reshape to [batch, num_detections * 6]
        return arrayOf(outputArray)
    }

    private fun releaseAccelerators() {
        gpuDelegate?.close()
        gpuDelegate = null
        nnApiDelegate?.close()
        nnApiDelegate = null
    }

    /**
     * Internal metrics tracker
     */
    private class DetectorMetricsTracker {
        private var totalFrames: Long = 0
        private var totalDetections: Long = 0
        private var totalInferenceTime: Long = 0
        private var modelSwaps: Int = 0

        @Synchronized
        fun recordFrame(inferenceTimeMs: Long, detectionCount: Int) {
            totalFrames++
            totalDetections += detectionCount
            totalInferenceTime += inferenceTimeMs
        }

        @Synchronized
        fun recordModelSwap() {
            modelSwaps++
        }

        @Synchronized
        fun getMetrics(): DetectorMetrics {
            val avgInference = if (totalFrames > 0) {
                totalInferenceTime.toFloat() / totalFrames
            } else 0f

            val avgFps = if (avgInference > 0) {
                1000f / avgInference
            } else 0f

            return DetectorMetrics(
                totalFramesProcessed = totalFrames,
                totalDetections = totalDetections,
                averageInferenceTimeMs = avgInference,
                averageFps = avgFps,
                modelSwaps = modelSwaps
            )
        }
    }
}
