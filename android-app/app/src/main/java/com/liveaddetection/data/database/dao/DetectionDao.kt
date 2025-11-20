package com.liveaddetection.data.database.dao

import androidx.room.*
import com.liveaddetection.data.database.entity.Detection
import kotlinx.coroutines.flow.Flow

@Dao
interface DetectionDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(detection: Detection)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(detections: List<Detection>)

    @Update
    suspend fun update(detection: Detection)

    @Delete
    suspend fun delete(detection: Detection)

    @Query("SELECT * FROM detections WHERE detection_id = :detectionId LIMIT 1")
    suspend fun getById(detectionId: String): Detection?

    @Query("SELECT * FROM detections WHERE node_id = :nodeId ORDER BY timestamp DESC")
    suspend fun getByNodeId(nodeId: String): List<Detection>

    @Query("SELECT * FROM detections ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentDetections(limit: Int): List<Detection>

    @Query("SELECT * FROM detections ORDER BY timestamp DESC")
    fun observeAll(): Flow<List<Detection>>

    @Query("SELECT * FROM detections WHERE node_id = :nodeId ORDER BY timestamp DESC")
    fun observeByNodeId(nodeId: String): Flow<List<Detection>>

    @Query("SELECT * FROM detections WHERE timestamp >= :since ORDER BY timestamp DESC")
    suspend fun getDetectionsSince(since: Long): List<Detection>

    @Query("SELECT * FROM detections WHERE ad_type = :adType ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getByAdType(adType: String, limit: Int): List<Detection>

    @Query("SELECT COUNT(*) FROM detections")
    suspend fun getCount(): Int

    @Query("SELECT COUNT(*) FROM detections WHERE node_id = :nodeId")
    suspend fun getCountByNodeId(nodeId: String): Int

    @Query("SELECT * FROM detections")
    suspend fun getAll(): List<Detection>

    @Query("DELETE FROM detections WHERE timestamp < :before")
    suspend fun deleteOlderThan(before: Long)

    @Query("DELETE FROM detections")
    suspend fun deleteAll()
}
