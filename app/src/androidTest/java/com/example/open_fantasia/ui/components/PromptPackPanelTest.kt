package com.example.open_fantasia.ui.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.example.open_fantasia.domain.model.CharacterDocumentData
import com.example.open_fantasia.domain.model.PersonaDocumentData
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class PromptPackPanelTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun panel_isCollapsedByDefault() {
        composeTestRule.setContent {
            PromptPackPanel(
                kind = PortableKind.CHARACTER,
                accentColor = Color.Cyan,
                currentJson = { "{}" }
            )
        }

        // Toggle header is visible
        composeTestRule.onNodeWithText("Prompt Packs").assertExists()
        // Content inside expanded panel should not be visible/present
        composeTestRule.onNodeWithText("EXPORT").assertDoesNotExist()
        composeTestRule.onNodeWithText("IMPORT").assertDoesNotExist()
    }

    @Test
    fun panel_expandsOnToggleClick() {
        composeTestRule.setContent {
            PromptPackPanel(
                kind = PortableKind.CHARACTER,
                accentColor = Color.Cyan,
                currentJson = { "{}" }
            )
        }

        // Click on the toggle header card
        composeTestRule.onNodeWithText("Prompt Packs").performClick()

        // Content should now be visible
        composeTestRule.onNodeWithText("EXPORT").assertExists()
        composeTestRule.onNodeWithText("IMPORT").assertExists()
    }

    @Test
    fun panel_showsExportButtons() {
        composeTestRule.setContent {
            PromptPackPanel(
                kind = PortableKind.CHARACTER,
                accentColor = Color.Cyan,
                currentJson = { "{}" }
            )
        }

        composeTestRule.onNodeWithText("Prompt Packs").performClick()

        // Export section buttons should be visible
        composeTestRule.onNodeWithText("Copy JSON").assertExists()
        composeTestRule.onNodeWithText("Share").assertExists()
        composeTestRule.onNodeWithText("Share Blank Template").assertExists()
    }

    @Test
    fun panel_showsPromptPackVariants() {
        composeTestRule.setContent {
            PromptPackPanel(
                kind = PortableKind.CHARACTER,
                accentColor = Color.Cyan,
                currentJson = { "{}" }
            )
        }

        composeTestRule.onNodeWithText("Prompt Packs").performClick()

        // Prompt pack variant chips should be visible
        composeTestRule.onNodeWithText("Generic").assertExists()
        composeTestRule.onNodeWithText("Claude").assertExists()
        composeTestRule.onNodeWithText("Gemini").assertExists()
    }

    @Test
    fun panel_showsImportButtons() {
        composeTestRule.setContent {
            PromptPackPanel(
                kind = PortableKind.CHARACTER,
                accentColor = Color.Cyan,
                currentJson = { "{}" }
            )
        }

        composeTestRule.onNodeWithText("Prompt Packs").performClick()

        // Import section buttons should be visible
        composeTestRule.onNodeWithText("Paste").assertExists()
        composeTestRule.onNodeWithText("From File").assertExists()
    }

    @Test
    fun panel_showsValidPreviewOnValidImport() {
        // Set up clipboard with valid Character document JSON
        val validJson = """
        {
            "format": "openfantasia.character",
            "version": 4,
            "data": {
                "name": "Mara Vale",
                "story": "Setting description",
                "core_persona": "Persona details",
                "greeting": "Hello",
                "appearance": "Appearance details",
                "style_rules": "Writing rules",
                "definition": "More lore",
                "negative_guidance": "Forbidden",
                "suggested_starters": ["Hi", "What's up"],
                "example_conversations": []
            }
        }
        """.trimIndent()

        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val clip = ClipData.newPlainText("valid_json", validJson)
            clipboard.setPrimaryClip(clip)
        }

        var importedData: CharacterDocumentData? = null

        composeTestRule.setContent {
            PromptPackPanel(
                kind = PortableKind.CHARACTER,
                accentColor = Color.Cyan,
                currentJson = { "{}" },
                onImportCharacter = { data -> importedData = data }
            )
        }

        // Expand panel
        composeTestRule.onNodeWithText("Prompt Packs").performClick()

        // Paste JSON
        composeTestRule.onNodeWithText("Paste").performClick()

        // Verify that the preview card is shown with correct title/details
        composeTestRule.onNodeWithText("Mara Vale").assertExists()
        composeTestRule.onNodeWithText("2 starters · 0 examples").assertExists()

        // Click on Load into Editor
        composeTestRule.onNodeWithText("Load into Editor").performClick()

        // Verify that the data is loaded/callback called
        assertNotNull(importedData)
        assertEquals("Mara Vale", importedData?.name)
    }

    @Test
    fun panel_showsErrorOnInvalidImport() {
        // Set up clipboard with invalid format document JSON
        val invalidJson = """
        {
            "format": "invalid.format",
            "version": 4,
            "data": {
                "name": "Mara Vale"
            }
        }
        """.trimIndent()

        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val clip = ClipData.newPlainText("invalid_json", invalidJson)
            clipboard.setPrimaryClip(clip)
        }

        composeTestRule.setContent {
            PromptPackPanel(
                kind = PortableKind.CHARACTER,
                accentColor = Color.Cyan,
                currentJson = { "{}" }
            )
        }

        // Expand panel
        composeTestRule.onNodeWithText("Prompt Packs").performClick()

        // Paste JSON
        composeTestRule.onNodeWithText("Paste").performClick()

        // Verify that the validation failed card is shown
        composeTestRule.onNodeWithText("Validation Failed").assertExists()
    }
}
