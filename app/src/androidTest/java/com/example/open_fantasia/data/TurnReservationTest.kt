package com.example.open_fantasia.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.local.entity.BranchEntity
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import com.example.open_fantasia.data.local.entity.ProfileEntity
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class TurnReservationTest {

    private lateinit var db: OpenFantasiaDatabase
    private val userId = "user-123"
    private val connectionId = "conn-123"
    private val characterId = "char-123"

    @Before
    fun createDb() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, OpenFantasiaDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        // Seed data
        db.profileDao().insertProfile(ProfileEntity(userId, "TestUser", "", ""))
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
    fun closeDb() {
        db.close()
    }

    @Test
    fun beginTurn_setsGenerationLocked_andAdvancesHeadInCommit() = runBlocking {
        val chatDao = db.chatDao()
        val thread = chatDao.createThreadWithBranch(
            userId, characterId, connectionId, "gemini-1.5-flash", null, null, null, 2048, "Test"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!

        // 1. Begin Turn (Reservation)
        val turn = chatDao.beginTurn(userId, branch.id, null, "User text", "[]")
        assertEquals("reserved", turn.generation_status)
        assertEquals("User text", turn.user_input_text)
        assertNull(turn.assistant_output_text)

        // Branch is locked, but head is still null (not advanced yet)
        val branchAfterBegin = chatDao.getBranch(branch.id)!!
        assertTrue(branchAfterBegin.generation_locked)
        assertEquals(turn.id, branchAfterBegin.locked_by_turn_id)
        assertNull(branchAfterBegin.head_turn_id)

        // 2. Mark turn streaming
        chatDao.markTurnStreaming(turn.id)
        val turnStreaming = chatDao.getTurn(turn.id)!!
        assertEquals("streaming", turnStreaming.generation_status)

        // 3. Commit Turn (Advances head, unlocks branch)
        val committed = chatDao.commitTurn(
            userId = userId,
            branchId = branch.id,
            turnId = turn.id,
            assistantText = "Mara reply",
            assistantPayload = "[]",
            provider = "google",
            model = "gemini-1.5-flash",
            label = "Google",
            finishReason = "stop",
            totalTokens = 10,
            promptTokens = 5,
            completionTokens = 5,
            replaceTurnId = null
        )
        assertEquals("committed", committed.generation_status)

        val branchAfterCommit = chatDao.getBranch(branch.id)!!
        assertFalse(branchAfterCommit.generation_locked)
        assertEquals(committed.id, branchAfterCommit.head_turn_id)
        assertNull(branchAfterCommit.locked_by_turn_id)
    }

    @Test
    fun beginTurn_throwsIfLockAlreadyHeld() = runBlocking {
        val chatDao = db.chatDao()
        val thread = chatDao.createThreadWithBranch(
            userId, characterId, connectionId, "gemini-1.5-flash", null, null, null, 2048, "Test"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!

        chatDao.beginTurn(userId, branch.id, null, "User text", "[]")

        // Try second beginTurn on locked branch -> should throw
        try {
            chatDao.beginTurn(userId, branch.id, null, "Another user text", "[]")
            fail("Expected IllegalStateException")
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.contains("already generating"))
        }
    }

    @Test
    fun beginTurn_throwsIfExpectedHeadMismatch() = runBlocking {
        val chatDao = db.chatDao()
        val thread = chatDao.createThreadWithBranch(
            userId, characterId, connectionId, "gemini-1.5-flash", null, null, null, 2048, "Test"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!

        // Expected head mismatch since current head is null, but we pass "stale-id"
        try {
            chatDao.beginTurn(userId, branch.id, "stale-id", "User text", "[]")
            fail("Expected IllegalStateException")
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.contains("Branch head changed"))
        }
    }

    @Test
    fun failTurn_releasesLock_preservesExistingTurns() = runBlocking {
        val chatDao = db.chatDao()
        val thread = chatDao.createThreadWithBranch(
            userId, characterId, connectionId, "gemini-1.5-flash", null, null, null, 2048, "Test"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!

        val turn = chatDao.beginTurn(userId, branch.id, null, "User text", "[]")
        assertTrue(chatDao.getBranch(branch.id)!!.generation_locked)

        // Fail the turn
        val failed = chatDao.failTurn(userId, branch.id, turn.id, "API_ERROR", "Failed to contact service")
        assertEquals("failed", failed.generation_status)
        assertEquals("API_ERROR", failed.failure_code)

        val branchAfterFail = chatDao.getBranch(branch.id)!!
        assertFalse(branchAfterFail.generation_locked)
        assertNull(branchAfterFail.locked_by_turn_id)
        assertNull(branchAfterFail.head_turn_id)
    }

    @Test
    fun editFlow_doesNotDeleteOldTurnsUntilSuccess() = runBlocking {
        val chatDao = db.chatDao()
        val thread = chatDao.createThreadWithBranch(
            userId, characterId, connectionId, "gemini-1.5-flash", null, null, null, 2048, "Test"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!

        // 1. Commit Turn 1
        val turn1 = chatDao.beginTurn(userId, branch.id, null, "Original User", "[]")
        chatDao.commitTurn(
            userId, branch.id, turn1.id, "Original Assistant", "[]",
            "google", "gemini-1.5-flash", "Google", "stop", 10, 5, 5, null
        )

        // 2. Reserve Edit Turn 2, side-by-side (sharing same parent = null)
        val turn2 = chatDao.beginTurn(
            userId = userId,
            branchId = branch.id,
            expectedHeadTurnId = turn1.id, // Current head
            userInputText = "Edited User",
            userInputPayload = "[]",
            parentTurnIdOverride = null,
            forceParentOverride = true
        )

        // Verify branch is locked, turn 2 is reserved, but turn 1 is STILL head and STILL in DB
        val branchDuringEdit = chatDao.getBranch(branch.id)!!
        assertTrue(branchDuringEdit.generation_locked)
        assertEquals(turn1.id, branchDuringEdit.head_turn_id)
        assertNotNull(chatDao.getTurn(turn1.id))
        assertNotNull(chatDao.getTurn(turn2.id))

        // 3. Simulate failure of Edit -> failTurn
        chatDao.failTurn(userId, branch.id, turn2.id, "API_ERROR", "Failed")

        // Verify Turn 1 is still head, branch is unlocked, and Turn 1 is untouched
        val branchAfterFailedEdit = chatDao.getBranch(branch.id)!!
        assertFalse(branchAfterFailedEdit.generation_locked)
        assertEquals(turn1.id, branchAfterFailedEdit.head_turn_id)
        assertNotNull(chatDao.getTurn(turn1.id))

        // 4. Try again, reserve Turn 3 side-by-side
        val turn3 = chatDao.beginTurn(
            userId = userId,
            branchId = branch.id,
            expectedHeadTurnId = turn1.id,
            userInputText = "Edited User Try 2",
            userInputPayload = "[]",
            parentTurnIdOverride = null,
            forceParentOverride = true
        )

        // Commit Edit Turn 3, replacing Turn 1
        chatDao.commitTurn(
            userId = userId,
            branchId = branch.id,
            turnId = turn3.id,
            assistantText = "Edited Assistant",
            assistantPayload = "[]",
            provider = "google",
            model = "gemini-1.5-flash",
            label = "Google",
            finishReason = "stop",
            totalTokens = 12,
            promptTokens = 6,
            completionTokens = 6,
            replaceTurnId = turn1.id
        )

        // Verify Turn 3 is head, branch unlocked
        val branchAfterSuccessEdit = chatDao.getBranch(branch.id)!!
        assertFalse(branchAfterSuccessEdit.generation_locked)
        assertEquals(turn3.id, branchAfterSuccessEdit.head_turn_id)

        // Verify Turn 1 is now deleted
        assertNull(chatDao.getTurn(turn1.id))
    }

    @Test
    fun clearStaleLocks_clearsOldLocks_andLeavesRecentLocks() = runBlocking {
        val chatDao = db.chatDao()
        val thread = chatDao.createThreadWithBranch(
            userId, characterId, connectionId, "gemini-1.5-flash", null, null, null, 2048, "Test"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!

        // Begin a turn to acquire lock (locks at current time)
        val turn1 = chatDao.beginTurn(userId, branch.id, null, "User text", "[]")

        // Create a second thread and branch to simulate a stale lock
        val threadStale = chatDao.createThreadWithBranch(
            userId, characterId, connectionId, "gemini-1.5-flash", null, null, null, 2048, "Test Stale"
        )
        val branchStale = chatDao.getActiveBranchForThread(threadStale.id)!!
        val turnStale = chatDao.beginTurn(userId, branchStale.id, null, "Stale User", "[]")

        // Manipulate branchStale.locked_at directly in DB to be 6 minutes ago
        val sixMinutesAgo = Instant.now().minusSeconds(360).toString()
        val updatedBranchStale = branchStale.copy(
            locked_at = sixMinutesAgo
        )
        chatDao.updateBranch(updatedBranchStale)

        // Run clearStaleLocks (stale threshold = 5 minutes = 300,000ms)
        val cleared = chatDao.clearStaleLocks(300_000)
        assertEquals(1, cleared)

        // Verify turn1 (recent) is still locked and reserved
        val branch1 = chatDao.getBranch(branch.id)!!
        assertTrue(branch1.generation_locked)
        assertEquals(turn1.id, branch1.locked_by_turn_id)
        val fetchedTurn1 = chatDao.getTurn(turn1.id)!!
        assertEquals("reserved", fetchedTurn1.generation_status)

        // Verify branchStale is unlocked
        val branchStaleAfter = chatDao.getBranch(branchStale.id)!!
        assertFalse(branchStaleAfter.generation_locked)
        assertNull(branchStaleAfter.locked_by_turn_id)
        assertNull(branchStaleAfter.locked_at)

        // Verify turnStale is marked failed
        val fetchedTurnStale = chatDao.getTurn(turnStale.id)!!
        assertEquals("failed", fetchedTurnStale.generation_status)
        assertEquals("timeout", fetchedTurnStale.failure_code)
    }
}
