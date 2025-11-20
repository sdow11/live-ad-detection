package com.liveaddetection.domain.detector

import android.os.Build
import org.tensorflow.lite.gpu.CompatibilityList

/**
 * Hardware Accelerator Implementation
 * Single Responsibility: Detect and recommend hardware acceleration
 */
class HardwareAccelerator : IHardwareAccelerator {

    private val gpuCompatibilityList = CompatibilityList()

    override fun isNnapiAvailable(): Boolean {
        // NNAPI is available on Android 8.1 (API 27) and higher
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1
    }

    override fun isGpuAvailable(): Boolean {
        // Check if GPU delegate is supported on this device
        return gpuCompatibilityList.isDelegateSupportedOnThisDevice
    }

    override fun getRecommendedAcceleration(): AccelerationType {
        // Priority: GPU > NNAPI > CPU
        return when {
            isGpuAvailable() -> AccelerationType.GPU
            isNnapiAvailable() -> AccelerationType.NNAPI
            else -> AccelerationType.CPU
        }
    }

    override fun getCapabilities(): AccelerationCapabilities {
        val nnapi = isNnapiAvailable()
        val gpu = isGpuAvailable()
        val hexagon = false // Hexagon DSP support is device-specific and requires special setup

        val recommended = when {
            gpu -> AccelerationType.GPU
            nnapi -> AccelerationType.NNAPI
            hexagon -> AccelerationType.HEXAGON
            else -> AccelerationType.CPU
        }

        return AccelerationCapabilities(
            nnapi = nnapi,
            gpu = gpu,
            hexagon = hexagon,
            recommendedType = recommended
        )
    }
}
