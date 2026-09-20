package com.example.open_fantasia.data.continuity

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.example.open_fantasia.data.local.dao.CharacterDao
import com.example.open_fantasia.data.local.dao.PortraitTaskDao
import com.example.open_fantasia.data.local.entity.CastPortraitEntity
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.PortraitGenerationJobEntity
import com.example.open_fantasia.domain.model.CastProfile
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class PortraitGenerationCoordinator(
    private val context: Context,
    private val characterDao: CharacterDao,
    private val portraitDao: PortraitTaskDao,
    private val client: ContinuityHostClient,
    private val preferences: ContinuityHostPreferences
) {
    private val json = Json { encodeDefaults = true }

    suspend fun ensureAllPrimaryPortraits() {
        cleanupPreHardeningDuplicates()
        characterDao.getAllCharacters().forEach { ensurePrimary(it) }
    }

    private suspend fun cleanupPreHardeningDuplicates() {
        val now = Instant.now().toString()
        portraitDao.getAllJobs()
            .groupBy { listOf(it.subject_type, it.character_id, it.branch_id.orEmpty(), it.cast_id.orEmpty(), it.source_hash).joinToString("|") }
            .values
            .forEach { versions ->
                val accepted = versions.lastOrNull { it.status == "accepted" } ?: return@forEach
                versions.filter { it.id != accepted.id && it.status !in setOf("accepted", "failed", "superseded") }
                    .forEach { duplicate ->
                        portraitDao.upsertJob(duplicate.copy(status = "superseded", failure_detail = null, updated_at = now))
                        try { client.supersedePortrait(duplicate.id, accepted.id) } catch (_: Throwable) {}
                    }
            }
    }

    suspend fun ensurePrimary(character: CharacterEntity, force: Boolean = false) {
        val sourceHash = primarySourceHash(character)
        if (!force && character.portrait_source_hash == sourceHash && character.portrait_status in setOf("pending", "waiting_for_host", "processing", "ready")) return
        val now = Instant.now().toString()
        if (force) portraitDao.supersedePrimaryJobs(character.id, now)
        if (!force && portraitDao.findPrimaryJob("primary", character.id, sourceHash) != null) return
        val brief = PortraitBrief(
            canonical_name = character.name,
            appearance = character.appearance,
            role_background = character.story,
            personality = character.core_persona,
            voice_style = character.style_rules,
            boundaries = character.negative_guidance,
            visual_style = character.style_rules
        )
        val jobId = if (force) UUID.randomUUID().toString() else hash("primary|${character.id}|$sourceHash").take(36)
        portraitDao.upsertJob(newJob(jobId, "primary", character.id, null, null, null, sourceHash, brief, now))
        characterDao.insertCharacter(character.copy(
            portrait_status = "pending",
            portrait_source_hash = sourceHash,
            portrait_last_error = null,
            updated_at = now
        ))
        PortraitGenerationScheduler.enqueue(context)
    }

    suspend fun ensureCast(
        characterId: String,
        threadId: String,
        branchId: String,
        profile: CastProfile
    ) {
        if (profile.provenance == "primary") return
        val brief = PortraitBrief(
            canonical_name = profile.canonical_name,
            aliases = profile.aliases,
            appearance = profile.appearance,
            role_background = profile.role_background,
            personality = profile.personality,
            voice_style = profile.voice_style,
            goals = profile.goals,
            boundaries = profile.boundaries,
            evidence = profile.evidence,
            provenance = profile.provenance,
            manual_locks = profile.manual_locks
        )
        val briefJson = json.encodeToString(brief)
        val sourceHash = hash("portrait-v${PortraitProtocol.PROMPT_VERSION}|$branchId|${profile.cast_id}|$briefJson")
        if (portraitDao.findCastJob(branchId, profile.cast_id, sourceHash) != null) return
        val now = Instant.now().toString()
        val existing = portraitDao.getCastPortrait(branchId, profile.cast_id)
        portraitDao.upsertCastPortrait(CastPortraitEntity(
            id = "$branchId:${profile.cast_id}",
            thread_id = threadId,
            branch_id = branchId,
            cast_id = profile.cast_id,
            source_hash = sourceHash,
            portrait_path = existing?.portrait_path,
            thumbnail_path = existing?.thumbnail_path,
            portrait_brief_json = briefJson,
            status = "pending",
            last_error = null,
            generated_at = existing?.generated_at,
            updated_at = now
        ))
        val jobId = hash("cast|$branchId|${profile.cast_id}|$sourceHash").take(36)
        portraitDao.upsertJob(newJob(jobId, "cast", characterId, threadId, branchId, profile.cast_id, sourceHash, brief, now))
        PortraitGenerationScheduler.enqueue(context)
    }

    suspend fun sync(job: PortraitGenerationJobEntity) {
        flushAcknowledgements()
        if (job.status in setOf("failed", "accepted", "superseded")) return
        try {
            var current = portraitDao.getJob(job.id) ?: return
            if (current.status == "pending_export") {
                val remote = client.submitPortrait(request(current))
                current = current.copy(status = localStatus(remote.status), failure_detail = null, updated_at = Instant.now().toString())
                portraitDao.upsertJob(current)
                updateSubjectStatus(current, current.status, null)
            }
            val remote = client.portraitStatus(current.id)
            if (remote == null) {
                val detail = "The Mac Host no longer has this portrait attempt. Retry creates a new immutable job."
                portraitDao.upsertJob(current.copy(status = "failed", failure_detail = detail, updated_at = Instant.now().toString()))
                updateSubjectStatus(current, "failed", detail)
                return
            }
            when (remote.status) {
                "ready" -> accept(current)
                "failed" -> {
                    val detail = remote.error ?: "Antigravity could not create a portrait"
                    portraitDao.upsertJob(current.copy(status = "failed", failure_detail = detail, updated_at = Instant.now().toString()))
                    updateSubjectStatus(current, "failed", detail)
                }
                "expired" -> {
                    val detail = remote.error ?: "The portrait expired before the phone accepted it. Retry creates a new immutable job."
                    portraitDao.upsertJob(current.copy(status = "failed", failure_detail = detail, updated_at = Instant.now().toString()))
                    updateSubjectStatus(current, "failed", detail)
                }
                "superseded" -> portraitDao.upsertJob(current.copy(status = "superseded", updated_at = Instant.now().toString()))
                else -> {
                    val status = localStatus(remote.status)
                    portraitDao.upsertJob(current.copy(status = status, failure_detail = null, updated_at = Instant.now().toString()))
                    updateSubjectStatus(current, status, null)
                }
            }
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            val current = portraitDao.getJob(job.id) ?: return
            portraitDao.upsertJob(current.copy(failure_detail = "Waiting for Mac Host", updated_at = Instant.now().toString()))
            updateSubjectStatus(current, "waiting_for_host", "Waiting for Mac Host")
            client.markUnavailable(error)
        }
    }

    private suspend fun accept(job: PortraitGenerationJobEntity) {
        val response = client.portraitResult(job.id)
        require(response.protocol_version == 2 && response.job_type == "portrait")
        require(response.request_id == job.id && response.source_hash == job.source_hash)
        require(response.character_id == job.character_id && response.subject_type == job.subject_type)
        require(response.prompt_version == PortraitProtocol.PROMPT_VERSION && response.model_id == PortraitProtocol.MODEL_ID)
        if (job.subject_type == "primary") {
            val character = characterDao.getCharacter(job.character_id)
                ?: error("Portrait character no longer exists")
            require(character.portrait_source_hash == job.source_hash) {
                "Portrait source changed while generating"
            }
        } else {
            require(response.branch_id == job.branch_id && response.cast_id == job.cast_id)
            val current = portraitDao.getCastPortrait(requireNotNull(job.branch_id), requireNotNull(job.cast_id))
                ?: error("Cast portrait no longer exists")
            require(current.source_hash == job.source_hash) {
                "Cast profile changed while generating"
            }
        }
        val raw = Base64.getDecoder().decode(response.image_base64)
        require(hashBytes(raw) == response.sha256) { "Portrait image checksum mismatch" }
        val paths = storePortraitVersion(job, raw)
        val oldPaths = try {
            portraitDao.acceptPortrait(
                job.id,
                job.source_hash,
                paths.first,
                paths.second,
                job.portrait_brief_json
            )
        } catch (error: Throwable) {
            withContext(Dispatchers.IO) {
                File(paths.first).delete()
                File(paths.second).delete()
            }
            throw error
        }
        withContext(Dispatchers.IO) {
            oldPaths.oldPortraitPath?.takeUnless { it == paths.first }?.let { File(it).delete() }
            oldPaths.oldThumbnailPath?.takeUnless { it == paths.second }?.let { File(it).delete() }
        }
        preferences.rememberAcknowledgement(job.id, ContinuityHostPreferences.JOB_PORTRAIT)
        try {
            client.acknowledgePortrait(job.id)
            preferences.forgetAcknowledgement(job.id, ContinuityHostPreferences.JOB_PORTRAIT)
        } catch (_: Throwable) {}
    }

    suspend fun flushAcknowledgements() {
        preferences.pendingAcknowledgements(ContinuityHostPreferences.JOB_PORTRAIT).forEach { requestId ->
            try {
                client.acknowledgePortrait(requestId)
                preferences.forgetAcknowledgement(requestId, ContinuityHostPreferences.JOB_PORTRAIT)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                return
            }
        }
    }

    fun hasPendingAcknowledgements(): Boolean =
        preferences.pendingAcknowledgements(ContinuityHostPreferences.JOB_PORTRAIT).isNotEmpty()

    private suspend fun storePortraitVersion(job: PortraitGenerationJobEntity, raw: ByteArray): Pair<String, String> = withContext(Dispatchers.IO) {
        val decoded = BitmapFactory.decodeByteArray(raw, 0, raw.size) ?: error("Portrait image could not be decoded")
        require(decoded.width >= 640 && decoded.height >= 1000) { "Portrait image resolution is too low" }
        val targetRatio = 9f / 16f
        val sourceRatio = decoded.width.toFloat() / decoded.height
        val cropped = if (sourceRatio > targetRatio) {
            val width = (decoded.height * targetRatio).toInt()
            Bitmap.createBitmap(decoded, (decoded.width - width) / 2, 0, width, decoded.height)
        } else {
            val height = (decoded.width / targetRatio).toInt()
            Bitmap.createBitmap(decoded, 0, (decoded.height - height) / 2, decoded.width, height)
        }
        val master = Bitmap.createScaledBitmap(cropped, 1080, 1920, true)
        val square = Bitmap.createBitmap(master, 0, 420, 1080, 1080)
        val thumb = Bitmap.createScaledBitmap(square, 512, 512, true)
        val directory = File(context.filesDir, "portraits").apply { mkdirs() }
        val subjectKey = if (job.subject_type == "primary") job.character_id
            else hash("${job.branch_id}:${job.cast_id}").take(24)
        val key = "$subjectKey.${job.source_hash.take(16)}.${job.id.take(8)}"
        val masterFile = File(directory, "$key.webp")
        val thumbFile = File(directory, "$key.thumb.webp")
        writeBitmapAtomically(master, masterFile, 88)
        writeBitmapAtomically(thumb, thumbFile, 86)
        if (decoded !== cropped) decoded.recycle()
        if (cropped !== master) cropped.recycle()
        square.recycle()
        thumb.recycle()
        master.recycle()
        masterFile.absolutePath to thumbFile.absolutePath
    }

    private fun writeBitmapAtomically(bitmap: Bitmap, destination: File, quality: Int) {
        val temporary = File(destination.parentFile, ".${destination.name}.${UUID.randomUUID()}.tmp")
        temporary.outputStream().use { output ->
            check(bitmap.compress(Bitmap.CompressFormat.WEBP_LOSSY, quality, output)) { "Portrait compression failed" }
        }
        check(temporary.renameTo(destination)) { "Portrait file could not be committed" }
    }

    private suspend fun updateSubjectStatus(job: PortraitGenerationJobEntity, status: String, detail: String?) {
        val now = Instant.now().toString()
        if (job.subject_type == "primary") {
            val character = characterDao.getCharacter(job.character_id) ?: return
            if (character.portrait_source_hash != job.source_hash) return
            characterDao.insertCharacter(character.copy(portrait_status = status, portrait_last_error = detail, updated_at = now))
        } else if (job.branch_id != null && job.cast_id != null) {
            val portrait = portraitDao.getCastPortrait(job.branch_id, job.cast_id) ?: return
            if (portrait.source_hash != job.source_hash) return
            portraitDao.upsertCastPortrait(portrait.copy(status = status, last_error = detail, updated_at = now))
        }
    }

    private fun request(job: PortraitGenerationJobEntity) = PortraitRequestEnvelope(
        request_id = job.id,
        subject_type = job.subject_type,
        character_id = job.character_id,
        thread_id = job.thread_id,
        branch_id = job.branch_id,
        cast_id = job.cast_id,
        source_hash = job.source_hash,
        prompt_version = job.prompt_version,
        model_id = job.model_id,
        attempt_count = job.attempt_count,
        portrait_brief = json.decodeFromString(PortraitBrief.serializer(), job.portrait_brief_json)
    )

    private fun newJob(
        id: String,
        subjectType: String,
        characterId: String,
        threadId: String?,
        branchId: String?,
        castId: String?,
        sourceHash: String,
        brief: PortraitBrief,
        now: String
    ) = PortraitGenerationJobEntity(
        id = id,
        subject_type = subjectType,
        character_id = characterId,
        thread_id = threadId,
        branch_id = branchId,
        cast_id = castId,
        source_hash = sourceHash,
        prompt_version = PortraitProtocol.PROMPT_VERSION,
        portrait_brief_json = json.encodeToString(brief),
        model_id = PortraitProtocol.MODEL_ID,
        status = "pending_export",
        attempt_count = 0,
        failure_detail = null,
        created_at = now,
        updated_at = now,
        accepted_at = null
    )

    fun primarySourceHash(character: CharacterEntity) = hash(
        "portrait-v${PortraitProtocol.PROMPT_VERSION}|${character.name}|${character.appearance}|${character.core_persona}|${character.style_rules}|${character.story}"
    )

    private fun localStatus(remote: String) = when (remote) {
        "queued" -> "waiting_for_host"
        "running", "generating", "validating" -> "processing"
        else -> "waiting_for_host"
    }

    private fun hash(value: String) = hashBytes(value.toByteArray())
    private fun hashBytes(value: ByteArray) = MessageDigest.getInstance("SHA-256")
        .digest(value).joinToString("") { "%02x".format(it) }
}
