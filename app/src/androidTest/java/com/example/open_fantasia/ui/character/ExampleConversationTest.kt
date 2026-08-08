package com.example.open_fantasia.ui.character

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.local.entity.ProfileEntity
import com.example.open_fantasia.domain.model.ExampleConversation
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ExampleConversationTest {

    private lateinit var db: OpenFantasiaDatabase
    private lateinit var viewModel: CharacterViewModel

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        db = Room.inMemoryDatabaseBuilder(context, OpenFantasiaDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        viewModel = CharacterViewModel(db.characterDao())
        
        runBlocking {
            db.profileDao().insertProfile(
                ProfileEntity("00000000-0000-0000-0000-000000000000", "LocalUser", "", "")
            )
        }
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun trimsWhitespace_onSave() = runBlocking {
        viewModel.saveCharacter(
            id = "test-trim",
            name = "Test Trim",
            story = "Story setting",
            corePersona = "Core persona",
            greeting = "Greeting",
            appearance = "Appearance",
            styleRules = "Style rules",
            definition = "Definition",
            negativeGuidance = "Negative guidance",
            temperature = 0.92,
            topP = 0.94,
            starters = emptyList(),
            exampleConversations = listOf(
                ExampleConversation("  User Line  ", "  Char Line  ")
            ),
            triggerPortraitGen = false
        )

        var char = db.characterDao().getCharacter("test-trim")
        val start = System.currentTimeMillis()
        while (char == null && System.currentTimeMillis() - start < 3000) {
            kotlinx.coroutines.delay(100)
            char = db.characterDao().getCharacter("test-trim")
        }

        assertNotNull(char)
        assertEquals(1, char?.example_conversations?.size)
        assertEquals("User Line", char?.example_conversations?.first()?.user_line)
        assertEquals("Char Line", char?.example_conversations?.first()?.character_line)
    }

    @Test
    fun filtersFullyEmptyPairs() = runBlocking {
        viewModel.saveCharacter(
            id = "test-empty",
            name = "Test Empty",
            story = "Story setting",
            corePersona = "Core persona",
            greeting = "Greeting",
            appearance = "Appearance",
            styleRules = "Style rules",
            definition = "Definition",
            negativeGuidance = "Negative guidance",
            temperature = 0.92,
            topP = 0.94,
            starters = emptyList(),
            exampleConversations = listOf(
                ExampleConversation("   ", "   "),
                ExampleConversation("Valid User", "Valid Char")
            ),
            triggerPortraitGen = false
        )

        var char = db.characterDao().getCharacter("test-empty")
        val start = System.currentTimeMillis()
        while (char == null && System.currentTimeMillis() - start < 3000) {
            kotlinx.coroutines.delay(100)
            char = db.characterDao().getCharacter("test-empty")
        }

        assertNotNull(char)
        assertEquals(1, char?.example_conversations?.size)
        assertEquals("Valid User", char?.example_conversations?.first()?.user_line)
    }

    @Test
    fun allowsPartialPairs() = runBlocking {
        viewModel.saveCharacter(
            id = "test-partial",
            name = "Test Partial",
            story = "Story setting",
            corePersona = "Core persona",
            greeting = "Greeting",
            appearance = "Appearance",
            styleRules = "Style rules",
            definition = "Definition",
            negativeGuidance = "Negative guidance",
            temperature = 0.92,
            topP = 0.94,
            starters = emptyList(),
            exampleConversations = listOf(
                ExampleConversation("Only User", ""),
                ExampleConversation("", "Only Char")
            ),
            triggerPortraitGen = false
        )

        var char = db.characterDao().getCharacter("test-partial")
        val start = System.currentTimeMillis()
        while (char == null && System.currentTimeMillis() - start < 3000) {
            kotlinx.coroutines.delay(100)
            char = db.characterDao().getCharacter("test-partial")
        }

        assertNotNull(char)
        assertEquals(2, char?.example_conversations?.size)
        assertEquals("Only User", char?.example_conversations?.get(0)?.user_line)
        assertEquals("", char?.example_conversations?.get(0)?.character_line)
        assertEquals("", char?.example_conversations?.get(1)?.user_line)
        assertEquals("Only Char", char?.example_conversations?.get(1)?.character_line)
    }

    @Test
    fun savingWithoutPortraitGenerationDoesNotClaimASourceHash() = runBlocking {
        viewModel.saveCharacter(
            id = "test-hash",
            name = "Hash Name",
            story = "Story setting",
            corePersona = "Core persona info",
            greeting = "Greeting",
            appearance = "Red Hair",
            styleRules = "Formal",
            definition = "Definition",
            negativeGuidance = "Negative guidance",
            temperature = 0.92,
            topP = 0.94,
            starters = emptyList(),
            exampleConversations = emptyList(),
            triggerPortraitGen = false
        )

        var char = db.characterDao().getCharacter("test-hash")
        val start = System.currentTimeMillis()
        while (char == null && System.currentTimeMillis() - start < 3000) {
            kotlinx.coroutines.delay(100)
            char = db.characterDao().getCharacter("test-hash")
        }

        assertNotNull(char)
        assertNull(char?.portrait_source_hash)
    }

    @Test
    fun sourceHash_excludesStyleRules() = runBlocking {
        // Save character 1
        viewModel.saveCharacter(
            id = "char-a",
            name = "Char",
            story = "Story",
            corePersona = "Persona",
            greeting = "Greeting",
            appearance = "Appearance",
            styleRules = "Style A",
            definition = "Definition",
            negativeGuidance = "Negatives",
            temperature = 0.92,
            topP = 0.94,
            starters = emptyList(),
            exampleConversations = emptyList(),
            triggerPortraitGen = false
        )

        // Save character 2 with different style rules, but same name, appearance, corePersona
        viewModel.saveCharacter(
            id = "char-b",
            name = "Char",
            story = "Story",
            corePersona = "Persona",
            greeting = "Greeting",
            appearance = "Appearance",
            styleRules = "Style B",
            definition = "Definition",
            negativeGuidance = "Negatives",
            temperature = 0.92,
            topP = 0.94,
            starters = emptyList(),
            exampleConversations = emptyList(),
            triggerPortraitGen = false
        )

        var charA = db.characterDao().getCharacter("char-a")
        var charB = db.characterDao().getCharacter("char-b")
        val start = System.currentTimeMillis()
        while ((charA == null || charB == null) && System.currentTimeMillis() - start < 3000) {
            kotlinx.coroutines.delay(100)
            charA = db.characterDao().getCharacter("char-a")
            charB = db.characterDao().getCharacter("char-b")
        }

        assertNotNull(charA)
        assertNotNull(charB)
        assertEquals(charA?.portrait_source_hash, charB?.portrait_source_hash)
    }
}
