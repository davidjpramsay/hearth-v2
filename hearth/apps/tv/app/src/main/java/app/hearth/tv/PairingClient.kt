package app.hearth.tv

import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.util.UUID

data class PairingSession(
    val pairingId: String,
    val code: String,
    val status: String,
    val expiresAt: String,
    val pairingSecret: String,
) {
    override fun toString(): String =
        "PairingSession(pairingId=$pairingId, code=$code, status=$status, expiresAt=$expiresAt, pairingSecret=[REDACTED])"
}

data class DeviceSession(
    val deviceId: String,
    val householdId: String,
    val deviceName: String,
)

class PairingClient {
    fun start(serverOrigin: String, applicationVersion: String): PairingSession {
        val pairingSecret = newSecret()
        val payload = JSONObject()
            .put("requestId", requestId("tv_pair"))
            .put("deviceName", "Living room Google TV")
            .put("applicationVersion", applicationVersion)
            .put("pairingSecret", pairingSecret)
        val response = request(serverOrigin, "/api/v1/tv-pairing-sessions", "POST", payload)
        val pairing = response.getJSONObject("pairing")
        return PairingSession(
            pairingId = pairing.getString("id"),
            code = pairing.getString("code"),
            status = pairing.getString("status"),
            expiresAt = pairing.getString("expiresAt"),
            pairingSecret = pairingSecret,
        )
    }

    fun status(serverOrigin: String, pairingId: String): String = request(
        serverOrigin,
        "/api/v1/device-pairing-requests/$pairingId",
        "GET",
    ).getString("status")

    fun exchange(serverOrigin: String, session: PairingSession): DeviceSession {
        val payload = JSONObject()
            .put("requestId", requestId("tv_exchange"))
            .put("pairingSecret", session.pairingSecret)
        return parseDeviceSession(
            request(
                serverOrigin,
                "/api/v1/tv-pairing-sessions/${session.pairingId}/credential-exchanges",
                "POST",
                payload,
            ),
        )
    }

    fun validate(serverOrigin: String, credential: String): DeviceSession = parseDeviceSession(
        request(
            serverOrigin,
            "/api/v1/device-sessions/current",
            "GET",
            authorization = credential,
        ),
    )

    private fun parseDeviceSession(response: JSONObject): DeviceSession = DeviceSession(
        deviceId = response.getString("deviceId"),
        householdId = response.getString("householdId"),
        deviceName = response.getString("deviceName"),
    )

    private fun request(
        origin: String,
        path: String,
        method: String,
        payload: JSONObject? = null,
        authorization: String? = null,
    ): JSONObject {
        val connection = (URL(origin + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 5_000
            readTimeout = 5_000
            instanceFollowRedirects = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "HearthTV/${BuildConfig.VERSION_NAME}")
            authorization?.let { setRequestProperty("Authorization", "Bearer $it") }
            if (payload != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            if (payload != null) {
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { writer ->
                    writer.write(payload.toString())
                }
            }
            val status = connection.responseCode
            val responseText = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader(Charsets.UTF_8)
                ?.use { it.readText() }
                .orEmpty()
            if (status !in 200..299) {
                val familyMessage = runCatching {
                    JSONObject(responseText).getJSONObject("error").getString("message")
                }.getOrNull()
                throw PairingClientException(status, familyMessage ?: "Hearth could not finish that request.")
            }
            return JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }

    private fun newSecret(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    private fun requestId(prefix: String): String = "${prefix}_${UUID.randomUUID()}"
}

class PairingClientException(
    val statusCode: Int,
    override val message: String,
) : Exception(message)
