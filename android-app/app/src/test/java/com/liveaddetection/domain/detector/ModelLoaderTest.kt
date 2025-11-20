package com.liveaddetection.domain.detector

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

/**
 * Model Loader Tests - TDD
 * Single Responsibility: Test ONLY model loading functionality
 */
@RunWith(RobolectricTestRunner::class)
class ModelLoaderTest {

    private lateinit var context: Context
    private lateinit var modelLoader: IModelLoader

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        modelLoader = ModelLoader(context)
    }

    @Test
    fun `loadFromAsset loads model from assets folder`() = runBlocking {
        // Given
        val assetPath = "models/test_model.tflite"
        createMockAsset(assetPath)

        // When
        val modelInfo = modelLoader.loadFromAsset(assetPath)

        // Then
        assertThat(modelInfo.path).isEqualTo(assetPath)
        assertThat(modelInfo.data).isNotEmpty()
        assertThat(modelInfo.size).isGreaterThan(0)
        assertThat(modelInfo.checksum).isNotEmpty()
    }

    @Test
    fun `loadFromFile loads model from file path`() = runBlocking {
        // Given
        val file = File(context.cacheDir, "test_model.tflite")
        file.writeBytes(ByteArray(1024) { it.toByte() })

        // When
        val modelInfo = modelLoader.loadFromFile(file.absolutePath)

        // Then
        assertThat(modelInfo.path).isEqualTo(file.absolutePath)
        assertThat(modelInfo.data.size).isEqualTo(1024)
        assertThat(modelInfo.size).isEqualTo(1024)
    }

    @Test
    fun `validateModel returns true for valid TFLite model`() = runBlocking {
        // Given
        val validModel = createValidTFLiteModelData()
        val modelInfo = ModelInfo("test.tflite", validModel, validModel.size.toLong(), "checksum")

        // When
        val isValid = modelLoader.validateModel(modelInfo)

        // Then
        assertThat(isValid).isTrue()
    }

    @Test
    fun `validateModel returns false for invalid model`() = runBlocking {
        // Given
        val invalidModel = ByteArray(100) { 0 } // Invalid TFLite format
        val modelInfo = ModelInfo("test.tflite", invalidModel, invalidModel.size.toLong(), "checksum")

        // When
        val isValid = modelLoader.validateModel(modelInfo)

        // Then
        assertThat(isValid).isFalse()
    }

    @Test
    fun `getModelMetadata extracts model information`() = runBlocking {
        // Given
        val modelData = createValidTFLiteModelData()
        val modelInfo = ModelInfo("test.tflite", modelData, modelData.size.toLong(), "checksum")

        // When
        val metadata = modelLoader.getModelMetadata(modelInfo)

        // Then
        assertThat(metadata.name).isNotEmpty()
        assertThat(metadata.inputShape).isNotEmpty()
        assertThat(metadata.outputShape).isNotEmpty()
    }

    @Test
    fun `checksum is consistent for same file`() = runBlocking {
        // Given
        val file = File(context.cacheDir, "test_model.tflite")
        val data = ByteArray(1024) { it.toByte() }
        file.writeBytes(data)

        // When
        val modelInfo1 = modelLoader.loadFromFile(file.absolutePath)
        val modelInfo2 = modelLoader.loadFromFile(file.absolutePath)

        // Then
        assertThat(modelInfo1.checksum).isEqualTo(modelInfo2.checksum)
    }

    @Test
    fun `checksum is different for different files`() = runBlocking {
        // Given
        val file1 = File(context.cacheDir, "model1.tflite")
        val file2 = File(context.cacheDir, "model2.tflite")
        file1.writeBytes(ByteArray(1024) { it.toByte() })
        file2.writeBytes(ByteArray(1024) { (it + 1).toByte() })

        // When
        val modelInfo1 = modelLoader.loadFromFile(file1.absolutePath)
        val modelInfo2 = modelLoader.loadFromFile(file2.absolutePath)

        // Then
        assertThat(modelInfo1.checksum).isNotEqualTo(modelInfo2.checksum)
    }

    // Helper methods
    private fun createMockAsset(path: String) {
        // Mock asset creation (would need actual implementation)
    }

    private fun createValidTFLiteModelData(): ByteArray {
        // Create minimal valid TFLite model format
        // TFLite files start with "TFL3" magic bytes
        return byteArrayOf(
            'T'.code.toByte(), 'F'.code.toByte(), 'L'.code.toByte(), '3'.code.toByte()
        ) + ByteArray(1020) { 0 }
    }
}
