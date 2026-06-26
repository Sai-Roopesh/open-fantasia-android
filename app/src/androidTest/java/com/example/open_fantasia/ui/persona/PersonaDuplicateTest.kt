package com.example.open_fantasia.ui.persona

import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.local.entity.PersonaEntity
import com.example.open_fantasia.data.local.entity.ProfileEntity
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import java.io.IOException
import kotlinx.coroutines.runBlocking
import java.time.Instant

class PersonaDuplicateTest {

    private lateinit var db: OpenFantasiaDatabase
    private lateinit var viewModel: PersonaViewModel
    private val fixedUserId = "00000000-0000-0000-0000-000000000000"

    @Before
    fun createDb() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        db = Room.inMemoryDatabaseBuilder(context, OpenFantasiaDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        viewModel = PersonaViewModel(db.personaDao(), db.chatDao())

        runBlocking {
            db.profileDao().insertProfile(ProfileEntity(fixedUserId, "LocalUser", "", ""))
        }
    }

    @After
    @Throws(IOException::class)
    fun closeDb() {
        db.close()
    }

    @Test
    fun duplicatePersona_createsNewWithCopySuffix() = runBlocking {
        // Given: a persona
        val original = PersonaEntity(
            id = "pers-1",
            user_id = fixedUserId,
            name = "Wizard",
            identity = "Spellcaster",
            backstory = "Studied at the academy",
            voice_style = "Monotone",
            goals = "Find magic items",
            boundaries = "No dark magic",
            private_notes = "Secret notes",
            is_default = true,
            created_at = Instant.now().toString(),
            updated_at = Instant.now().toString()
        )
        db.personaDao().insertPersona(original)

        // When: duplicated
        viewModel.duplicatePersona(original)

        // Then: a copy should exist in the database with the name "Wizard Copy"
        val all = db.personaDao().getAllPersonas()
        assertEquals(2, all.size)

        val copy = all.find { it.id != "pers-1" }
        assertNotNull(copy)
        assertEquals("Wizard Copy", copy?.name)
        assertEquals("Spellcaster", copy?.identity)
        assertEquals("Studied at the academy", copy?.backstory)
        assertEquals("Monotone", copy?.voice_style)
        assertEquals("Find magic items", copy?.goals)
        assertEquals("No dark magic", copy?.boundaries)
        assertEquals("Secret notes", copy?.private_notes)
    }

    @Test
    fun duplicatePersona_isNotDefault() = runBlocking {
        // Given: a default persona
        val original = PersonaEntity(
            id = "pers-1",
            user_id = fixedUserId,
            name = "Wizard",
            identity = "Spellcaster",
            backstory = "", voice_style = "", goals = "", boundaries = "", private_notes = "",
            is_default = true,
            created_at = Instant.now().toString(),
            updated_at = Instant.now().toString()
        )
        db.personaDao().insertPersona(original)

        // When: duplicated
        viewModel.duplicatePersona(original)

        // Then: the duplicated persona is not a default persona
        val all = db.personaDao().getAllPersonas()
        val copy = all.find { it.id != "pers-1" }
        assertNotNull(copy)
        assertFalse(copy!!.is_default)
    }
}
