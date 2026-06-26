package com.example.open_fantasia.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.local.entity.*
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.IOException

@RunWith(AndroidJUnit4::class)
class RewindBranchDaoTest {

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
                default_model_id = "gemini",
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
    fun testRewindBranchDeletesOrphanedTurnsAndSiblingBranches() = runBlocking {
        val chatDao = db.chatDao()

        // 1. Create Thread and Branch
        val thread = chatDao.createThreadWithBranch(
            userId = userId,
            characterId = characterId,
            connectionId = connectionId,
            modelId = "gemini",
            personaId = null,
            brainConnectionId = null,
            brainModelId = null,
            maxOutputTokens = 2048,
            title = "Rewind Test"
        )
        val mainBranch = chatDao.getActiveBranchForThread(thread.id)!!

        // Seed Turn 1
        val turn1 = chatDao.beginTurn(userId, mainBranch.id, null, "Turn 1", "[]")
        val committed1 = chatDao.commitTurn(userId, mainBranch.id, turn1.id, "Hi 1", "[]", "g", "m", "l", "stop", 10, 5, 5, null)

        // Seed Turn 2
        val turn2 = chatDao.beginTurn(userId, mainBranch.id, committed1.id, "Turn 2", "[]")
        val committed2 = chatDao.commitTurn(userId, mainBranch.id, turn2.id, "Hi 2", "[]", "g", "m", "l", "stop", 10, 5, 5, null)

        // Seed Turn 3
        val turn3 = chatDao.beginTurn(userId, mainBranch.id, committed2.id, "Turn 3", "[]")
        val committed3 = chatDao.commitTurn(userId, mainBranch.id, turn3.id, "Hi 3", "[]", "g", "m", "l", "stop", 10, 5, 5, null)

        // Verify path of main branch: turn1 -> turn2 -> turn3 (head = turn3)
        val pathBefore = chatDao.getAncestorTurns(committed3.id)
        assertEquals(3, pathBefore.size)

        // 2. Create Sibling Branch from Turn 2
        val siblingBranch = chatDao.createBranchFromTurn(
            userId = userId,
            sourceBranchId = mainBranch.id,
            sourceTurnId = committed2.id,
            name = "Branch B",
            makeActive = false
        )

        // Seed Turn 4 on Sibling Branch B (parent_turn_id is Turn 2)
        val turn4 = chatDao.beginTurn(userId, siblingBranch.id, committed2.id, "Turn 4", "[]")
        val committed4 = chatDao.commitTurn(userId, siblingBranch.id, turn4.id, "Hi 4", "[]", "g", "m", "l", "stop", 10, 5, 5, null)

        // Verify Branch B exists and head is committed4.id
        val fetchedSiblingBefore = chatDao.getBranch(siblingBranch.id)
        assertNotNull(fetchedSiblingBefore)
        assertEquals(committed4.id, fetchedSiblingBefore!!.head_turn_id)

        // 3. Rewind Main Branch back to Turn 1 (prunes turn2 and turn3, which should also orphan Branch B)
        val rewound = chatDao.rewindBranchToTurn(
            userId = userId,
            branchId = mainBranch.id,
            targetTurnId = committed1.id,
            expectedHeadTurnId = committed3.id
        )

        assertEquals(committed1.id, rewound.head_turn_id)

        // Verify Turn 2 and Turn 3 are deleted from the database
        assertNull(chatDao.getTurn(committed2.id))
        assertNull(chatDao.getTurn(committed3.id))

        // Verify Turn 4 is deleted as its parent (Turn 2) was cascade deleted
        assertNull(chatDao.getTurn(committed4.id))

        // Verify Sibling Branch B is deleted because it was based on a pruned turn (Turn 2)
        assertNull(chatDao.getBranch(siblingBranch.id))

        // Verify path of main branch after rewind is just turn1
        val pathAfter = chatDao.getAncestorTurns(committed1.id)
        assertEquals(1, pathAfter.size)
        assertEquals(committed1.id, pathAfter[0].id)
    }
}
