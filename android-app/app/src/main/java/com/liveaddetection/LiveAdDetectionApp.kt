package com.liveaddetection

import android.app.Application
import com.liveaddetection.data.database.AppDatabase

/**
 * Application class for Live Ad Detection
 */
class LiveAdDetectionApp : Application() {

    // Database instance
    val database: AppDatabase by lazy {
        AppDatabase.getInstance(this)
    }

    override fun onCreate() {
        super.onCreate()
        // Initialize app-wide components here
    }
}
