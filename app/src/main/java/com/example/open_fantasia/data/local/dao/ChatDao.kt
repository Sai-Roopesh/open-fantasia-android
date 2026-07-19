package com.example.open_fantasia.data.local.dao

import androidx.room.*
import com.example.open_fantasia.data.local.entity.*
import com.example.open_fantasia.domain.model.DurableMemorySnapshot
import kotlinx.coroutines.flow.Flow
import java.time.Instant
import java.util.UUID

@Dao
abstract class ChatDao {

    // --- Core Queries ---

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertThread(thread: ThreadEntity)

    @Query("SELECT * FROM chat_threads WHERE id = :id")
    abstract suspend fun getThread(id: String): ThreadEntity?

    @Query("SELECT * FROM chat_threads WHERE id = :id")
    abstract fun getThreadFlow(id: String): Flow<ThreadEntity?>

    @Query("SELECT * FROM chat_threads ORDER BY updated_at DESC")
    abstract fun getAllThreadsFlow(): Flow<List<ThreadEntity>>

    @Query("SELECT * FROM chat_threads")
    abstract suspend fun getAllThreads(): List<ThreadEntity>

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

    @Query("""
        INSERT OR IGNORE INTO cast_seeds (
            cast_id, thread_id, entity_id, canonical_name, aliases, role_background,
            personality, voice_style, appearance, goals, boundaries, provenance,
            evidence, manual_locks, created_at, updated_at
        )
        SELECT 'primary:' || t.id, t.id, c.id, c.name, '[]', c.story,
               c.core_persona, c.style_rules, c.appearance, '', c.negative_guidance,
               'primary', '[]',
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

    @Update
    abstract suspend fun updateBranch(branch: BranchEntity)

    @Query("UPDATE chat_branches SET active_speaker_id = :castId, speaker_mode = :mode, updated_at = :timestamp WHERE id = :branchId")
    abstract suspend fun setActiveSpeaker(branchId: String, castId: String?, mode: String, timestamp: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertCastOverride(override: CastProfileOverrideEntity)

    @Query("SELECT * FROM cast_profile_overrides WHERE branch_id = :branchId")
    abstract suspend fun getCastOverrides(branchId: String): List<CastProfileOverrideEntity>

    @Query("SELECT o.* FROM cast_profile_overrides o JOIN chat_branches b ON b.id = o.branch_id WHERE b.thread_id = :threadId")
    abstract fun getCastOverridesForThreadFlow(threadId: String): Flow<List<CastProfileOverrideEntity>>

    @Query("DELETE FROM chat_branches WHERE id = :id")
    abstract suspend fun deleteBranch(id: String)

    @Query("DELETE FROM chat_branches WHERE id IN (:ids)")
    abstract suspend fun deleteBranches(ids: List<String>)

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
    abstract suspend fun deleteTurn(id: String)

    @Query("UPDATE chat_turns SET parent_turn_id = :newParentId WHERE parent_turn_id = :oldParentId")
    abstract suspend fun updateParentForChildren(oldParentId: String, newParentId: String?)

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

    @Query("DELETE FROM world_snapshots WHERE turn_id = :turnId")
    abstract suspend fun deleteSnapshot(turnId: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertCheckpoint(request: ContinuityCheckpointEntity)

    @Update
    abstract suspend fun updateCheckpoint(request: ContinuityCheckpointEntity)

    @Query("SELECT * FROM continuity_checkpoint_requests WHERE id = :id")
    abstract suspend fun getCheckpoint(id: String): ContinuityCheckpointEntity?

    @Query("SELECT * FROM continuity_checkpoint_requests WHERE thread_id = :threadId ORDER BY created_at DESC")
    abstract fun getCheckpointsForThreadFlow(threadId: String): Flow<List<ContinuityCheckpointEntity>>

    @Query("SELECT * FROM continuity_checkpoint_requests WHERE status NOT IN ('accepted', 'superseded') ORDER BY created_at ASC")
    abstract suspend fun getPendingCheckpoints(): List<ContinuityCheckpointEntity>

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
        require(request.status != "accepted")
        val branch = getBranch(request.branch_id) ?: error("Branch not found")
        require(branch.head_turn_id == request.target_turn_id) { "Branch changed while continuity was processing" }
        upsertWorldSnapshot(request.target_turn_id, request.thread_id, request.branch_id, request.baseline_turn_id,
            worldState, worldState.metadata.version, true)
        timelineEvents.forEach { insertTimelineEvent(it) }
        val now = Instant.now().toString()
        updateCheckpoint(request.copy(status="accepted",failure_detail=null,updated_at=now,accepted_at=now))
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertPin(pin: PinEntity)

    @Query("SELECT * FROM chat_pins WHERE thread_id = :threadId AND branch_id = :branchId AND status = 'active'")
    abstract suspend fun getActivePins(threadId: String, branchId: String): List<PinEntity>

    @Query("SELECT * FROM chat_pins WHERE id = :id")
    abstract suspend fun getPin(id: String): PinEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertTimelineEvent(event: TimelineEntity)

    @Query("DELETE FROM chat_threads WHERE id = :id")
    abstract suspend fun deleteThread(id: String)

    @Query("SELECT * FROM chat_timeline_events WHERE thread_id = :threadId ORDER BY created_at DESC")
    abstract fun getAllTimelineEventsForThreadFlow(threadId: String): Flow<List<TimelineEntity>>

    @Query("SELECT * FROM chat_timeline_events WHERE thread_id = :threadId AND branch_id = :branchId ORDER BY created_at DESC")
    abstract fun getTimelineEventsFlow(threadId: String, branchId: String): Flow<List<TimelineEntity>>

    @Query("SELECT * FROM chat_timeline_events WHERE thread_id = :threadId AND branch_id = :branchId")
    abstract suspend fun getTimelineEvents(threadId: String, branchId: String): List<TimelineEntity>

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
        maxOutputTokens: Int?,
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
            max_output_tokens = maxOutputTokens ?: 4096,
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
        totalTokens: Int,
        promptTokens: Int,
        completionTokens: Int,
        replaceTurnId: String?
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

        if (replaceTurnId != null && replaceTurnId != turnId) {
            // Edit & regenerate: the new turn is a SIBLING of the replaced turn (same parent),
            // so delete the replaced turn — its FK-CASCADE removes the now-stale continuation
            // below it. (Previously its children were reparented to the grandparent, which
            // orphaned them off the active path: permanently hidden and leaking rows.)
            deleteTurn(replaceTurnId)
        }

        updateThread(thread.copy(updated_at = now))

        createCheckpointIfDue(updatedTurn, branch.id, now)

        return updatedTurn
    }

    private suspend fun createCheckpointIfDue(turn: TurnEntity, branchId: String, now: String) {
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
        if (since < 7) return
        insertCheckpoint(
            ContinuityCheckpointEntity(
                id = UUID.randomUUID().toString(), thread_id = turn.thread_id, branch_id = branchId,
                target_turn_id = turn.id, baseline_turn_id = baseline?.turn_id,
                baseline_version = baseline?.version ?: 0, trigger_reason = "cadence", created_at = now, updated_at = now
            )
        )
    }

    @Transaction
    open suspend fun requestEarlyCheckpoint(branchId: String): ContinuityCheckpointEntity {
        val branch = getBranch(branchId) ?: error("Branch not found")
        val head = branch.head_turn_id ?: error("Nothing to update yet")
        getBlockingCheckpoint(head)?.let { return it }
        val baseline = getNearestSnapshot(head)
        val now = Instant.now().toString()
        return ContinuityCheckpointEntity(
            id = UUID.randomUUID().toString(), thread_id = branch.thread_id, branch_id = branchId,
            target_turn_id = head, baseline_turn_id = baseline?.turn_id,
            baseline_version = baseline?.version ?: 0, trigger_reason = "manual", created_at = now, updated_at = now
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
            active_speaker_id = sourceBranch.active_speaker_id,
            speaker_mode = sourceBranch.speaker_mode
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
        val ancestorMap = ancestorTurns.associateBy { it.id }
        var discardedCount = 0
        var discardedCursor: String? = headTurnId
        while (discardedCursor != null && discardedCursor != targetTurnId) {
            val discarded = ancestorMap[discardedCursor] ?: break
            if (discarded.generation_status == "committed" && !discarded.starter_seed) discardedCount++
            discardedCursor = discarded.parent_turn_id
        }

        // 2. Find pruneRootTurnId: the turn whose parent_turn_id is targetTurnId and is on the path
        val pruneRootTurn = ancestorTurns.find { it.parent_turn_id == targetTurnId }
        val pruneRootTurnId = pruneRootTurn?.id

        if (pruneRootTurnId != null) {
            // Find doomed branches: branches whose head or fork turn is a descendant of pruneRootTurnId
            val doomedBranches = getDoomedBranchesInternal(branch.thread_id, branch.id, pruneRootTurnId)
            val doomedBranchIds = doomedBranches.map { it.id }

            // Delete doomed branches
            if (doomedBranchIds.isNotEmpty()) {
                deleteBranches(doomedBranchIds)
            }

            // Delete pruneRootTurnId (triggers SQLite cascade delete of descendant turns, snapshots, pins, timeline)
            deleteTurn(pruneRootTurnId)
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

        val retainedBaseline = getNearestSnapshot(targetTurnId)
        insertCheckpoint(
            ContinuityCheckpointEntity(
                id = UUID.randomUUID().toString(), thread_id = branch.thread_id, branch_id = branch.id,
                target_turn_id = targetTurnId, baseline_turn_id = retainedBaseline?.turn_id,
                baseline_version = retainedBaseline?.version ?: 0, trigger_reason = "rewind",
                old_head_turn_id = headTurnId, discarded_exchange_count = discardedCount,
                created_at = now, updated_at = now
            )
        )

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

    @Query("UPDATE chat_threads SET persona_id = :newPersonaId WHERE persona_id = :oldPersonaId")
    abstract suspend fun reassignPersona(oldPersonaId: String, newPersonaId: String?)
}
