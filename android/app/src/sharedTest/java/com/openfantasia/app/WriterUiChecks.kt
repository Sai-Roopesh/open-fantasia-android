package com.openfantasia.app

import androidx.compose.ui.test.*
import android.view.View
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalDensity
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.compose.ui.test.junit4.createComposeRule
import com.openfantasia.protocol.*
import org.junit.Assert.*
import org.junit.Rule

open class WriterUiChecks {
    @get:Rule val compose = createComposeRule()
    protected val link = FakeFantasiaLink()
    protected fun openScene() {
        compose.setContent { FantasiaApp(FantasiaModel(link), PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
    }

    // WHEN the player taps End scene after a Reply
    // THEN the Scene is closed at that Reply and the Day View opens
    fun playerEndsScene() {
        openScene()
        compose.onNodeWithText("End scene").assertIsEnabled().performClick()
        compose.onNodeWithText("Sunday").assertIsDisplayed()
        compose.onNodeWithText("7:40 am · you're in Common room").assertIsDisplayed()
        compose.runOnIdle { assertEquals(EndSceneRequest(after = "reply"), link.endScenes.single()) }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("She smiles."))
        compose.onNodeWithText("She smiles.").assertIsDisplayed()
        compose.onNodeWithText("End scene").assertDoesNotExist()
        compose.onNodeWithTag("composer").performTextInput("I go to my room.")
        compose.onNodeWithTag("send-move").performClick()
        compose.runOnIdle { assertEquals(MoveRequest(after = "closed", text = "I go to my room."), link.moves.single()) }
    }

    // WHEN a Reply brings the Scene to its close
    // THEN the Day View opens after it
    fun storyClosesScene() {
        openScene()
        compose.runOnIdle {
            val projection = SceneProjection(link.current.value)
            link.current.value = projection.apply(StoryEventEnvelope("4", StoryEvent(kind = StoryEventKind.SceneClosed,
                seq = 4, dayView = FakeFantasiaLink.dayView())))
        }
        compose.onNodeWithText("Sunday").assertIsDisplayed()
        compose.onNodeWithText("7:40 am · you're in Common room").assertIsDisplayed()
    }

    // GIVEN it is Sunday and Draconia's flying test is a Landmark on Wednesday
    // THEN the Day View shows "3 days to Draconia's flying test"
    fun countdown() {
        link.current.value = link.current.value.copy(dayView = FakeFantasiaLink.dayView(), headEntryID = "closed")
        openScene()
        compose.onNode(hasTestTag("countdown-Draconia's flying test") and hasAnyDescendant(hasText("3 days")) and
            hasAnyDescendant(hasText("to Draconia's flying test"))).assertIsDisplayed()
        compose.onNodeWithText("9 weeks").assertIsDisplayed()
        compose.onNodeWithText("to Slytherin v Gryffindor").assertIsDisplayed()
        compose.preview("DayView")
        val first = compose.onNodeWithTag("countdown-Draconia's flying test").getUnclippedBoundsInRoot()
        val second = compose.onNodeWithTag("countdown-Slytherin v Gryffindor").getUnclippedBoundsInRoot()
        assertEquals(first.top, second.top)
        assertEquals(first.right - first.left, second.right - second.left)
        // 10 dp apart, give or take the rounding of a real screen's pixels.
        assertEquals(10f, (second.left - first.right).value, 0.5f)
        compose.onNodeWithText("Or write your own Move").assertIsDisplayed()
        compose.onNodeWithText("She smiles.").assertIsNotDisplayed()
        compose.onNodeWithText("7:40 am · you're in Common room").assertIsDisplayed()
    }

    fun portraitSetsAndClearsFocus() {
        openScene()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("scene-title"))
        compose.onNodeWithContentDescription("Hermione's Portrait").performClick()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("scene-title"))
        compose.onNodeWithText("Focus on Hermione · tap a Portrait to change").assertIsDisplayed()
        compose.onNodeWithContentDescription("Hermione's Portrait").assertIsSelected().performClick()
        compose.onNodeWithText("Focus on Hermione · tap a Portrait to change").assertDoesNotExist()
        compose.runOnIdle {
            assertEquals(listOf(FocusRequest(after = "reply", on = "Hermione"), FocusRequest(after = "focus-1", on = null)), link.focuses)
        }
    }

    // GIVEN a Scene opens with only Draconia besides the Player Character
    // THEN Focus is on Draconia
    // AND when that Scene ends, the next Scene starts with no Focus unless it too opens with one other person
    fun focusStartsAndClears() {
        openScene()
        compose.runOnIdle {
            val card = link.current.value.scene.copy(number = 15, title = "By the pitch",
                people = listOf(PersonCard(name = "Draconia", portraitURL = null)))
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("4",
                StoryEvent(kind = StoryEventKind.SceneOpened, seq = 4, scene = card, focus = "Draconia")))
        }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("scene-title"))
        compose.onNodeWithText("Focus on Draconia · tap a Portrait to change").assertIsDisplayed()
        compose.onNodeWithContentDescription("Draconia's Portrait").assertIsSelected()
        compose.runOnIdle {
            val card = link.current.value.scene.copy(number = 16, title = "At breakfast",
                people = listOf("Draconia", "Hermione").map { PersonCard(name = it, portraitURL = null) })
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("5",
                StoryEvent(kind = StoryEventKind.SceneOpened, seq = 5, scene = card, focus = null)))
        }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("scene-title"))
        compose.onNodeWithText("At breakfast").assertIsDisplayed()
        compose.onNodeWithText("Focus on Draconia · tap a Portrait to change").assertDoesNotExist()
        compose.onNodeWithContentDescription("Draconia's Portrait").assertIsNotSelected()
    }

    fun focusSetUpdatesCard() {
        openScene()
        compose.runOnIdle {
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("4",
                StoryEvent(kind = StoryEventKind.FocusSet, seq = 4, focus = "Hermione")))
        }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("scene-title"))
        compose.onNodeWithText("Focus on Hermione · tap a Portrait to change").assertIsDisplayed()
        compose.onNodeWithContentDescription("Hermione's Portrait").assertIsSelected()
        compose.runOnIdle {
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("5",
                StoryEvent(kind = StoryEventKind.FocusSet, seq = 5, focus = null)))
        }
        compose.onNodeWithText("Focus on Hermione · tap a Portrait to change").assertDoesNotExist()
        compose.onNodeWithContentDescription("Hermione's Portrait").assertIsNotSelected()
    }

    fun lingerTogglesAndReceivesChanges() {
        openScene()
        compose.onNodeWithContentDescription("Linger").assertIsOff().performClick()
        compose.onNodeWithContentDescription("Linger").assertIsOn().performClick()
        compose.onNodeWithContentDescription("Linger").assertIsOff()
        compose.runOnIdle {
            assertEquals(listOf(LingerRequest(after = "reply", on = true), LingerRequest(after = "linger-1", on = false)), link.lingers)
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("6",
                StoryEvent(kind = StoryEventKind.LingerSet, seq = 6, linger = true)))
        }
        compose.onNodeWithContentDescription("Linger").assertIsOn()
        compose.onNodeWithText("Linger").assertIsDisplayed()
        compose.runOnIdle {
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("7",
                StoryEvent(kind = StoryEventKind.LingerSet, seq = 7, linger = false)))
        }
        compose.onNodeWithContentDescription("Linger").assertIsOff()
        compose.onNodeWithText("Linger").assertIsDisplayed()
    }

    // WHEN the player Redoes with the Direction "you're leaning too much into Ron, move on"
    // THEN the new Reply moves away from Ron
    // AND the Direction's words appear nowhere in the Story
    fun directionIsNotRemembered() {
        openScene()
        compose.onNodeWithText("Redo").assertIsEnabled().performClick()
        compose.onNodeWithText("Redo this Reply").assertIsDisplayed()
        compose.onNodeWithText("A Direction steers the new Reply. It never appears in the Story.").assertIsDisplayed()
        compose.onNodeWithText("Keep it as a line of Taste for every Scene after.").assertIsDisplayed()
        compose.onNodeWithTag("redo-sheet").assertIsDisplayed()
        compose.preview("Redo")
        val direction = "you're leaning too much into Ron, move on"
        compose.onNodeWithTag("redo-direction").performTextInput(direction)
        compose.onNodeWithText("Remember this").assertIsOff()
        compose.onNodeWithTag("confirm-redo").performClick()
        compose.runOnIdle {
            assertEquals(RedoRequest(after = "reply", direction = direction, remember = false), link.redos.single())
            // The redo event reloads this view: the old Reply has left the Path.
            link.current.value = link.current.value.copy(exchanges = link.current.value.exchanges.map { it.copy(reply = null) }.filter { it.move != null },
                headEntryID = "writer", seq = 5, lastEventID = "5.1", turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "Hermione "))
        }
        compose.onNodeWithText("She smiles.").assertDoesNotExist()
        compose.onNodeWithText("Hermione ").assertIsDisplayed()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(exchanges = listOf(Exchange(move = Passage(entryID = "move", text = "I sit beside her."),
                reply = Passage(entryID = "new-reply", text = "Hermione turns away from Ron."))), headEntryID = "new-reply", seq = 6, lastEventID = "6",
                turn = TurnState(kind = TurnStateKind.Idle))
        }
        compose.onNodeWithText("Hermione turns away from Ron.").assertIsDisplayed()
        compose.onAllNodesWithText(direction, substring = true).assertCountEquals(0)
    }

    // WHEN the player Redoes with the Direction "don't dwell on school procedure" and ticks "remember this"
    // THEN Taste gains a line saying so, and later Scenes honour it
    // The phone sends remember=true; Taste and later Scenes are owned by the Mac.
    fun rememberDirection() {
        openScene()
        compose.onNodeWithText("Redo").performClick()
        compose.onNodeWithTag("redo-direction").performTextInput("don't dwell on school procedure")
        compose.onNodeWithText("Remember this").performClick().assertIsOn()
        compose.onNodeWithTag("confirm-redo").performClick()
        compose.runOnIdle { assertEquals(RedoRequest(after = "reply", direction = "don't dwell on school procedure", remember = true), link.redos.single()) }
    }

    // Reading back is the player's choice: the keyboard opening, or a Reply's words arriving, must not pull them away
    // from an earlier Scene they scrolled up to. Only a new Move or Reply returns them to the end.
    fun readingBackKeepsItsPlace() {
        val model = FantasiaModel(link)
        lateinit var view: View
        var imeHeight = 0
        var pixelsPerDp = 1f
        compose.setContent {
            view = LocalView.current
            val density = LocalDensity.current
            val bottom = WindowInsets.ime.getBottom(density)
            SideEffect { imeHeight = bottom; pixelsPerDp = density.density }
            FantasiaApp(model, PairingScanner { error("Already paired") })
        }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("earlier-1"))
        compose.onNodeWithTag("earlier-1").assertIsDisplayed()
        compose.runOnIdle {
            ViewCompat.dispatchApplyWindowInsets(view, WindowInsetsCompat.Builder()
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, (300 * pixelsPerDp).toInt()))
                .setVisible(WindowInsetsCompat.Type.ime(), true).build())
        }
        compose.waitUntil(5000) { imeHeight > 0 }
        compose.onNodeWithTag("earlier-1").assertIsDisplayed()
        compose.runOnIdle { link.current.value = link.current.value.copy(turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "Hermione ")) }
        compose.onNodeWithTag("earlier-1").assertIsDisplayed()
    }

    fun replyEndStaysAboveComposerWithIme() {
        val reply = (1..60).joinToString("\n") { "Hermione speaks beside the fire, line $it." } + "\nThe end of the Reply."
        link.current.value = link.current.value.copy(exchanges = listOf(Exchange(
            move = Passage(entryID = "move", text = "I wait beside her."), reply = Passage(entryID = "reply", text = reply))))
        val model = FantasiaModel(link)
        lateinit var view: View
        var imeHeight = 0
        var pixelsPerDp = 1f
        compose.setContent {
            view = LocalView.current
            val density = LocalDensity.current
            val bottom = WindowInsets.ime.getBottom(density)
            SideEffect { imeHeight = bottom; pixelsPerDp = density.density }
            FantasiaApp(model, PairingScanner { error("Already paired") })
        }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithTag("composer").performClick().performTextInput("I stay.")
        compose.runOnIdle {
            ViewCompat.dispatchApplyWindowInsets(view, WindowInsetsCompat.Builder()
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, (300 * pixelsPerDp).toInt()))
                .setVisible(WindowInsetsCompat.Type.ime(), true).build())
        }
        compose.waitUntil(5000) { imeHeight > 0 }
        fun assertEndIsVisible(text: String) {
            val passage = compose.onNodeWithText(text).getUnclippedBoundsInRoot()
            val passages = compose.onNodeWithTag("scene-passages").getUnclippedBoundsInRoot()
            val composer = compose.onNodeWithTag("composer").getUnclippedBoundsInRoot()
            assertTrue("Reply's end is below the visible passages: $passage / $passages", passage.bottom <= passages.bottom)
            assertTrue("Reply's end is above the visible passages: $passage / $passages", passage.bottom > passages.top)
            assertTrue("The composer covers the Reply's end", passage.bottom <= composer.top)
        }
        assertEndIsVisible(reply)
        val streaming = reply + "\nShe speaks again."
        compose.runOnIdle {
            link.current.value = link.current.value.copy(exchanges = listOf(Exchange(move = Passage(entryID = "move", text = "I wait beside her."))),
                turn = TurnState(kind = TurnStateKind.Writing, textSoFar = streaming))
        }
        assertEndIsVisible(streaming)
        val more = streaming + "\nOne more word."
        compose.runOnIdle { link.current.value = link.current.value.copy(turn = TurnState(kind = TurnStateKind.Writing, textSoFar = more)) }
        assertEndIsVisible(more)
        compose.onNodeWithTag("composer").assertTextContains("I stay.")
    }

    fun replyRefreshesPeople() {
        openScene()
        compose.runOnIdle {
            val card = link.current.value.scene.copy(people = listOf("Hermione", "Ron").map { PersonCard(name = it, portraitURL = null) })
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("4",
                StoryEvent(kind = StoryEventKind.Reply, seq = 4, scene = card,
                    passage = Passage(entryID = "next-reply", text = "Ron joins them."))))
        }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("scene-title"))
        compose.onNodeWithContentDescription("Ron's Portrait").assertIsDisplayed()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Ron joins them."))
        compose.onNodeWithText("Ron joins them.").assertIsDisplayed()
    }

    fun growingComposerKeepsReplyEndVisible() {
        replyEndStaysAboveComposerWithIme()
        compose.onNodeWithTag("composer").performTextInput("\nI wait.\nI listen.\nI look at the fire.\nI stay beside her.")
        val end = compose.onNodeWithText(link.current.value.turn.textSoFar!!).getUnclippedBoundsInRoot()
        val passages = compose.onNodeWithTag("scene-passages").getUnclippedBoundsInRoot()
        val composer = compose.onNodeWithTag("composer").getUnclippedBoundsInRoot()
        assertTrue("A growing composer hides the Reply's end: $end / $passages", end.bottom <= passages.bottom)
        assertTrue(end.bottom > passages.top)
        assertTrue(end.bottom <= composer.top)
    }

    // The Writer plans each Reply before the Actor starts it, so a Move waits a few seconds for its first word.
    fun moveShowsItsReplyIsComing() {
        openScene()
        compose.runOnIdle {
            val projection = SceneProjection(link.current.value)
            link.current.value = projection.apply(StoryEventEnvelope("4", StoryEvent(kind = StoryEventKind.Move, seq = 4,
                passage = Passage(entryID = "move-2", text = "I ask what she is reading."))))
        }
        compose.onNodeWithText("Reply being written").assertIsDisplayed()
    }

    fun rememberThisWaitsForADirection() {
        openScene()
        compose.onNodeWithText("Redo").performClick()
        compose.onNodeWithText("Remember this").assertIsNotEnabled()
        compose.onNodeWithTag("redo-direction").performTextInput("less Ron")
        compose.onNodeWithText("Remember this").assertIsEnabled().performClick().assertIsOn()
        compose.onNodeWithTag("redo-direction").performTextClearance()
        compose.onNodeWithText("Remember this").assertIsNotEnabled().assertIsOff()
    }

    fun redoWithoutDirectionAndCancelling() {
        openScene()
        compose.onNodeWithText("Redo").performClick()
        compose.onNodeWithText("Cancel").performClick()
        compose.onNodeWithText("She smiles.").assertIsDisplayed()
        compose.runOnIdle { assertTrue(link.redos.isEmpty()) }
        compose.onNodeWithText("Redo").performClick()
        compose.onNodeWithTag("confirm-redo").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(RedoRequest(after = "reply", direction = null, remember = false), link.redos.single()) }
    }

    fun redoOnlyWhereTheStoryClosedTheScene() {
        link.current.value = link.current.value.copy(dayView = FakeFantasiaLink.dayView(ClosedBy.Story), headEntryID = "closed")
        openScene()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Redo"))
        compose.onNodeWithText("Redo").assertIsDisplayed()
        compose.runOnIdle { link.current.value = link.current.value.copy(dayView = FakeFantasiaLink.dayView(ClosedBy.Player)) }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("She smiles."))
        compose.onNodeWithText("She smiles.").assertIsDisplayed()
        compose.onNodeWithText("Redo").assertDoesNotExist()
    }

    // GIVEN a Reply is still streaming in
    // THEN the player can type in the composer, and sends once the Reply is complete
    fun typingDuringReply() {
        // A Move waiting for its first word is already a Reply in progress.
        link.current.value = link.current.value.copy(exchanges = link.current.value.exchanges +
            Exchange(move = Passage(entryID = "pending", text = "I ask her.")), headEntryID = "pending", seq = 4, lastEventID = "4")
        openScene()
        compose.onNodeWithTag("composer").assertIsEnabled().performTextInput("I wait beside her.")
        compose.onNodeWithTag("composer").assertTextContains("I wait beside her.")
        compose.onNodeWithTag("send-move").assertIsNotEnabled()
        compose.onNodeWithText("Your Move sends once the Reply is done.").assertIsDisplayed()
        compose.onNodeWithText("Reply being written").assertIsDisplayed()
        compose.onNodeWithContentDescription("Linger").assertIsNotEnabled()
        compose.onNodeWithText("End scene").assertIsNotEnabled()
        compose.runOnIdle { assertTrue(link.moves.isEmpty()); link.current.value = link.current.value.copy(turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "She ")) }
        compose.onNodeWithText("She ").assertIsDisplayed()
        compose.onNodeWithTag("reply-caret", useUnmergedTree = true).assertExists()
        compose.onNodeWithTag("scene-header-title").assertTextEquals("After curfew")
        compose.onNodeWithTag("scene-header-time").assertTextEquals("Scene 14 · Friday · 9:40 pm")
        compose.preview("SceneWriting")
        compose.onNodeWithTag("composer").performTextInput(" I stay.")
        compose.runOnIdle {
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("5", StoryEvent(kind = StoryEventKind.Reply,
                seq = 5, passage = Passage(entryID = "finished", text = "She finishes."))))
        }
        compose.onNodeWithTag("composer").assertTextContains("I wait beside her. I stay.")
        compose.onNodeWithTag("send-move").assertIsEnabled()
        compose.onNodeWithText("Your Move sends once the Reply is done.").assertDoesNotExist()
        compose.onNodeWithTag("reply-caret", useUnmergedTree = true).assertDoesNotExist()
        compose.runOnIdle { assertTrue("Completion must not send the draft", link.moves.isEmpty()) }
        compose.onNodeWithTag("send-move").performClick()
        compose.runOnIdle { assertEquals(MoveRequest(after = "finished", text = "I wait beside her. I stay."), link.moves.single()) }
    }
}
