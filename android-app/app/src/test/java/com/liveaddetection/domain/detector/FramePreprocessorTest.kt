package com.liveaddetection.domain.detector

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * FramePreprocessor Tests
 * Tests for image preprocessing pipeline
 */
@RunWith(RobolectricTestRunner::class)
class FramePreprocessorTest {

    private lateinit var preprocessor: FramePreprocessor

    @Before
    fun setUp() {
        preprocessor = FramePreprocessor()
    }

    // ========== Resize Tests ==========

    @Test
    fun `resize scales image to target dimensions`() {
        val bitmap = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888)

        val resized = preprocessor.resize(bitmap, 640, 640)

        assertThat(resized.width).isEqualTo(640)
        assertThat(resized.height).isEqualTo(640)
    }

    @Test
    fun `resize returns same bitmap if dimensions match`() {
        val bitmap = Bitmap.createBitmap(640, 640, Bitmap.Config.ARGB_8888)

        val resized = preprocessor.resize(bitmap, 640, 640)

        assertThat(resized).isSameInstanceAs(bitmap)
    }

    @Test
    fun `resize handles upscaling`() {
        val bitmap = Bitmap.createBitmap(320, 320, Bitmap.Config.ARGB_8888)

        val resized = preprocessor.resize(bitmap, 640, 640)

        assertThat(resized.width).isEqualTo(640)
        assertThat(resized.height).isEqualTo(640)
    }

    @Test
    fun `resize handles downscaling`() {
        val bitmap = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888)

        val resized = preprocessor.resize(bitmap, 320, 320)

        assertThat(resized.width).isEqualTo(320)
        assertThat(resized.height).isEqualTo(320)
    }

    @Test
    fun `resize handles non-square dimensions`() {
        val bitmap = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888)

        val resized = preprocessor.resize(bitmap, 640, 480)

        assertThat(resized.width).isEqualTo(640)
        assertThat(resized.height).isEqualTo(480)
    }

    // ========== Normalization Tests ==========

    @Test
    fun `normalize converts 0-255 range to 0-1 range`() {
        val pixels = floatArrayOf(0f, 127.5f, 255f)

        val normalized = preprocessor.normalize(pixels)

        assertThat(normalized[0]).isWithin(0.001f).of(0f)
        assertThat(normalized[1]).isWithin(0.001f).of(0.5f)
        assertThat(normalized[2]).isWithin(0.001f).of(1f)
    }

    @Test
    fun `normalize handles all zeros`() {
        val pixels = floatArrayOf(0f, 0f, 0f)

        val normalized = preprocessor.normalize(pixels)

        assertThat(normalized).asList().containsExactly(0f, 0f, 0f)
    }

    @Test
    fun `normalize handles all max values`() {
        val pixels = floatArrayOf(255f, 255f, 255f)

        val normalized = preprocessor.normalize(pixels)

        normalized.forEach { value ->
            assertThat(value).isWithin(0.001f).of(1f)
        }
    }

    @Test
    fun `normalize preserves array size`() {
        val pixels = FloatArray(1000) { it.toFloat() }

        val normalized = preprocessor.normalize(pixels)

        assertThat(normalized.size).isEqualTo(1000)
    }

    // ========== Color Space Conversion Tests ==========

    @Test
    fun `convertColorSpace handles RGB format`() {
        val bitmap = Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888)

        val converted = preprocessor.convertColorSpace(bitmap, ColorFormat.RGB)

        assertThat(converted).isNotNull()
        assertThat(converted.width).isEqualTo(100)
        assertThat(converted.height).isEqualTo(100)
    }

    @Test
    fun `convertColorSpace handles RGBA format`() {
        val bitmap = Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888)

        val converted = preprocessor.convertColorSpace(bitmap, ColorFormat.RGBA)

        assertThat(converted).isNotNull()
    }

    @Test
    fun `convertColorSpace handles BGR format`() {
        val bitmap = Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888)

        val converted = preprocessor.convertColorSpace(bitmap, ColorFormat.BGR)

        assertThat(converted).isNotNull()
    }

    // ========== Full Preprocessing Pipeline Tests ==========

    @Test
    fun `preprocess returns correct array size for target dimensions`() {
        val bitmap = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888)
        val targetWidth = 640
        val targetHeight = 640

        val processed = preprocessor.preprocess(bitmap, targetWidth, targetHeight)

        // Expected size: width * height * 3 channels (RGB)
        val expectedSize = targetWidth * targetHeight * 3
        assertThat(processed.size).isEqualTo(expectedSize)
    }

    @Test
    fun `preprocess normalizes pixel values`() {
        val bitmap = Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888)

        val processed = preprocessor.preprocess(bitmap, 100, 100)

        // All values should be between 0 and 1
        processed.forEach { value ->
            assertThat(value).isAtLeast(0f)
            assertThat(value).isAtMost(1f)
        }
    }

    @Test
    fun `preprocess handles different input sizes`() {
        val bitmap1 = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888)
        val bitmap2 = Bitmap.createBitmap(640, 480, Bitmap.Config.ARGB_8888)
        val bitmap3 = Bitmap.createBitmap(320, 240, Bitmap.Config.ARGB_8888)

        val processed1 = preprocessor.preprocess(bitmap1, 640, 640)
        val processed2 = preprocessor.preprocess(bitmap2, 640, 640)
        val processed3 = preprocessor.preprocess(bitmap3, 640, 640)

        // All should result in same output size
        assertThat(processed1.size).isEqualTo(640 * 640 * 3)
        assertThat(processed2.size).isEqualTo(640 * 640 * 3)
        assertThat(processed3.size).isEqualTo(640 * 640 * 3)
    }

    @Test
    fun `preprocess handles square and non-square targets`() {
        val bitmap = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888)

        val square = preprocessor.preprocess(bitmap, 640, 640)
        val nonSquare = preprocessor.preprocess(bitmap, 640, 480)

        assertThat(square.size).isEqualTo(640 * 640 * 3)
        assertThat(nonSquare.size).isEqualTo(640 * 480 * 3)
    }

    @Test
    fun `preprocess handles small images`() {
        val bitmap = Bitmap.createBitmap(10, 10, Bitmap.Config.ARGB_8888)

        val processed = preprocessor.preprocess(bitmap, 100, 100)

        assertThat(processed.size).isEqualTo(100 * 100 * 3)
    }

    @Test
    fun `preprocess output is deterministic for same input`() {
        val bitmap = Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888)

        val result1 = preprocessor.preprocess(bitmap, 100, 100)
        val result2 = preprocessor.preprocess(bitmap, 100, 100)

        assertThat(result1).isEqualTo(result2)
    }
}
