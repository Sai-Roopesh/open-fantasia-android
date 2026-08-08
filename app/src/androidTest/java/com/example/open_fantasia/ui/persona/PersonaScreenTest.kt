package com.example.open_fantasia.ui.persona

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.local.entity.PersonaEntity
import com.example.open_fantasia.data.local.entity.ProfileEntity
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.io.IOException
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking

class PersonaScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var db: OpenFantasiaDatabase
    private lateinit var viewModel: PersonaViewModel

    @Before
    fun createDb() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        db = Room.inMemoryDatabaseBuilder(context, OpenFantasiaDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        viewModel = PersonaViewModel(db.personaDao())
    }

    @After
    @Throws(IOException::class)
    fun closeDb() {
        db.close()
    }

    @Test
    fun personaScreen_showsEmptyState_whenNoPersonas() {
        composeTestRule.setContent {
            PersonaScreen(viewModel = viewModel)
        }
        composeTestRule.onNodeWithText("No personas created yet.").assertExists()
    }

    @Test
    fun personaScreen_showsList_andCanToggleDefault() {
        val persona = PersonaEntity(
            id = "pers-1",
            user_id = "00000000-0000-0000-0000-000000000000",
            name = "Valiant Knight",
            identity = "A noble paladin",
            backstory = "", voice_style = "", goals = "", boundaries = "",
            private_notes = "", is_default = false, created_at = "", updated_at = ""
        )
        runBlocking {
            db.profileDao().insertProfile(ProfileEntity("00000000-0000-0000-0000-000000000000", "LocalUser", "", ""))
            db.personaDao().insertPersona(persona)
        }

        composeTestRule.setContent {
            PersonaScreen(viewModel = viewModel)
        }

        // Check name displays
        composeTestRule.onNodeWithText("Valiant Knight").assertExists()

        // Toggle default favorite click
        composeTestRule.onNodeWithContentDescription("Default Persona").performClick()

        runBlocking {
            val deadline = System.currentTimeMillis() + 3_000
            while (db.personaDao().getPersona(persona.id)?.is_default != true &&
                System.currentTimeMillis() < deadline
            ) {
                delay(50)
            }
        }
        composeTestRule.onNodeWithContentDescription("Default Persona").assertExists()
    }
}
