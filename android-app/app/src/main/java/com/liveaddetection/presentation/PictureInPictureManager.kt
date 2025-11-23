package com.liveaddetection.presentation

import android.app.Activity
import android.app.PictureInPictureParams
import android.os.Build
import android.util.Rational

/**
 * Picture-in-Picture Manager Implementation
 * Single Responsibility: Manage PiP mode lifecycle
 */
class PictureInPictureManager(
    private val activity: Activity
) : IPictureInPictureManager {

    @Volatile
    private var pipActive = false

    override fun isPipSupported(): Boolean {
        // PiP is supported on Android 8.0 (API 26) and above
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
    }

    override fun enterPipMode(aspectRatio: Pair<Int, Int>): Boolean {
        if (!isPipSupported()) {
            return false
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Validate and clamp aspect ratio
                // PiP requires ratio between 0.41 (~9:21) and 2.39 (~21:9)
                val ratio = aspectRatio.first.toFloat() / aspectRatio.second.toFloat()
                val clampedRatio = ratio.coerceIn(0.41f, 2.39f)

                // Create rational from clamped ratio
                val rationalAspectRatio = if (clampedRatio != ratio) {
                    // Ratio was clamped, use safe 16:9
                    Rational(16, 9)
                } else {
                    Rational(aspectRatio.first, aspectRatio.second)
                }

                // Build PiP params
                val params = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    PictureInPictureParams.Builder()
                        .setAspectRatio(rationalAspectRatio)
                        .build()
                } else {
                    null
                }

                // Enter PiP mode
                val success = if (params != null) {
                    activity.enterPictureInPictureMode(params)
                } else {
                    false
                }

                if (success) {
                    pipActive = true
                }

                return success
            }

            return false
        } catch (e: Exception) {
            return false
        }
    }

    override fun exitPipMode() {
        pipActive = false
        // Activity will handle exiting PiP through onPictureInPictureModeChanged
    }

    override fun isPipActive(): Boolean = pipActive

    override fun updatePipParams(aspectRatio: Pair<Int, Int>) {
        if (!isPipActive() || !isPipSupported()) {
            return
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val ratio = aspectRatio.first.toFloat() / aspectRatio.second.toFloat()
                val clampedRatio = ratio.coerceIn(0.41f, 2.39f)

                val rationalAspectRatio = if (clampedRatio != ratio) {
                    Rational(16, 9)
                } else {
                    Rational(aspectRatio.first, aspectRatio.second)
                }

                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(rationalAspectRatio)
                    .build()

                activity.setPictureInPictureParams(params)
            }
        } catch (e: Exception) {
            // Update failed
        }
    }

    /**
     * Call this from Activity.onPictureInPictureModeChanged
     */
    fun onPipModeChanged(isInPictureInPictureMode: Boolean) {
        pipActive = isInPictureInPictureMode
    }
}
