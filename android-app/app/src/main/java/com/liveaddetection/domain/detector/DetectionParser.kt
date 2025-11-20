package com.liveaddetection.domain.detector

import java.util.UUID

/**
 * Detection Parser Implementation
 * Single Responsibility: Parse inference results and apply NMS
 */
class DetectionParser : IDetectionParser {

    private val adTypeLabels = listOf(
        "commercial",
        "banner",
        "overlay",
        "pre-roll",
        "mid-roll",
        "sponsored_content"
    )

    override fun parse(
        output: Array<FloatArray>,
        confidenceThreshold: Float,
        imageWidth: Int,
        imageHeight: Int
    ): List<AdDetection> {
        val detections = mutableListOf<AdDetection>()

        // Output format: [batch, num_detections, 6] where 6 = [x, y, w, h, confidence, class]
        val flatOutput = output[0]
        val numDetections = flatOutput.size / 6

        for (i in 0 until numDetections) {
            val baseIndex = i * 6

            val x = flatOutput[baseIndex]
            val y = flatOutput[baseIndex + 1]
            val w = flatOutput[baseIndex + 2]
            val h = flatOutput[baseIndex + 3]
            val confidence = flatOutput[baseIndex + 4]
            val classId = flatOutput[baseIndex + 5].toInt()

            // Filter by confidence threshold
            if (confidence < confidenceThreshold) continue

            // Normalize coordinates to image dimensions
            val normalizedBox = normalizeCoordinates(x, y, w, h, imageWidth, imageHeight)

            // Get ad type label
            val adType = if (classId in adTypeLabels.indices) {
                adTypeLabels[classId]
            } else {
                "unknown"
            }

            detections.add(
                AdDetection(
                    id = UUID.randomUUID().toString(),
                    adType = adType,
                    confidence = confidence,
                    boundingBox = normalizedBox
                )
            )
        }

        return detections
    }

    override fun filter(detections: List<AdDetection>, threshold: Float): List<AdDetection> {
        return detections.filter { it.confidence >= threshold }
    }

    override fun applyNMS(detections: List<AdDetection>, iouThreshold: Float): List<AdDetection> {
        // Group detections by ad type (NMS should be applied per class)
        val groupedByType = detections.groupBy { it.adType }
        val results = mutableListOf<AdDetection>()

        // Apply NMS for each ad type separately
        for ((_, typeDetections) in groupedByType) {
            results.addAll(applyNMSForType(typeDetections, iouThreshold))
        }

        return results
    }

    private fun applyNMSForType(
        detections: List<AdDetection>,
        iouThreshold: Float
    ): List<AdDetection> {
        if (detections.isEmpty()) return emptyList()

        // Sort by confidence (descending)
        val sortedDetections = detections.sortedByDescending { it.confidence }
        val selectedDetections = mutableListOf<AdDetection>()
        val suppressed = mutableSetOf<String>()

        for (detection in sortedDetections) {
            if (detection.id in suppressed) continue

            selectedDetections.add(detection)

            // Suppress overlapping boxes
            for (other in sortedDetections) {
                if (other.id in suppressed || other.id == detection.id) continue

                val iou = detection.boundingBox.intersectionOverUnion(other.boundingBox)
                if (iou > iouThreshold) {
                    suppressed.add(other.id)
                }
            }
        }

        return selectedDetections
    }

    private fun normalizeCoordinates(
        x: Float,
        y: Float,
        w: Float,
        h: Float,
        imageWidth: Int,
        imageHeight: Int
    ): BoundingBox {
        // Check if coordinates are already normalized (0-1 range)
        val isNormalized = x <= 1.0f && y <= 1.0f && w <= 1.0f && h <= 1.0f

        return if (isNormalized) {
            // Scale to image dimensions
            BoundingBox(
                x = x * imageWidth,
                y = y * imageHeight,
                width = w * imageWidth,
                height = h * imageHeight
            )
        } else {
            // Already in pixel coordinates
            BoundingBox(x, y, w, h)
        }
    }
}
