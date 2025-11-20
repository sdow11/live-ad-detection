package com.liveaddetection.domain.detector

import com.google.common.truth.Truth.assertThat
import org.junit.Before
import org.junit.Test

/**
 * Detection Parser Tests - TDD
 * Single Responsibility: Test ONLY detection parsing and NMS
 */
class DetectionParserTest {

    private lateinit var parser: IDetectionParser

    @Before
    fun setup() {
        parser = DetectionParser()
    }

    // ===== PARSING TESTS =====

    @Test
    fun `parse converts raw output to detections`() {
        // Given
        // Format: [batch, num_detections, 6] where 6 = [x, y, w, h, confidence, class]
        val rawOutput = arrayOf(
            floatArrayOf(
                100f, 100f, 200f, 200f, 0.95f, 0f, // Detection 1: commercial
                300f, 300f, 400f, 400f, 0.85f, 1f  // Detection 2: banner
            )
        )

        // When
        val detections = parser.parse(rawOutput, 0.8f, 1920, 1080)

        // Then
        assertThat(detections).hasSize(2)
        assertThat(detections[0].confidence).isEqualTo(0.95f)
        assertThat(detections[0].adType).isEqualTo("commercial")
        assertThat(detections[1].confidence).isEqualTo(0.85f)
        assertThat(detections[1].adType).isEqualTo("banner")
    }

    @Test
    fun `parse filters detections below threshold`() {
        // Given
        val rawOutput = arrayOf(
            floatArrayOf(
                100f, 100f, 200f, 200f, 0.95f, 0f, // Above threshold
                300f, 300f, 400f, 400f, 0.75f, 1f, // Below threshold
                500f, 500f, 600f, 600f, 0.85f, 2f  // Above threshold
            )
        )

        // When
        val detections = parser.parse(rawOutput, 0.8f, 1920, 1080)

        // Then
        assertThat(detections).hasSize(2)
        assertThat(detections.all { it.confidence >= 0.8f }).isTrue()
    }

    @Test
    fun `parse normalizes coordinates to image dimensions`() {
        // Given
        // Coordinates in normalized format [0, 1]
        val rawOutput = arrayOf(
            floatArrayOf(
                0.1f, 0.1f, 0.2f, 0.2f, 0.95f, 0f
            )
        )

        // When
        val detections = parser.parse(rawOutput, 0.8f, 1920, 1080)

        // Then
        val bbox = detections[0].boundingBox
        // Should be scaled to image dimensions
        assertThat(bbox.x).isAtLeast(0f)
        assertThat(bbox.y).isAtLeast(0f)
        assertThat(bbox.x + bbox.width).isAtMost(1920f)
        assertThat(bbox.y + bbox.height).isAtMost(1080f)
    }

    // ===== FILTER TESTS =====

    @Test
    fun `filter removes detections below threshold`() {
        // Given
        val detections = listOf(
            AdDetection("1", "commercial", 0.95f, BoundingBox(100f, 100f, 200f, 200f)),
            AdDetection("2", "banner", 0.70f, BoundingBox(300f, 300f, 400f, 400f)),
            AdDetection("3", "overlay", 0.85f, BoundingBox(500f, 500f, 600f, 600f))
        )

        // When
        val filtered = parser.filter(detections, 0.8f)

        // Then
        assertThat(filtered).hasSize(2)
        assertThat(filtered.map { it.id }).containsExactly("1", "3")
    }

    // ===== NMS (Non-Maximum Suppression) TESTS =====

    @Test
    fun `applyNMS keeps highest confidence when boxes overlap`() {
        // Given
        val detections = listOf(
            AdDetection("1", "commercial", 0.95f, BoundingBox(100f, 100f, 200f, 200f)),
            AdDetection("2", "commercial", 0.85f, BoundingBox(110f, 110f, 210f, 210f)) // Overlaps with #1
        )

        // When
        val nmsResult = parser.applyNMS(detections, iouThreshold = 0.5f)

        // Then
        assertThat(nmsResult).hasSize(1)
        assertThat(nmsResult[0].id).isEqualTo("1") // Highest confidence kept
    }

    @Test
    fun `applyNMS keeps non-overlapping boxes`() {
        // Given
        val detections = listOf(
            AdDetection("1", "commercial", 0.95f, BoundingBox(100f, 100f, 200f, 200f)),
            AdDetection("2", "banner", 0.85f, BoundingBox(500f, 500f, 600f, 600f)) // No overlap
        )

        // When
        val nmsResult = parser.applyNMS(detections, iouThreshold = 0.5f)

        // Then
        assertThat(nmsResult).hasSize(2)
        assertThat(nmsResult.map { it.id }).containsExactly("1", "2")
    }

    @Test
    fun `applyNMS handles different ad types separately`() {
        // Given
        val detections = listOf(
            AdDetection("1", "commercial", 0.95f, BoundingBox(100f, 100f, 200f, 200f)),
            AdDetection("2", "banner", 0.90f, BoundingBox(110f, 110f, 210f, 210f)) // Overlaps but different type
        )

        // When
        val nmsResult = parser.applyNMS(detections, iouThreshold = 0.5f)

        // Then
        // Both should be kept because they're different ad types
        assertThat(nmsResult).hasSize(2)
    }

    @Test
    fun `IOU calculation is correct for overlapping boxes`() {
        // Given
        val box1 = BoundingBox(0f, 0f, 100f, 100f) // 10000 area
        val box2 = BoundingBox(50f, 50f, 100f, 100f) // 10000 area, 2500 overlap

        // When
        val iou = box1.intersectionOverUnion(box2)

        // Then
        // IOU = intersection / union
        // intersection = 2500 (50x50 overlap)
        // union = 10000 + 10000 - 2500 = 17500
        // IOU = 2500 / 17500 = 0.1428...
        assertThat(iou).isWithin(0.01f).of(0.1428f)
    }

    @Test
    fun `IOU is 1 for identical boxes`() {
        // Given
        val box1 = BoundingBox(100f, 100f, 200f, 200f)
        val box2 = BoundingBox(100f, 100f, 200f, 200f)

        // When
        val iou = box1.intersectionOverUnion(box2)

        // Then
        assertThat(iou).isEqualTo(1.0f)
    }

    @Test
    fun `IOU is 0 for non-overlapping boxes`() {
        // Given
        val box1 = BoundingBox(0f, 0f, 100f, 100f)
        val box2 = BoundingBox(200f, 200f, 300f, 300f)

        // When
        val iou = box1.intersectionOverUnion(box2)

        // Then
        assertThat(iou).isEqualTo(0.0f)
    }

    @Test
    fun `applyNMS with strict threshold removes more boxes`() {
        // Given
        val detections = listOf(
            AdDetection("1", "commercial", 0.95f, BoundingBox(100f, 100f, 200f, 200f)),
            AdDetection("2", "commercial", 0.90f, BoundingBox(120f, 120f, 220f, 220f)), // Slight overlap
            AdDetection("3", "commercial", 0.85f, BoundingBox(140f, 140f, 240f, 240f))  // Slight overlap
        )

        // When
        val nmsStrict = parser.applyNMS(detections, iouThreshold = 0.3f) // Strict
        val nmsRelaxed = parser.applyNMS(detections, iouThreshold = 0.7f) // Relaxed

        // Then
        assertThat(nmsStrict.size).isLessThan(nmsRelaxed.size)
    }
}
