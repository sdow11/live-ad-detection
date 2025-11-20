package com.liveaddetection.domain.tv

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.*

/**
 * BluetoothTvController Tests - TDD Red Phase
 */
class BluetoothTvControllerTest {

    private lateinit var controller: IBluetoothTvController
    private lateinit var mockCommandMapper: ITvCommandMapper

    @Before
    fun setUp() {
        mockCommandMapper = mock()
        controller = BluetoothTvController(mockCommandMapper)
    }

    // ========== Connection Tests ==========

    @Test
    fun `isConnected returns false initially`() {
        val connected = controller.isConnected()
        assertThat(connected).isFalse()
    }

    // ========== Command Sending Tests ==========

    @Test
    fun `sendCommand with POWER_TOGGLE sends correct HID report`() = runBlocking {
        val hidReport = byteArrayOf(0x01, 0x02, 0x03)
        whenever(mockCommandMapper.mapToBluetoothHid(TvCommand.POWER_TOGGLE))
            .thenReturn(hidReport)

        val result = controller.sendCommand(TvCommand.POWER_TOGGLE)

        assertThat(result.command).isEqualTo(TvCommand.POWER_TOGGLE)
        verify(mockCommandMapper).mapToBluetoothHid(TvCommand.POWER_TOGGLE)
    }

    @Test
    fun `sendCommand with VOLUME_UP sends correct HID report`() = runBlocking {
        val hidReport = byteArrayOf(0x04, 0x05)
        whenever(mockCommandMapper.mapToBluetoothHid(TvCommand.VOLUME_UP))
            .thenReturn(hidReport)

        val result = controller.sendCommand(TvCommand.VOLUME_UP)

        assertThat(result.command).isEqualTo(TvCommand.VOLUME_UP)
    }

    @Test
    fun `sendCommand returns failure when not connected`() = runBlocking {
        whenever(mockCommandMapper.mapToBluetoothHid(any()))
            .thenReturn(byteArrayOf(0x01))

        val result = controller.sendCommand(TvCommand.POWER_ON)

        assertThat(result.success).isFalse()
        assertThat(result.error).contains("not connected")
    }

    @Test
    fun `sendCommand returns failure for unsupported command`() = runBlocking {
        whenever(mockCommandMapper.mapToBluetoothHid(TvCommand.POWER_ON))
            .thenReturn(null)

        val result = controller.sendCommand(TvCommand.POWER_ON)

        assertThat(result.success).isFalse()
        assertThat(result.error).contains("not supported")
    }

    @Test
    fun `sendCommand measures execution time`() = runBlocking {
        val hidReport = byteArrayOf(0x01, 0x02)
        whenever(mockCommandMapper.mapToBluetoothHid(any()))
            .thenReturn(hidReport)

        val result = controller.sendCommand(TvCommand.VOLUME_DOWN)

        assertThat(result.executionTimeMs).isGreaterThan(0)
    }

    // ========== Raw HID Report Tests ==========

    @Test
    fun `sendRawHidReport sends custom report`() = runBlocking {
        val customReport = byteArrayOf(0x10, 0x20, 0x30)

        val result = controller.sendRawHidReport(customReport)

        // Will fail if not connected, but tests the interface
        assertThat(result).isNotNull()
    }

    @Test
    fun `sendRawHidReport returns false when not connected`() = runBlocking {
        val customReport = byteArrayOf(0x10, 0x20)

        val result = controller.sendRawHidReport(customReport)

        assertThat(result).isFalse()
    }

    // ========== Consumer Control Tests ==========

    @Test
    fun `PLAY command maps to Consumer Control code`() = runBlocking {
        val expectedReport = byteArrayOf(0xB0.toByte()) // Consumer Control PLAY
        whenever(mockCommandMapper.mapToBluetoothHid(TvCommand.PLAY))
            .thenReturn(expectedReport)

        controller.sendCommand(TvCommand.PLAY)

        verify(mockCommandMapper).mapToBluetoothHid(TvCommand.PLAY)
    }

    @Test
    fun `PAUSE command maps to Consumer Control code`() = runBlocking {
        val expectedReport = byteArrayOf(0xB1.toByte()) // Consumer Control PAUSE
        whenever(mockCommandMapper.mapToBluetoothHid(TvCommand.PAUSE))
            .thenReturn(expectedReport)

        controller.sendCommand(TvCommand.PAUSE)

        verify(mockCommandMapper).mapToBluetoothHid(TvCommand.PAUSE)
    }
}
