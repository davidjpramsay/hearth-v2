package app.hearth.tv

enum class NativeRequest {
    APP_IDENTITY,
    NETWORK_STATUS,
    EXIT_REQUEST,
}

object BridgeProtocol {
    const val bridgeName = "hearthNative"
    const val backMessage = "{\"type\":\"back\"}"
    private val typeOnlyMessage = Regex("^\\{\\s*\"type\"\\s*:\\s*\"([a-z.]+)\"\\s*}$")

    fun parse(payload: String?): NativeRequest? {
        if (payload == null) return null
        if (payload.length > 256) return null
        return when (typeOnlyMessage.matchEntire(payload)?.groupValues?.get(1)) {
            "app.identity" -> NativeRequest.APP_IDENTITY
            "network.status" -> NativeRequest.NETWORK_STATUS
            "exit.request" -> NativeRequest.EXIT_REQUEST
            else -> null
        }
    }
}
