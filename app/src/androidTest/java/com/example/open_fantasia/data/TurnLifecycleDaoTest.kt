package com.example.open_fantasia.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.local.entity.*
import com.example.open_fantasia.data.continuity.ContinuityCheckpointProtocol
import com.example.open_fantasia.domain.model.DurableMemorySnapshot
import com.example.open_fantasia.domain.model.NarrativeState
import com.example.open_fantasia.domain.model.SnapshotMetadata
import com.example.open_fantasia.domain.model.SpatialState
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.IOException
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class TurnLifecycleDaoTest {

    private lateinit var db: OpenFantasiaDatabase
    private val userId = "00000000-0000-0000-0000-000000000000"
    private val connectionId = "conn-1"
    private val characterId = "char-1"

    @Before
    fun createDb() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, OpenFantasiaDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        // Seed profile
        db.profileDao().insertProfile(ProfileEntity(userId, "LocalUser", "", ""))
        
        // Seed connection
        db.connectionDao().insertConnection(
            ConnectionEntity(
                id = connectionId,
                user_id = userId,
                provider = "google",
                label = "Google API",
                base_url = null,
                encrypted_api_key = "key",
                enabled = true,
                default_model_id = "gemini-1.5-flash",
                model_cache = emptyList(),
                health_status = "healthy",
                health_message = "",
                last_checked_at = null,
                last_model_refresh_at = null,
                last_synced_at = null,
                created_at = "",
                updated_at = ""
            )
        )

        // Seed character
        db.characterDao().insertCharacter(
            CharacterEntity(
                id = characterId,
                user_id = userId,
                name = "Mara Vale",
                story = "Lore",
                core_persona = "Alchemist",
                greeting = "Hello",
                appearance = "Cloaked",
                style_rules = "Scientific",
                definition = "",
                negative_guidance = "",
                temperature = 0.9,
                top_p = 0.9,
                starters = emptyList(),
                example_conversations = emptyList(),
                portrait_status = "idle",
                portrait_path = null,
                portrait_prompt = null,
                portrait_seed = null,
                portrait_source_hash = null,
                portrait_last_error = null,
                portrait_generated_at = null,
                created_at = "",
                updated_at = ""
            )
        )
    }

    @After
    @Throws(IOException::class)
    fun closeDb() {
        db.close()
    }

    @Test
    fun fifteenthCommittedExchangeCreatesStrictCheckpoint() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Checkpoint")
        val branch = dao.getActiveBranchForThread(thread.id)!!
        var head: String? = null
        repeat(15) { index ->
            val turn = dao.beginTurn(userId, branch.id, head, "User ${index + 1}", "{}")
            dao.commitTurn(userId, branch.id, turn.id, "Assistant ${index + 1}", "{}", "deepseek", "chat-model", "Chat", "stop", 10, 5, 5, null)
            head = turn.id
            if (index < 14) assertTrue(dao.getPendingCheckpoints().isEmpty())
        }
        val checkpoint = dao.getPendingCheckpoints().single()
        assertEquals(head, checkpoint.target_turn_id)
        assertEquals("pending_export", checkpoint.status)
        try {
            dao.beginTurn(userId, branch.id, head, "Blocked", "{}")
            fail("Checkpoint must block the sixteenth exchange")
        } catch (expected: IllegalStateException) {
            assertTrue(expected.message!!.contains("Continuity checkpoint"))
        }
    }

    @Test
    fun rewindCreatesNoCheckpointAndKeepsOnlyRetainedLineage() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Rewind")
        val branch = dao.getActiveBranchForThread(thread.id)!!
        val turns = mutableListOf<TurnEntity>()
        var head: String? = null
        repeat(3) { index ->
            val turn = dao.beginTurn(userId, branch.id, head, "User ${index + 1}", "{}")
            dao.commitTurn(userId, branch.id, turn.id, "Assistant ${index + 1}", "{}", "deepseek", "chat-model", "Chat", "stop", 10, 5, 5, null)
            turns += turn
            head = turn.id
        }
        dao.rewindBranchToTurn(userId, branch.id, turns.first().id, turns.last().id)

        // A Rewind only removes exchanges, so it asks for no Continuity Update. See ADR-0013.
        assertTrue(
            "A Rewind must not create a Continuity Checkpoint",
            dao.getPendingCheckpoints().isEmpty()
        )
        assertNull(dao.getTurn(turns[1].id))
        assertNull(dao.getTurn(turns[2].id))
        assertEquals(listOf(turns.first().id), dao.getAncestorTurns(turns.first().id).map { it.id })
        assertEquals(turns.first().id, dao.getBranch(branch.id)!!.head_turn_id)
    }

    @Test
    fun rewindNeverDeletesSiblingBranchOrItsSixExchangeLineage() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(
            userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Sibling rewind"
        )
        val main = dao.getActiveBranchForThread(thread.id)!!
        val mainTurns = mutableListOf<TurnEntity>()
        var mainHead: String? = null
        repeat(3) { index ->
            val turn = dao.beginTurn(userId, main.id, mainHead, "Main ${index + 1}", "{}")
            dao.commitTurn(
                userId, main.id, turn.id, "Main reply ${index + 1}", "{}",
                "deepseek", "chat-model", "Chat", "stop", 10, 5, 5, null
            )
            mainTurns += turn
            mainHead = turn.id
        }

        val jealousy = dao.createBranchFromTurn(
            userId = userId,
            sourceBranchId = main.id,
            sourceTurnId = mainTurns[1].id,
            name = "Jealousy",
            makeActive = true
        )
        val jealousyTurns = mutableListOf<TurnEntity>()
        var jealousyHead: String? = jealousy.head_turn_id
        repeat(6) { index ->
            val turn = dao.beginTurn(userId, jealousy.id, jealousyHead, "Jealousy ${index + 1}", "{}")
            dao.commitTurn(
                userId, jealousy.id, turn.id, "Jealous reply ${index + 1}", "{}",
                "deepseek", "chat-model", "Chat", "stop", 10, 5, 5, null
            )
            jealousyTurns += turn
            jealousyHead = turn.id
        }

        dao.activateBranch(userId, thread.id, main.id)
        dao.rewindBranchToTurn(userId, main.id, mainTurns.first().id, mainTurns.last().id)

        val retainedJealousy = dao.getBranch(jealousy.id)
        assertNotNull("Rewinding Main must never delete the Jealousy branch", retainedJealousy)
        assertEquals(jealousyTurns.last().id, retainedJealousy!!.head_turn_id)
        jealousyTurns.forEach { turn ->
            assertNotNull("Jealousy exchange ${turn.id} must remain stored", dao.getTurn(turn.id))
        }
    }

    @Test
    fun acceptingCheckpointPersistsTimelineEventsAtomically() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Timeline")
        val branch = dao.getActiveBranchForThread(thread.id)!!
        val turn = dao.beginTurn(userId, branch.id, null, "A revelation", "{}")
        dao.commitTurn(userId, branch.id, turn.id, "The truth is revealed", "{}", "deepseek", "chat-model", "Chat", "stop", 10, 5, 5, null)
        val request = ContinuityCheckpointEntity(
            id = "checkpoint-timeline",
            thread_id = thread.id,
            branch_id = branch.id,
            target_turn_id = turn.id,
            baseline_turn_id = null,
            baseline_version = 0,
            status = "waiting_for_worker",
            created_at = "now",
            updated_at = "now"
        )
        dao.insertCheckpoint(request)
        val snapshot = DurableMemorySnapshot(
            metadata = SnapshotMetadata(turn.id, "Day 1", "continuation", 1),
            spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
            entity_state = emptyList(),
            relational_state = emptyList(),
            narrative_state = NarrativeState("Story", "Scene", "Beat", emptyList(), emptyList())
        )
        val event = TimelineEntity(
            id = "checkpoint-timeline:event:0",
            thread_id = thread.id,
            branch_id = branch.id,
            turn_id = turn.id,
            title = "The truth emerges",
            detail = "A major revelation changes the scene.",
            importance = 5,
            event_type = "reveal",
            affected_entity_ids = emptyList(),
            affected_relationship_ids = emptyList(),
            created_at = "now"
        )

        dao.acceptCheckpoint(request.id, snapshot, listOf(event))
        // A foreground/background race may enter acceptance twice. The second acceptance is a
        // successful no-op and must never revert the checkpoint to failed.
        dao.acceptCheckpoint(request.id, snapshot, listOf(event))

        assertEquals("accepted", dao.getCheckpoint(request.id)?.status)
        assertEquals(listOf(event), dao.getTimelineEvents(thread.id, branch.id))
        assertEquals(snapshot, dao.getSnapshot(turn.id)?.world_state)
    }

    @Test
    fun checkpointRequestIncludesFullRetainedTranscriptAndMarksOnlyNewTurns() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Full transcript")
        val branch = dao.getActiveBranchForThread(thread.id)!!
        val turns = mutableListOf<TurnEntity>()
        var head: String? = null
        repeat(3) { index ->
            val turn = dao.beginTurn(userId, branch.id, head, "User ${index + 1}", "{}")
            dao.commitTurn(userId, branch.id, turn.id, "Assistant ${index + 1}", "{}", "deepseek", "chat-model", "Chat", "stop", 10, 5, 5, null)
            turns += turn
            head = turn.id
        }
        val baseline = DurableMemorySnapshot(
            metadata = SnapshotMetadata(turns.first().id, "Day 1", "continuation", 1),
            spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
            entity_state = emptyList(),
            relational_state = emptyList(),
            narrative_state = NarrativeState("Earlier story", "Earlier scene", "Earlier beat", emptyList(), emptyList())
        )
        dao.upsertWorldSnapshot(turns.first().id, thread.id, branch.id, null, baseline, 1, true)
        val checkpoint = ContinuityCheckpointEntity(
            id = "full-transcript-checkpoint",
            thread_id = thread.id,
            branch_id = branch.id,
            target_turn_id = turns.last().id,
            baseline_turn_id = turns.first().id,
            baseline_version = 1,
            status = "pending_export",
            created_at = "now",
            updated_at = "now"
        )

        val request = ContinuityCheckpointProtocol.buildRequest(
            dao, checkpoint, db.characterDao().getCharacter(characterId)!!, null, ""
        )

        assertEquals(turns.map { it.id }, request.exchanges.map { it.turn_id })
        assertEquals(turns.drop(1).map { it.id }, request.checkpoint_turn_ids)
    }

    @Test
    fun testBeginTurnLocksBranchAndReservesTurn() = runBlocking {
        val chatDao = db.chatDao()

        // 1. Create Thread and Branch
        val thread = chatDao.createThreadWithBranch(
            userId = userId,
            characterId = characterId,
            connectionId = connectionId,
            modelId = "gemini-1.5-flash",
            personaId = null,
            brainConnectionId = null,
            brainModelId = null,
            maxOutputTokens = 2048,
            title = "Test Thread"
        )

        val branch = chatDao.getActiveBranchForThread(thread.id)
        assertNotNull(branch)
        assertEquals("Main", branch!!.name)
        assertFalse(branch.generation_locked)
        assertNull(branch.head_turn_id)

        // 2. Begin Turn
        val turn = chatDao.beginTurn(
            userId = userId,
            branchId = branch.id,
            expectedHeadTurnId = null,
            userInputText = "Hello Mara",
            userInputPayload = "[]"
        )

        assertEquals("reserved", turn.generation_status)
        assertEquals("Hello Mara", turn.user_input_text)
        assertNull(turn.assistant_output_text)

        // Verify Branch is locked
        val lockedBranch = chatDao.getBranch(branch.id)
        assertNotNull(lockedBranch)
        assertTrue(lockedBranch!!.generation_locked)
        assertEquals(turn.id, lockedBranch.locked_by_turn_id)

        // 3. Attempt to begin another turn on locked branch should fail
        try {
            chatDao.beginTurn(
                userId = userId,
                branchId = branch.id,
                expectedHeadTurnId = null,
                userInputText = "Another turn",
                userInputPayload = "[]"
            )
            fail("Should have failed to begin turn on locked branch")
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.contains("already generating"))
        }
    }

    @Test
    fun testCommitTurnMovesHeadAndUnlocksBranch() = runBlocking {
        val chatDao = db.chatDao()

        val thread = chatDao.createThreadWithBranch(
            userId = userId,
            characterId = characterId,
            connectionId = connectionId,
            modelId = "gemini",
            personaId = null,
            brainConnectionId = null,
            brainModelId = null,
            maxOutputTokens = 2048,
            title = "Commit Test"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!

        val turn = chatDao.beginTurn(
            userId = userId,
            branchId = branch.id,
            expectedHeadTurnId = null,
            userInputText = "Hello",
            userInputPayload = "[]"
        )

        // Commit Turn
        val committed = chatDao.commitTurn(
            userId = userId,
            branchId = branch.id,
            turnId = turn.id,
            assistantText = "Hi there!",
            assistantPayload = "[]",
            provider = "google",
            model = "gemini",
            label = "Google",
            finishReason = "stop",
            totalTokens = 10,
            promptTokens = 5,
            completionTokens = 5,
            replaceTurnId = null
        )

        assertEquals("committed", committed.generation_status)
        assertEquals("Hi there!", committed.assistant_output_text)

        // Verify branch head updated and unlocked
        val updatedBranch = chatDao.getBranch(branch.id)!!
        assertFalse(updatedBranch.generation_locked)
        assertEquals(committed.id, updatedBranch.head_turn_id)
        assertNull(updatedBranch.locked_by_turn_id)
    }

    @Test
    fun testCommitTurnRejectsBlankAssistantOutput() = runBlocking {
        val chatDao = db.chatDao()
        val thread = chatDao.createThreadWithBranch(
            userId, characterId, connectionId, "deepseek-v4-pro", null, null, null, 2048, "Blank output"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!
        val turn = chatDao.beginTurn(userId, branch.id, null, "Hello", "{}")

        try {
            chatDao.commitTurn(userId, branch.id, turn.id, "   ", "{}", "deepseek", "deepseek-v4-pro", "DeepSeek", "stop", 999, 900, 99, null)
            fail("Blank assistant output must not be committed")
        } catch (error: IllegalArgumentException) {
            assertTrue(error.message!!.contains("no visible reply"))
        }

        assertEquals("reserved", chatDao.getTurn(turn.id)!!.generation_status)
        assertNull(chatDao.getBranch(branch.id)!!.head_turn_id)
    }

    @Test
    fun commitRejectsReplacementThatWouldCascadeDeleteTheNewHead() = runBlocking {
        val chatDao = db.chatDao()

        val thread = chatDao.createThreadWithBranch(
            userId = userId,
            characterId = characterId,
            connectionId = connectionId,
            modelId = "gemini",
            personaId = null,
            brainConnectionId = null,
            brainModelId = null,
            maxOutputTokens = 2048,
            title = "Cascade Test"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!

        // Turn 1
        val turn1 = chatDao.beginTurn(userId, branch.id, null, "Hello", "[]")
        chatDao.commitTurn(userId, branch.id, turn1.id, "Hi 1", "[]", "g", "m", "l", "stop", 10, 5, 5, null)

        // Snapshot for Turn 1
        val dummySnapshot = DurableMemorySnapshot(
            metadata = SnapshotMetadata(turn1.id, "", "", 1),
            spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
            entity_state = emptyList(),
            relational_state = emptyList(),
            narrative_state = NarrativeState("", "", "", emptyList(), emptyList())
        )
        chatDao.upsertWorldSnapshot(turn1.id, thread.id, branch.id, null, dummySnapshot, 1, false)
        assertNotNull(chatDao.getSnapshot(turn1.id))

        // Turn 2 is a child, not a sibling, so deleting Turn 1 would cascade-delete Turn 2.
        val turn2 = chatDao.beginTurn(userId, branch.id, turn1.id, "Hello again", "[]")
        try {
            chatDao.commitTurn(
                userId, branch.id, turn2.id, "Hi 2", "[]", "g", "m", "l",
                "stop", 10, 5, 5, replaceTurnId = turn1.id
            )
            fail("A replacement that would delete its own new head must be rejected")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message!!.contains("sibling"))
        }

        assertNotNull(chatDao.getTurn(turn1.id))
        assertNotNull(chatDao.getSnapshot(turn1.id))
        assertNotNull(chatDao.getTurn(turn2.id))
        assertEquals(turn1.id, chatDao.getBranch(branch.id)!!.head_turn_id)
    }

    @Test
    fun startupRepairsDanglingHeadToLatestSurvivingBranchTurn() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(
            userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Repair"
        )
        val branch = dao.getActiveBranchForThread(thread.id)!!
        val first = dao.beginTurn(userId, branch.id, null, "One", "{}")
        dao.commitTurn(userId, branch.id, first.id, "Reply one", "{}", "deepseek", "m", "Chat", "stop", 1, 1, 1, null)
        val second = dao.beginTurn(userId, branch.id, first.id, "Two", "{}")
        dao.commitTurn(userId, branch.id, second.id, "Reply two", "{}", "deepseek", "m", "Chat", "stop", 1, 1, 1, null)

        dao.updateBranch(dao.getBranch(branch.id)!!.copy(head_turn_id = "missing-turn"))

        assertEquals(1, dao.repairDanglingBranchHeads())
        assertEquals(second.id, dao.getBranch(branch.id)!!.head_turn_id)
        assertNotNull(dao.getTurn(first.id))
        assertNotNull(dao.getTurn(second.id))
    }

    @Test
    fun replacementNeverDeletesAChildBranchLineage() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(
            userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Safe replacement"
        )
        val main = dao.getActiveBranchForThread(thread.id)!!
        val first = dao.beginTurn(userId, main.id, null, "One", "{}")
        dao.commitTurn(userId, main.id, first.id, "Reply one", "{}", "deepseek", "m", "Chat", "stop", 1, 1, 1, null)
        val oldHead = dao.beginTurn(userId, main.id, first.id, "Two", "{}")
        dao.commitTurn(userId, main.id, oldHead.id, "Old reply", "{}", "deepseek", "m", "Chat", "stop", 1, 1, 1, null)

        val childBranch = dao.createBranchFromTurn(userId, main.id, oldHead.id, "Child", true)
        val childTurn = dao.beginTurn(userId, childBranch.id, oldHead.id, "Child turn", "{}")
        dao.commitTurn(userId, childBranch.id, childTurn.id, "Child reply", "{}", "deepseek", "m", "Chat", "stop", 1, 1, 1, null)
        dao.activateBranch(userId, thread.id, main.id)

        val replacement = dao.beginTurn(
            userId = userId,
            branchId = main.id,
            expectedHeadTurnId = oldHead.id,
            userInputText = "Two, edited",
            userInputPayload = "{}",
            parentTurnIdOverride = first.id,
            forceParentOverride = true
        )
        dao.commitTurn(
            userId, main.id, replacement.id, "New reply", "{}", "deepseek", "m",
            "Chat", "stop", 1, 1, 1, replaceTurnId = oldHead.id
        )

        assertEquals(replacement.id, dao.getBranch(main.id)!!.head_turn_id)
        assertEquals(childTurn.id, dao.getBranch(childBranch.id)!!.head_turn_id)
        assertNotNull(dao.getTurn(oldHead.id))
        assertNotNull(dao.getTurn(childTurn.id))
    }

    @Test
    fun roleplayJobAcceptsOnlyItsFrozenIdentityAndCommitsAtomically() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(
            userId, characterId, connectionId, "antigravity:gemini-3.6-flash:high",
            null, null, null, 2048, "Mac roleplay"
        )
        val branch = dao.getActiveBranchForThread(thread.id)!!
        val turn = dao.beginTurn(
            userId, branch.id, null, "Speak", "{}",
            requestedSpeakerId = "side:yunxi",
            requestedSpeakerName = "Yunxi",
            speakerMode = "single"
        )
        val job = RoleplayGenerationJobEntity(
            id = "roleplay-1",
            turn_id = turn.id,
            thread_id = thread.id,
            branch_id = branch.id,
            expected_head_turn_id = null,
            replace_turn_id = null,
            requested_speaker_id = "side:yunxi",
            speaker_mode = "single",
            model_id = "antigravity:gemini-3.6-flash:high",
            system_prompt = "Frozen system prompt",
            messages_json = "[]",
            temperature = 0.9,
            top_p = 0.95,
            max_tokens = 2048,
            created_at = "now",
            updated_at = "now"
        )
        dao.insertRoleplayJob(job)

        val committed = dao.acceptRoleplayJob(
            jobId = job.id,
            replyText = "Yunxi answers.",
            responseThreadId = thread.id,
            responseBranchId = branch.id,
            responseTurnId = turn.id,
            responseSpeakerId = "side:yunxi",
            responseSpeakerMode = "single",
            responseModelId = job.model_id,
            elapsedMillis = 1500,
            continuityEngineId = "antigravity:gemini-3.6-flash:high"
        )

        assertEquals("committed", committed.generation_status)
        assertEquals("Yunxi answers.", committed.assistant_output_text)
        assertEquals("accepted", dao.getRoleplayJob(job.id)?.status)
        assertEquals(turn.id, dao.getBranch(branch.id)?.head_turn_id)
        assertFalse(dao.getBranch(branch.id)!!.generation_locked)

        // A stale regenerate/discard action may have captured this job before acceptance.
        // It must not erase the reply that just became durable history.
        dao.discardRoleplayJob(job.id)
        assertEquals("accepted", dao.getRoleplayJob(job.id)?.status)
        assertEquals(turn.id, dao.getBranch(branch.id)?.head_turn_id)
        assertEquals("committed", dao.getTurn(turn.id)?.generation_status)
    }

    @Test
    fun roleplayJobRejectsAStaleModelResponseWithoutUnlockingTheBranch() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(
            userId, characterId, connectionId, "antigravity:gemini-3.6-flash:high",
            null, null, null, 2048, "Stale Mac roleplay"
        )
        val branch = dao.getActiveBranchForThread(thread.id)!!
        val turn = dao.beginTurn(userId, branch.id, null, "Speak", "{}")
        val job = RoleplayGenerationJobEntity(
            id = "roleplay-stale",
            turn_id = turn.id,
            thread_id = thread.id,
            branch_id = branch.id,
            expected_head_turn_id = null,
            replace_turn_id = null,
            requested_speaker_id = null,
            speaker_mode = "single",
            model_id = "antigravity:gemini-3.6-flash:high",
            system_prompt = "Frozen system prompt",
            messages_json = "[]",
            temperature = 0.9,
            top_p = 0.95,
            max_tokens = 2048,
            created_at = "now",
            updated_at = "now"
        )
        dao.insertRoleplayJob(job)

        try {
            dao.acceptRoleplayJob(
                job.id, "Wrong result", thread.id, branch.id, turn.id,
                null, "single", "different-model", 100,
                "codex:gpt-5.6-terra:high"
            )
            fail("A result from another frozen model must be rejected")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message!!.contains("model mismatch"))
        }

        assertEquals("reserved", dao.getTurn(turn.id)?.generation_status)
        assertEquals("pending_export", dao.getRoleplayJob(job.id)?.status)
        assertTrue(dao.getBranch(branch.id)!!.generation_locked)
    }

    @Test
    fun directApiRoleplayJobUsesTheSameAtomicAcceptancePath() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(
            userId, characterId, connectionId, "deepseek-v4-pro",
            null, null, null, 2048, "Direct roleplay"
        )
        val branch = dao.getActiveBranchForThread(thread.id)!!
        val turn = dao.beginTurn(
            userId, branch.id, null, "Speak", "{}",
            requestedSpeakerId = "primary:${thread.id}",
            requestedSpeakerName = "Primary",
            speakerMode = "single"
        )
        val job = RoleplayGenerationJobEntity(
            id = "roleplay-direct",
            turn_id = turn.id,
            thread_id = thread.id,
            branch_id = branch.id,
            expected_head_turn_id = null,
            replace_turn_id = null,
            requested_speaker_id = "primary:${thread.id}",
            speaker_mode = "single",
            model_id = "deepseek-v4-pro",
            system_prompt = "Frozen system prompt",
            messages_json = """[{"role":"user","content":"Speak"}]""",
            temperature = 0.9,
            top_p = 0.95,
            max_tokens = 2048,
            provider = "deepseek",
            connection_id = connectionId,
            connection_label = "DeepSeek",
            execution_mode = "direct",
            request_hash = "frozen-hash",
            created_at = "now",
            updated_at = "now"
        )
        dao.insertRoleplayJob(job)

        val committed = dao.acceptRoleplayJob(
            jobId = job.id,
            replyText = "The direct model answers.",
            responseThreadId = thread.id,
            responseBranchId = branch.id,
            responseTurnId = turn.id,
            responseSpeakerId = job.requested_speaker_id,
            responseSpeakerMode = job.speaker_mode,
            responseModelId = job.model_id,
            elapsedMillis = 400,
            continuityEngineId = "codex:gpt-5.6-terra:high",
            provider = "deepseek",
            connectionLabel = "DeepSeek",
            assistantPayload = """{"prompt_cache_hit_tokens":120,"prompt_cache_miss_tokens":30}""",
            totalTokens = 200,
            promptTokens = 150,
            completionTokens = 50
        )

        assertEquals("committed", committed.generation_status)
        assertEquals("deepseek", committed.assistant_provider)
        assertEquals("deepseek-v4-pro", committed.assistant_model)
        assertEquals("accepted", dao.getRoleplayJob(job.id)?.status)
        assertEquals(turn.id, dao.getBranch(branch.id)?.head_turn_id)
        assertFalse(dao.getBranch(branch.id)!!.generation_locked)
    }

    @Test
    fun assistantEditCreatesBranchLocalReplacementAndMandatoryCheckpoint() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(
            userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Immutable edit"
        )
        val main = dao.getActiveBranchForThread(thread.id)!!
        val first = dao.beginTurn(userId, main.id, null, "First", "{}")
        val committedFirst = dao.commitTurn(
            userId, main.id, first.id, "Original answer", "{}", "deepseek", "chat-model",
            "Chat", "stop", null, null, null, null
        )
        val second = dao.beginTurn(userId, main.id, committedFirst.id, "Second", "{}")
        val committedSecond = dao.commitTurn(
            userId, main.id, second.id, "Second answer", "{}", "deepseek", "chat-model",
            "Chat", "stop", null, null, null, null
        )
        val sibling = dao.createBranchFromTurn(
            userId, main.id, committedFirst.id, "Sibling", makeActive = false
        )

        val checkpoint = dao.replaceAssistantReply(
            userId, main.id, committedFirst.id, "Edited only on Main",
            "codex:gpt-5.6-terra:high"
        )

        assertEquals("Original answer", dao.getTurn(committedFirst.id)?.assistant_output_text)
        assertEquals(committedFirst.id, dao.getBranch(sibling.id)?.head_turn_id)
        val mainHead = dao.getBranch(main.id)!!.head_turn_id!!
        assertNotEquals(committedSecond.id, mainHead)
        val replacementPath = dao.getAncestorTurns(mainHead)
        assertEquals("Edited only on Main", replacementPath.single { it.user_input_text == "First" }.assistant_output_text)
        assertEquals(mainHead, checkpoint.target_turn_id)
        assertEquals("assistant_edit", checkpoint.trigger_reason)
        assertEquals(checkpoint.id, dao.getBlockingCheckpoint(mainHead)?.id)
    }

    @Test
    fun destructiveDefinitionsAreRejectedWhileThreadsDependOnThem() = runBlocking {
        val thread = db.chatDao().createThreadWithBranch(
            userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Protected"
        )

        assertFalse(db.characterDao().deleteCharacterIfUnused(db.characterDao().getCharacter(characterId)!!))
        assertFalse(db.connectionDao().deleteConnectionIfUnused(db.connectionDao().getConnection(connectionId)!!))
        assertNotNull(db.chatDao().getThread(thread.id))
    }

    @Test
    fun primaryCharacterSaveSynchronizesExistingThreadCastSeeds() = runBlocking {
        val thread = db.chatDao().createThreadWithBranch(
            userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Seed sync"
        )
        val character = db.characterDao().getCharacter(characterId)!!.copy(
            name = "Mara Renamed",
            core_persona = "A changed but authoritative persona",
            updated_at = "later"
        )

        db.characterDao().saveCharacterAndSyncPrimarySeeds(character)

        val primary = db.chatDao().getCastSeeds(thread.id).single { it.provenance == "primary" }
        assertEquals("Mara Renamed", primary.canonical_name)
        assertEquals("A changed but authoritative persona", primary.personality)
    }

    @Test
    fun forkRestoresSpeakerAtForkInsteadOfCurrentSpeaker() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(
            userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Speaker fork"
        )
        val main = dao.getActiveBranchForThread(thread.id)!!
        val first = dao.beginTurn(
            userId, main.id, null, "First",
            """{"sticky_speaker_id":"cast:yunxi","sticky_mode":"single"}"""
        )
        dao.commitTurn(
            userId, main.id, first.id, "Yunxi answers", "{}", "deepseek", "chat-model",
            "Chat", "stop", null, null, null, null
        )
        dao.setActiveSpeaker(main.id, "primary:${thread.id}", "ensemble", "later")

        val fork = dao.createBranchFromTurn(userId, main.id, first.id, "Fork", makeActive = false)

        assertEquals("cast:yunxi", fork.active_speaker_id)
        assertEquals("single", fork.speaker_mode)
    }
}
