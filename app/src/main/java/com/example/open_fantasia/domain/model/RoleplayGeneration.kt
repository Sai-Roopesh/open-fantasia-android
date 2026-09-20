package com.example.open_fantasia.domain.model

import java.security.MessageDigest
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class RoleplayMessage(
    val role: String,
    val content: String
) {
    init {
        require(role == "user" || role == "assistant") { "Unsupported roleplay message role" }
    }
}

/**
 * Sampling, as the reply was asked for.
 *
 * `presence_penalty` and `frequency_penalty` used to default to 0.4 "to discourage echoing". A
 * frequency penalty is a tax on tokens that have already appeared, and what appears most in human
 * dialogue is *I, you, it's, don't, yeah, okay,* the other person's name, and the word someone just
 * said twice because they are stalling — the exact surface the prompt asks for. The sampler was
 * fighting the instructions and winning. Both are zero now; a provider that offers nothing better and
 * loops anyway may be given at most 0.1.
 *
 * `min_p` is the truncation that suits creative writing at the temperatures roleplay runs at. Top-p
 * degrades there (Nguyen et al., ICLR 2025); min-p keeps coherence while leaving the tail alive. It is
 * recorded here as the intention and sent only where the adapter knows the backend accepts it.
 */
@Serializable
data class RoleplayGenerationSettings(
    val temperature: Double,
    val top_p: Double,
    val max_tokens: Int,
    val presence_penalty: Double = 0.0,
    val frequency_penalty: Double = 0.0,
    val min_p: Double? = DEFAULT_MIN_P
) {
    companion object {
        const val DEFAULT_MIN_P = 0.05
    }
}

/**
 * Provider-neutral, immutable input for one reply attempt. Only [system_prompt] and [messages]
 * are model-visible; speaker and settings fields describe the same frozen attempt without
 * allowing transport or queue metadata into the prompt.
 */
@Serializable
data class RoleplayGenerationRequest(
    val contract_version: Int = CONTRACT_VERSION,
    val system_prompt: String,
    val messages: List<RoleplayMessage>,
    val requested_speaker_id: String?,
    val speaker_mode: String,
    val settings: RoleplayGenerationSettings
) {
    fun canonicalJson(): String = JSON.encodeToString(this)

    fun sha256(): String = MessageDigest.getInstance("SHA-256")
        .digest(canonicalJson().toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    companion object {
        const val CONTRACT_VERSION = 1
        private val JSON = Json {
            encodeDefaults = true
            explicitNulls = true
        }

        fun decode(raw: String): RoleplayGenerationRequest = JSON.decodeFromString(raw)
    }
}

data class RoleplayProviderCapabilities(
    val streams_partial_output: Boolean,
    val durable_after_disconnect: Boolean,
    val applies_temperature: Boolean,
    val applies_top_p: Boolean,
    val applies_max_tokens: Boolean,
    val applies_presence_penalty: Boolean,
    val applies_frequency_penalty: Boolean,
    val applies_min_p: Boolean = false
)

object RoleplayOutputValidator {
    private const val MAX_REPLY_BYTES = 256 * 1024

    fun validate(value: String): String {
        val trimmed = value.trim()
        require(trimmed.isNotEmpty()) { "The Roleplay Model returned no visible reply" }
        require(!trimmed.matches(Regex("^```[\\s\\S]*```$", RegexOption.IGNORE_CASE))) {
            "The Roleplay Model wrapped its reply in a Markdown fence"
        }
        require(!(trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            "The Roleplay Model returned JSON instead of roleplay prose"
        }
        // By the time output reaches here its Scene Report has already been split off, so anything left
        // that is only a report is a reply with no story in it. See [SceneReportCodec].
        require(!trimmed.startsWith("<${SceneReportCodec.TAG}>", ignoreCase = true)) {
            "The Roleplay Model returned a scene report instead of roleplay prose"
        }
        require(!trimmed.matches(Regex(
            "^(here(?:'s| is)|certainly|of course)[,:]?\\s+(?:the|an|your)\\s+(?:reply|response)[\\s\\S]*$",
            RegexOption.IGNORE_CASE
        ))) {
            "The Roleplay Model prefaced its reply with agent commentary"
        }
        require(trimmed.toByteArray(Charsets.UTF_8).size <= MAX_REPLY_BYTES) {
            "The Roleplay Model reply exceeded the transport safety limit"
        }
        // Preserve direct-provider output bytes exactly as before; trimming is only for validation.
        return value
    }
}
