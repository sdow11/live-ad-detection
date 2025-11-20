package com.liveaddetection.domain.detector

import android.content.Context
import android.content.res.AssetManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.tensorflow.lite.Interpreter
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.security.MessageDigest

/**
 * Model Loader Implementation
 * Single Responsibility: Load and validate TFLite models
 */
class ModelLoader(private val context: Context) : IModelLoader {

    override suspend fun loadFromAsset(assetPath: String): ModelInfo = withContext(Dispatchers.IO) {
        val assetManager = context.assets
        val assetFileDescriptor = assetManager.openFd(assetPath)

        val inputStream = FileInputStream(assetFileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        val startOffset = assetFileDescriptor.startOffset
        val declaredLength = assetFileDescriptor.declaredLength

        val buffer = fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
        val data = ByteArray(buffer.remaining())
        buffer.get(data)

        ModelInfo(
            path = assetPath,
            data = data,
            size = data.size.toLong(),
            checksum = calculateChecksum(data)
        )
    }

    override suspend fun loadFromFile(filePath: String): ModelInfo = withContext(Dispatchers.IO) {
        val file = File(filePath)
        if (!file.exists()) {
            throw IllegalArgumentException("Model file not found: $filePath")
        }

        val data = file.readBytes()

        ModelInfo(
            path = filePath,
            data = data,
            size = file.length(),
            checksum = calculateChecksum(data)
        )
    }

    override suspend fun validateModel(modelInfo: ModelInfo): Boolean = withContext(Dispatchers.IO) {
        try {
            // Check TFLite magic bytes
            if (modelInfo.data.size < 4) return@withContext false

            // TFLite files start with "TFL3"
            val magic = String(modelInfo.data.sliceArray(0..3))
            if (magic != "TFL3") return@withContext false

            // Try to create interpreter to validate
            val buffer = ByteBuffer.wrap(modelInfo.data)
            val interpreter = Interpreter(buffer)
            interpreter.close()

            true
        } catch (e: Exception) {
            false
        }
    }

    override fun getModelMetadata(modelInfo: ModelInfo): ModelMetadata {
        val buffer = ByteBuffer.wrap(modelInfo.data)
        val interpreter = Interpreter(buffer)

        try {
            val inputTensor = interpreter.getInputTensor(0)
            val outputTensor = interpreter.getOutputTensor(0)

            val inputShape = inputTensor.shape()
            val outputShape = outputTensor.shape()

            // Extract labels (if available in metadata)
            val labels = extractLabels(modelInfo) ?: getDefaultLabels()

            return ModelMetadata(
                name = modelInfo.path.substringAfterLast('/'),
                version = "1.0",
                inputShape = inputShape,
                outputShape = outputShape,
                labels = labels
            )
        } finally {
            interpreter.close()
        }
    }

    private fun calculateChecksum(data: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(data)
        return hash.joinToString("") { "%02x".format(it) }
    }

    private fun extractLabels(modelInfo: ModelInfo): List<String>? {
        // Try to extract labels from TFLite metadata
        // This is simplified - real implementation would parse metadata
        return null
    }

    private fun getDefaultLabels(): List<String> {
        return listOf(
            "commercial",
            "banner",
            "overlay",
            "pre-roll",
            "mid-roll",
            "sponsored_content"
        )
    }
}
