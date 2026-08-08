package com.example.open_fantasia.data.continuity

import com.example.open_fantasia.data.local.dao.ChatDao
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.ContinuityCheckpointEntity
import com.example.open_fantasia.data.local.entity.PersonaEntity
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CancellationException

class ContinuityCheckpointCoordinator(
    private val chatDao: ChatDao,
    private val client: ContinuityHostClient,
    private val preferences: ContinuityHostPreferences
) {
    suspend fun sync(
        request: ContinuityCheckpointEntity,
        character: CharacterEntity,
        persona: PersonaEntity?,
        directorNotes: String
    ) {
        flushAcknowledgements()
        try {
            var current = chatDao.getCheckpoint(request.id) ?: return
            // A completed local materialization is authoritative. This repairs an interrupted
            // acknowledgement or a stale retry without ever rebuilding the same checkpoint.
            if (chatDao.hasCompletedSnapshot(current.target_turn_id, current.baseline_version)) {
                markAccepted(current)
                return
            }
            if (current.status in setOf("failed", "accepted", "superseded")) return
            if (current.status == "pending_export") {
                val envelope = ContinuityCheckpointProtocol.buildRequest(
                    chatDao, current, character, persona, directorNotes
                )
                val remote = client.submit(envelope)
                current = current.copy(
                    baseline_hash = envelope.baseline_hash,
                    status = localStatus(remote.status),
                    failure_detail = null,
                    updated_at = Instant.now().toString()
                )
                chatDao.updateCheckpoint(current)
            }

            val remote = client.status(current.id)
            if (remote == null) {
                chatDao.transitionOpenCheckpoint(
                    current.id,
                    "failed",
                    "The Mac Host no longer has this Continuity Update. Retry creates a new immutable job.",
                    Instant.now().toString()
                )
                return
            }
            when (remote.status) {
                "ready" -> acceptResult(current)
                "failed" -> chatDao.updateCheckpoint(current.copy(
                    status = "failed",
                    failure_detail = remote.error ?: "Codex could not create a valid continuity snapshot",
                    updated_at = Instant.now().toString()
                ))
                "expired" -> chatDao.transitionOpenCheckpoint(
                    current.id,
                    "failed",
                    remote.error ?: "The Continuity Update expired before acceptance. Retry creates a new immutable job.",
                    Instant.now().toString()
                )
                "superseded" -> Unit
                else -> if (current.status != localStatus(remote.status)) {
                    chatDao.updateCheckpoint(current.copy(
                        status = localStatus(remote.status),
                        failure_detail = null,
                        updated_at = Instant.now().toString()
                    ))
                }
            }
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            val latest = chatDao.getCheckpoint(request.id) ?: return
            if (latest.status != "failed" && latest.status != "accepted") {
                chatDao.updateCheckpoint(latest.copy(
                    status = if (error is ContinuityHostHttpException && error.status == 409) "failed" else latest.status,
                    failure_detail = when {
                        error is ContinuityHostHttpException && error.status == 409 -> IMMUTABLE_CONFLICT_DETAIL
                        else -> "Waiting for Mac Host"
                    },
                    updated_at = Instant.now().toString()
                ))
            }
            if (error !is ContinuityHostHttpException || error.status >= 500) client.markUnavailable(error)
        }
    }

    suspend fun retry(request: ContinuityCheckpointEntity) {
        require(request.status == "failed") { "Only a failed Continuity Checkpoint can be retried" }
        val now = Instant.now().toString()
        val successor = request.copy(
            id = UUID.randomUUID().toString(),
            baseline_hash = "",
            status = "pending_export",
            attempt_count = request.attempt_count + 1,
            failure_detail = null,
            created_at = now,
            updated_at = now,
            accepted_at = null
        )
        chatDao.updateCheckpoint(request.copy(status = "superseded", failure_detail = null, updated_at = now))
        chatDao.insertCheckpoint(successor)
        try {
            client.supersede(request.id, successor.id)
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            // The new immutable identity is authoritative locally and will submit independently.
        }
    }

    suspend fun replaceEngine(request: ContinuityCheckpointEntity, engineId: String) {
        require(engineId in ContinuityHostPreferences.SUPPORTED_CONTINUITY_ENGINES)
        require(engineId != request.engine_id)
        val now = Instant.now().toString()
        val successor = request.copy(
            id = UUID.randomUUID().toString(),
            engine_id = engineId,
            baseline_hash = "",
            status = "pending_export",
            attempt_count = 0,
            failure_detail = null,
            created_at = now,
            updated_at = now,
            accepted_at = null
        )
        chatDao.updateCheckpoint(request.copy(status = "superseded", failure_detail = null, updated_at = now))
        chatDao.insertCheckpoint(successor)
        try { client.supersede(request.id, successor.id) } catch (_: Throwable) {}
    }

    private suspend fun markAccepted(request: ContinuityCheckpointEntity) {
        chatDao.transitionOpenCheckpoint(request.id, "accepted", null, Instant.now().toString())
    }

    private suspend fun acceptResult(request: ContinuityCheckpointEntity) {
        val response = client.result(request.id)
        try {
            ContinuityCheckpointProtocol.acceptResponse(chatDao, request, response)
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            val latest = chatDao.getCheckpoint(request.id) ?: return
            if (latest.status != "accepted") {
                chatDao.transitionOpenCheckpoint(
                    request.id,
                    "failed",
                    error.message ?: "Continuity snapshot did not pass device validation",
                    Instant.now().toString()
                )
                return
            }
        }
        preferences.rememberAcknowledgement(request.id)
        try {
            client.acknowledge(request.id)
            preferences.forgetAcknowledgement(request.id)
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            // The snapshot is already committed atomically. A later sync cleans remote prose.
        }
    }

    suspend fun flushAcknowledgements() {
        preferences.pendingAcknowledgements().forEach { requestId ->
            try {
                client.acknowledge(requestId)
                preferences.forgetAcknowledgement(requestId)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                return
            }
        }
    }

    fun hasPendingAcknowledgements(): Boolean =
        preferences.pendingAcknowledgements().isNotEmpty()

    private fun localStatus(remote: String) = when (remote) {
        "queued" -> "waiting_for_host"
        "running", "generating" -> "processing"
        "validating" -> "validating"
        "ready" -> "validating"
        else -> "waiting_for_host"
    }

    private companion object {
        const val IMMUTABLE_CONFLICT_DETAIL = "This checkpoint was already completed with an older immutable payload. Retry creates a fresh checkpoint."
    }
}
