package com.example.open_fantasia.data.continuity

import com.example.open_fantasia.data.local.dao.ChatDao
import com.example.open_fantasia.data.local.dao.ConnectionDao
import com.example.open_fantasia.data.local.entity.RoleplayGenerationJobEntity
import com.example.open_fantasia.data.remote.ChatMessage
import com.example.open_fantasia.data.remote.LLMClient
import com.example.open_fantasia.domain.model.RoleplayProviderCapabilities
import com.example.open_fantasia.domain.model.RoleplayOutputValidator
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

class RoleplayGenerationCoordinator(
    private val chatDao: ChatDao,
    private val connectionDao: ConnectionDao,
    private val llmClient: LLMClient,
    private val client: ContinuityHostClient,
    private val preferences: ContinuityHostPreferences
) {
    private val activeDirectJobs = ConcurrentHashMap.newKeySet<String>()

    suspend fun execute(
        job: RoleplayGenerationJobEntity,
        onPartialText: (String) -> Unit = {}
    ) {
        if (job.execution_mode == EXECUTION_MODE_MAC_HOST) {
            sync(job)
        } else {
            executeDirect(job, onPartialText)
        }
    }

    suspend fun sync(job: RoleplayGenerationJobEntity) {
        if (job.execution_mode != EXECUTION_MODE_MAC_HOST) return
        flushAcknowledgements()
        if (job.status in setOf("failed", "accepted", "superseded")) return
        try {
            var current = chatDao.getRoleplayJob(job.id) ?: return
            if (current.status == "pending_export") {
                val remote = client.submitRoleplay(RoleplayProtocol.request(current))
                current = current.copy(status = localStatus(remote.status), failure_detail = null, updated_at = Instant.now().toString())
                chatDao.updateRoleplayJob(current)
                chatDao.markTurnGenerationStatus(current.turn_id, current.status, Instant.now().toString())
            }
            val remote = client.roleplayStatus(current.id)
            if (remote == null) {
                chatDao.failRoleplayJob(
                    current.id,
                    "The Mac Host no longer has this reply attempt. Retry creates a new immutable job."
                )
                return
            }
            when (remote.status) {
                "ready" -> accept(current)
                "failed" -> chatDao.failRoleplayJob(current.id, remote.error ?: "Antigravity could not create a reply")
                "expired" -> chatDao.failRoleplayJob(
                    current.id,
                    remote.error ?: "The reply expired before the phone accepted it. Retry creates a new immutable job."
                )
                "superseded" -> chatDao.updateRoleplayJob(current.copy(status = "superseded", updated_at = Instant.now().toString()))
                else -> {
                    val status = localStatus(remote.status)
                    if (current.status != status) {
                        chatDao.updateRoleplayJob(current.copy(status = status, failure_detail = null, updated_at = Instant.now().toString()))
                        chatDao.markTurnGenerationStatus(current.turn_id, status, Instant.now().toString())
                    }
                }
            }
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            val current = chatDao.getRoleplayJob(job.id) ?: return
            if (current.status !in setOf("failed", "accepted", "superseded")) {
                chatDao.updateRoleplayJob(current.copy(
                    failure_detail = "Waiting for Mac Host",
                    updated_at = Instant.now().toString()
                ))
            }
            client.markUnavailable(error)
        }
    }

    suspend fun resume(job: RoleplayGenerationJobEntity) {
        if (job.execution_mode == EXECUTION_MODE_MAC_HOST) {
            sync(job)
        } else if (job.status !in setOf("failed", "accepted", "superseded") &&
            job.id !in activeDirectJobs
        ) {
            chatDao.failRoleplayJob(
                job.id,
                "Direct API generation was interrupted before completion. Regenerate to try again."
            )
        }
    }

    suspend fun retry(job: RoleplayGenerationJobEntity): RoleplayGenerationJobEntity {
        require(job.execution_mode == EXECUTION_MODE_MAC_HOST) {
            "Only a durable Mac Host job can be retried without rebuilding its reply attempt"
        }
        val now = Instant.now().toString()
        val replacement = job.copy(
            id = UUID.randomUUID().toString(),
            status = "pending_export",
            attempt_count = job.attempt_count + 1,
            failure_detail = null,
            created_at = now,
            updated_at = now,
            accepted_at = null
        )
        chatDao.updateRoleplayJob(job.copy(status = "superseded", failure_detail = null, updated_at = now))
        chatDao.insertRoleplayJob(replacement)
        chatDao.markTurnGenerationStatus(job.turn_id, "waiting_for_host", now)
        try { client.supersedeRoleplay(job.id, replacement.id) } catch (_: Throwable) {}
        return replacement
    }

    suspend fun discard(job: RoleplayGenerationJobEntity) {
        if (job.execution_mode == EXECUTION_MODE_MAC_HOST) {
            try { client.supersedeRoleplay(job.id, "discarded:${UUID.randomUUID()}") } catch (_: Throwable) {}
        }
        chatDao.discardRoleplayJob(job.id)
    }

    fun capabilities(job: RoleplayGenerationJobEntity): RoleplayProviderCapabilities {
        if (job.execution_mode == EXECUTION_MODE_MAC_HOST) {
            return RoleplayProviderCapabilities(
                streams_partial_output = false,
                durable_after_disconnect = true,
                applies_temperature = false,
                applies_top_p = false,
                applies_max_tokens = false,
                applies_presence_penalty = false,
                applies_frequency_penalty = false
            )
        }
        val appliesOpenAiPenalties = job.provider in setOf("deepseek", "openrouter", "groq", "mistral")
        return RoleplayProviderCapabilities(
            streams_partial_output = true,
            durable_after_disconnect = false,
            applies_temperature = true,
            applies_top_p = true,
            applies_max_tokens = true,
            applies_presence_penalty = appliesOpenAiPenalties,
            applies_frequency_penalty = appliesOpenAiPenalties
        )
    }

    private suspend fun executeDirect(
        job: RoleplayGenerationJobEntity,
        onPartialText: (String) -> Unit
    ) {
        if (job.status in setOf("failed", "accepted", "superseded")) return
        check(activeDirectJobs.add(job.id)) { "This Roleplay Generation Job is already active" }
        val startedAt = System.currentTimeMillis()
        try {
            val connection = connectionDao.getConnection(job.connection_id)
                ?: error("The frozen Roleplay Model connection no longer exists")
            require(connection.provider == job.provider) { "The frozen Roleplay Model provider changed" }
            val request = RoleplayProtocol.generationRequest(job)
            val requestHash = request.sha256()
            require(job.request_hash.isBlank() || job.request_hash == requestHash) {
                "Frozen Roleplay Generation Request changed after reservation"
            }
            val now = Instant.now().toString()
            chatDao.updateRoleplayJob(job.copy(
                status = "processing",
                request_hash = requestHash,
                failure_detail = null,
                updated_at = now
            ))
            chatDao.markTurnGenerationStatus(job.turn_id, "streaming", now)

            var accumulatedText = ""
            var providerTotalTokens: Int? = null
            var providerPromptTokens: Int? = null
            var providerCompletionTokens: Int? = null
            var cacheHitTokens: Int? = null
            var cacheMissTokens: Int? = null
            var finishReason = "stop"
            llmClient.streamGenerateText(
                connection = connection.toDomain(),
                modelId = job.model_id,
                systemPrompt = request.system_prompt,
                messages = request.messages.map { ChatMessage(it.role, it.content) },
                temperature = request.settings.temperature,
                topP = request.settings.top_p,
                maxTokens = request.settings.max_tokens
            ).collect { chunk ->
                accumulatedText += chunk.text.orEmpty()
                providerTotalTokens = chunk.totalTokens ?: providerTotalTokens
                providerPromptTokens = chunk.promptTokens ?: providerPromptTokens
                providerCompletionTokens = chunk.completionTokens ?: providerCompletionTokens
                cacheHitTokens = chunk.promptCacheHitTokens ?: cacheHitTokens
                cacheMissTokens = chunk.promptCacheMissTokens ?: cacheMissTokens
                finishReason = chunk.finishReason ?: finishReason
                onPartialText(accumulatedText)
            }

            val generatedTokens = accumulatedText.split(Regex("\\s+")).size * 4 / 3
            val promptTokens = request.system_prompt.split(Regex("\\s+")).size * 4 / 3 +
                request.messages.sumOf { it.content.split(Regex("\\s+")).size * 4 / 3 }
            val finalPromptTokens = providerPromptTokens ?: promptTokens
            val finalCompletionTokens = providerCompletionTokens ?: generatedTokens
            val totalTokens = providerTotalTokens ?: (finalCompletionTokens + finalPromptTokens)
            val assistantPayload = buildString {
                append("{\"prompt_cache_hit_tokens\":")
                append(cacheHitTokens ?: "null")
                append(",\"prompt_cache_miss_tokens\":")
                append(cacheMissTokens ?: "null")
                append('}')
            }
            chatDao.acceptRoleplayJob(
                jobId = job.id,
                replyText = RoleplayOutputValidator.validate(accumulatedText),
                responseThreadId = job.thread_id,
                responseBranchId = job.branch_id,
                responseTurnId = job.turn_id,
                responseSpeakerId = job.requested_speaker_id,
                responseSpeakerMode = job.speaker_mode,
                responseModelId = job.model_id,
                elapsedMillis = System.currentTimeMillis() - startedAt,
                continuityEngineId = preferences.continuityEngineId()
                    ?: ContinuityHostPreferences.CODEX_TERRA_HIGH,
                provider = job.provider,
                connectionLabel = job.connection_label,
                finishReason = finishReason,
                assistantPayload = assistantPayload,
                totalTokens = totalTokens,
                promptTokens = finalPromptTokens,
                completionTokens = finalCompletionTokens
            )
        } catch (error: Throwable) {
            withContext(NonCancellable) {
                chatDao.failRoleplayJob(
                    job.id,
                    error.message ?: "The Roleplay Model could not create a reply"
                )
            }
            if (error is CancellationException) throw error
        } finally {
            activeDirectJobs.remove(job.id)
        }
    }

    private suspend fun accept(job: RoleplayGenerationJobEntity) {
        val response = client.roleplayResult(job.id)
        require(response.protocol_version == 2 && response.job_type == "roleplay") { "Roleplay protocol is incompatible" }
        require(response.request_id == job.id) { "Roleplay response belongs to another request" }
        chatDao.acceptRoleplayJob(
            jobId = job.id,
            replyText = RoleplayOutputValidator.validate(response.reply_text),
            responseThreadId = response.thread_id,
            responseBranchId = response.branch_id,
            responseTurnId = response.turn_id,
            responseSpeakerId = response.requested_speaker_id,
            responseSpeakerMode = response.speaker_mode,
            responseModelId = response.model_id,
            elapsedMillis = response.elapsed_millis,
            continuityEngineId = preferences.continuityEngineId()
                ?: ContinuityHostPreferences.CODEX_TERRA_HIGH,
            provider = job.provider,
            connectionLabel = job.connection_label
        )
        preferences.rememberAcknowledgement(job.id, ContinuityHostPreferences.JOB_ROLEPLAY)
        try {
            client.acknowledgeRoleplay(job.id)
            preferences.forgetAcknowledgement(job.id, ContinuityHostPreferences.JOB_ROLEPLAY)
        } catch (_: Throwable) {
            // The reply is already committed; host cleanup can be retried without regenerating.
        }
    }

    suspend fun flushAcknowledgements() {
        preferences.pendingAcknowledgements(ContinuityHostPreferences.JOB_ROLEPLAY).forEach { requestId ->
            try {
                client.acknowledgeRoleplay(requestId)
                preferences.forgetAcknowledgement(requestId, ContinuityHostPreferences.JOB_ROLEPLAY)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                return
            }
        }
    }

    fun hasPendingAcknowledgements(): Boolean =
        preferences.pendingAcknowledgements(ContinuityHostPreferences.JOB_ROLEPLAY).isNotEmpty()

    private fun localStatus(remote: String) = when (remote) {
        "queued" -> "waiting_for_host"
        "running", "generating", "validating" -> "processing"
        else -> "waiting_for_host"
    }

    companion object {
        const val EXECUTION_MODE_DIRECT = "direct"
        const val EXECUTION_MODE_MAC_HOST = "mac_host"
    }
}
