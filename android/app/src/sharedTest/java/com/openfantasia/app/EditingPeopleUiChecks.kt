package com.openfantasia.app

import androidx.compose.ui.test.*
import com.openfantasia.protocol.*
import org.junit.Assert.*

/** Editing people on the phone: Everyone in the Story, the person page's Edit, Lead and Group, and Portraits. */
open class EditingPeopleUiChecks : WorldUiChecks() {
    private fun openWorld() {
        openScene(portraitPicker = { PickedImage(PNG, "image/png") })
        compose.onNodeWithText("World").performClick()
        compose.onNodeWithText("The World").assertIsDisplayed()
    }

    // GIVEN a person who first appeared in Scene 30
    // WHEN the player toggles them to Lead
    // THEN the Story treats them as a Lead from then on
    fun aNewcomerBecomesALead() {
        openWorld()
        compose.onNodeWithTag("world-people").performScrollToNode(hasText("Minerva McGonagall"))
        compose.onNodeWithText("Minerva McGonagall").performClick()
        compose.onNodeWithTag("lead-switch").assertIsOff().performClick()
        compose.runOnIdle { assertEquals(listOf("Minerva McGonagall" to LeadRequest(after = "reply", lead = true)), link.leadSets) }
        compose.onNodeWithTag("lead-switch").assertIsOn()
    }

    // GIVEN Goyle is in the "Crabbe and Goyle" Group
    // WHEN Goyle saves the Player Character's life in a Scene
    // THEN Goyle is still in the Group until the player takes him out
    fun goyleStartsToMatter() {
        openWorld()
        compose.onNodeWithText("Edit").performClick()
        compose.onNodeWithText("Everyone in the Story").assertIsDisplayed()
        compose.onNodeWithTag("everyone").performScrollToNode(hasText("Gregory Goyle"))
        compose.onNodeWithText("Gregory Goyle").performClick()
        compose.onNodeWithText("Crabbe and Goyle").assertIsDisplayed().performClick()
        compose.onNodeWithText("New Group…").assertIsDisplayed()
        compose.onNodeWithText("None").performClick()
        compose.runOnIdle {
            val edit = link.personEdits.single()
            assertEquals("Gregory Goyle", edit.first)
            assertNull(edit.second.group)
            assertFalse(edit.second.create)
            assertEquals("Draconia's other bodyguard, larger and slower.", edit.second.whoTheyAre)
        }
    }

    // WHEN the player creates Theodore Nott in the app, with a description and an uploaded Portrait
    // THEN he is in the Story's people from that moment on the current Path, and can appear in Scenes
    fun aNewPersonIsCreated() {
        openWorld()
        compose.onNodeWithContentDescription("Add a person").performClick()
        compose.onNodeWithText("A new person").assertIsDisplayed()
        compose.onNodeWithTag("person-name").performTextInput("Theodore Nott")
        compose.onNodeWithTag("person-who").performTextInput("A quiet Slytherin who reads in the library.")
        compose.onNodeWithTag("person-known").performTextInput("A Slytherin who is always reading.")
        compose.onNodeWithText("Choose a Portrait").performClick()
        compose.onNodeWithText("Portrait chosen").assertIsDisplayed()
        compose.preview("PersonEditor")
        compose.onNodeWithText("Add to the Story").performClick()
        compose.waitUntil(3000) { link.portraitUploads.isNotEmpty() }
        compose.runOnIdle {
            val (name, edit) = link.personEdits.single()
            assertEquals("Theodore Nott", name)
            assertTrue(edit.create)
            assertEquals("A quiet Slytherin who reads in the library.", edit.whoTheyAre)
            assertEquals("A Slytherin who is always reading.", edit.known)
            assertEquals(Triple("Theodore Nott", "image/png", PNG.toList()), link.portraitUploads.single().let { Triple(it.first, it.second, it.third.toList()) })
        }
        compose.onNodeWithText("The World").assertIsDisplayed()
    }

    // WHEN the player uploads an image from the phone for Daphne Greengrass
    // THEN it is her Portrait everywhere she appears
    fun uploadingAPortrait() {
        openWorld()
        compose.onNodeWithText("Hermione Granger").performClick()
        compose.onNodeWithText("Replace Portrait").performClick()
        compose.waitUntil(3000) { link.portraitUploads.isNotEmpty() }
        compose.runOnIdle { assertEquals("Hermione Granger" to "image/png", link.portraitUploads.single().let { it.first to it.second }) }
        compose.preview("PersonEdit")
    }

    fun editingSomeone() {
        openWorld()
        compose.onNodeWithText("Hermione Granger").performClick()
        compose.onNodeWithText("Edit").performClick()
        compose.onNodeWithText("Muggle-born, Gryffindor, top of every class.").assertIsDisplayed()
        compose.onNodeWithTag("person-name").assertDoesNotExist()
        compose.onNodeWithTag("person-wants").performTextReplacement("The truth about the inkwell.")
        compose.onNodeWithText("Save").performClick()
        compose.runOnIdle {
            val (name, edit) = link.personEdits.single()
            assertEquals("Hermione Granger", name)
            assertFalse(edit.create)
            assertEquals("The truth about the inkwell.", edit.wants)
        }
    }

    fun aRefusalIsShownAndTheWordsKept() {
        link.personFailure = LinkFailure("Hermione Granger is already in the Story.")
        openWorld()
        compose.onNodeWithContentDescription("Add a person").performClick()
        compose.onNodeWithTag("person-name").performTextInput("Hermione Granger")
        compose.onNodeWithTag("person-who").performTextInput("Another Hermione.")
        compose.onNodeWithText("Add to the Story").performClick()
        compose.onNodeWithText("Hermione Granger is already in the Story.").assertIsDisplayed()
        compose.onNodeWithTag("person-who").assertTextContains("Another Hermione.")
    }

    private companion object {
        val PNG = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3)
    }
}
