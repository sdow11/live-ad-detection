package com.liveaddetection.data.database.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

/**
 * Detection entity - matches PostgreSQL schema
 */
@Entity(
    tableName = "detections",
    foreignKeys = [
        ForeignKey(
            entity = Node::class,
            parentColumns = ["node_id"],
            childColumns = ["node_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["detection_id"], unique = true),
        Index(value = ["node_id"]),
        Index(value = ["timestamp"]),
        Index(value = ["ad_type"])
    ]
)
data class Detection(
    @ColumnInfo(name = "detection_id")
    val detectionId: String,

    @ColumnInfo(name = "node_id")
    val nodeId: String,

    @ColumnInfo(name = "timestamp")
    val timestamp: Long,

    @ColumnInfo(name = "confidence")
    val confidence: Float,

    @ColumnInfo(name = "ad_type")
    val adType: String, // "commercial", "banner", "overlay", etc.

    @ColumnInfo(name = "metadata")
    val metadata: String? = null, // JSON string

    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis(),

    @PrimaryKey
    val id: String = UUID.randomUUID().toString()
)
