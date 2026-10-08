package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.*
import org.junit.Assert.*

open class PathsUiChecks : WorldUiChecks() {
    private fun longPress(text: String) = compose.onNodeWithText(text).performScrollTo().performTouchInput { longClick() }
    private fun openPaths() = compose.onNodeWithContentDescription("Paths").performClick()
    /** An item of the held Reply's menu, which opens in a popup over the Scene. */
    private fun menu(text: String) = compose.onNode(hasText(text) and hasAnyAncestor(isPopup()))

    // GIVEN the player is with Hermione at the lantern at 11:47 pm
    // WHEN they Try another way and follow the lantern into the forest for three Scenes, then switch back
    // THEN they are with Hermione at 11:47 pm, with nothing on that Path changed
    // AND the forest Path is still there
    fun tryAnotherWayFromAReply() {
        openScene()
        longPress("Hermione looks up.")
        menu("Copy").assertIsDisplayed()
        menu("Rewind to here").assertIsDisplayed()
        menu("Try another way from here").assertIsDisplayed()
        menu("Edit").assertIsDisplayed()
        // As drawn in LongPress.dc.html, the menu opens under the Reply it belongs to, at its left edge; with no room
        // left under it on the screen, right above it instead, never pinned to a corner. The menu is its own window,
        // so everything is measured on the screen.
        val held = compose.onNodeWithTag("reply-opening").fetchSemanticsNode()
        val reply = held.positionOnScreen
        val copy = menu("Copy").fetchSemanticsNode().positionOnScreen
        val line = compose.onNode(hasText("Editing", substring = true) and hasAnyAncestor(isPopup())).fetchSemanticsNode()
        // The app and the menu are two windows; Material keeps a menu 48 dp clear of the screen's edge.
        val windows = compose.onAllNodes(isRoot()).fetchSemanticsNodes()
        val menuHeight = windows.minBy { it.size.height }.size.height
        val screen = windows.maxBy { it.size.height }.let { it.positionOnScreen.y + it.size.height }
        val margin = with(compose.density) { 56.dp.toPx() }
        val roomUnder = reply.y + held.size.height + menuHeight + margin <= screen
        if (roomUnder) assertTrue("The menu opens under the held Reply: $copy below $reply + ${held.size}", copy.y >= reply.y + held.size.height)
        else assertTrue("With no room under it, the menu opens right above the held Reply: ends at ${line.positionOnScreen.y + line.size.height}, Reply at $reply",
            line.positionOnScreen.y + line.size.height <= reply.y && copy.y > reply.y - menuHeight - 120)
        assertTrue("The menu starts at the held Reply's left: $copy beside $reply", copy.x >= reply.x - 60 && copy.x < reply.x + 120)
        compose.preview("LongPress")
        menu("Try another way from here").performClick()
        compose.runOnIdle { assertEquals(listOf(TryAnotherWayRequest(from = "opening", after = "reply")), link.tries) }
        compose.onNodeWithText("She smiles.").assertDoesNotExist()
        menu("Try another way from here").assertDoesNotExist()
        // The same from an earlier Scene being read: the reader closes on the new Path.
        compose.onNodeWithTag("earlier-13").performScrollTo().performClick()
        longPress("The club comes down behind them.")
        menu("Try another way from here").performClick()
        compose.runOnIdle { assertEquals(TryAnotherWayRequest(from = "past-reply", after = "opening"), link.tries.last()) }
        compose.onNodeWithTag("past-scene-passages").assertDoesNotExist()
    }

    // GIVEN five exchanges after a Reply
    // WHEN the player Rewinds to that Reply and makes a different Move
    // THEN the five exchanges are on a Path of their own in the Paths screen
    fun rewindGoingBack() {
        openScene()
        longPress("She smiles.")
        menu("Try another way from here").assertIsDisplayed()
        menu("Rewind to here").assertDoesNotExist()
        menu("Copy").performClick()
        longPress("Hermione looks up.")
        menu("Rewind to here").performClick()
        compose.runOnIdle { assertEquals(listOf(RewindRequest(to = "opening", after = "reply")), link.rewinds) }
        compose.onNodeWithText("She smiles.").assertDoesNotExist()
        compose.onNodeWithTag("composer").performTextInput("I ask what she is reading.")
        compose.onNodeWithTag("send-move").performClick()
        compose.runOnIdle { assertEquals(MoveRequest(after = "opening", text = "I ask what she is reading."), link.moves.single()) }
    }

    // WHEN the player taps a Path in the Paths screen
    // THEN they are at that Path's latest moment
    fun returningByThePathsScreen() {
        openScene()
        openPaths()
        compose.onNodeWithText("Scenes 1 – 12 · Friday 6:10 pm").assertIsDisplayed()
        compose.onNodeWithText("Scene 13 · Friday 8:05 pm").assertIsDisplayed()
        compose.onNodeWithText("The troll").assertIsDisplayed()
        compose.onNodeWithText("MAIN · YOU ARE HERE").assertIsDisplayed()
        compose.onNodeWithText("Scene 14 · After curfew").assertIsDisplayed()
        compose.onNodeWithText("FROM SCENE 13 · TRIED ANOTHER WAY").assertIsDisplayed()
        compose.onNodeWithText("3 Scenes · Saturday 1:15 am · played 2 days ago").assertIsDisplayed()
        compose.onNodeWithText("Start again from the beginning").assertIsDisplayed()
        compose.preview("Paths")
        compose.onNodeWithText("Following the lantern").performClick()
        compose.runOnIdle { assertEquals(listOf("lantern"), link.opened) }
        compose.onNodeWithText("Start again from the beginning").assertDoesNotExist()
        compose.onNodeWithTag("scene-passages").assertIsDisplayed()
        compose.runOnIdle { assertEquals("lantern", link.current.value.pathID) }
    }

    fun startingAgain() {
        openScene()
        openPaths()
        compose.onNodeWithText("Start again from the beginning").performClick()
        compose.runOnIdle { assertEquals(listOf(TryAnotherWayRequest(from = null, after = "reply")), link.tries) }
        compose.onNodeWithTag("scene-passages").assertIsDisplayed()
    }

    // GIVEN the player is on Main and "Following the lantern" is another Path
    // WHEN they delete "Following the lantern" and confirm
    // THEN it is gone from the Paths screen, Main is as it was, and Main offers no Delete
    fun deletingAPath() {
        openScene()
        openPaths()
        compose.onAllNodesWithText("Delete").assertCountEquals(1)
        compose.onAllNodesWithText("Rename").assertCountEquals(2)
        compose.onNodeWithText("Delete").performClick()
        compose.onNodeWithText("Delete Following the lantern?").assertIsDisplayed()
        compose.onNodeWithTag("confirm-delete").performClick()
        compose.runOnIdle { assertEquals(listOf("lantern"), link.deleted) }
        compose.onNodeWithText("Following the lantern").assertDoesNotExist()
        compose.onNodeWithText("Scene 14 · After curfew").assertIsDisplayed()
        compose.onNodeWithText("Delete").assertDoesNotExist()
        compose.onNodeWithText("Rename").performClick()
        compose.onNodeWithTag("path-name").performTextReplacement("The long way")
        compose.onNodeWithText("Save").performClick()
        compose.runOnIdle { assertEquals(listOf("main" to RenamePathRequest(name = "The long way")), link.renames) }
        compose.onNodeWithText("The long way").assertIsDisplayed()
    }

    // GIVEN two Paths set aside by Rewind, one of which the player has since opened, and a Path they tried another way on and left
    // WHEN the player taps Clear Paths you never went back to
    // THEN only the set-aside Path they never opened is gone, and the other two are still in the Paths screen
    fun clearingWhatWasSetAside() {
        openScene()
        openPaths()
        compose.onNodeWithText("Clear Paths you never went back to").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(1, link.clears) }
        compose.onNodeWithText("Clear Paths you never went back to").assertDoesNotExist()
        compose.onNodeWithText("Following the lantern").assertIsDisplayed()
    }

    // GIVEN a Reply is being written
    // WHEN the player Rewinds to an earlier Reply
    // THEN the Story says a Reply is being written and stays where it is
    fun rewindingWhileAReplyIsWritten() {
        link.current.value = link.current.value.copy(turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "She", traceID = "turn"))
        openScene()
        longPress("Hermione looks up.")
        menu("Copy").assertIsEnabled()
        menu("Rewind to here").assertIsNotEnabled()
        menu("Try another way from here").assertIsNotEnabled()
        menu("Copy").performClick()
        openPaths()
        compose.onNodeWithText("Start again from the beginning").assertIsNotEnabled()
        compose.onNodeWithText("Following the lantern").performClick()
        compose.runOnIdle { assertTrue(link.opened.isEmpty() && link.rewinds.isEmpty() && link.tries.isEmpty()) }
    }

    // A Reply taller than the screen has no room under it or above it on screen: its menu opens where the player
    // pressed, not pinned to the top corner (found on the phone with Meera's Reply in "Ginger and dry toast").
    fun menuOpensWhereALongReplyIsHeld() {
        val long = "She looks at him properly then, at his glasses fogged at the edges. ".repeat(30)
        link.current.value = link.current.value.copy(exchanges = link.current.value.exchanges +
            Exchange(move = Passage(entryID = "move-2", text = "I take the toast."), reply = Passage(entryID = "long", text = long)), headEntryID = "long")
        openScene()
        val list = compose.onNodeWithTag("scene-passages").fetchSemanticsNode()
        compose.onNodeWithTag("reply-long").performTouchInput { longClick(center) }
        val copy = menu("Copy").fetchSemanticsNode().positionOnScreen
        val top = list.positionOnScreen.y
        assertTrue("The menu opens inside the Scene, near the press: $copy, the Scene from $top", copy.y > top + 100 && copy.y < top + list.size.height)
    }
}
