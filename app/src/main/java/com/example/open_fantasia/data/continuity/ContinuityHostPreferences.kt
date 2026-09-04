package com.example.open_fantasia.data.continuity

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.io.IOException
import java.security.GeneralSecurityException

/**
 * A Continuity Engine the Mac Host can run, with the name a person chooses it by. The identity is
 * protocol; the label is not, which is why they live together here rather than being restated in
 * each screen that offers the choice.
 */
data class ContinuityEngineOption(
    val id: String,
    val label: String,
    val hint: String
)

data class ContinuityHostPairing(
    val endpoint: String,
    val deviceId: String,
    val credential: String
)

class ContinuityHostPreferences(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    private val preferences: SharedPreferences = recoverEncryptedCredentialStore(
        open = {
            EncryptedSharedPreferences.create(
                context,
                PREFERENCES_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        },
        clearCorruptStore = { context.deleteSharedPreferences(PREFERENCES_NAME) }
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

    fun clearPairing() = preferences.edit()
        .remove("endpoint")
        .remove("device_id")
        .remove("credential")
        .remove("pending_acknowledgements")
        .apply()

    fun continuityEngineId(): String? = preferences.getString("continuity_engine_id", null)

    fun saveContinuityEngineId(engineId: String) {
        require(engineId in SUPPORTED_CONTINUITY_ENGINES) { "Unsupported Continuity Engine" }
        preferences.edit().putString("continuity_engine_id", engineId).apply()
    }

    fun pendingAcknowledgements(jobType: String = JOB_CONTINUITY): Set<String> =
        preferences.getStringSet("pending_acknowledgements", emptySet())
            .orEmpty()
            .map { encoded ->
                if (':' in encoded) encoded.substringBefore(':') to encoded.substringAfter(':')
                else JOB_CONTINUITY to encoded
            }
            .filter { it.first == jobType }
            .map { it.second }
            .toSet()

    fun rememberAcknowledgement(requestId: String, jobType: String = JOB_CONTINUITY) {
        val encoded = "$jobType:$requestId"
        preferences.edit().putStringSet(
            "pending_acknowledgements",
            preferences.getStringSet("pending_acknowledgements", emptySet()).orEmpty() + encoded
        ).apply()
    }

    fun forgetAcknowledgement(requestId: String, jobType: String = JOB_CONTINUITY) {
        val encoded = "$jobType:$requestId"
        val stored = preferences.getStringSet("pending_acknowledgements", emptySet()).orEmpty()
        preferences.edit().putStringSet(
            "pending_acknowledgements",
            stored - encoded - if (jobType == JOB_CONTINUITY) requestId else ""
        ).apply()
    }

    companion object {
        private const val PREFERENCES_NAME = "continuity_host_credentials"
        const val CODEX_TERRA_HIGH = "codex:gpt-5.6-terra:high"
        const val ANTIGRAVITY_GEMINI_FLASH_HIGH = "antigravity:gemini-3.6-flash:high"
        const val CLAUDE_OPUS_HIGH = "claude-code:opus:high"
        const val JOB_CONTINUITY = "continuity"
        const val JOB_ROLEPLAY = "roleplay"
        const val JOB_PORTRAIT = "portrait"
        val CONTINUITY_ENGINES = listOf(
            ContinuityEngineOption(
                CODEX_TERRA_HIGH, "GPT-5.6 Terra High",
                "Runs on the Codex CLI signed in on your Mac"
            ),
            ContinuityEngineOption(
                ANTIGRAVITY_GEMINI_FLASH_HIGH, "Gemini 3.6 Flash High",
                "Runs on the Antigravity CLI signed in on your Mac"
            ),
            ContinuityEngineOption(
                CLAUDE_OPUS_HIGH, "Claude Opus High",
                "Runs on the signed-in Claude Code subscription on your Mac"
            )
        )
        val SUPPORTED_CONTINUITY_ENGINES = CONTINUITY_ENGINES.map { it.id }.toSet()

        fun continuityEngineLabel(engineId: String): String =
            CONTINUITY_ENGINES.firstOrNull { it.id == engineId }?.label ?: engineId

        fun normalizeEndpoint(raw: String): String {
            val value = raw.trim().trimEnd('/')
            require(value.startsWith("https://")) { "Mac Host must use private HTTPS" }
            val host = java.net.URI(value).host.orEmpty()
            require(host.endsWith(".ts.net")) { "Mac Host must use a Tailscale address" }
            return value
        }
    }
}

/**
 * EncryptedSharedPreferences ciphertext is intentionally not portable across an app uninstall:
 * Android deletes its Keystore key. A restored data backup may therefore contain healthy chat
 * data alongside credentials that can no longer be decrypted. Reset only that credential store
 * and let the user pair again; never crash chat or delete the database.
 */
internal fun <T> recoverEncryptedCredentialStore(
    open: () -> T,
    clearCorruptStore: () -> Boolean
): T = try {
    open()
} catch (error: Exception) {
    if (error !is GeneralSecurityException && error !is IOException) throw error
    clearCorruptStore()
    open()
}
