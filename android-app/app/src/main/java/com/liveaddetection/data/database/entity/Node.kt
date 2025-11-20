package com.liveaddetection.data.database.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

/**
 * Node entity - matches PostgreSQL schema
 */
@Entity(
    tableName = "nodes",
    indices = [
        Index(value = ["node_id"], unique = true)
    ]
)
data class Node(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),

    @ColumnInfo(name = "node_id")
    val nodeId: String,

    @ColumnInfo(name = "node_name")
    val nodeName: String,

    @ColumnInfo(name = "ip_address")
    val ipAddress: String,

    @ColumnInfo(name = "role")
    val role: String, // "head" or "node"

    @ColumnInfo(name = "status")
    val status: String, // "online", "offline", "error"

    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "last_seen")
    val lastSeen: Long? = null,

    @ColumnInfo(name = "cpu_usage")
    val cpuUsage: Float = 0.0f,

    @ColumnInfo(name = "memory_usage")
    val memoryUsage: Float = 0.0f,

    @ColumnInfo(name = "disk_usage")
    val diskUsage: Float = 0.0f,

    @ColumnInfo(name = "metadata")
    val metadata: String? = null // JSON string
)
