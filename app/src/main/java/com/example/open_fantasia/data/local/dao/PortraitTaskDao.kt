package com.example.open_fantasia.data.local.dao

import androidx.room.*
import com.example.open_fantasia.data.local.entity.CastPortraitEntity
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.PortraitGenerationJobEntity
import kotlinx.coroutines.flow.Flow
import java.time.Instant

@Dao
abstract class PortraitTaskDao {
    @Upsert
    abstract suspend fun upsertJob(job: PortraitGenerationJobEntity)

    @Query("SELECT * FROM portrait_generation_jobs WHERE id = :id")
    abstract suspend fun getJob(id: String): PortraitGenerationJobEntity?

    @Query("SELECT * FROM portrait_generation_jobs WHERE status NOT IN ('accepted', 'failed', 'superseded') ORDER BY created_at ASC")
    abstract suspend fun getPendingJobs(): List<PortraitGenerationJobEntity>

    @Query("SELECT * FROM portrait_generation_jobs ORDER BY created_at ASC")
    abstract suspend fun getAllJobs(): List<PortraitGenerationJobEntity>

    @Query("SELECT * FROM portrait_generation_jobs WHERE subject_type = :subjectType AND character_id = :characterId AND source_hash = :sourceHash AND status NOT IN ('failed', 'superseded') LIMIT 1")
    abstract suspend fun findPrimaryJob(subjectType: String, characterId: String, sourceHash: String): PortraitGenerationJobEntity?

    @Query("SELECT * FROM portrait_generation_jobs WHERE branch_id = :branchId AND cast_id = :castId AND source_hash = :sourceHash AND status NOT IN ('failed', 'superseded') LIMIT 1")
    abstract suspend fun findCastJob(branchId: String, castId: String, sourceHash: String): PortraitGenerationJobEntity?

    @Query("UPDATE portrait_generation_jobs SET status = 'superseded', updated_at = :updatedAt WHERE subject_type = 'primary' AND character_id = :characterId AND status NOT IN ('failed', 'superseded')")
    abstract suspend fun supersedePrimaryJobs(characterId: String, updatedAt: String)

    @Upsert
    abstract suspend fun upsertCastPortrait(portrait: CastPortraitEntity)

    @Query("SELECT * FROM cast_portraits WHERE thread_id = :threadId")
    abstract fun getCastPortraitsForThreadFlow(threadId: String): Flow<List<CastPortraitEntity>>

    @Query("SELECT * FROM cast_portraits WHERE branch_id = :branchId AND cast_id = :castId LIMIT 1")
    abstract suspend fun getCastPortrait(branchId: String, castId: String): CastPortraitEntity?

    @Query("SELECT * FROM characters WHERE id = :id")
    protected abstract suspend fun getCharacterForAcceptance(id: String): CharacterEntity?

    @Update
    protected abstract suspend fun updateCharacterForAcceptance(character: CharacterEntity)

    @Transaction
    open suspend fun acceptPortrait(
        jobId: String,
        expectedSourceHash: String,
        portraitPath: String,
        thumbnailPath: String,
        portraitBriefJson: String
    ): PortraitFileSwap {
        val job = getJob(jobId) ?: error("Portrait job no longer exists")
        if (job.status == "accepted") return PortraitFileSwap(null, null)
        require(job.status != "superseded") { "Portrait job was superseded" }
        require(job.source_hash == expectedSourceHash) { "Portrait source identity changed" }
        val now = Instant.now().toString()
        val oldPaths = if (job.subject_type == "primary") {
            val character = getCharacterForAcceptance(job.character_id)
                ?: error("Portrait character no longer exists")
            require(character.portrait_source_hash == expectedSourceHash) {
                "Portrait source changed while generating"
            }
            updateCharacterForAcceptance(
                character.copy(
                    portrait_status = "ready",
                    portrait_path = portraitPath,
                    portrait_prompt = portraitBriefJson,
                    portrait_seed = null,
                    portrait_last_error = null,
                    portrait_generated_at = now,
                    updated_at = now
                )
            )
            PortraitFileSwap(character.portrait_path, character.portrait_path?.replace(".webp", ".thumb.webp"))
        } else {
            val branchId = requireNotNull(job.branch_id)
            val castId = requireNotNull(job.cast_id)
            val current = getCastPortrait(branchId, castId) ?: error("Cast portrait no longer exists")
            require(current.source_hash == expectedSourceHash) {
                "Cast profile changed while generating"
            }
            upsertCastPortrait(
                current.copy(
                    portrait_path = portraitPath,
                    thumbnail_path = thumbnailPath,
                    status = "ready",
                    last_error = null,
                    generated_at = now,
                    updated_at = now
                )
            )
            PortraitFileSwap(current.portrait_path, current.thumbnail_path)
        }
        upsertJob(job.copy(status = "accepted", failure_detail = null, updated_at = now, accepted_at = now))
        return oldPaths
    }
}

data class PortraitFileSwap(val oldPortraitPath: String?, val oldThumbnailPath: String?)
