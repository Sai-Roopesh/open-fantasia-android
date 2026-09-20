package com.example.open_fantasia.data.local.dao

import androidx.room.*
import com.example.open_fantasia.data.local.entity.*
import com.example.open_fantasia.domain.model.BranchLineage
import com.example.open_fantasia.domain.model.BranchLineageRef
import com.example.open_fantasia.domain.model.TurnLineageRef
import com.example.open_fantasia.domain.model.DurableMemorySnapshot
import com.example.open_fantasia.domain.model.VoiceMeter
import com.example.open_fantasia.domain.model.VoiceMetrics
import kotlinx.coroutines.flow.Flow
import java.time.Instant
import java.util.UUID

@Dao
abstract class ChatDao {

    // --- Core Queries ---

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertThread(thread: ThreadEntity)

    @Query("SELECT * FROM chat_threads WHERE id = :id")
    abstract suspend fun getThread(id: String): ThreadEntity?

    @Query("SELECT * FROM chat_threads WHERE id = :id")
    abstract fun getThreadFlow(id: String): Flow<ThreadEntity?>

    @Query("SELECT * FROM chat_threads ORDER BY updated_at DESC")
    abstract fun getAllThreadsFlow(): Flow<List<ThreadEntity>>

    @Update
    abstract suspend fun updateThread(thread: ThreadEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertCastSeed(seed: CastSeedEntity)

    @Query("SELECT * FROM cast_seeds WHERE thread_id = :threadId ORDER BY CASE provenance WHEN 'primary' THEN 0 WHEN 'manual_seed' THEN 1 ELSE 2 END, canonical_name COLLATE NOCASE")
    abstract suspend fun getCastSeeds(threadId: String): List<CastSeedEntity>

    @Query("SELECT * FROM cast_seeds WHERE thread_id = :threadId ORDER BY CASE provenance WHEN 'primary' THEN 0 WHEN 'manual_seed' THEN 1 ELSE 2 END, canonical_name COLLATE NOCASE")
    abstract fun getCastSeedsFlow(threadId: String): Flow<List<CastSeedEntity>>

    @Query("DELETE FROM cast_seeds WHERE cast_id = :castId AND provenance != 'primary'")
    abstract suspend fun deleteCastSeed(castId: String)

    /**
     * Gives a new thread its Primary Character as a Cast Seed.
     *
     * Every NOT NULL column must appear here. The list is explicit, and `INSERT OR IGNORE` turns a
     * constraint violation into silence, so omitting one does not raise an error: the row simply never
     * arrives and the thread has no Primary Character in its Cast Roster. That is what happened when
     * canonical_name_key was added and this statement was not updated with it.
     */
    @Query("""
        INSERT OR IGNORE INTO cast_seeds (
            cast_id, thread_id, entity_id, canonical_name, canonical_name_key, aliases,
            role_background, personality, voice_style, appearance, goals, boundaries, provenance,
            first_seen_turn_id, evidence, status, speaker_eligible, player_controlled,
            manual_locks, created_at, updated_at
        )
        SELECT 'primary:' || t.id, t.id, c.id, c.name, lower(trim(c.name)), '[]',
               c.story, c.core_persona, c.style_rules, c.appearance, '', c.negative_guidance,
               'primary', NULL, '[]', 'active', 1, 0,
               '["canonical_name","role_background","personality","voice_style","appearance","boundaries"]',
               t.created_at, t.updated_at
        FROM chat_threads t JOIN characters c ON c.id = t.character_id WHERE t.id = :threadId
    """)
    abstract suspend fun seedPrimaryCast(threadId: String): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertBranch(branch: BranchEntity)

    @Query("SELECT * FROM chat_branches WHERE id = :id")
    abstract suspend fun getBranch(id: String): BranchEntity?

    @Query("SELECT * FROM chat_branches WHERE thread_id = :threadId")
    abstract suspend fun getBranchesForThread(threadId: String): List<BranchEntity>

    @Query("SELECT * FROM chat_branches WHERE thread_id = :threadId")
    abstract fun getBranchesForThreadFlow(threadId: String): Flow<List<BranchEntity>>

    @Query("SELECT * FROM chat_branches WHERE thread_id = :threadId AND is_active = 1 LIMIT 1")
    abstract suspend fun getActiveBranchForThread(threadId: String): BranchEntity?

    @Query("SELECT * FROM chat_branches WHERE thread_id = :threadId AND is_active = 1 LIMIT 1")
    abstract fun getActiveBranchForThreadFlow(threadId: String): Flow<BranchEntity?>

    @Query("""
        SELECT b.* FROM chat_branches b
        LEFT JOIN chat_turns h ON h.id = b.head_turn_id
        WHERE b.head_turn_id IS NOT NULL AND h.id IS NULL
    """)
    abstract suspend fun getBranchesWithDanglingHeads(): List<BranchEntity>

    @Query("""
        SELECT * FROM chat_turns
        WHERE branch_origin_id = :branchId AND generation_status = 'committed'
        ORDER BY created_at DESC
        LIMIT 1
    """)
    abstract suspend fun getLatestCommittedTurnCreatedOnBranch(branchId: String): TurnEntity?

    @Update
    abstract suspend fun updateBranch(branch: BranchEntity)

    @Query("UPDATE chat_branches SET active_speaker_id = :castId, speaker_mode = :mode, updated_at = :timestamp WHERE id = :branchId")
    abstract suspend fun setActiveSpeaker(branchId: String, castId: String?, mode: String, timestamp: String)

    @Query("UPDATE chat_branches SET scene_intent = :intent, updated_at = :timestamp WHERE id = :branchId")
    abstract suspend fun setSceneIntent(branchId: String, intent: String, timestamp: String)

    @Query("UPDATE chat_threads SET story_direction = :encoded, updated_at = :timestamp WHERE id = :threadId")
    abstract suspend fun setStoryDirection(threadId: String, encoded: String, timestamp: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertCastOverride(override: CastProfileOverrideEntity)

    @Query("SELECT o.* FROM cast_profile_overrides o JOIN chat_branches b ON b.id = o.branch_id WHERE b.thread_id = :threadId")
    abstract fun getCastOverridesForThreadFlow(threadId: String): Flow<List<CastProfileOverrideEntity>>

    @Query("SELECT o.* FROM cast_profile_overrides o JOIN chat_branches b ON b.id = o.branch_id WHERE b.thread_id = :threadId")
    protected abstract suspend fun getAllCastOverridesForThread(threadId: String): List<CastProfileOverrideEntity>

    @Query("UPDATE chat_branches SET is_active = 0, updated_at = :timestamp WHERE thread_id = :threadId")
    abstract suspend fun deactivateAllBranchesForThread(threadId: String, timestamp: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertTurn(turn: TurnEntity): Long

    @Query("SELECT * FROM chat_turns WHERE id = :id")
    abstract suspend fun getTurn(id: String): TurnEntity?

    @Query("SELECT * FROM chat_turns WHERE thread_id = :threadId")
    abstract suspend fun getTurnsForThread(threadId: String): List<TurnEntity>

    @Query("SELECT * FROM chat_turns WHERE thread_id = :threadId")
    abstract fun getTurnsForThreadFlow(threadId: String): Flow<List<TurnEntity>>

    @Update
    abstract suspend fun updateTurn(turn: TurnEntity)

    @Query("DELETE FROM chat_turns WHERE id = :id")
    protected abstract suspend fun deleteTurn(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertSnapshot(snapshot: SnapshotEntity)

    @Query("SELECT * FROM world_snapshots WHERE turn_id = :turnId")
    abstract suspend fun getSnapshot(turnId: String): SnapshotEntity?

    @Query("SELECT EXISTS(SELECT 1 FROM world_snapshots WHERE turn_id = :turnId AND is_full_materialization = 1 AND version > :baselineVersion)")
    abstract suspend fun hasCompletedSnapshot(turnId: String, baselineVersion: Int): Boolean

    /** Reactive signal: re-emits whenever any snapshot row for the thread changes, so the
     *  chat UI re-reads currentSnapshot after a background materialization saves it. */
    @Query("SELECT COUNT(*) FROM world_snapshots WHERE thread_id = :threadId")
    abstract fun getSnapshotSignalFlow(threadId: String): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertCheckpoint(request: ContinuityCheckpointEntity)

    @Update
    abstract suspend fun updateCheckpoint(request: ContinuityCheckpointEntity)

    @Query("""
        UPDATE continuity_checkpoint_requests
        SET status = :status,
            failure_detail = :failureDetail,
            updated_at = :updatedAt,
            accepted_at = CASE WHEN :status = 'accepted' THEN COALESCE(accepted_at, :updatedAt) ELSE accepted_at END
        WHERE id = :requestId AND status NOT IN ('accepted', 'superseded')
    """)
    abstract suspend fun transitionOpenCheckpoint(
        requestId: String,
        status: String,
        failureDetail: String?,
        updatedAt: String
    ): Int

    @Query("SELECT * FROM continuity_checkpoint_requests WHERE id = :id")
    abstract suspend fun getCheckpoint(id: String): ContinuityCheckpointEntity?

    @Query("SELECT * FROM continuity_checkpoint_requests WHERE thread_id = :threadId ORDER BY created_at DESC")
    abstract fun getCheckpointsForThreadFlow(threadId: String): Flow<List<ContinuityCheckpointEntity>>

    @Query("SELECT * FROM continuity_checkpoint_requests WHERE status NOT IN ('accepted', 'superseded') ORDER BY created_at ASC")
    abstract suspend fun getPendingCheckpoints(): List<ContinuityCheckpointEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertRoleplayJob(job: RoleplayGenerationJobEntity)

    @Update
    abstract suspend fun updateRoleplayJob(job: RoleplayGenerationJobEntity)

    @Query("SELECT * FROM roleplay_generation_jobs WHERE id = :id")
    abstract suspend fun getRoleplayJob(id: String): RoleplayGenerationJobEntity?

    @Query("SELECT * FROM roleplay_generation_jobs WHERE turn_id = :turnId ORDER BY created_at DESC LIMIT 1")
    abstract suspend fun getLatestRoleplayJobForTurn(turnId: String): RoleplayGenerationJobEntity?

    @Query("SELECT * FROM roleplay_generation_jobs WHERE status NOT IN ('accepted', 'superseded') ORDER BY created_at ASC")
    abstract suspend fun getPendingRoleplayJobs(): List<RoleplayGenerationJobEntity>

    @Query("SELECT EXISTS(SELECT 1 FROM roleplay_generation_jobs WHERE turn_id = :turnId AND status NOT IN ('accepted', 'superseded'))")
    abstract suspend fun hasBlockingRoleplayJob(turnId: String): Boolean

    @Query("UPDATE chat_turns SET generation_status = :status, failure_code = NULL, failure_message = NULL, updated_at = :now WHERE id = :turnId")
    abstract suspend fun markTurnGenerationStatus(turnId: String, status: String, now: String)

    @Query("""
        WITH RECURSIVE path(id, parent_turn_id) AS (
            SELECT id, parent_turn_id FROM chat_turns WHERE id = :headTurnId
            UNION ALL
            SELECT t.id, t.parent_turn_id FROM chat_turns t JOIN path ON path.parent_turn_id = t.id
        )
        SELECT c.* FROM continuity_checkpoint_requests c
        WHERE c.status NOT IN ('accepted', 'superseded') AND c.target_turn_id IN (SELECT id FROM path)
        ORDER BY c.created_at DESC LIMIT 1
    """)
    abstract suspend fun getBlockingCheckpoint(headTurnId: String): ContinuityCheckpointEntity?

    /** The newest Scene Report on this lineage. Fresh presence beats a snapshot up to fifteen exchanges old. */
    @Query("""
        WITH RECURSIVE path(id, parent_turn_id, depth) AS (
            SELECT id, parent_turn_id, 0 FROM chat_turns WHERE id = :headTurnId
            UNION ALL
            SELECT t.id, t.parent_turn_id, path.depth + 1 FROM chat_turns t JOIN path ON path.parent_turn_id = t.id
        )
        SELECT t.scene_report FROM chat_turns t JOIN path ON path.id = t.id
        WHERE t.scene_report IS NOT NULL AND t.generation_status = 'committed'
        ORDER BY path.depth ASC LIMIT 1
    """)
    abstract suspend fun getNearestSceneReport(headTurnId: String): String?

    @Query("""
        WITH RECURSIVE path(id, parent_turn_id, depth) AS (
            SELECT id, parent_turn_id, 0 FROM chat_turns WHERE id = :headTurnId
            UNION ALL
            SELECT t.id, t.parent_turn_id, path.depth + 1 FROM chat_turns t JOIN path ON path.parent_turn_id = t.id
        )
        SELECT s.* FROM world_snapshots s JOIN path ON path.id = s.turn_id
        ORDER BY path.depth ASC LIMIT 1
    """)
    abstract suspend fun getNearestSnapshot(headTurnId: String): SnapshotEntity?

    @Transaction
    open suspend fun acceptCheckpoint(
        requestId: String,
        worldState: DurableMemorySnapshot,
        timelineEvents: List<TimelineEntity> = emptyList()
    ) {
        val request = getCheckpoint(requestId) ?: error("Checkpoint not found")
        if (request.status == "accepted") return
        require(request.status != "superseded") { "Checkpoint was superseded" }
        val branch = getBranch(request.branch_id) ?: error("Branch not found")
        require(branch.head_turn_id == request.target_turn_id) { "Branch changed while continuity was processing" }
        upsertWorldSnapshot(request.target_turn_id, request.thread_id, request.branch_id, request.baseline_turn_id,
            worldState, worldState.metadata.version, true)
        timelineEvents.forEach { insertTimelineEvent(it) }
        val now = Instant.now().toString()
        check(transitionOpenCheckpoint(request.id, "accepted", null, now) == 1) {
            "Checkpoint changed while continuity was being accepted"
        }
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertPin(pin: PinEntity)

    @Query("SELECT * FROM chat_pins WHERE thread_id = :threadId AND status = 'active'")
    abstract fun getAllActivePinsForThreadFlow(threadId: String): Flow<List<PinEntity>>

    @Query("SELECT * FROM chat_pins WHERE thread_id = :threadId AND status = 'active'")
    protected abstract suspend fun getAllActivePinsForThread(threadId: String): List<PinEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertTimelineEvent(event: TimelineEntity)

    @Query("DELETE FROM chat_threads WHERE id = :id")
    abstract suspend fun deleteThread(id: String)

    @Query("SELECT * FROM chat_timeline_events WHERE thread_id = :threadId ORDER BY created_at DESC")
    abstract fun getAllTimelineEventsForThreadFlow(threadId: String): Flow<List<TimelineEntity>>

    @Query("SELECT * FROM chat_timeline_events WHERE thread_id = :threadId AND branch_id = :branchId")
    abstract suspend fun getTimelineEvents(threadId: String, branchId: String): List<TimelineEntity>

    @Query("SELECT * FROM chat_timeline_events WHERE thread_id = :threadId")
    protected abstract suspend fun getAllTimelineEventsForThread(threadId: String): List<TimelineEntity>

    @Transaction
    open suspend fun resolveLineageState(branchId: String, headTurnId: String?): ResolvedLineageState {
        val branch = getBranch(branchId) ?: error("Branch not found")
        val branches = getBranchesForThread(branch.thread_id)
        val turns = getTurnsForThread(branch.thread_id)
        val selection = BranchLineage.select(
            branches.map { BranchLineageRef(it.id, it.parent_branch_id) },
            turns.map { TurnLineageRef(it.id, it.parent_turn_id) },
            branchId,
            headTurnId
        )
        return ResolvedLineageState(
            pins = BranchLineage.reachable(
                getAllActivePinsForThread(branch.thread_id),
                selection,
                branchId = { it.branch_id },
                turnId = { it.turn_id }
            ),
            timelineEvents = BranchLineage.reachable(
                getAllTimelineEventsForThread(branch.thread_id),
                selection,
                branchId = { it.branch_id },
                turnId = { it.turn_id }
            ),
            castOverrides = BranchLineage.overlay(
                getAllCastOverridesForThread(branch.thread_id),
                selection,
                branchId = { it.branch_id },
                firstSeenTurnId = { it.first_seen_turn_id },
                key = { it.cast_id }
            )
        )
    }

    // --- Recursive Path Helpers ---

    @Query("""
        WITH RECURSIVE path(id, parent_turn_id) AS (
            SELECT id, parent_turn_id FROM chat_turns WHERE id = :headTurnId
            UNION ALL
            SELECT t.id, t.parent_turn_id FROM chat_turns t JOIN path ON path.parent_turn_id = t.id
        )
        SELECT * FROM chat_turns WHERE id IN (SELECT id FROM path)
    """)
    abstract suspend fun getAncestorTurns(headTurnId: String): List<TurnEntity>

    @Query("""
        WITH RECURSIVE descendants(id) AS (
            SELECT :pruneRootTurnId
            UNION ALL
            SELECT t.id FROM chat_turns t JOIN descendants d ON t.parent_turn_id = d.id
        )
        SELECT * FROM chat_branches 
        WHERE thread_id = :threadId 
          AND id != :activeBranchId 
          AND (head_turn_id IN (SELECT id FROM descendants) OR fork_turn_id IN (SELECT id FROM descendants))
    """)
    protected abstract suspend fun getDoomedBranchesInternal(threadId: String, activeBranchId: String, pruneRootTurnId: String): List<BranchEntity>

    // --- RPC Equivalent Transactions ---

    @Transaction
    open suspend fun createThreadWithBranch(
        userId: String,
        characterId: String,
        connectionId: String,
        modelId: String,
        personaId: String?,
        brainConnectionId: String?,
        brainModelId: String?,
        replyLength: String?,
        title: String
    ): ThreadEntity {
        val now = Instant.now().toString()
        val threadId = UUID.randomUUID().toString()
        val thread = ThreadEntity(
            id = threadId,
            user_id = userId,
            character_id = characterId,
            connection_id = connectionId,
            model_id = modelId,
            persona_id = personaId,
            brain_connection_id = brainConnectionId,
            brain_model_id = brainModelId,
            reply_length = replyLength ?: "full",
            title = title,
            is_title_autogenerated = true,
            status = "active",
            archived_at = null,
            pinned_at = null,
            created_at = now,
            updated_at = now
        )
        insertThread(thread)
        seedPrimaryCast(threadId)

        val branch = BranchEntity(
            id = UUID.randomUUID().toString(),
            thread_id = threadId,
            name = "Main",
            parent_branch_id = null,
            fork_turn_id = null,
            head_turn_id = null,
            is_active = true,
            generation_locked = false,
            locked_by_turn_id = null,
            locked_at = null,
            created_by = userId,
            created_at = now,
            updated_at = now,
            active_speaker_id = "primary:$threadId"
        )
        insertBranch(branch)

        return thread
    }

    @Transaction
    open suspend fun beginTurn(
        userId: String,
        branchId: String,
        expectedHeadTurnId: String?,
        userInputText: String,
        userInputPayload: String,
        parentTurnIdOverride: String? = null,
        forceParentOverride: Boolean = false,
        userInputHidden: Boolean = false,
        starterSeed: Boolean = false,
        requestedSpeakerId: String? = null,
        requestedSpeakerName: String? = null,
        speakerMode: String = "single",
        renderedUserMessage: String? = null
    ): TurnEntity {
        val now = Instant.now().toString()
        val branch = getBranch(branchId) ?: throw IllegalArgumentException("Branch not found")
        val thread = getThread(branch.thread_id) ?: throw IllegalArgumentException("Thread not found")
        if (thread.user_id != userId) {
            throw IllegalArgumentException("Thread not owned by current user")
        }

        if (branch.generation_locked) {
            throw IllegalStateException("A turn is already generating on this branch.")
        }

        branch.head_turn_id?.let { head ->
            if (getBlockingCheckpoint(head) != null) {
                throw IllegalStateException("Continuity checkpoint must be completed before continuing.")
            }
        }

        if (branch.head_turn_id != expectedHeadTurnId) {
            throw IllegalStateException("Branch head changed before generation could begin.")
        }

        val turnId = UUID.randomUUID().toString()
        val parentTurnId = if (forceParentOverride) parentTurnIdOverride else branch.head_turn_id

        val newTurn = TurnEntity(
            id = turnId,
            thread_id = branch.thread_id,
            branch_origin_id = branch.id,
            parent_turn_id = parentTurnId,
            user_input_text = userInputText,
            user_input_payload = userInputPayload,
            user_input_hidden = userInputHidden,
            starter_seed = starterSeed,
            assistant_output_text = null,
            assistant_output_payload = null,
            generation_status = "reserved",
            reserved_by_user_id = userId,
            assistant_provider = null,
            assistant_model = null,
            assistant_connection_label = null,
            finish_reason = null,
            total_tokens = null,
            prompt_tokens = null,
            completion_tokens = null,
            feedback_rating = null,
            generation_started_at = now,
            generation_finished_at = null,
            failure_code = null,
            failure_message = null,
            created_at = now,
            updated_at = now,
            requested_speaker_id = requestedSpeakerId,
            requested_speaker_name = requestedSpeakerName,
            speaker_mode = speakerMode,
            rendered_user_message = renderedUserMessage
        )
        insertTurn(newTurn)

        val updatedBranch = branch.copy(
            generation_locked = true,
            locked_by_turn_id = turnId,
            locked_at = now,
            updated_at = now
        )
        updateBranch(updatedBranch)

        return newTurn
    }

    @Transaction
    open suspend fun commitTurn(
        userId: String,
        branchId: String,
        turnId: String,
        assistantText: String,
        assistantPayload: String,
        provider: String,
        model: String,
        label: String,
        finishReason: String,
        totalTokens: Int?,
        promptTokens: Int?,
        completionTokens: Int?,
        replaceTurnId: String?,
        continuityEngineId: String = "codex:gpt-5.6-terra:high"
    ): TurnEntity {
        require(assistantText.isNotBlank()) { "The model returned no visible reply. Regenerate to try again." }
        val now = Instant.now().toString()
        val branch = getBranch(branchId) ?: throw IllegalArgumentException("Branch not found")
        val thread = getThread(branch.thread_id) ?: throw IllegalArgumentException("Thread not found")
        if (thread.user_id != userId) {
            throw IllegalArgumentException("Thread not owned by current user")
        }

        if (branch.locked_by_turn_id != turnId) {
            throw IllegalStateException("This branch is not locked by the target turn.")
        }

        val turn = getTurn(turnId) ?: throw IllegalArgumentException("Turn not found")
        val replacedTurn = replaceTurnId
            ?.takeUnless { it == turnId }
            ?.let { getTurn(it) ?: throw IllegalArgumentException("Replacement turn not found") }
        if (replacedTurn != null) {
            require(replacedTurn.thread_id == turn.thread_id) {
                "Replacement turn belongs to another thread."
            }
            require(replacedTurn.parent_turn_id == turn.parent_turn_id) {
                "A replacement must be a sibling of the turn it replaces."
            }
        }
        val updatedTurn = turn.copy(
            assistant_output_text = assistantText,
            assistant_output_payload = assistantPayload,
            assistant_provider = provider,
            assistant_model = model,
            assistant_connection_label = label,
            finish_reason = finishReason,
            total_tokens = totalTokens,
            prompt_tokens = promptTokens,
            completion_tokens = completionTokens,
            generation_status = "committed",
            generation_finished_at = now,
            updated_at = now
        )
        updateTurn(updatedTurn)

        val updatedBranch = branch.copy(
            head_turn_id = turnId,
            generation_locked = false,
            locked_by_turn_id = null,
            locked_at = null,
            updated_at = now
        )
        updateBranch(updatedBranch)

        // Replacement is intentionally non-destructive. Moving this branch's head to the new
        // sibling hides the old continuation here while preserving it for any forked branch that
        // still depends on that lineage.

        updateThread(thread.copy(updated_at = now))

        createCheckpointIfDue(updatedTurn, branch.id, now, continuityEngineId)

        return updatedTurn
    }

    private suspend fun createCheckpointIfDue(turn: TurnEntity, branchId: String, now: String, continuityEngineId: String) {
        if (getBlockingCheckpoint(turn.id) != null) return
        val path = getAncestorTurns(turn.id).associateBy { it.id }
        val ordered = mutableListOf<TurnEntity>()
        var cursor: String? = turn.id
        while (cursor != null) {
            val item = path[cursor] ?: break
            ordered += item
            cursor = item.parent_turn_id
        }
        ordered.reverse()
        var baseline: SnapshotEntity? = null
        var baselineIndex = -1
        ordered.forEachIndexed { index, item ->
            getSnapshot(item.id)?.let { baseline = it; baselineIndex = index }
        }
        val since = ordered.drop(baselineIndex + 1).count { it.generation_status == "committed" && !it.starter_seed }
        if (since < 15) return
        insertCheckpoint(
            ContinuityCheckpointEntity(
                id = UUID.randomUUID().toString(), engine_id = continuityEngineId, thread_id = turn.thread_id, branch_id = branchId,
                target_turn_id = turn.id, baseline_turn_id = baseline?.turn_id,
                baseline_version = baseline?.version ?: 0, trigger_reason = "cadence", created_at = now, updated_at = now
            )
        )
    }

    @Transaction
    open suspend fun acceptRoleplayJob(
        jobId: String,
        replyText: String,
        responseThreadId: String,
        responseBranchId: String,
        responseTurnId: String,
        responseSpeakerId: String?,
        responseSpeakerMode: String,
        responseModelId: String,
        elapsedMillis: Long,
        continuityEngineId: String,
        sceneReport: String? = null,
        provider: String = "antigravity_host",
        connectionLabel: String = "Antigravity (Mac)",
        finishReason: String = "stop",
        assistantPayload: String = "{\"usage_unavailable\":true,\"elapsed_millis\":$elapsedMillis}",
        totalTokens: Int? = null,
        promptTokens: Int? = null,
        completionTokens: Int? = null
    ): TurnEntity {
        val job = getRoleplayJob(jobId) ?: error("Roleplay job not found")
        require(job.status !in setOf("accepted", "superseded")) { "Roleplay job is stale" }
        require(job.thread_id == responseThreadId && job.branch_id == responseBranchId && job.turn_id == responseTurnId) { "Roleplay response identity mismatch" }
        require(job.requested_speaker_id == responseSpeakerId && job.speaker_mode == responseSpeakerMode) { "Roleplay response speaker mismatch" }
        require(job.model_id == responseModelId) { "Roleplay response model mismatch" }
        require(job.provider == provider) { "Roleplay response provider mismatch" }
        require(replyText.isNotBlank()) { "The Roleplay Model returned no visible reply" }
        val branch = getBranch(job.branch_id) ?: error("Branch not found")
        require(branch.locked_by_turn_id == job.turn_id) { "Pending reply no longer owns the branch" }
        require(branch.head_turn_id == job.expected_head_turn_id) { "Branch changed while the Roleplay Model was generating" }
        val pendingTurn = getTurn(job.turn_id) ?: error("Pending reply no longer exists")
        require(pendingTurn.requested_speaker_id == job.requested_speaker_id && pendingTurn.speaker_mode == job.speaker_mode) { "Pending speaker changed" }
        val committed = commitTurn(
            userId = getThread(job.thread_id)?.user_id ?: error("Thread not found"),
            branchId = job.branch_id,
            turnId = job.turn_id,
            assistantText = replyText,
            assistantPayload = assistantPayload,
            provider = provider,
            model = job.model_id,
            label = connectionLabel,
            finishReason = finishReason,
            totalTokens = totalTokens,
            promptTokens = promptTokens,
            completionTokens = completionTokens,
            replaceTurnId = job.replace_turn_id,
            continuityEngineId = continuityEngineId
        )
        if (sceneReport != null) updateTurn(getTurn(committed.id)?.copy(scene_report = sceneReport) ?: committed)
        // How the dialogue came out, beside the request that produced it. See [VoiceMetrics].
        val voiceMetrics = VoiceMetrics.encode(VoiceMeter.measure(replyText))
        updateRoleplayJob(job.copy(
            status = "accepted", failure_detail = null, voice_metrics = voiceMetrics,
            updated_at = Instant.now().toString(), accepted_at = Instant.now().toString()
        ))
        return committed
    }

    @Transaction
    open suspend fun failRoleplayJob(jobId: String, detail: String) {
        val job = getRoleplayJob(jobId) ?: return
        if (job.status in setOf("accepted", "superseded")) return
        val now = Instant.now().toString()
        updateRoleplayJob(job.copy(status = "failed", failure_detail = detail, updated_at = now))
        getTurn(job.turn_id)?.let { turn ->
            updateTurn(turn.copy(
                generation_status = "failed",
                generation_finished_at = now,
                failure_code = if (job.execution_mode == "mac_host") "MAC_HOST_ERROR" else "API_ERROR",
                failure_message = detail,
                updated_at = now
            ))
        }
        releaseBranchLock(job.branch_id, job.turn_id, now)
    }

    @Transaction
    open suspend fun discardRoleplayJob(jobId: String) {
        val job = getRoleplayJob(jobId) ?: return
        if (job.status in setOf("accepted", "superseded")) return
        val turn = getTurn(job.turn_id) ?: return
        val branch = getBranch(job.branch_id) ?: return
        // The host can finish between a stale UI read and this transaction. Once accepted,
        // committed, or installed as the branch head, this is durable history—not a draft.
        if (turn.generation_status == "committed" || branch.head_turn_id == turn.id) return
        val now = Instant.now().toString()
        updateRoleplayJob(job.copy(status = "superseded", updated_at = now))
        releaseBranchLock(job.branch_id, job.turn_id, now)
        deleteTurn(job.turn_id)
    }

    @Transaction
    open suspend fun discardUncommittedTurn(branchId: String, turnId: String): Boolean {
        val branch = getBranch(branchId) ?: return false
        val turn = getTurn(turnId) ?: return false
        if (turn.branch_origin_id != branch.id) return false
        if (turn.generation_status == "committed" || branch.head_turn_id == turn.id) return false
        if (getLatestRoleplayJobForTurn(turn.id)?.status == "accepted") return false
        val now = Instant.now().toString()
        if (branch.locked_by_turn_id == turn.id) {
            releaseBranchLock(branch.id, turn.id, now)
        }
        deleteTurn(turn.id)
        return true
    }

    /**
     * Repairs legacy/corrupt head pointers without inventing prose. Prefer the newest surviving
     * turn created on that branch; otherwise fall back to its still-valid fork turn.
     */
    @Transaction
    open suspend fun repairDanglingBranchHeads(): Int {
        var repaired = 0
        for (branch in getBranchesWithDanglingHeads()) {
            val latestOwnTurn = getLatestCommittedTurnCreatedOnBranch(branch.id)
            val validFork = branch.fork_turn_id?.let { getTurn(it) }
            updateBranch(
                branch.copy(
                    head_turn_id = latestOwnTurn?.id ?: validFork?.id,
                    generation_locked = false,
                    locked_by_turn_id = null,
                    locked_at = null,
                    updated_at = Instant.now().toString()
                )
            )
            repaired++
        }
        return repaired
    }

    @Transaction
    open suspend fun requestEarlyCheckpoint(
        branchId: String,
        continuityEngineId: String = "codex:gpt-5.6-terra:high"
    ): ContinuityCheckpointEntity {
        val branch = getBranch(branchId) ?: error("Branch not found")
        val head = branch.head_turn_id ?: error("Nothing to update yet")
        getBlockingCheckpoint(head)?.let { return it }
        val baseline = getNearestSnapshot(head)
        val now = Instant.now().toString()
        return ContinuityCheckpointEntity(
            id = UUID.randomUUID().toString(), engine_id = continuityEngineId, thread_id = branch.thread_id, branch_id = branchId,
            target_turn_id = head, baseline_turn_id = baseline?.turn_id,
            baseline_version = baseline?.version ?: 0, trigger_reason = "manual", created_at = now, updated_at = now
        ).also { insertCheckpoint(it) }
    }

    /** The retained ancestor path of a branch head, oldest first. */
    private suspend fun orderedAncestry(headId: String): List<TurnEntity> {
        val byId = getAncestorTurns(headId).associateBy { it.id }
        val ordered = mutableListOf<TurnEntity>()
        val seen = mutableSetOf<String>()
        var cursor: String? = headId
        while (cursor != null) {
            check(seen.add(cursor)) { "Detected a Roleplay Exchange ancestry cycle" }
            val exchange = byId[cursor] ?: error("Roleplay Exchange ancestry is incomplete")
            ordered += exchange
            cursor = exchange.parent_turn_id
        }
        return ordered.asReversed()
    }

    /** The last Snapshot strictly before an edited exchange, which is what survives the edit. */
    private suspend fun snapshotStrictlyBefore(ordered: List<TurnEntity>, editIndex: Int): SnapshotEntity? {
        for (candidate in ordered.take(editIndex).asReversed()) {
            getSnapshot(candidate.id)?.let { return it }
        }
        return null
    }

    /**
     * Whether editing this reply moves the Continuity Baseline.
     *
     * Editing clones the exchange and everything after it under new identities, so the Baseline becomes
     * the last Snapshot strictly before the edit. When that is the Snapshot the branch was already
     * using, nothing about continuity changed and no Continuity Update is owed. When it is an older one,
     * the Baseline was built from prose that no longer exists, and the distance from Baseline to head
     * grows, which is the case a Rewind can never produce. See ADR-0015.
     */
    open suspend fun assistantEditRequiresContinuityUpdate(branchId: String, turnId: String): Boolean {
        val branch = getBranch(branchId) ?: return false
        val headId = branch.head_turn_id ?: return false
        val ordered = orderedAncestry(headId)
        val editIndex = ordered.indexOfFirst { it.id == turnId }
        if (editIndex < 0) return false
        return getNearestSnapshot(headId)?.turn_id != snapshotStrictlyBefore(ordered, editIndex)?.turn_id
    }

    /**
     * Replaces committed prose by creating a new branch-local lineage. Shared ancestor exchanges
     * remain immutable for sibling branches, and continuity is rebuilt from the last snapshot
     * strictly before the edited exchange.
     */
    @Transaction
    open suspend fun replaceAssistantReply(
        userId: String,
        branchId: String,
        turnId: String,
        assistantText: String,
        continuityEngineId: String?
    ): ContinuityCheckpointEntity? {
        require(assistantText.isNotBlank()) { "Assistant reply cannot be empty" }
        val branch = getBranch(branchId) ?: error("Branch not found")
        val thread = getThread(branch.thread_id) ?: error("Thread not found")
        require(thread.user_id == userId) { "Thread not owned by current user" }
        require(!branch.generation_locked) { "Cannot edit while this branch is generating" }
        val headId = branch.head_turn_id ?: error("Branch has no committed reply")
        require(getBlockingCheckpoint(headId) == null) { "Continuity must finish before editing" }

        val ordered = orderedAncestry(headId)
        val editIndex = ordered.indexOfFirst { it.id == turnId }
        require(editIndex >= 0) { "Edited reply is not reachable from this branch" }
        require(ordered[editIndex].generation_status == "committed") { "Only committed prose can be edited" }

        val baselineBefore = getNearestSnapshot(headId)
        val baseline = snapshotStrictlyBefore(ordered, editIndex)
        val movesBaseline = baselineBefore?.turn_id != baseline?.turn_id

        val now = Instant.now().toString()
        val replacementIds = linkedMapOf<String, String>()
        var replacementParentId = ordered[editIndex].parent_turn_id
        ordered.drop(editIndex).forEachIndexed { offset, original ->
            val replacementId = UUID.randomUUID().toString()
            replacementIds[original.id] = replacementId
            insertTurn(
                original.copy(
                    id = replacementId,
                    branch_origin_id = branch.id,
                    parent_turn_id = replacementParentId,
                    assistant_output_text = if (offset == 0) assistantText else original.assistant_output_text,
                    updated_at = now
                )
            )
            replacementParentId = replacementId
        }

        // User-authored pins survive for unchanged cloned exchanges. Generated timeline rows do
        // not: the mandatory Continuity Update rebuilds them from the replacement lineage.
        val priorState = resolveLineageState(branch.id, headId)
        priorState.pins.filter { it.turn_id in replacementIds }.forEach { pin ->
            insertPin(
                pin.copy(
                    id = UUID.randomUUID().toString(),
                    branch_id = branch.id,
                    turn_id = replacementIds.getValue(pin.turn_id!!),
                    updated_at = now
                )
            )
        }

        updateBranch(branch.copy(head_turn_id = replacementParentId, updated_at = now))
        updateThread(thread.copy(updated_at = now))

        // An edit that leaves the Baseline where it was changes only prose the Baseline never saw, so
        // continuity is already correct and no Continuity Update is owed. See ADR-0015.
        if (!movesBaseline) return null
        requireNotNull(continuityEngineId) { "A Continuity Engine is required when an edit moves the Baseline" }
        return ContinuityCheckpointEntity(
            id = UUID.randomUUID().toString(),
            engine_id = continuityEngineId,
            thread_id = branch.thread_id,
            branch_id = branch.id,
            target_turn_id = requireNotNull(replacementParentId),
            baseline_turn_id = baseline?.turn_id,
            baseline_version = baseline?.version ?: 0,
            trigger_reason = "assistant_edit",
            old_head_turn_id = headId,
            discarded_exchange_count = ordered.size - editIndex,
            created_at = now,
            updated_at = now
        ).also { insertCheckpoint(it) }
    }

    @Transaction
    open suspend fun failTurn(
        userId: String,
        branchId: String,
        turnId: String,
        failureCode: String,
        failureMessage: String
    ): TurnEntity {
        val now = Instant.now().toString()
        val branch = getBranch(branchId) ?: throw IllegalArgumentException("Branch not found")
        val thread = getThread(branch.thread_id) ?: throw IllegalArgumentException("Thread not found")
        if (thread.user_id != userId) {
            throw IllegalArgumentException("Thread not owned by current user")
        }

        val turn = getTurn(turnId) ?: throw IllegalArgumentException("Turn not found")
        val updatedTurn = turn.copy(
            generation_status = "failed",
            generation_finished_at = now,
            failure_code = failureCode,
            failure_message = failureMessage,
            updated_at = now
        )
        updateTurn(updatedTurn)

        if (branch.locked_by_turn_id == turnId) {
            val updatedBranch = branch.copy(
                generation_locked = false,
                locked_by_turn_id = null,
                locked_at = null,
                updated_at = now
            )
            updateBranch(updatedBranch)
        }

        return updatedTurn
    }

    @Transaction
    open suspend fun createBranchFromTurn(
        userId: String,
        sourceBranchId: String,
        sourceTurnId: String,
        name: String,
        makeActive: Boolean = true
    ): BranchEntity {
        val now = Instant.now().toString()
        val sourceBranch = getBranch(sourceBranchId) ?: throw IllegalArgumentException("Source branch not found")
        val thread = getThread(sourceBranch.thread_id) ?: throw IllegalArgumentException("Thread not found")
        if (thread.user_id != userId) {
            throw IllegalArgumentException("Thread not owned by current user")
        }

        val sourceTurn = getTurn(sourceTurnId) ?: throw IllegalArgumentException("Source turn not found")
        if (sourceTurn.thread_id != sourceBranch.thread_id) {
            throw IllegalArgumentException("Source turn not found on selected thread")
        }
        val sourceHead = sourceBranch.head_turn_id ?: throw IllegalStateException("Source branch has no history")
        require(getAncestorTurns(sourceHead).any { it.id == sourceTurn.id }) {
            "Source exchange is not reachable from the selected branch"
        }
        val speakerAtFork = sourceTurn.user_input_payload
            .let { Regex("\\\"sticky_speaker_id\\\":\\\"([^\\\"]+)\\\"").find(it)?.groupValues?.getOrNull(1) }
            ?: sourceTurn.requested_speaker_id
            ?: "primary:${sourceBranch.thread_id}"
        val modeAtFork = sourceTurn.user_input_payload
            .let { Regex("\\\"sticky_mode\\\":\\\"([^\\\"]+)\\\"").find(it)?.groupValues?.getOrNull(1) }
            ?: sourceTurn.speaker_mode

        if (makeActive) {
            deactivateAllBranchesForThread(sourceBranch.thread_id, now)
        }

        val newBranch = BranchEntity(
            id = UUID.randomUUID().toString(),
            thread_id = sourceBranch.thread_id,
            name = name,
            parent_branch_id = sourceBranch.id,
            fork_turn_id = sourceTurn.id,
            head_turn_id = sourceTurn.id,
            is_active = makeActive,
            generation_locked = false,
            locked_by_turn_id = null,
            locked_at = null,
            created_by = userId,
            created_at = now,
            updated_at = now,
            active_speaker_id = speakerAtFork,
            speaker_mode = modeAtFork
        )
        insertBranch(newBranch)

        updateThread(thread.copy(updated_at = now))

        return newBranch
    }

    @Transaction
    open suspend fun activateBranch(
        userId: String,
        threadId: String,
        branchId: String
    ): BranchEntity {
        val now = Instant.now().toString()
        val thread = getThread(threadId) ?: throw IllegalArgumentException("Thread not found")
        if (thread.user_id != userId) {
            throw IllegalArgumentException("Thread not owned by current user")
        }

        val targetBranch = getBranch(branchId) ?: throw IllegalArgumentException("Branch not found")
        if (targetBranch.thread_id != threadId) {
            throw IllegalArgumentException("Branch not found on the target thread")
        }

        deactivateAllBranchesForThread(threadId, now)

        val updatedBranch = targetBranch.copy(
            is_active = true,
            updated_at = now
        )
        updateBranch(updatedBranch)

        return updatedBranch
    }

    @Transaction
    open suspend fun rewindBranchToTurn(
        userId: String,
        branchId: String,
        targetTurnId: String,
        expectedHeadTurnId: String?
    ): BranchEntity {
        val now = Instant.now().toString()
        val branch = getBranch(branchId) ?: throw IllegalArgumentException("Branch not found")
        val thread = getThread(branch.thread_id) ?: throw IllegalArgumentException("Thread not found")
        if (thread.user_id != userId) {
            throw IllegalArgumentException("Thread not owned by current user")
        }

        if (branch.generation_locked) {
            throw IllegalStateException("Cannot rewind while this branch is locked for generation.")
        }

        if (expectedHeadTurnId != null && branch.head_turn_id != expectedHeadTurnId) {
            throw IllegalStateException("Branch head changed before rewind could complete.")
        }

        val headTurnId = branch.head_turn_id ?: throw IllegalStateException("Branch head is empty.")
        if (headTurnId == targetTurnId) return branch

        // 1. Get path of ancestors from headTurnId backwards
        val ancestorTurns = getAncestorTurns(headTurnId)
        val ancestorIds = ancestorTurns.map { it.id }.toSet()

        if (!ancestorIds.contains(targetTurnId)) {
            throw IllegalStateException("Target turn is not reachable from the current branch head.")
        }
        // 2. Rewind is branch-local: never delete another branch row or a turn that another
        // branch still needs. The first subtree with no other branch dependency is this branch's
        // exclusive suffix and is the only portion safe to cascade-delete.
        val byId = ancestorTurns.associateBy { it.id }
        val forwardShallowToDeep = buildList {
            var cursor: String? = headTurnId
            while (cursor != null && cursor != targetTurnId) {
                val item = byId[cursor] ?: break
                add(item)
                cursor = item.parent_turn_id
            }
        }.asReversed()

        val pruneStartId = forwardShallowToDeep.firstOrNull { item ->
            getDoomedBranchesInternal(branch.thread_id, branch.id, item.id).isEmpty()
        }?.id
        if (pruneStartId != null) {
            deleteTurn(pruneStartId)
        }

        // 3. Update branch head
        val targetTurn = getTurn(targetTurnId)
        val restoredSpeakerId = targetTurn?.user_input_payload
            ?.let { Regex("\\\"sticky_speaker_id\\\":\\\"([^\\\"]+)\\\"").find(it)?.groupValues?.getOrNull(1) }
            ?: targetTurn?.requested_speaker_id
            ?: "primary:${branch.thread_id}"
        val restoredMode = targetTurn?.user_input_payload
            ?.let { Regex("\\\"sticky_mode\\\":\\\"([^\\\"]+)\\\"").find(it)?.groupValues?.getOrNull(1) }
            ?: targetTurn?.speaker_mode ?: "single"
        val updatedBranch = branch.copy(
            head_turn_id = targetTurnId,
            updated_at = now,
            active_speaker_id = restoredSpeakerId,
            speaker_mode = restoredMode
        )
        updateBranch(updatedBranch)

        // 4. Touch thread updated_at
        updateThread(thread.copy(updated_at = now))

        // 5. No Continuity Checkpoint. A Rewind only removes exchanges, so what it leaves behind —
        // the reachable Continuity Baseline plus the exchanges retained after it — is the state this
        // branch is in for fourteen exchanges out of every fifteen. getNearestSnapshot walks ancestors
        // only, so a Snapshot belonging to a discarded exchange is unreachable rather than merely
        // deleted, and the cadence counter is derived, so the next Update lands where it always would.
        // See ADR-0013.
        return updatedBranch
    }

    @Transaction
    open suspend fun upsertWorldSnapshot(
        turnId: String,
        threadId: String,
        branchId: String,
        basedOnTurnId: String?,
        worldState: DurableMemorySnapshot,
        version: Int,
        isFullMaterialization: Boolean
    ): SnapshotEntity {
        val snapshot = SnapshotEntity(
            turn_id = turnId,
            thread_id = threadId,
            branch_id = branchId,
            based_on_turn_id = basedOnTurnId,
            world_state = worldState,
            version = version,
            is_full_materialization = isFullMaterialization
        )
        insertSnapshot(snapshot)
        return snapshot
    }

    @Query("UPDATE chat_turns SET generation_status = 'streaming' WHERE id = :turnId")
    abstract suspend fun markTurnStreaming(turnId: String)

    @Query("""
        UPDATE chat_turns
        SET generation_status = 'failed', failure_code = 'EMPTY_RESPONSE',
            failure_message = 'The model returned no visible reply. Regenerate to try again.',
            generation_finished_at = :timestamp, updated_at = :timestamp
        WHERE generation_status = 'committed' AND starter_seed = 0
          AND TRIM(COALESCE(assistant_output_text, '')) = ''
    """)
    abstract suspend fun markEmptyCommittedTurnsFailed(timestamp: String): Int

    @Transaction
    open suspend fun clearStaleLocks(maxAgeMs: Long = 300_000): Int {
        val now = Instant.now()
        val cutoff = now.minusMillis(maxAgeMs)
        val lockedBranches = getLockedBranchesInternal()
        var clearedCount = 0
        for (branch in lockedBranches) {
            val lockedTurnId = branch.locked_by_turn_id
            if (lockedTurnId != null && hasBlockingRoleplayJob(lockedTurnId)) continue
            val lockedAtStr = branch.locked_at
            // A locked branch whose timestamp is missing or unparseable is, by definition, in a
            // broken state that no normal flow produced — and this function is the recovery net
            // whose whole job is to break stuck locks. Treat null/unparseable locked_at as stale
            // so such a branch is never bricked forever (beginTurn would reject every future turn).
            val isStale = if (lockedAtStr == null) {
                true
            } else {
                try {
                    Instant.parse(lockedAtStr).isBefore(cutoff)
                } catch (e: Exception) {
                    true
                }
            }
            if (isStale) {
                val turnId = branch.locked_by_turn_id
                if (turnId != null) {
                    val turn = getTurn(turnId)
                    if (turn != null && (turn.generation_status == "reserved" || turn.generation_status == "streaming")) {
                        val failedTurn = turn.copy(
                            generation_status = "failed",
                            generation_finished_at = now.toString(),
                            failure_code = "timeout",
                            failure_message = "Generation lock expired before completion.",
                            updated_at = now.toString()
                        )
                        updateTurn(failedTurn)
                    }
                }
                val unlockedBranch = branch.copy(
                    generation_locked = false,
                    locked_by_turn_id = null,
                    locked_at = null,
                    updated_at = now.toString()
                )
                updateBranch(unlockedBranch)
                clearedCount++
            }
        }
        return clearedCount
    }

    @Query("SELECT * FROM chat_branches WHERE generation_locked = 1")
    protected abstract suspend fun getLockedBranchesInternal(): List<BranchEntity>

    /** Idempotent unlock — only clears the lock if it is still held by [turnId]. Safe to call
     *  in a finally (NonCancellable) so a cancelled generation never leaves the branch locked. */
    @Query("UPDATE chat_branches SET generation_locked = 0, locked_by_turn_id = null, locked_at = null, updated_at = :now WHERE id = :branchId AND locked_by_turn_id = :turnId")
    abstract suspend fun releaseBranchLock(branchId: String, turnId: String, now: String)

}

data class ResolvedLineageState(
    val pins: List<PinEntity>,
    val timelineEvents: List<TimelineEntity>,
    val castOverrides: List<CastProfileOverrideEntity>
)
