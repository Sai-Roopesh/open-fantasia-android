package com.example.open_fantasia.data.continuity

import com.example.open_fantasia.data.local.entity.RoleplayGenerationJobEntity
import com.example.open_fantasia.domain.model.RoleplayGenerationRequest
import com.example.open_fantasia.domain.model.RoleplayGenerationSettings
import com.example.open_fantasia.domain.model.RoleplayMessage
import com.example.open_fantasia.domain.model.ModelCatalogEntry
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

typealias RoleplayPromptMessage = RoleplayMessage

@Serializable
data class RoleplayRequestEnvelope(
    val protocol_version: Int = 2,
    val job_type: String = "roleplay",
    val request_id: String,
    val thread_id: String,
    val branch_id: String,
    val turn_id: String,
    val requested_speaker_id: String?,
    val speaker_mode: String,
    val model_id: String,
    val attempt_count: Int,
    val request_hash: String,
    val generation_request: RoleplayGenerationRequest
)

@Serializable
data class RoleplayResponseEnvelope(
    val protocol_version: Int,
    val job_type: String,
    val request_id: String,
    val thread_id: String,
    val branch_id: String,
    val turn_id: String,
    val requested_speaker_id: String?,
    val speaker_mode: String,
    val model_id: String,
    val reply_text: String,
    val elapsed_millis: Long
)

object RoleplayProtocol {
    const val CONNECTION_ID = "builtin:mac-antigravity"
    const val PROVIDER = "antigravity_host"
    const val ANTIGRAVITY_MODEL_ID = "antigravity:gemini-3.6-flash:high"
    const val CLAUDE_CODE_MODEL_ID = "claude-code:sonnet:high"
    const val CLAUDE_OPUS_48_MODEL_ID = "claude-code:opus-4.8:high"
    const val CLAUDE_OPUS_5_MODEL_ID = "claude-code:opus-5:high"
    const val CODEX_MODEL_ID = "codex:gpt-5.6-terra:high"
    const val MODEL_ID = ANTIGRAVITY_MODEL_ID

    /**
     * Every model a reply can be written by, in the order they are offered.
     *
     * The Claude entries name a version rather than the `opus` alias the CLI would also accept. An
     * alias follows whatever is newest, and a story that changes voice mid-thread because a release
     * shipped is a continuity failure the app would have no way to explain.
     */
    val models = listOf(
        ModelCatalogEntry(
            id = ANTIGRAVITY_MODEL_ID,
            name = "Gemini 3.6 Flash High",
            provider = PROVIDER,
            hint = "Uses Antigravity credits through the paired Mac Host"
        ),
        ModelCatalogEntry(
            id = CLAUDE_CODE_MODEL_ID,
            name = "Claude Sonnet High",
            provider = PROVIDER,
            hint = "Uses the signed-in Claude Code subscription through the paired Mac Host"
        ),
        ModelCatalogEntry(
            id = CLAUDE_OPUS_48_MODEL_ID,
            name = "Claude Opus 4.8 High",
            provider = PROVIDER,
            hint = "Slower and stronger. Uses the signed-in Claude Code subscription on your Mac"
        ),
        ModelCatalogEntry(
            id = CLAUDE_OPUS_5_MODEL_ID,
            name = "Claude Opus 5 High",
            provider = PROVIDER,
            hint = "Slower and strongest. Uses the signed-in Claude Code subscription on your Mac"
        ),
        ModelCatalogEntry(
            id = CODEX_MODEL_ID,
            name = "GPT-5.6 Terra High",
            provider = PROVIDER,
            hint = "Uses the signed-in Codex subscription on your Mac"
        )
    )

    fun isSupportedModel(modelId: String): Boolean = models.any { it.id == modelId }

    fun displayName(modelId: String): String =
        models.firstOrNull { it.id == modelId }?.name ?: modelId
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun messagesJson(messages: List<RoleplayPromptMessage>): String =
        json.encodeToString(ListSerializer(RoleplayPromptMessage.serializer()), messages)

    fun generationRequest(job: RoleplayGenerationJobEntity): RoleplayGenerationRequest =
        RoleplayGenerationRequest(
            system_prompt = job.system_prompt,
            messages = json.decodeFromString(
                ListSerializer(RoleplayPromptMessage.serializer()),
                job.messages_json
            ),
            requested_speaker_id = job.requested_speaker_id,
            speaker_mode = job.speaker_mode,
            settings = RoleplayGenerationSettings(
                temperature = job.temperature,
                top_p = job.top_p,
                max_tokens = job.max_tokens
            )
        )

    fun request(job: RoleplayGenerationJobEntity): RoleplayRequestEnvelope {
        val generationRequest = generationRequest(job)
        val requestHash = generationRequest.sha256()
        require(job.request_hash.isBlank() || job.request_hash == requestHash) {
            "Frozen Roleplay Generation Request changed after reservation"
        }
        return RoleplayRequestEnvelope(
            request_id = job.id,
            thread_id = job.thread_id,
            branch_id = job.branch_id,
            turn_id = job.turn_id,
            requested_speaker_id = job.requested_speaker_id,
            speaker_mode = job.speaker_mode,
            model_id = job.model_id,
            attempt_count = job.attempt_count,
            request_hash = requestHash,
            generation_request = generationRequest
        )
    }
}
