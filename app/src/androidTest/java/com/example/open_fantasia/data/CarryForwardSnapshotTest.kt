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
class CarryForwardSnapshotTest {

    private lateinit var db: OpenFantasiaDatabase
    private val userId = "user-1"
    private val connectionId = "conn-1"
    private val characterId = "char-1"

    @Before
    fun createDb() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, OpenFantasiaDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        db.profileDao().insertProfile(ProfileEntity(userId, "Test", "", ""))
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
    fun onExtractionFailure_clonesAncestorSnapshot() = runBlocking {
        val chatDao = db.chatDao()
        val thread = chatDao.createThreadWithBranch(
            userId, characterId, connectionId, "gemini-1.5-flash", null, null, null, 2048, "Test"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!

        // 1. Commit Turn 1
        val turn1 = chatDao.beginTurn(userId, branch.id, null, "Turn 1 Input", "[]")
        chatDao.commitTurn(userId, branch.id, turn1.id, "Turn 1 Output", "[]", "google", "gemini-1.5-flash", "Google", "stop", 10, 5, 5, null)

        // Upsert dummy snapshot for Turn 1 (acting as ancestor snapshot)
        val snapshot1 = DurableMemorySnapshot(
            metadata = SnapshotMetadata(turn1.id, "10:00", "continuation", 1),
            spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
            entity_state = emptyList(),
            relational_state = emptyList(),
            narrative_state = NarrativeState("story", "scene", "beat", emptyList(), emptyList())
        )
        chatDao.upsertWorldSnapshot(turn1.id, thread.id, branch.id, null, snapshot1, 1, false)

        // 2. Commit Turn 2
        val turn2 = chatDao.beginTurn(userId, branch.id, turn1.id, "Turn 2 Input", "[]")
        chatDao.commitTurn(userId, branch.id, turn2.id, "Turn 2 Output", "[]", "google", "gemini-1.5-flash", "Google", "stop", 10, 5, 5, null)

        // Simulate failure by carrying forward previous snapshot1
        // We simulate what the catch block in ChatViewModel does:
        val baseSnapshot = chatDao.getSnapshot(turn2.parent_turn_id!!)?.world_state
        assertNotNull(baseSnapshot)
        assertEquals(turn1.id, baseSnapshot!!.metadata.current_turn_id)

        // Clone and upsert for Turn 2
        val clonedSnapshot = baseSnapshot.copy(
            metadata = baseSnapshot.metadata.copy(
                current_turn_id = turn2.id,
                version = baseSnapshot.metadata.version + 1,
                transition_type = "continuation"
            )
        )
        chatDao.upsertWorldSnapshot(
            turnId = turn2.id,
            threadId = thread.id,
            branchId = turn2.branch_origin_id,
            basedOnTurnId = turn2.parent_turn_id,
            worldState = clonedSnapshot,
            version = clonedSnapshot.metadata.version,
            isFullMaterialization = false
        )

        // Verify snapshot for Turn 2 exists and matches cloned content
        val snapshot2 = chatDao.getSnapshot(turn2.id)
        assertNotNull(snapshot2)
        assertEquals(turn2.id, snapshot2!!.turn_id)
        assertEquals(turn1.id, snapshot2.based_on_turn_id)
        assertEquals(2, snapshot2.version)
        assertEquals("beat", snapshot2.world_state.narrative_state.last_turn_beat)
    }
}
