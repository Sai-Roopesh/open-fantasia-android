package com.openfantasia.app

import androidx.compose.ui.test.*
import com.openfantasia.protocol.*
import org.junit.Assert.*

open class EditingUiChecks : WorldUiChecks() {
    private fun longPress(text: String) = compose.onNodeWithText(text).performScrollTo().performTouchInput { longClick() }
    /** An item of a held passage's menu, which opens in a popup over the Scene. */
    private fun menu(text: String) = compose.onNode(hasText(text) and hasAnyAncestor(isPopup()))
    private fun latest(label: String) = compose.onNode(hasText(label) and hasAnyAncestor(hasTestTag("latest-actions")))
    /** An exchange after the fixture's "I sit beside her.", which makes that Move and its Reply earlier ones. */
    private fun withAnotherExchange() {
        link.current.value = link.current.value.copy(headEntryID = "shows", exchanges = link.current.value.exchanges +
            Exchange(move = Passage(entryID = "ask", text = "I ask what she is reading."), reply = Passage(entryID = "shows", text = "She shows you the cover.")))
    }

    // GIVEN the player's Move "I sit at the other end of the sofa" has a Reply after it
    // WHEN the player holds that Move
    // THEN Copy, Rewind to here, Try another way from here and Edit are offered
    // AND Rewind to here goes back to the moment before that Move, with the Move and everything after it set aside
    fun holdingAnEarlierMove() {
        withAnotherExchange()
        openScene()
        longPress("I sit beside her.")
        for (item in listOf("Copy", "Rewind to here", "Try another way from here", "Edit")) menu(item).assertIsDisplayed()
        menu("Editing an earlier Move carries the Story on from the edit on a new Path. The Path you were on stays as it was.").assertIsDisplayed()
        compose.preview("LongPressMove")
        menu("Rewind to here").performClick()
        compose.runOnIdle { assertEquals(listOf(RewindRequest(to = "move", after = "shows")), link.rewinds) }
    }

    // WHEN the player edits "Hermoine" to "Hermione" in the latest Reply
    // THEN the Reply reads "Hermione" and no new Path exists
    fun fixingATypoInTheLatestReply() {
        link.current.value = link.current.value.copy(exchanges = link.current.value.exchanges.dropLast(1) +
            Exchange(move = Passage(entryID = "move", text = "I sit beside her."), reply = Passage(entryID = "reply", text = "Hermoine smiles.")))
        openScene()
        latest("Edit").performClick()
        compose.onNodeWithText("Edit this Reply").assertIsDisplayed()
        compose.onNodeWithText("Changes it where it is. Nothing after it changes.").assertIsDisplayed()
        compose.onNodeWithTag("edit-text").assertTextEquals("Hermoine smiles.")
        compose.preview("Edit")
        compose.onNodeWithTag("edit-text").performTextReplacement("Hermione smiles.")
        compose.onNodeWithTag("confirm-edit").performClick()
        compose.runOnIdle {
            assertEquals(listOf(EditRequest(entry = "reply", text = "Hermione smiles.", after = "reply")), link.edits)
            assertEquals("path", link.current.value.pathID)
        }
        compose.onNodeWithText("Hermione smiles.").assertIsDisplayed()
        compose.onNodeWithText("Edit this Reply").assertDoesNotExist()
    }

    // GIVEN the player is ten exchanges past a Move
    // WHEN they edit that Move
    // THEN a new Path carries on from the edited Move
    // AND the ten exchanges after it remain on the Path they were on
    fun editingAnEarlierMove() {
        withAnotherExchange()
        openScene()
        longPress("I sit beside her.")
        menu("Edit").performClick()
        compose.onNodeWithText("Edit this Move").assertIsDisplayed()
        compose.onNodeWithText("Carries the Story on from the edit on a new Path. The Path you are on stays as it was.").assertIsDisplayed()
        compose.onNodeWithTag("edit-text").performTextReplacement("I sit on the floor by the fire.")
        compose.onNodeWithTag("confirm-edit").performClick()
        compose.runOnIdle {
            assertEquals(listOf(EditRequest(entry = "move", text = "I sit on the floor by the fire.", after = "shows")), link.edits)
            assertEquals("edited", link.current.value.pathID)
        }
        compose.onNodeWithText("I sit on the floor by the fire.").assertIsDisplayed()
        compose.onNodeWithText("She shows you the cover.").assertDoesNotExist()
        // The edited Move gets its Reply on the new Path; until then nothing else can be edited.
        compose.runOnIdle {
            val view = link.current.value
            link.current.value = view.copy(seq = view.seq + 1, lastEventID = (view.seq + 1).toString(), headEntryID = "new-reply",
                exchanges = view.exchanges.dropLast(1) + view.exchanges.last().copy(reply = Passage(entryID = "new-reply", text = "She moves over.")))
        }
        compose.onNodeWithText("She moves over.").assertIsDisplayed()
        // From an earlier Scene being read, too: its Moves are earlier ones.
        compose.onNodeWithTag("earlier-13").performScrollTo().performClick()
        longPress("I pull Hermione through the door.")
        menu("Edit").performClick()
        compose.onNodeWithTag("edit-text").performTextReplacement("I pull Hermione under the sink.")
        compose.onNodeWithTag("confirm-edit").performClick()
        compose.runOnIdle { assertEquals(EditRequest(entry = "past-move", text = "I pull Hermione under the sink.", after = "new-reply"), link.edits.last()) }
    }

    fun editingWaitsForTheReply() {
        link.current.value = link.current.value.copy(turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "She", traceID = "turn"))
        withAnotherExchange()
        openScene()
        longPress("I sit beside her.")
        menu("Copy").assertIsEnabled()
        menu("Edit").assertIsNotEnabled()
        menu("Copy").performClick()
        compose.runOnIdle { assertTrue(link.edits.isEmpty()) }
    }

    // Found on the phone: scrolling the words of a long Reply in the Edit sheet dragged the whole sheet with the finger,
    // so the screen shook. A sheet with words to change stays where it is; Cancel and the scrim close it.
    fun editSheetStaysWhileItsWordsScroll() {
        val long = "She looks at him properly then, at his glasses fogged at the edges. ".repeat(12).trim()
        link.current.value = link.current.value.copy(exchanges = link.current.value.exchanges.dropLast(1) +
            Exchange(move = Passage(entryID = "move", text = "I sit beside her."), reply = Passage(entryID = "reply", text = long)))
        openScene()
        latest("Edit").performClick()
        val sheet = { compose.onNodeWithTag("edit-sheet").getUnclippedBoundsInRoot().top }
        val before = sheet()
        compose.onNodeWithTag("edit-text").performTouchInput { swipeDown(startY = top + 20f, endY = bottom - 20f, durationMillis = 400) }
        compose.waitForIdle()
        assertEquals("The sheet stays put while its words scroll down", before, sheet())
        compose.onNodeWithTag("edit-text").performTouchInput { swipeUp(startY = bottom - 20f, endY = top + 20f, durationMillis = 400) }
        compose.waitForIdle()
        assertEquals("The sheet stays put while its words scroll up", before, sheet())
        compose.onNodeWithText("Edit this Reply").assertIsDisplayed()
    }

    // GIVEN the latest Move reads "I sit at the other end of the sofa" and has its Reply
    // WHEN the player edits it to "I sit at the far end of the sofa"
    // THEN the Move reads "I sit at the far end of the sofa", a new Reply answers it, and no new Path exists
    fun fixingTheLatestMove() {
        openScene()
        longPress("I sit beside her.")
        menu("Editing the latest Move changes it where it is, and the Story answers it again.").assertIsDisplayed()
        menu("Edit").performClick()
        compose.onNodeWithText("Edit this Move").assertIsDisplayed()
        compose.onNodeWithText("Changes it where it is, and the Story answers it again.").assertIsDisplayed()
        compose.onNodeWithTag("edit-text").performTextReplacement("I sit at the far end of the sofa.")
        compose.onNodeWithTag("confirm-edit").performClick()
        compose.runOnIdle {
            assertEquals(listOf(EditRequest(entry = "move", text = "I sit at the far end of the sofa.", after = "reply")), link.edits)
            assertEquals("path", link.current.value.pathID)
        }
        compose.onNodeWithText("I sit at the far end of the sofa.").assertIsDisplayed()
        compose.onNodeWithText("She smiles.").assertDoesNotExist()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Reply being written"))
    }
}
