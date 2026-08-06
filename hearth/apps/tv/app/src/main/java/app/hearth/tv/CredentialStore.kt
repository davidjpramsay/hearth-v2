package app.hearth.tv

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class TvCredential(
    val serverOrigin: String,
    val deviceId: String,
    val householdId: String,
    val pairingSecret: String,
) {
    override fun toString(): String =
        "TvCredential(serverOrigin=$serverOrigin, deviceId=$deviceId, householdId=$householdId, pairingSecret=[REDACTED])"
}

class CredentialStore(context: Context) {
    private val preferences = context.getSharedPreferences(preferenceName, Context.MODE_PRIVATE)

    fun save(credential: TvCredential) {
        val fields = listOf(
            credential.serverOrigin,
            credential.deviceId,
            credential.householdId,
            credential.pairingSecret,
        )
        require(fields.all { it.isNotBlank() && !it.contains('\n') }) {
            "Credential fields must be present and single-line."
        }
        val plaintext = fields.joinToString("\n")
        val cipher = Cipher.getInstance(transformation)
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
        val encrypted = cipher.doFinal(plaintext.toByteArray(StandardCharsets.UTF_8))
        preferences.edit()
            .putString(ivKey, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString(blobKey, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .apply()
    }

    fun load(): TvCredential? = runCatching {
        val iv = preferences.getString(ivKey, null) ?: return null
        val blob = preferences.getString(blobKey, null) ?: return null
        val cipher = Cipher.getInstance(transformation)
        cipher.init(
            Cipher.DECRYPT_MODE,
            encryptionKey(),
            GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
        )
        val decoded = cipher.doFinal(Base64.decode(blob, Base64.NO_WRAP))
            .toString(StandardCharsets.UTF_8)
            .split('\n')
        if (decoded.size != 4 || decoded.any(String::isBlank)) return null
        TvCredential(decoded[0], decoded[1], decoded[2], decoded[3])
    }.getOrElse {
        clear()
        null
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    private fun encryptionKey(): SecretKey {
        val keyStore = KeyStore.getInstance(keyStoreName).apply { load(null) }
        (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, keyStoreName)
        generator.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val preferenceName = "hearth_secure_device"
        const val ivKey = "credential_iv"
        const val blobKey = "credential_blob"
        const val keyStoreName = "AndroidKeyStore"
        const val keyAlias = "hearth_tv_device_v1"
        const val transformation = "AES/GCM/NoPadding"
    }
}

class LocalStateStore(context: Context) {
    private val preferences = context.getSharedPreferences("hearth_tv_state", Context.MODE_PRIVATE)

    var serverOrigin: String?
        get() = preferences.getString("server_origin", null)
        set(value) = preferences.edit().putString("server_origin", value).apply()

    var lastPath: String
        get() = preferences.getString("last_path", "/today") ?: "/today"
        set(value) {
            if (value.startsWith('/') && !value.startsWith("//") && value.length <= 240) {
                preferences.edit().putString("last_path", value).apply()
            }
        }

    fun clearOrigin() {
        preferences.edit().remove("server_origin").remove("last_path").apply()
    }
}
