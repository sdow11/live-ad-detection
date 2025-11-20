package com.liveaddetection.data.database.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

/**
 * NodeStats entity - Time-series statistics
 * Matches PostgreSQL schema
 */
@Entity(
    tableName = "node_stats",
    foreignKeys = [
        ForeignKey(
            entity = Node::class,
            parentColumns = ["node_id"],
            childColumns = ["node_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["node_id"]),
        Index(value = ["timestamp"])
    ]
)
data class NodeStats(
    @ColumnInfo(name = "node_id")
    val nodeId: String,

    @ColumnInfo(name = "timestamp")
    val timestamp: Long,

    @ColumnInfo(name = "cpu_usage")
    val cpuUsage: Float?,

    @ColumnInfo(name = "memory_usage")
    val memoryUsage: Float?,

    @ColumnInfo(name = "disk_usage")
    val diskUsage: Float?,

    @ColumnInfo(name = "temperature")
    val temperature: Float?,

    @ColumnInfo(name = "network_bytes_sent")
    val networkBytesSent: Long? = null,

    @ColumnInfo(name = "network_bytes_recv")
    val networkBytesRecv: Long? = null,

    @PrimaryKey
    val id: String = UUID.randomUUID().toString()
)
