package com.liveaddetection.data.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import com.liveaddetection.data.database.dao.DetectionDao
import com.liveaddetection.data.database.dao.NodeDao
import com.liveaddetection.data.database.dao.NodeStatsDao
import com.liveaddetection.data.database.entity.Detection
import com.liveaddetection.data.database.entity.Node
import com.liveaddetection.data.database.entity.NodeStats
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.*

/**
 * Test Database Layer - TDD
 * Tests written BEFORE implementation
 */
@RunWith(RobolectricTestRunner::class)
class DetectionDatabaseTest {

    private lateinit var database: AppDatabase
    private lateinit var nodeDao: NodeDao
    private lateinit var detectionDao: DetectionDao
    private lateinit var nodeStatsDao: NodeStatsDao

    @Before
    fun setupDatabase() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(
            context,
            AppDatabase::class.java
        ).allowMainThreadQueries().build()

        nodeDao = database.nodeDao()
        detectionDao = database.detectionDao()
        nodeStatsDao = database.nodeStatsDao()
    }

    @After
    fun closeDatabase() {
        database.close()
    }

    // ===== NODE TESTS =====

    @Test
    fun `insert node and retrieve by id`() = runBlocking {
        // Given
        val node = Node(
            nodeId = "android-moto-edge",
            nodeName = "Motorola Edge",
            ipAddress = "192.168.1.50",
            role = "node",
            status = "online"
        )

        // When
        nodeDao.insert(node)
        val retrieved = nodeDao.getByNodeId("android-moto-edge")

        // Then
        assertThat(retrieved).isNotNull()
        assertThat(retrieved?.nodeName).isEqualTo("Motorola Edge")
        assertThat(retrieved?.role).isEqualTo("node")
    }

    @Test
    fun `update node status`() = runBlocking {
        // Given
        val node = Node(
            nodeId = "test-node",
            nodeName = "Test",
            ipAddress = "192.168.1.100",
            role = "node",
            status = "offline"
        )
        nodeDao.insert(node)

        // When
        nodeDao.updateStatus("test-node", "online", System.currentTimeMillis())
        val updated = nodeDao.getByNodeId("test-node")

        // Then
        assertThat(updated?.status).isEqualTo("online")
        assertThat(updated?.lastSeen).isNotNull()
    }

    @Test
    fun `get all online nodes`() = runBlocking {
        // Given
        val node1 = Node(nodeId = "node1", nodeName = "N1", ipAddress = "192.168.1.1", role = "node", status = "online")
        val node2 = Node(nodeId = "node2", nodeName = "N2", ipAddress = "192.168.1.2", role = "node", status = "offline")
        val node3 = Node(nodeId = "node3", nodeName = "N3", ipAddress = "192.168.1.3", role = "node", status = "online")

        nodeDao.insert(node1)
        nodeDao.insert(node2)
        nodeDao.insert(node3)

        // When
        val onlineNodes = nodeDao.getAllByStatus("online")

        // Then
        assertThat(onlineNodes).hasSize(2)
        assertThat(onlineNodes.map { it.nodeId }).containsExactly("node1", "node3")
    }

    @Test
    fun `delete node cascades to detections`() = runBlocking {
        // Given
        val node = Node(nodeId = "test-node", nodeName = "Test", ipAddress = "192.168.1.1", role = "node", status = "online")
        nodeDao.insert(node)

        val detection = Detection(
            detectionId = UUID.randomUUID().toString(),
            nodeId = "test-node",
            timestamp = System.currentTimeMillis(),
            confidence = 0.95f,
            adType = "commercial"
        )
        detectionDao.insert(detection)

        // When
        nodeDao.delete(node)
        val detections = detectionDao.getAll()

        // Then - detections should be deleted (cascade)
        assertThat(detections).isEmpty()
    }

    // ===== DETECTION TESTS =====

    @Test
    fun `insert detection and retrieve`() = runBlocking {
        // Given
        val node = Node(nodeId = "test-node", nodeName = "Test", ipAddress = "192.168.1.1", role = "node", status = "online")
        nodeDao.insert(node)

        val detection = Detection(
            detectionId = UUID.randomUUID().toString(),
            nodeId = "test-node",
            timestamp = System.currentTimeMillis(),
            confidence = 0.95f,
            adType = "commercial",
            metadata = """{"duration": 30, "brand": "Test"}"""
        )

        // When
        detectionDao.insert(detection)
        val retrieved = detectionDao.getById(detection.detectionId)

        // Then
        assertThat(retrieved).isNotNull()
        assertThat(retrieved?.confidence).isEqualTo(0.95f)
        assertThat(retrieved?.adType).isEqualTo("commercial")
        assertThat(retrieved?.metadata).contains("duration")
    }

    @Test
    fun `get recent detections ordered by timestamp`() = runBlocking {
        // Given
        val node = Node(nodeId = "test-node", nodeName = "Test", ipAddress = "192.168.1.1", role = "node", status = "online")
        nodeDao.insert(node)

        val detection1 = Detection(
            detectionId = UUID.randomUUID().toString(),
            nodeId = "test-node",
            timestamp = 1000L,
            confidence = 0.9f,
            adType = "banner"
        )
        val detection2 = Detection(
            detectionId = UUID.randomUUID().toString(),
            nodeId = "test-node",
            timestamp = 3000L,
            confidence = 0.95f,
            adType = "commercial"
        )
        val detection3 = Detection(
            detectionId = UUID.randomUUID().toString(),
            nodeId = "test-node",
            timestamp = 2000L,
            confidence = 0.85f,
            adType = "overlay"
        )

        detectionDao.insert(detection1)
        detectionDao.insert(detection2)
        detectionDao.insert(detection3)

        // When
        val recent = detectionDao.getRecentDetections(10)

        // Then
        assertThat(recent).hasSize(3)
        // Should be ordered newest first
        assertThat(recent[0].timestamp).isEqualTo(3000L)
        assertThat(recent[1].timestamp).isEqualTo(2000L)
        assertThat(recent[2].timestamp).isEqualTo(1000L)
    }

    @Test
    fun `get detections by node id`() = runBlocking {
        // Given
        val node1 = Node(nodeId = "node1", nodeName = "N1", ipAddress = "192.168.1.1", role = "node", status = "online")
        val node2 = Node(nodeId = "node2", nodeName = "N2", ipAddress = "192.168.1.2", role = "node", status = "online")
        nodeDao.insert(node1)
        nodeDao.insert(node2)

        detectionDao.insert(Detection(UUID.randomUUID().toString(), "node1", System.currentTimeMillis(), 0.9f, "banner"))
        detectionDao.insert(Detection(UUID.randomUUID().toString(), "node2", System.currentTimeMillis(), 0.9f, "commercial"))
        detectionDao.insert(Detection(UUID.randomUUID().toString(), "node1", System.currentTimeMillis(), 0.9f, "overlay"))

        // When
        val node1Detections = detectionDao.getByNodeId("node1")

        // Then
        assertThat(node1Detections).hasSize(2)
        assertThat(node1Detections.all { it.nodeId == "node1" }).isTrue()
    }

    @Test
    fun `count total detections`() = runBlocking {
        // Given
        val node = Node(nodeId = "test-node", nodeName = "Test", ipAddress = "192.168.1.1", role = "node", status = "online")
        nodeDao.insert(node)

        repeat(5) {
            detectionDao.insert(Detection(
                UUID.randomUUID().toString(),
                "test-node",
                System.currentTimeMillis(),
                0.9f,
                "commercial"
            ))
        }

        // When
        val count = detectionDao.getCount()

        // Then
        assertThat(count).isEqualTo(5)
    }

    // ===== NODE STATS TESTS =====

    @Test
    fun `insert node stats time series`() = runBlocking {
        // Given
        val node = Node(nodeId = "test-node", nodeName = "Test", ipAddress = "192.168.1.1", role = "node", status = "online")
        nodeDao.insert(node)

        val stats = NodeStats(
            nodeId = "test-node",
            timestamp = System.currentTimeMillis(),
            cpuUsage = 45.5f,
            memoryUsage = 60.2f,
            diskUsage = 30.0f,
            temperature = 55.0f
        )

        // When
        nodeStatsDao.insert(stats)
        val retrieved = nodeStatsDao.getByNodeId("test-node")

        // Then
        assertThat(retrieved).hasSize(1)
        assertThat(retrieved[0].cpuUsage).isEqualTo(45.5f)
        assertThat(retrieved[0].temperature).isEqualTo(55.0f)
    }

    @Test
    fun `get node stats within time range`() = runBlocking {
        // Given
        val node = Node(nodeId = "test-node", nodeName = "Test", ipAddress = "192.168.1.1", role = "node", status = "online")
        nodeDao.insert(node)

        val now = System.currentTimeMillis()
        val oneHourAgo = now - 3600000
        val twoHoursAgo = now - 7200000

        nodeStatsDao.insert(NodeStats("test-node", twoHoursAgo, 40f, 50f, 30f, 50f))
        nodeStatsDao.insert(NodeStats("test-node", oneHourAgo, 45f, 55f, 30f, 52f))
        nodeStatsDao.insert(NodeStats("test-node", now, 50f, 60f, 30f, 55f))

        // When
        val stats = nodeStatsDao.getStatsSince("test-node", oneHourAgo - 1000)

        // Then
        assertThat(stats).hasSize(2) // Should include oneHourAgo and now
        assertThat(stats[0].cpuUsage).isEqualTo(45f)
        assertThat(stats[1].cpuUsage).isEqualTo(50f)
    }

    @Test
    fun `delete old stats keeps recent ones`() = runBlocking {
        // Given
        val node = Node(nodeId = "test-node", nodeName = "Test", ipAddress = "192.168.1.1", role = "node", status = "online")
        nodeDao.insert(node)

        val now = System.currentTimeMillis()
        val oneDayAgo = now - 86400000
        val twoDaysAgo = now - 172800000

        nodeStatsDao.insert(NodeStats("test-node", twoDaysAgo, 40f, 50f, 30f, 50f))
        nodeStatsDao.insert(NodeStats("test-node", oneDayAgo, 45f, 55f, 30f, 52f))
        nodeStatsDao.insert(NodeStats("test-node", now, 50f, 60f, 30f, 55f))

        // When - delete stats older than 1.5 days
        nodeStatsDao.deleteOlderThan(now - 129600000)
        val remaining = nodeStatsDao.getByNodeId("test-node")

        // Then
        assertThat(remaining).hasSize(2) // twoDaysAgo should be deleted
    }
}
