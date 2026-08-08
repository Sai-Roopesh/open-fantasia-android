package com.example.open_fantasia.ui.persona

import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import com.example.open_fantasia.data.local.entity.PersonaEntity
import com.example.open_fantasia.data.local.entity.ProfileEntity
import com.example.open_fantasia.data.local.entity.ThreadEntity
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import kotlinx.coroutines.runBlocking
import java.time.Instant

class PersonaDeletionTest {

    private lateinit var db: OpenFantasiaDatabase
    private val fixedUserId = "00000000-0000-0000-0000-000000000000"

    @Before
    fun createDb() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        db = Room.inMemoryDatabaseBuilder(context, OpenFantasiaDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        runBlocking {
            db.profileDao().insertProfile(ProfileEntity(fixedUserId, "LocalUser", "", ""))
            db.connectionDao().insertConnection(
                ConnectionEntity(
                    id = "conn-1",
                    user_id = fixedUserId,
                    provider = "google",
                    label = "Test",
                    base_url = null,
                    encrypted_api_key = "key",
                    enabled = true,
                    default_model_id = "model-1",
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
                    id = "char-1",
                    user_id = fixedUserId,
                    name = "Test Character",
                    story = "",
                    core_persona = "",
                    greeting = "",
                    appearance = "",
                    style_rules = "",
                    definition = "",
                    negative_guidance = "",
                    temperature = 0.9,
                    top_p = 0.95,
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
    }

    @After
    @Throws(IOException::class)
    fun closeDb() {
        db.close()
    }

    @Test
    fun deletePersona_preservesThreadHistoryWithoutChangingIdentity() = runBlocking {
        // Given: two personas
        val persona1 = createPersona("pers-1", "Persona 1", isDefault = false)
        val persona2 = createPersona("pers-2", "Persona 2", isDefault = true)
        db.personaDao().insertPersona(persona1)
        db.personaDao().insertPersona(persona2)

        // And: a thread linked to persona1
        val thread = createThread("thread-1", personaId = "pers-1")
        db.chatDao().insertThread(thread)

        // When: persona1 is deleted
        db.personaDao().deletePersonaPreservingThreads(persona1)

        // Then: the deleted identity is removed, never replaced by an unrelated Persona.
        val updatedThread = db.chatDao().getThread("thread-1")
        assertNull(updatedThread?.persona_id)
    }

    @Test
    fun deleteDefaultPersona_promotesReplacement() = runBlocking {
        // Given: two personas, persona1 is default
        val persona1 = createPersona("pers-1", "Default Persona", isDefault = true)
        val persona2 = createPersona("pers-2", "Backup Persona", isDefault = false)
        db.personaDao().insertPersona(persona1)
        db.personaDao().insertPersona(persona2)

        // When: default persona1 is deleted
        db.personaDao().deletePersonaPreservingThreads(persona1)

        // Then: persona2 should be promoted to default
        val updatedPersona2 = db.personaDao().getPersona("pers-2")
        assertTrue(updatedPersona2?.is_default == true)
    }

    @Test
    fun deleteLastPersona_setsThreadsToNull() = runBlocking {
        // Given: only one persona
        val persona1 = createPersona("pers-1", "Only Persona", isDefault = true)
        db.personaDao().insertPersona(persona1)

        // And: a thread linked to it
        val thread = createThread("thread-1", personaId = "pers-1")
        db.chatDao().insertThread(thread)

        // When: the only persona is deleted
        db.personaDao().deletePersonaPreservingThreads(persona1)

        // Then: the thread persona reference should be set to null (cascade set null or manual set null)
        val updatedThread = db.chatDao().getThread("thread-1")
        assertNull(updatedThread?.persona_id)
    }

    private fun createPersona(id: String, name: String, isDefault: Boolean): PersonaEntity {
        return PersonaEntity(
            id = id,
            user_id = fixedUserId,
            name = name,
            identity = "Identity",
            backstory = "",
            voice_style = "",
            goals = "",
            boundaries = "",
            private_notes = "",
            is_default = isDefault,
            created_at = Instant.now().toString(),
            updated_at = Instant.now().toString()
        )
    }

    private fun createThread(id: String, personaId: String?): ThreadEntity {
        val now = Instant.now().toString()
        return ThreadEntity(
            id = id,
            user_id = fixedUserId,
            character_id = "char-1",
            connection_id = "conn-1",
            model_id = "model-1",
            persona_id = personaId,
            brain_connection_id = null,
            brain_model_id = null,
            max_output_tokens = 4096,
            title = "Thread Title",
            is_title_autogenerated = true,
            status = "active",
            archived_at = null,
            pinned_at = null,
            created_at = now,
            updated_at = now
        )
    }
}
