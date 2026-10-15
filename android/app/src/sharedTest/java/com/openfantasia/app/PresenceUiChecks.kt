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
        compose.onNodeWithContentDescription("Journal").performClick()
        compose.onNodeWithText("The insult").assertIsDisplayed()
        compose.onNodeWithContentDescription("Back to the Scene").performClick()
        compose.onNodeWithContentDescription("World").performClick()
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

    /** What the Mac sends for the turn under way, applied as the phone's stream applies it. */
    private fun mac(id: String?, event: StoryEvent) = compose.runOnIdle {
        link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope(id, event))
    }

    private fun line(text: String) = compose.onNodeWithTag("reply-under-way").assertIsDisplayed().assert(hasText(text))

    private val kiss = "I kiss her, quickly, and pull back before she can say anything."
    private val answer = "For a moment nothing in the room moves. \"That,\" Hermione says, very carefully, \"was not a reason either.\""

    // WHEN the player sends a Move
    // THEN one line says the Reply is being written, then that it is being checked, and the Reply appears whole
    fun watchingAReplyCome() {
        openScene()
        compose.onNodeWithTag("composer").performTextInput(kiss)
        compose.onNodeWithTag("send-move").performClick()
        compose.runOnIdle { assertEquals(listOf(MoveRequest(after = "reply", text = kiss)), link.moves) }
        mac("4", StoryEvent(kind = StoryEventKind.Move, seq = 4, passage = Passage(entryID = "kiss", text = kiss)))
        mac(null, StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 4, traceID = "turn"))
        line("Writing…")
        compose.onNodeWithText(answer).assertDoesNotExist()
        compose.preview("SceneWriting")
        mac(null, StoryEvent(kind = StoryEventKind.TurnStep, seq = 4, turnStep = TurnStep.Checking, traceID = "turn"))
        line("Checking…")
        compose.onNodeWithText("Writing…").assertDoesNotExist()
        compose.onNodeWithText(answer).assertDoesNotExist()
        // Checked: the words appear together, and the line goes.
        mac("5", StoryEvent(kind = StoryEventKind.Reply, seq = 5, passage = Passage(entryID = "answer", text = answer)))
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText(answer))
        compose.onNodeWithText(answer).assertIsDisplayed()
        compose.onNodeWithTag("reply-under-way").assertDoesNotExist()
        compose.onNodeWithTag("latest-actions").assertIsDisplayed()
    }

    // GIVEN the Writer looks up how Hermione learned his secret before it plans the Reply
    // THEN the line says it is looking back, before it says the Reply is being written
    fun lookingSomethingUp() {
        openScene()
        compose.onNodeWithTag("composer").performTextInput(kiss)
        compose.onNodeWithTag("send-move").performClick()
        // Nothing is said to be written before the Mac says so.
        line("Looking back…")
        mac("4", StoryEvent(kind = StoryEventKind.Move, seq = 4, passage = Passage(entryID = "kiss", text = kiss)))
        mac(null, StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 4, turnStep = TurnStep.LookingBack, traceID = "turn"))
        line("Looking back…")
        compose.onNodeWithText("Writing…").assertDoesNotExist()
        compose.preview("SceneWriting · looking back")
        mac(null, StoryEvent(kind = StoryEventKind.TurnStep, seq = 4, turnStep = TurnStep.Writing, traceID = "turn"))
        line("Writing…")
        compose.onNodeWithText("Looking back…").assertDoesNotExist()
        mac(null, StoryEvent(kind = StoryEventKind.TurnStep, seq = 4, turnStep = TurnStep.Checking, traceID = "turn"))
        line("Checking…")
        mac("5", StoryEvent(kind = StoryEventKind.Reply, seq = 5, passage = Passage(entryID = "answer", text = answer)))
        compose.onNodeWithTag("reply-under-way").assertDoesNotExist()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText(answer))
        compose.onNodeWithText(answer).assertIsDisplayed()
    }

    // GIVEN a Scene ended that turned the Story
    // WHEN the Director re-plans the current Act deeply
    // THEN the line says it is rethinking Year One, until the World moves on
    fun rethinkingAYear() {
        link.endedDayView = FakeFantasiaLink.dayView(closedBy = ClosedBy.Player).copy(sceneEnd = SceneEnd(step = SceneEndStep.Chronicler))
        openScene()
        compose.onNodeWithText("End scene").performClick()
        step("Recording the Scene", "Under way")
        step("The Director is reconsidering the Outline", "Still to come")
        sceneEndAt(SceneEnd(step = SceneEndStep.Director, rethinking = "Year One"))
        step("The Scene is recorded", "Done")
        step("Rethinking Year One…", "Under way")
        step("The World moves on", "Still to come")
        compose.onNodeWithText("The Director is reconsidering the Outline").assertDoesNotExist()
        compose.preview("MovingOn · rethinking")
        sceneEndAt(SceneEnd(step = SceneEndStep.Weaver))
        compose.onNodeWithText("Rethinking Year One…").assertDoesNotExist()
        step("The Outline is reconsidered", "Done")
        step("The World moves on", "Under way")
    }

    // A Reply the Editor had written again that still breaks something arrives with the Editor's note under it, and
    // Redo moves into the note (SceneWriting.dc.html; docs/adr/0019). Once the Story moves on, the note stays under its
    // Reply, without Redo.
    fun aReplyWithTheEditorsNote() {
        val note = "Hermione has not been told about the egg; she could not ask about it yet."
        val reply = "\"Is it the same thing that warmed the egg?\""
        link.current.value = link.current.value.copy(exchanges = listOf(
            Exchange(reply = Passage(entryID = "opening", text = "Hermione looks up.")),
            Exchange(move = Passage(entryID = "move", text = kiss), reply = Passage(entryID = "reply", text = reply, note = note))))
        openScene()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("editor-note"))
        compose.onNodeWithText("THE EDITOR'S NOTE").assertIsDisplayed()
        compose.onNodeWithText(note).assertIsDisplayed()
        val replyBounds = compose.onNodeWithText(reply).getUnclippedBoundsInRoot()
        assertTrue("The note is under its Reply", compose.onNodeWithTag("editor-note").getUnclippedBoundsInRoot().top >= replyBounds.bottom)
        compose.onAllNodesWithText("Redo").assertCountEquals(1)
        compose.onNodeWithTag("editor-note-redo").assertIsEnabled()
        compose.onNode(hasText("Copy") and hasAnyAncestor(hasTestTag("latest-actions"))).assertIsDisplayed()
        compose.preview("EditorNote")
        compose.onNodeWithTag("editor-note-redo").performClick()
        compose.onNodeWithText("Redo this Reply").assertIsDisplayed()
        compose.onNodeWithText("Cancel").performClick()
        compose.runOnIdle {
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("4", StoryEvent(kind = StoryEventKind.Move, seq = 4,
                passage = Passage(entryID = "next", text = "I tell her the truth."))))
        }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("editor-note"))
        compose.onNodeWithText(note).assertIsDisplayed()
        compose.onNodeWithTag("editor-note-redo").assertDoesNotExist()
    }
}
