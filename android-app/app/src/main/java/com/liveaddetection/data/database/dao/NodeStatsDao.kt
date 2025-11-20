package com.liveaddetection.data.database.dao

import androidx.room.*
import com.liveaddetection.data.database.entity.NodeStats
import kotlinx.coroutines.flow.Flow

@Dao
interface NodeStatsDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(stats: NodeStats)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(stats: List<NodeStats>)

    @Update
    suspend fun update(stats: NodeStats)

    @Delete
    suspend fun delete(stats: NodeStats)

    @Query("SELECT * FROM node_stats WHERE node_id = :nodeId ORDER BY timestamp DESC")
    suspend fun getByNodeId(nodeId: String): List<NodeStats>

    @Query("SELECT * FROM node_stats WHERE node_id = :nodeId AND timestamp >= :since ORDER BY timestamp ASC")
    suspend fun getStatsSince(nodeId: String, since: Long): List<NodeStats>

    @Query("SELECT * FROM node_stats WHERE node_id = :nodeId ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentStats(nodeId: String, limit: Int): List<NodeStats>

    @Query("SELECT * FROM node_stats WHERE node_id = :nodeId ORDER BY timestamp DESC")
    fun observeByNodeId(nodeId: String): Flow<List<NodeStats>>

    @Query("SELECT * FROM node_stats WHERE timestamp >= :since ORDER BY timestamp ASC")
    suspend fun getAllSince(since: Long): List<NodeStats>

    @Query("DELETE FROM node_stats WHERE timestamp < :before")
    suspend fun deleteOlderThan(before: Long): Int

    @Query("DELETE FROM node_stats WHERE node_id = :nodeId")
    suspend fun deleteByNodeId(nodeId: String)

    @Query("SELECT COUNT(*) FROM node_stats WHERE node_id = :nodeId")
    suspend fun getCount(nodeId: String): Int
}
