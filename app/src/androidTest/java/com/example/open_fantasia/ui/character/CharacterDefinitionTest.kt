package com.example.open_fantasia.ui.character

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.local.entity.ProfileEntity
import com.example.open_fantasia.domain.model.ExampleConversation
import com.example.open_fantasia.domain.portability.PortableJsonCodec
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CharacterDefinitionTest {

    private lateinit var db: OpenFantasiaDatabase
    private lateinit var viewModel: CharacterViewModel

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        db = Room.inMemoryDatabaseBuilder(context, OpenFantasiaDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        viewModel = CharacterViewModel(db.characterDao(), db.portraitTaskDao(), context)
        
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
    fun saveCharacter_preservesDefinition() = runBlocking {
        viewModel.saveCharacter(
            id = "test-char",
            name = "Test Character",
            story = "Story setting",
            corePersona = "Core persona",
            greeting = "Greeting",
            appearance = "Appearance",
            styleRules = "Style rules",
            definition = "This is a custom definition of the character core identity.",
            negativeGuidance = "Negative guidance",
            temperature = 0.92,
            topP = 0.94,
            starters = emptyList(),
            exampleConversations = emptyList(),
            triggerPortraitGen = false
        )

        var char = db.characterDao().getCharacter("test-char")
        val start = System.currentTimeMillis()
        while (char == null && System.currentTimeMillis() - start < 3000) {
            kotlinx.coroutines.delay(100)
            char = db.characterDao().getCharacter("test-char")
        }

        assertNotNull(char)
        assertEquals("This is a custom definition of the character core identity.", char?.definition)
    }

    @Test
    fun saveCharacter_doesNotOverwriteDefinitionWithEmpty() = runBlocking {
        viewModel.saveCharacter(
            id = "test-char-2",
            name = "Test Character 2",
            story = "Story setting",
            corePersona = "Core persona",
            greeting = "Greeting",
            appearance = "Appearance",
            styleRules = "Style rules",
            definition = "Definition 2",
            negativeGuidance = "Negative guidance",
            temperature = 0.92,
            topP = 0.94,
            starters = emptyList(),
            exampleConversations = emptyList(),
            triggerPortraitGen = false
        )

        var char = db.characterDao().getCharacter("test-char-2")
        val start = System.currentTimeMillis()
        while (char == null && System.currentTimeMillis() - start < 3000) {
            kotlinx.coroutines.delay(100)
            char = db.characterDao().getCharacter("test-char-2")
        }
        assertNotNull(char)

        viewModel.saveCharacter(
            id = "test-char-2",
            name = "Test Character 2 Updated",
            story = "Story setting",
            corePersona = "Core persona",
            greeting = "Greeting",
            appearance = "Appearance",
            styleRules = "Style rules",
            definition = "",
            negativeGuidance = "Negative guidance",
            temperature = 0.92,
            topP = 0.94,
            starters = emptyList(),
            exampleConversations = emptyList(),
            triggerPortraitGen = false
        )

        var updatedChar = db.characterDao().getCharacter("test-char-2")
        val start2 = System.currentTimeMillis()
        while (updatedChar?.name != "Test Character 2 Updated" && System.currentTimeMillis() - start2 < 3000) {
            kotlinx.coroutines.delay(100)
            updatedChar = db.characterDao().getCharacter("test-char-2")
        }

        assertNotNull(updatedChar)
        assertEquals("", updatedChar?.definition)
    }

    @Test
    fun importedCharacter_retainsDefinitionAfterEdit() = runBlocking {
        val json = """
            {
              "format": "openfantasia.character",
              "version": 4,
              "data": {
                "name": "Imported Character",
                "story": "Imported Story",
                "core_persona": "Imported Persona",
                "greeting": "Imported Greeting",
                "appearance": "Imported Appearance",
                "style_rules": "Imported Style",
                "definition": "Imported Definition",
                "negative_guidance": "Imported Negatives",
                "suggested_starters": [],
                "example_conversations": []
              }
            }
        """.trimIndent()

        val parseResult = PortableJsonCodec.parseCharacterDocument(json)
        assertTrue(parseResult.isSuccess)
        val doc = parseResult.getOrThrow()
        
        val entity = PortableJsonCodec.characterDocumentToEntity(doc, "00000000-0000-0000-0000-000000000000", "test-imported")
        assertEquals("Imported Definition", entity.definition)

        db.characterDao().insertCharacter(entity)

        viewModel.saveCharacter(
            id = "test-imported",
            name = "Imported Character Edited",
            story = "Imported Story",
            corePersona = "Imported Persona",
            greeting = "Imported Greeting",
            appearance = "Imported Appearance",
            styleRules = "Imported Style",
            definition = entity.definition,
            negativeGuidance = "Imported Negatives",
            temperature = 0.92,
            topP = 0.94,
            starters = emptyList(),
            exampleConversations = emptyList(),
            triggerPortraitGen = false
        )

        var editedChar = db.characterDao().getCharacter("test-imported")
        val start = System.currentTimeMillis()
        while (editedChar?.name != "Imported Character Edited" && System.currentTimeMillis() - start < 3000) {
            kotlinx.coroutines.delay(100)
            editedChar = db.characterDao().getCharacter("test-imported")
        }

        assertNotNull(editedChar)
        assertEquals("Imported Definition", editedChar?.definition)
    }
}
