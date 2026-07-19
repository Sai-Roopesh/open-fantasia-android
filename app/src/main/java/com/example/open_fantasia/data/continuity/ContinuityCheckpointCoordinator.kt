package com.example.open_fantasia.data.continuity

import com.example.open_fantasia.data.local.dao.ChatDao
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.ContinuityCheckpointEntity
import com.example.open_fantasia.data.local.entity.PersonaEntity
import com.example.open_fantasia.data.local.entity.PinEntity
import java.time.Instant
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
        pins: List<PinEntity>,
        directorNotes: String
    ) {
        if (request.status == "failed") return
        flushAcknowledgements()
        try {
            var current = chatDao.getCheckpoint(request.id) ?: return
            if (current.status == "pending_export") {
                val envelope = ContinuityCheckpointProtocol.buildRequest(
                    chatDao, current, character, persona, pins, directorNotes
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
                chatDao.updateCheckpoint(current.copy(
                    status = "pending_export",
                    failure_detail = null,
                    updated_at = Instant.now().toString()
                ))
                return
            }
            when (remote.status) {
                "ready" -> acceptResult(current)
                "failed" -> chatDao.updateCheckpoint(current.copy(
                    status = "failed",
                    failure_detail = remote.error ?: "Codex could not create a valid continuity snapshot",
                    updated_at = Instant.now().toString()
                ))
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
            client.markUnavailable(error)
            val latest = chatDao.getCheckpoint(request.id) ?: return
            if (latest.status != "failed" && latest.status != "accepted") {
                chatDao.updateCheckpoint(latest.copy(
                    failure_detail = "Waiting for Continuity Host",
                    updated_at = Instant.now().toString()
                ))
            }
        }
    }

    suspend fun retry(request: ContinuityCheckpointEntity) {
        chatDao.updateCheckpoint(request.copy(
            status = "pending_export",
            attempt_count = request.attempt_count + 1,
            failure_detail = null,
            updated_at = Instant.now().toString()
        ))
    }

    private suspend fun acceptResult(request: ContinuityCheckpointEntity) {
        val response = client.result(request.id)
        try {
            ContinuityCheckpointProtocol.acceptResponse(chatDao, request, response)
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            chatDao.updateCheckpoint(request.copy(
                status = "failed",
                failure_detail = error.message ?: "Continuity snapshot did not pass device validation",
                updated_at = Instant.now().toString()
            ))
            return
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

    private suspend fun flushAcknowledgements() {
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

    private fun localStatus(remote: String) = when (remote) {
        "queued" -> "waiting_for_host"
        "running", "generating" -> "processing"
        "validating" -> "validating"
        "ready" -> "validating"
        else -> "waiting_for_host"
    }
}
