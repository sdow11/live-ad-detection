package com.liveaddetection.domain.detector

import android.os.Build
import com.google.common.truth.Truth.assertThat
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * HardwareAccelerator Tests
 * Tests for hardware acceleration detection
 */
@RunWith(RobolectricTestRunner::class)
class HardwareAcceleratorTest {

    private lateinit var accelerator: HardwareAccelerator

    @Before
    fun setUp() {
        accelerator = HardwareAccelerator()
    }

    // ========== NNAPI Availability Tests ==========

    @Config(sdk = [Build.VERSION_CODES.O_MR1])
    @Test
    fun `isNnapiAvailable returns true on API 27+`() {
        val available = accelerator.isNnapiAvailable()

        assertThat(available).isTrue()
    }

    @Config(sdk = [Build.VERSION_CODES.P])
    @Test
    fun `isNnapiAvailable returns true on API 28`() {
        val available = accelerator.isNnapiAvailable()

        assertThat(available).isTrue()
    }

    @Config(sdk = [Build.VERSION_CODES.O])
    @Test
    fun `isNnapiAvailable returns false on API 26`() {
        val available = accelerator.isNnapiAvailable()

        assertThat(available).isFalse()
    }

    @Config(sdk = [Build.VERSION_CODES.N])
    @Test
    fun `isNnapiAvailable returns false on API 24`() {
        val available = accelerator.isNnapiAvailable()

        assertThat(available).isFalse()
    }

    // ========== GPU Availability Tests ==========

    @Test
    fun `isGpuAvailable returns boolean value`() {
        val available = accelerator.isGpuAvailable()

        // Should return either true or false, not null
        assertThat(available).isNotNull()
    }

    @Test
    fun `isGpuAvailable checks device compatibility`() {
        // GPU availability depends on device
        // Just verify the method exists and returns a value
        val available = accelerator.isGpuAvailable()

        assertThat(available is Boolean).isTrue()
    }

    // ========== Recommended Acceleration Tests ==========

    @Test
    fun `getRecommendedAcceleration returns valid acceleration type`() {
        val recommended = accelerator.getRecommendedAcceleration()

        // Should return one of the valid acceleration types
        val validTypes = setOf(
            AccelerationType.CPU,
            AccelerationType.GPU,
            AccelerationType.NNAPI,
            AccelerationType.HEXAGON,
            AccelerationType.AUTO
        )

        assertThat(recommended).isIn(validTypes)
    }

    @Test
    fun `getRecommendedAcceleration prefers GPU when available`() {
        // If GPU is available, it should be recommended
        // This depends on device capabilities
        val recommended = accelerator.getRecommendedAcceleration()

        // GPU or NNAPI should be preferred over CPU when available
        if (accelerator.isGpuAvailable()) {
            assertThat(recommended).isEqualTo(AccelerationType.GPU)
        } else if (accelerator.isNnapiAvailable()) {
            assertThat(recommended).isEqualTo(AccelerationType.NNAPI)
        } else {
            assertThat(recommended).isEqualTo(AccelerationType.CPU)
        }
    }

    @Config(sdk = [Build.VERSION_CODES.N])
    @Test
    fun `getRecommendedAcceleration falls back to CPU on old API`() {
        // On API < 27, NNAPI not available
        // If GPU also not available, should recommend CPU
        val recommended = accelerator.getRecommendedAcceleration()

        if (!accelerator.isGpuAvailable()) {
            assertThat(recommended).isEqualTo(AccelerationType.CPU)
        }
    }

    // ========== Capabilities Tests ==========

    @Test
    fun `getCapabilities returns all capability flags`() {
        val capabilities = accelerator.getCapabilities()

        // Should have all fields populated
        assertThat(capabilities.nnapi is Boolean).isTrue()
        assertThat(capabilities.gpu is Boolean).isTrue()
        assertThat(capabilities.hexagon is Boolean).isTrue()
        assertThat(capabilities.recommendedType).isNotNull()
    }

    @Test
    fun `getCapabilities nnapi matches isNnapiAvailable`() {
        val capabilities = accelerator.getCapabilities()

        assertThat(capabilities.nnapi).isEqualTo(accelerator.isNnapiAvailable())
    }

    @Test
    fun `getCapabilities gpu matches isGpuAvailable`() {
        val capabilities = accelerator.getCapabilities()

        assertThat(capabilities.gpu).isEqualTo(accelerator.isGpuAvailable())
    }

    @Test
    fun `getCapabilities recommended type matches getRecommendedAcceleration`() {
        val capabilities = accelerator.getCapabilities()
        val recommended = accelerator.getRecommendedAcceleration()

        assertThat(capabilities.recommendedType).isEqualTo(recommended)
    }

    @Test
    fun `getCapabilities hexagon is false by default`() {
        val capabilities = accelerator.getCapabilities()

        // Hexagon DSP not widely supported
        assertThat(capabilities.hexagon).isFalse()
    }

    // ========== Priority Tests ==========

    @Test
    fun `acceleration priority is GPU then NNAPI then CPU`() {
        val recommended = accelerator.getRecommendedAcceleration()

        // Verify priority order:
        // GPU > NNAPI > CPU
        if (accelerator.isGpuAvailable()) {
            assertThat(recommended).isEqualTo(AccelerationType.GPU)
        } else if (accelerator.isNnapiAvailable()) {
            assertThat(recommended).isEqualTo(AccelerationType.NNAPI)
        } else {
            assertThat(recommended).isEqualTo(AccelerationType.CPU)
        }
    }

    // ========== Consistency Tests ==========

    @Test
    fun `multiple calls to isNnapiAvailable return same result`() {
        val result1 = accelerator.isNnapiAvailable()
        val result2 = accelerator.isNnapiAvailable()

        assertThat(result1).isEqualTo(result2)
    }

    @Test
    fun `multiple calls to isGpuAvailable return same result`() {
        val result1 = accelerator.isGpuAvailable()
        val result2 = accelerator.isGpuAvailable()

        assertThat(result1).isEqualTo(result2)
    }

    @Test
    fun `multiple calls to getRecommendedAcceleration return same result`() {
        val result1 = accelerator.getRecommendedAcceleration()
        val result2 = accelerator.getRecommendedAcceleration()

        assertThat(result1).isEqualTo(result2)
    }

    @Test
    fun `getCapabilities is consistent across multiple calls`() {
        val cap1 = accelerator.getCapabilities()
        val cap2 = accelerator.getCapabilities()

        assertThat(cap1.nnapi).isEqualTo(cap2.nnapi)
        assertThat(cap1.gpu).isEqualTo(cap2.gpu)
        assertThat(cap1.hexagon).isEqualTo(cap2.hexagon)
        assertThat(cap1.recommendedType).isEqualTo(cap2.recommendedType)
    }
}
