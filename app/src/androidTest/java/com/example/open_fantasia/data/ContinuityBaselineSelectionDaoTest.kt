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

/**
 * Which Continuity Snapshot a branch actually gets.
 *
 * `getNearestSnapshot` walks backwards from the head through `parent_turn_id` and takes the shallowest
 * snapshot on that path. Every guarantee about continuity being correct after a Rewind or a branch rests
 * on that walk — not on the checkpoint a Rewind used to create — so it is worth proving rather than
 * reading. The case that matters most: rewinding a long way must not leave the latest snapshot in force.
 *
 * These are DAO tests because the walk is a recursive SQL query.
 */
@RunWith(AndroidJUnit4::class)
class ContinuityBaselineSelectionDaoTest {

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
        db.profileDao().insertProfile(ProfileEntity(userId, "LocalUser", "", ""))
        db.connectionDao().insertConnection(
            ConnectionEntity(
                id = connectionId, user_id = userId, provider = "google", label = "Google API",
                base_url = null, encrypted_api_key = "key", enabled = true,
                default_model_id = "gemini-1.5-flash", model_cache = emptyList(),
                health_status = "healthy", health_message = "", last_checked_at = null,
                last_model_refresh_at = null, last_synced_at = null, created_at = "", updated_at = ""
            )
        )
        db.characterDao().insertCharacter(
            CharacterEntity(
                id = characterId, user_id = userId, name = "Mara Vale", story = "Lore",
                core_persona = "Alchemist", greeting = "Hello", appearance = "Cloaked",
                style_rules = "Scientific", definition = "", negative_guidance = "",
                temperature = 0.9, top_p = 0.9, starters = emptyList(),
                example_conversations = emptyList(), portrait_status = "idle", portrait_path = null,
                portrait_prompt = null, portrait_seed = null, portrait_source_hash = null,
                portrait_last_error = null, portrait_generated_at = null, created_at = "", updated_at = ""
            )
        )
    }

    @After
    fun closeDb() = db.close()

    private fun snapshotAt(turnId: String, version: Int, marker: String) = DurableMemorySnapshot(
        metadata = SnapshotMetadata(turnId, "Day 1", "continuation", version),
        spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
        entity_state = emptyList(),
        relational_state = emptyList(),
        narrative_state = NarrativeState(marker, "Scene", "Beat", emptyList(), emptyList())
    )

    private suspend fun commitExchanges(branchId: String, count: Int, label: String, from: String? = null): List<TurnEntity> {
        val dao = db.chatDao()
        val turns = mutableListOf<TurnEntity>()
        var head = from
        repeat(count) { index ->
            val turn = dao.beginTurn(userId, branchId, head, "$label ${index + 1}", "{}")
            dao.commitTurn(
                userId, branchId, turn.id, "$label reply ${index + 1}", "{}",
                "deepseek", "chat-model", "Chat", "stop", 10, 5, 5, null
            )
            turns += turn
            head = turn.id
        }
        return turns
    }

    @Test
    fun nearestAncestorSnapshotWinsOverAnOlderOne() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Baseline")
        val branch = dao.getActiveBranchForThread(thread.id)!!
        val turns = commitExchanges(branch.id, 6, "Main")

        dao.upsertWorldSnapshot(turns[1].id, thread.id, branch.id, null, snapshotAt(turns[1].id, 1, "OLDER"), 1, true)
        dao.upsertWorldSnapshot(turns[3].id, thread.id, branch.id, turns[1].id, snapshotAt(turns[3].id, 2, "NEARER"), 2, true)

        val chosen = dao.getNearestSnapshot(turns[5].id)
        assertEquals("NEARER", chosen!!.world_state.narrative_state.story_summary)
    }

    // The worry that started this: rewind a long way and the latest snapshot must not survive.
    @Test
    fun rewindingPastASnapshotFallsBackToTheOneStillBehindTheHead() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Rewind")
        val branch = dao.getActiveBranchForThread(thread.id)!!
        val turns = commitExchanges(branch.id, 6, "Main")

        dao.upsertWorldSnapshot(turns[0].id, thread.id, branch.id, null, snapshotAt(turns[0].id, 1, "RETAINED"), 1, true)
        dao.upsertWorldSnapshot(turns[4].id, thread.id, branch.id, turns[0].id, snapshotAt(turns[4].id, 2, "DISCARDED"), 2, true)

        dao.rewindBranchToTurn(userId, branch.id, turns[2].id, turns[5].id)

        val chosen = dao.getNearestSnapshot(turns[2].id)
        assertEquals("RETAINED", chosen!!.world_state.narrative_state.story_summary)
        assertNull("the discarded snapshot must be gone with its exchange", dao.getSnapshot(turns[4].id))
    }

    @Test
    fun aSiblingBranchSnapshotIsNeverSelected() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Siblings")
        val main = dao.getActiveBranchForThread(thread.id)!!
        val mainTurns = commitExchanges(main.id, 3, "Main")
        dao.upsertWorldSnapshot(mainTurns[0].id, thread.id, main.id, null, snapshotAt(mainTurns[0].id, 1, "SHARED"), 1, true)

        val sibling = dao.createBranchFromTurn(userId, main.id, mainTurns[0].id, "Sibling", true)
        val siblingTurns = commitExchanges(sibling.id, 2, "Sibling", sibling.head_turn_id)
        dao.upsertWorldSnapshot(
            siblingTurns[1].id, thread.id, sibling.id, mainTurns[0].id,
            snapshotAt(siblingTurns[1].id, 2, "SIBLING-ONLY"), 2, true
        )

        // Main's head cannot reach the sibling's snapshot: it is not an ancestor.
        val chosenOnMain = dao.getNearestSnapshot(mainTurns[2].id)
        assertEquals("SHARED", chosenOnMain!!.world_state.narrative_state.story_summary)

        // The sibling reaches its own, which is nearer than the shared one.
        val chosenOnSibling = dao.getNearestSnapshot(siblingTurns[1].id)
        assertEquals("SIBLING-ONLY", chosenOnSibling!!.world_state.narrative_state.story_summary)
    }

    @Test
    fun aForkInheritsTheSnapshotFromBeforeItsForkPoint() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Fork")
        val main = dao.getActiveBranchForThread(thread.id)!!
        val mainTurns = commitExchanges(main.id, 4, "Main")
        dao.upsertWorldSnapshot(mainTurns[1].id, thread.id, main.id, null, snapshotAt(mainTurns[1].id, 1, "INHERITED"), 1, true)
        // A snapshot after the fork point must not reach the fork.
        dao.upsertWorldSnapshot(mainTurns[3].id, thread.id, main.id, mainTurns[1].id, snapshotAt(mainTurns[3].id, 2, "AFTER-FORK"), 2, true)

        val fork = dao.createBranchFromTurn(userId, main.id, mainTurns[2].id, "Fork", true)
        val forkTurns = commitExchanges(fork.id, 2, "Fork", fork.head_turn_id)

        val chosen = dao.getNearestSnapshot(forkTurns[1].id)
        assertEquals("INHERITED", chosen!!.world_state.narrative_state.story_summary)
    }

    /**
     * canonical_name_key is derived from canonical_name and backs a unique index, so every write path
     * has to move it. Renaming the Primary Character goes through raw SQL in CharacterDao rather than
     * the Room entity, and that path forgot the key when the column was added.
     */
    @Test
    fun renamingThePrimaryCharacterMovesTheCastSeedComparisonKey() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Rename")
        dao.upsertCastSeed(
            CastSeedEntity(
                cast_id = "primary:${thread.id}", thread_id = thread.id, entity_id = characterId,
                canonical_name = "Mara Vale", canonical_name_key = "mara vale",
                provenance = "primary", created_at = "", updated_at = ""
            )
        )

        val renamed = db.characterDao().getCharacter(characterId)!!.copy(name = "Mara Renamed", updated_at = "later")
        db.characterDao().saveCharacterAndSyncPrimarySeeds(renamed)

        val seed = dao.getCastSeeds(thread.id).single { it.provenance == "primary" }
        assertEquals("Mara Renamed", seed.canonical_name)
        assertEquals("the key must follow the name", "mara renamed", seed.canonical_name_key)
    }

    @Test
    fun aBranchWithNoSnapshotBehindItGetsNone() = runBlocking {
        val dao = db.chatDao()
        val thread = dao.createThreadWithBranch(userId, characterId, connectionId, "chat-model", null, null, null, 2048, "Empty")
        val branch = dao.getActiveBranchForThread(thread.id)!!
        val turns = commitExchanges(branch.id, 2, "Main")
        assertNull(dao.getNearestSnapshot(turns[1].id))
    }
}
