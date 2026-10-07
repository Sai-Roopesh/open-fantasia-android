package com.openfantasia.app

import androidx.compose.ui.test.*
import com.openfantasia.protocol.*
import org.junit.Assert.*

open class PresenceUiChecks : WorldUiChecks() {
    // GIVEN the Mac is asleep
    // WHEN the player opens a Story
    // THEN its Scenes, Journal and World screen can be read
    // AND the composer says the Mac is unreachable
    fun theMacIsAsleep() {
        openScene()
        compose.runOnIdle { link.reachable.value = false }
        compose.onNodeWithText("The Mac is unreachable").assertIsDisplayed()
        compose.onNodeWithText("She smiles.").assertIsDisplayed()
        compose.onNodeWithText("Journal").performClick()
        compose.onNodeWithText("The insult").assertIsDisplayed()
        compose.onNodeWithContentDescription("Back to the Scene").performClick()
        compose.onNodeWithText("World").performClick()
        compose.onNodeWithText("Hermione Granger").assertIsDisplayed()
    }

    fun aMoveWaitsForTheMac() {
        openScene()
        compose.runOnIdle { link.reachable.value = false }
        compose.onNodeWithTag("composer").performTextInput("I wait for her to look up.")
        compose.onNodeWithTag("send-move").assertIsEnabled().performClick()
        compose.onNodeWithText("Sends when the Mac is back.").assertIsDisplayed()
        compose.runOnIdle { assertTrue(link.moves.isEmpty()) }
        compose.runOnIdle { link.reachable.value = true }
        compose.waitUntil(3000) { link.moves.isNotEmpty() }
        compose.runOnIdle { assertEquals(listOf(MoveRequest(after = "reply", text = "I wait for her to look up.")), link.moves) }
        compose.onNodeWithText("Sends when the Mac is back.").assertDoesNotExist()
    }

    fun aWaitingMoveMeetsAStoryThatMovedOn() {
        openScene()
        compose.runOnIdle { link.reachable.value = false }
        compose.onNodeWithTag("composer").performTextInput("I wait for her to look up.")
        compose.onNodeWithTag("send-move").performClick()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(headEntryID = "elsewhere", seq = 9, lastEventID = "9")
            link.reachable.value = true
        }
        compose.waitUntil(3000) { compose.onAllNodesWithText("The Story moved on while the Mac was away. Your Move is back to send again.").fetchSemanticsNodes().isNotEmpty() }
        compose.runOnIdle { assertTrue(link.moves.isEmpty()) }
        compose.onNodeWithTag("composer").assertTextEquals("I wait for her to look up.")
    }
}
