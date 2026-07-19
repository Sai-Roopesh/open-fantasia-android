package com.example.open_fantasia.data.continuity

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

data class ContinuityHostPairing(
    val endpoint: String,
    val deviceId: String,
    val credential: String
)

class ContinuityHostPreferences(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    private val preferences = EncryptedSharedPreferences.create(
        context,
        "continuity_host_credentials",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun pairing(): ContinuityHostPairing? {
        val endpoint = preferences.getString("endpoint", null) ?: return null
        val deviceId = preferences.getString("device_id", null) ?: return null
        val credential = preferences.getString("credential", null) ?: return null
        return ContinuityHostPairing(endpoint, deviceId, credential)
    }

    fun save(pairing: ContinuityHostPairing) {
        preferences.edit()
            .putString("endpoint", normalizeEndpoint(pairing.endpoint))
            .putString("device_id", pairing.deviceId)
            .putString("credential", pairing.credential)
            .apply()
    }

    fun clear() = preferences.edit().clear().apply()

    fun pendingAcknowledgements(): Set<String> =
        preferences.getStringSet("pending_acknowledgements", emptySet()).orEmpty().toSet()

    fun rememberAcknowledgement(requestId: String) {
        preferences.edit().putStringSet(
            "pending_acknowledgements",
            pendingAcknowledgements() + requestId
        ).apply()
    }

    fun forgetAcknowledgement(requestId: String) {
        preferences.edit().putStringSet(
            "pending_acknowledgements",
            pendingAcknowledgements() - requestId
        ).apply()
    }

    companion object {
        fun normalizeEndpoint(raw: String): String {
            val value = raw.trim().trimEnd('/')
            require(value.startsWith("https://")) { "Continuity Host must use private HTTPS" }
            val host = java.net.URI(value).host.orEmpty()
            require(host.endsWith(".ts.net")) { "Continuity Host must use a Tailscale address" }
            return value
        }
    }
}
