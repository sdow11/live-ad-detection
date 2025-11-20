package com.liveaddetection.data.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.liveaddetection.data.database.dao.DetectionDao
import com.liveaddetection.data.database.dao.NodeDao
import com.liveaddetection.data.database.dao.NodeStatsDao
import com.liveaddetection.data.database.entity.Detection
import com.liveaddetection.data.database.entity.Node
import com.liveaddetection.data.database.entity.NodeStats

/**
 * Main database for Live Ad Detection
 * Schema matches PostgreSQL database from backend
 */
@Database(
    entities = [
        Node::class,
        Detection::class,
        NodeStats::class
    ],
    version = 1,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun nodeDao(): NodeDao
    abstract fun detectionDao(): DetectionDao
    abstract fun nodeStatsDao(): NodeStatsDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "live_ad_detection_db"
                )
                    .fallbackToDestructiveMigration()
                    .build()

                INSTANCE = instance
                instance
            }
        }

        /**
         * For testing - allows custom database builder
         */
        fun getTestInstance(context: Context): AppDatabase {
            return Room.inMemoryDatabaseBuilder(
                context.applicationContext,
                AppDatabase::class.java
            )
                .allowMainThreadQueries()
                .build()
        }
    }
}
