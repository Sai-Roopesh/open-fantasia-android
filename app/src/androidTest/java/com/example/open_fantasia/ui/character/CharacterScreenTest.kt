package com.example.open_fantasia.ui.character

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.ProfileEntity
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.io.IOException
import kotlinx.coroutines.runBlocking

class CharacterScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var db: OpenFantasiaDatabase
    private lateinit var viewModel: CharacterViewModel

    @Before
    fun createDb() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        db = Room.inMemoryDatabaseBuilder(context, OpenFantasiaDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        viewModel = CharacterViewModel(db.characterDao())
    }

    @After
    @Throws(IOException::class)
    fun closeDb() {
        db.close()
    }

    @Test
    fun characterScreen_showsEmptyState_whenNoCharacters() {
        composeTestRule.setContent {
            CharacterScreen(viewModel = viewModel)
        }
        composeTestRule.onNodeWithText("No characters created yet.").assertExists()
    }

    @Test
    fun characterScreen_showsList_andCanDelete() {
        val char = CharacterEntity(
            id = "char-1",
            user_id = "00000000-0000-0000-0000-000000000000",
            name = "Alys the Weaver",
            story = "Story text description",
            core_persona = "Wisdom",
            greeting = "Welcome",
            appearance = "Robe",
            style_rules = "Formal",
            definition = "",
            negative_guidance = "",
            temperature = 0.8,
            top_p = 0.9,
            starters = emptyList(),
            example_conversations = emptyList(),
            portrait_status = "ready",
            portrait_path = null,
            portrait_prompt = null,
            portrait_seed = null,
            portrait_source_hash = null,
            portrait_last_error = null,
            portrait_generated_at = null,
            created_at = "2026-06-07T12:00:00Z",
            updated_at = "2026-06-07T12:00:00Z"
        )
        runBlocking {
            db.profileDao().insertProfile(ProfileEntity("00000000-0000-0000-0000-000000000000", "LocalUser", "2026-06-07T12:00:00Z", "2026-06-07T12:00:00Z"))
            db.characterDao().insertCharacter(char)
        }

        composeTestRule.setContent {
            CharacterScreen(viewModel = viewModel)
        }

        // Check character name displays
        composeTestRule.onNodeWithText("Alys the Weaver").assertExists()
        // Check story summary displays
        composeTestRule.onNodeWithText("Story text description").assertExists()

        // Delete character
        composeTestRule.onNodeWithContentDescription("Delete Character").performClick()
        composeTestRule.onNodeWithText("Delete character?").assertExists()
        composeTestRule.onNodeWithText("Delete").performClick()
        
        // Wait and check empty state
        composeTestRule.onNodeWithText("No characters created yet.").assertExists()
    }
}
