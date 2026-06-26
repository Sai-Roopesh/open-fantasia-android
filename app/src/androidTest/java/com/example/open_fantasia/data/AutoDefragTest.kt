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
import com.example.open_fantasia.data.local.entity.TurnEntity
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

@RunWith(AndroidJUnit4::class)
class AutoDefragTest {

    private lateinit var db: OpenFantasiaDatabase
    private val userId = "user-defrag"
    private val connectionId = "conn-defrag"
    private val characterId = "char-defrag"

    @Before
    fun createDb() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, OpenFantasiaDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        db.profileDao().insertProfile(ProfileEntity(userId, "DefragTest", "", ""))
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

    // Helper to simulate consecutive incremental turns in a branch path
    private suspend fun shouldDefragmentSimulated(turn: TurnEntity, historyTurns: List<TurnEntity>): Boolean {
        val parentId = turn.parent_turn_id ?: return false
        val index = historyTurns.indexOfFirst { it.id == parentId }
        if (index == -1) return false
        var count = 0
        for (i in index downTo 0) {
            val t = historyTurns[i]
            val snapshot = db.chatDao().getSnapshot(t.id)
            if (snapshot != null) {
                if (snapshot.is_full_materialization) {
                    break
                }
                count++
            }
        }
        return count >= 9
    }

    @Test
    fun testDefragAlgorithm_triggersEvery10Turns() = runBlocking {
        val chatDao = db.chatDao()
        val thread = chatDao.createThreadWithBranch(
            userId, characterId, connectionId, "gemini-1.5-flash", null, null, null, 2048, "Test"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!

        val turnsList = mutableListOf<TurnEntity>()
        var prevTurnId: String? = null

        // Create 10 turns sequentially
        for (i in 1..10) {
            val turn = chatDao.beginTurn(userId, branch.id, prevTurnId, "User text $i", "[]")
            chatDao.commitTurn(
                userId = userId,
                branchId = branch.id,
                turnId = turn.id,
                assistantText = "Reply $i",
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
            turnsList.add(turn)

            // Calculate if defragmentation should happen for this turn
            val allTurns = chatDao.getTurnsForThread(thread.id)
            // Reconstruct path
            val turnsMap = allTurns.associateBy { it.id }
            val path = mutableListOf<TurnEntity>()
            var currentId: String? = turn.id
            while (currentId != null) {
                val t = turnsMap[currentId] ?: break
                path.add(t)
                currentId = t.parent_turn_id
            }
            val historyTurns = path.reversed().dropLast(1) // exclude current turn for history walk

            val isDefrag = shouldDefragmentSimulated(turn, historyTurns)
            // Verify defrag should only trigger on 10th turn (i = 10)
            if (i == 10) {
                assertTrue("Expected defragmentation on turn $i", isDefrag)
            } else {
                assertFalse("Defragmentation should NOT trigger on turn $i", isDefrag)
            }

            // Save snapshot (turn 1 is full, others are incremental)
            val isFull = (i == 1 || isDefrag)
            val dummySnapshot = DurableMemorySnapshot(
                metadata = SnapshotMetadata(turn.id, "", "", 1),
                spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
                entity_state = emptyList(),
                relational_state = emptyList(),
                narrative_state = NarrativeState("", "", "", emptyList(), emptyList())
            )
            chatDao.upsertWorldSnapshot(turn.id, thread.id, branch.id, prevTurnId, dummySnapshot, 1, isFull)

            prevTurnId = turn.id
        }
    }
}
