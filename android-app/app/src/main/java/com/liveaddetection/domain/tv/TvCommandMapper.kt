package com.liveaddetection.domain.tv

/**
 * TV Command Mapper Implementation
 * Single Responsibility: Map TvCommand to protocol-specific formats
 */
class TvCommandMapper : ITvCommandMapper {

    // Bluetooth HID Consumer Control codes
    private val bluetoothHidMap = mapOf(
        TvCommand.POWER_ON to byteArrayOf(0x30),
        TvCommand.POWER_OFF to byteArrayOf(0x30),
        TvCommand.POWER_TOGGLE to byteArrayOf(0x30),
        TvCommand.VOLUME_UP to byteArrayOf(0xE9.toByte()),
        TvCommand.VOLUME_DOWN to byteArrayOf(0xEA.toByte()),
        TvCommand.VOLUME_MUTE to byteArrayOf(0xE2.toByte()),
        TvCommand.CHANNEL_UP to byteArrayOf(0x9C.toByte()),
        TvCommand.CHANNEL_DOWN to byteArrayOf(0x9D.toByte()),
        TvCommand.PLAY to byteArrayOf(0xB0.toByte()),
        TvCommand.PAUSE to byteArrayOf(0xB1.toByte()),
        TvCommand.STOP to byteArrayOf(0xB7.toByte()),
        TvCommand.REWIND to byteArrayOf(0xB4.toByte()),
        TvCommand.FAST_FORWARD to byteArrayOf(0xB3.toByte()),
        TvCommand.MENU to byteArrayOf(0x40),
        TvCommand.HOME to byteArrayOf(0x23),
        TvCommand.BACK to byteArrayOf(0x24),
        TvCommand.UP to byteArrayOf(0x42),
        TvCommand.DOWN to byteArrayOf(0x43),
        TvCommand.LEFT to byteArrayOf(0x44),
        TvCommand.RIGHT to byteArrayOf(0x45),
        TvCommand.SELECT to byteArrayOf(0x41)
    )

    // HDMI-CEC opcodes and parameters
    private val cecCommandMap = mapOf(
        TvCommand.POWER_ON to Pair(0x04, byteArrayOf()), // Image View On
        TvCommand.POWER_OFF to Pair(0x36, byteArrayOf()), // Standby
        TvCommand.VOLUME_UP to Pair(0x44, byteArrayOf(0x41)), // User Control Pressed - Volume Up
        TvCommand.VOLUME_DOWN to Pair(0x44, byteArrayOf(0x42)), // User Control Pressed - Volume Down
        TvCommand.VOLUME_MUTE to Pair(0x44, byteArrayOf(0x43)), // User Control Pressed - Mute
        TvCommand.UP to Pair(0x44, byteArrayOf(0x01)),
        TvCommand.DOWN to Pair(0x44, byteArrayOf(0x02)),
        TvCommand.LEFT to Pair(0x44, byteArrayOf(0x03)),
        TvCommand.RIGHT to Pair(0x44, byteArrayOf(0x04)),
        TvCommand.SELECT to Pair(0x44, byteArrayOf(0x00))
    )

    override fun mapToBluetoothHid(command: TvCommand): ByteArray? {
        return bluetoothHidMap[command]
    }

    override fun mapToNetworkCommand(command: TvCommand, deviceModel: String): Pair<String, String>? {
        // Samsung Smart TV API
        if (deviceModel.contains("Samsung", ignoreCase = true)) {
            return mapToSamsungCommand(command)
        }

        // LG webOS API
        if (deviceModel.contains("LG", ignoreCase = true) || deviceModel.contains("webOS", ignoreCase = true)) {
            return mapToLgWebOsCommand(command)
        }

        // Sony Bravia API
        if (deviceModel.contains("Sony", ignoreCase = true) || deviceModel.contains("Bravia", ignoreCase = true)) {
            return mapToSonyBraviaCommand(command)
        }

        // Generic fallback (basic HTTP commands)
        return mapToGenericCommand(command)
    }

    override fun mapToCecCommand(command: TvCommand): Pair<Int, ByteArray>? {
        return cecCommandMap[command]
    }

    // ========== Brand-specific Network Command Mappers ==========

    private fun mapToSamsungCommand(command: TvCommand): Pair<String, String>? {
        // Samsung Smart TV uses a proprietary protocol over port 55000
        val keyCode = when (command) {
            TvCommand.POWER_TOGGLE -> "KEY_POWER"
            TvCommand.POWER_ON -> "KEY_POWERON"
            TvCommand.POWER_OFF -> "KEY_POWEROFF"
            TvCommand.VOLUME_UP -> "KEY_VOLUP"
            TvCommand.VOLUME_DOWN -> "KEY_VOLDOWN"
            TvCommand.VOLUME_MUTE -> "KEY_MUTE"
            TvCommand.CHANNEL_UP -> "KEY_CHUP"
            TvCommand.CHANNEL_DOWN -> "KEY_CHDOWN"
            TvCommand.UP -> "KEY_UP"
            TvCommand.DOWN -> "KEY_DOWN"
            TvCommand.LEFT -> "KEY_LEFT"
            TvCommand.RIGHT -> "KEY_RIGHT"
            TvCommand.SELECT -> "KEY_ENTER"
            TvCommand.MENU -> "KEY_MENU"
            TvCommand.HOME -> "KEY_HOME"
            TvCommand.BACK -> "KEY_RETURN"
            TvCommand.PLAY -> "KEY_PLAY"
            TvCommand.PAUSE -> "KEY_PAUSE"
            TvCommand.STOP -> "KEY_STOP"
            else -> null
        }

        return keyCode?.let {
            Pair("/api/v2/keys", """{"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":"$it"}}""")
        }
    }

    private fun mapToLgWebOsCommand(command: TvCommand): Pair<String, String>? {
        // LG webOS TV API
        val action = when (command) {
            TvCommand.POWER_TOGGLE -> "system/turnOff"
            TvCommand.VOLUME_UP -> "audio/volumeUp"
            TvCommand.VOLUME_DOWN -> "audio/volumeDown"
            TvCommand.VOLUME_MUTE -> "audio/setMute"
            TvCommand.CHANNEL_UP -> "tv/channelUp"
            TvCommand.CHANNEL_DOWN -> "tv/channelDown"
            TvCommand.PLAY -> "media.controls/play"
            TvCommand.PAUSE -> "media.controls/pause"
            TvCommand.STOP -> "media.controls/stop"
            else -> null
        }

        return action?.let {
            Pair("/api/$it", """{"type":"request","uri":"ssap://$it"}""")
        }
    }

    private fun mapToSonyBraviaCommand(command: TvCommand): Pair<String, String>? {
        // Sony Bravia uses IRCC (IR Command Code) over HTTP
        val irccCode = when (command) {
            TvCommand.POWER_TOGGLE -> "AAAAAQAAAAEAAAAVAw=="
            TvCommand.VOLUME_UP -> "AAAAAQAAAAEAAAASAw=="
            TvCommand.VOLUME_DOWN -> "AAAAAQAAAAEAAAATAw=="
            TvCommand.VOLUME_MUTE -> "AAAAAQAAAAEAAAAUAw=="
            TvCommand.CHANNEL_UP -> "AAAAAQAAAAEAAAAQAw=="
            TvCommand.CHANNEL_DOWN -> "AAAAAQAAAAEAAAARAw=="
            TvCommand.UP -> "AAAAAQAAAAEAAAB0Aw=="
            TvCommand.DOWN -> "AAAAAQAAAAEAAAB1Aw=="
            TvCommand.LEFT -> "AAAAAQAAAAEAAAA0Aw=="
            TvCommand.RIGHT -> "AAAAAQAAAAEAAAAzAw=="
            TvCommand.SELECT -> "AAAAAQAAAAEAAABlAw=="
            TvCommand.HOME -> "AAAAAQAAAAEAAABgAw=="
            TvCommand.BACK -> "AAAAAgAAAJcAAAAjAw=="
            else -> null
        }

        return irccCode?.let {
            Pair(
                "/sony/ircc",
                """<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>$it</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>"""
            )
        }
    }

    private fun mapToGenericCommand(command: TvCommand): Pair<String, String>? {
        // Generic REST API fallback
        val action = when (command) {
            TvCommand.POWER_TOGGLE -> "power/toggle"
            TvCommand.VOLUME_UP -> "volume/up"
            TvCommand.VOLUME_DOWN -> "volume/down"
            TvCommand.VOLUME_MUTE -> "volume/mute"
            else -> null
        }

        return action?.let {
            Pair("/api/$it", """{"action":"$it"}""")
        }
    }
}
