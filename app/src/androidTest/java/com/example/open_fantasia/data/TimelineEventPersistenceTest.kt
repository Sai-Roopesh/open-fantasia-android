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
import com.example.open_fantasia.data.local.entity.TimelineEntity
import com.example.open_fantasia.data.continuity.CheckpointTimelineEvent
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class TimelineEventPersistenceTest {

    private lateinit var db: OpenFantasiaDatabase
    private val userId = "user-timeline"
    private val connectionId = "conn-timeline"
    private val characterId = "char-timeline"

    @Before
    fun createDb() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, OpenFantasiaDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        db.profileDao().insertProfile(ProfileEntity(userId, "TimelineTest", "", ""))
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
    fun testTimelineEventPersistence_roundTripsCheckpointEvents() = runBlocking {
        val chatDao = db.chatDao()
        val thread = chatDao.createThreadWithBranch(
            userId, characterId, connectionId, "gemini-1.5-flash", null, null, null, 2048, "Test"
        )
        val branch = chatDao.getActiveBranchForThread(thread.id)!!
        val turn = chatDao.beginTurn(userId, branch.id, null, "Hello", "[]")

        // 1. A Continuity Update returns timeline events already bound to real entity IDs;
        //    the Mac Host protocol rejects unresolved references before they reach the phone.
        val checkpointTimelineEvents = listOf(
            CheckpointTimelineEvent(
                turn_id = turn.id,
                title = "Met Valeria",
                detail = "The protagonist met the alchemist Valeria at her laboratory.",
                importance = 3,
                event_type = "plot",
                affected_entity_ids = listOf("real-uuid-valeria-1234"),
                affected_relationship_ids = emptyList()
            )
        )

        // 2. Persist them against the branch they were checkpointed on.
        val nowStr = Instant.now().toString()
        checkpointTimelineEvents.forEach { event ->
            chatDao.insertTimelineEvent(
                TimelineEntity(
                    id = UUID.randomUUID().toString(),
                    thread_id = thread.id,
                    branch_id = branch.id,
                    turn_id = event.turn_id,
                    title = event.title,
                    detail = event.detail,
                    importance = event.importance,
                    event_type = event.event_type,
                    affected_entity_ids = event.affected_entity_ids,
                    affected_relationship_ids = event.affected_relationship_ids,
                    created_at = nowStr
                )
            )
        }

        // 4. Retrieve and verify from db
        val dbEvents = chatDao.getTimelineEvents(thread.id, branch.id)
        assertEquals(1, dbEvents.size)
        val savedEvent = dbEvents[0]
        assertEquals("Met Valeria", savedEvent.title)
        assertEquals("plot", savedEvent.event_type)
        assertEquals(3, savedEvent.importance)
        assertEquals(listOf("real-uuid-valeria-1234"), savedEvent.affected_entity_ids)
        assertEquals(turn.id, savedEvent.turn_id)
    }
}
