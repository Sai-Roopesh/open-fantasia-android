package com.example.open_fantasia.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.local.entity.*
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
    fun testCommitTurnWithReplaceDeletesOldTurnCascading() = runBlocking {
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

        // Turn 2 (will replace Turn 1)
        val turn2 = chatDao.beginTurn(userId, branch.id, turn1.id, "Hello again", "[]")
        chatDao.commitTurn(userId, branch.id, turn2.id, "Hi 2", "[]", "g", "m", "l", "stop", 10, 5, 5, replaceTurnId = turn1.id)

        // Verify Turn 1 is deleted
        assertNull(chatDao.getTurn(turn1.id))
        
        // Verify Snapshot for Turn 1 is deleted via cascade
        assertNull(chatDao.getSnapshot(turn1.id))

        // Verify Turn 2 is committed and head
        val bAfter2 = chatDao.getBranch(branch.id)!!
        assertEquals(turn2.id, bAfter2.head_turn_id)
        assertNotNull(chatDao.getTurn(turn2.id))
    }
}
