package com.liveaddetection.data.database.dao

import androidx.room.*
import com.liveaddetection.data.database.entity.Node
import kotlinx.coroutines.flow.Flow

@Dao
interface NodeDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(node: Node)

    @Update
    suspend fun update(node: Node)

    @Delete
    suspend fun delete(node: Node)

    @Query("SELECT * FROM nodes WHERE node_id = :nodeId LIMIT 1")
    suspend fun getByNodeId(nodeId: String): Node?

    @Query("SELECT * FROM nodes WHERE status = :status")
    suspend fun getAllByStatus(status: String): List<Node>

    @Query("SELECT * FROM nodes")
    suspend fun getAll(): List<Node>

    @Query("SELECT * FROM nodes")
    fun observeAll(): Flow<List<Node>>

    @Query("UPDATE nodes SET status = :status, last_seen = :lastSeen WHERE node_id = :nodeId")
    suspend fun updateStatus(nodeId: String, status: String, lastSeen: Long)

    @Query("UPDATE nodes SET cpu_usage = :cpuUsage, memory_usage = :memoryUsage, disk_usage = :diskUsage, last_seen = :lastSeen WHERE node_id = :nodeId")
    suspend fun updateStats(
        nodeId: String,
        cpuUsage: Float,
        memoryUsage: Float,
        diskUsage: Float,
        lastSeen: Long
    )

    @Query("SELECT COUNT(*) FROM nodes")
    suspend fun getCount(): Int

    @Query("SELECT COUNT(*) FROM nodes WHERE status = :status")
    suspend fun getCountByStatus(status: String): Int

    @Query("DELETE FROM nodes WHERE node_id = :nodeId")
    suspend fun deleteByNodeId(nodeId: String)
}
