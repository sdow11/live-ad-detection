package com.liveaddetection.domain.detector

import android.graphics.Bitmap
import android.graphics.Matrix

/**
 * Frame Preprocessor Implementation
 * Single Responsibility: Prepare frames for model inference
 */
class FramePreprocessor : IFramePreprocessor {

    override fun preprocess(bitmap: Bitmap, targetWidth: Int, targetHeight: Int): FloatArray {
        // 1. Resize to target dimensions
        val resized = resize(bitmap, targetWidth, targetHeight)

        // 2. Convert to RGB color space (if needed)
        val rgbBitmap = convertColorSpace(resized, ColorFormat.RGB)

        // 3. Extract pixel values
        val pixels = extractPixels(rgbBitmap, targetWidth, targetHeight)

        // 4. Normalize pixel values
        return normalize(pixels)
    }

    override fun resize(bitmap: Bitmap, width: Int, height: Int): Bitmap {
        if (bitmap.width == width && bitmap.height == height) {
            return bitmap
        }

        val matrix = Matrix()
        val scaleX = width.toFloat() / bitmap.width
        val scaleY = height.toFloat() / bitmap.height
        matrix.postScale(scaleX, scaleY)

        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    override fun normalize(pixels: FloatArray): FloatArray {
        // Normalize from [0, 255] to [0, 1]
        return pixels.map { it / 255.0f }.toFloatArray()
    }

    override fun convertColorSpace(bitmap: Bitmap, format: ColorFormat): Bitmap {
        // For this implementation, we'll ensure RGB format
        // Android Bitmap is typically in ARGB_8888 format
        when (format) {
            ColorFormat.RGB -> {
                // Already in a compatible format
                return bitmap.copy(bitmap.config, false)
            }
            ColorFormat.BGR -> {
                // Would need to swap R and B channels
                // For now, return as-is (implement if needed for specific models)
                return bitmap.copy(bitmap.config, false)
            }
            ColorFormat.RGBA, ColorFormat.BGRA -> {
                // Already includes alpha channel
                return bitmap.copy(bitmap.config, false)
            }
        }
    }

    private fun extractPixels(bitmap: Bitmap, width: Int, height: Int): FloatArray {
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        // Convert to float array in RGB order
        val floatPixels = FloatArray(width * height * 3)
        var index = 0

        for (pixel in pixels) {
            // Extract RGB values from ARGB format
            val r = (pixel shr 16) and 0xFF
            val g = (pixel shr 8) and 0xFF
            val b = pixel and 0xFF

            floatPixels[index++] = r.toFloat()
            floatPixels[index++] = g.toFloat()
            floatPixels[index++] = b.toFloat()
        }

        return floatPixels
    }
}
