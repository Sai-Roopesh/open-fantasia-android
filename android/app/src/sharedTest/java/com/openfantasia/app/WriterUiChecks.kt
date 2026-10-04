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
        compose.onNodeWithText("Day View").assertIsDisplayed()
        compose.onNodeWithText("Sunday · 7:40 am").assertIsDisplayed()
        compose.runOnIdle { assertEquals(EndSceneRequest(after = "reply"), link.endScenes.single()) }
        compose.onNodeWithText("She smiles.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("End scene").assertIsNotEnabled()
        compose.onNodeWithTag("composer").performTextInput("I go to my room.")
        compose.onNodeWithText("Send").performClick()
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
        compose.onNodeWithText("Day View").assertIsDisplayed()
        compose.onNodeWithText("Sunday · 7:40 am").assertIsDisplayed()
    }

    // GIVEN it is Sunday and Draconia's flying test is a Landmark on Wednesday
    // THEN the Day View shows "3 days to Draconia's flying test"
    fun countdown() {
        link.current.value = link.current.value.copy(dayView = FakeFantasiaLink.dayView(), headEntryID = "closed")
        openScene()
        compose.onNodeWithText("3 days to Draconia's flying test").assertIsDisplayed()
        compose.onNodeWithText("Sunday · 7:40 am").assertIsDisplayed()
        compose.onNode(hasText("Common room") and hasAnySibling(hasText("Day View"))).assertIsDisplayed()
    }

    fun portraitSetsAndClearsFocus() {
        openScene()
        compose.onNodeWithContentDescription("Hermione's Portrait").performClick()
        compose.onNodeWithText("Focus: Hermione").assertIsDisplayed()
        compose.onNodeWithContentDescription("Hermione's Portrait").assertIsSelected().performClick()
        compose.onNodeWithText("Focus: Hermione").assertDoesNotExist()
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
        compose.onNodeWithText("Focus: Draconia").assertIsDisplayed()
        compose.onNodeWithContentDescription("Draconia's Portrait").assertIsSelected()
        compose.runOnIdle {
            val card = link.current.value.scene.copy(number = 16, title = "At breakfast",
                people = listOf("Draconia", "Hermione").map { PersonCard(name = it, portraitURL = null) })
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("5",
                StoryEvent(kind = StoryEventKind.SceneOpened, seq = 5, scene = card, focus = null)))
        }
        compose.onNodeWithText("At breakfast").assertIsDisplayed()
        compose.onNodeWithText("Focus: Draconia").assertDoesNotExist()
        compose.onNodeWithContentDescription("Draconia's Portrait").assertIsNotSelected()
    }

    fun focusSetUpdatesCard() {
        openScene()
        compose.runOnIdle {
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("4",
                StoryEvent(kind = StoryEventKind.FocusSet, seq = 4, focus = "Hermione")))
        }
        compose.onNodeWithText("Focus: Hermione").assertIsDisplayed()
        compose.onNodeWithContentDescription("Hermione's Portrait").assertIsSelected()
        compose.runOnIdle {
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("5",
                StoryEvent(kind = StoryEventKind.FocusSet, seq = 5, focus = null)))
        }
        compose.onNodeWithText("Focus: Hermione").assertDoesNotExist()
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
        compose.onNodeWithText("Linger on").assertIsDisplayed()
        compose.runOnIdle {
            link.current.value = SceneProjection(link.current.value).apply(StoryEventEnvelope("7",
                StoryEvent(kind = StoryEventKind.LingerSet, seq = 7, linger = false)))
        }
        compose.onNodeWithContentDescription("Linger").assertIsOff()
        compose.onNodeWithText("Linger off").assertIsDisplayed()
    }

    // WHEN the player Redoes with the Direction "you're leaning too much into Ron, move on"
    // THEN the new Reply moves away from Ron
    // AND the Direction's words appear nowhere in the Story
    fun directionIsNotRemembered() {
        openScene()
        compose.onNodeWithText("Redo").assertIsEnabled().performClick()
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
        compose.onNodeWithContentDescription("Ron's Portrait").assertIsDisplayed()
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
        compose.onNodeWithText("Remember this").assertIsEnabled()
    }

    fun redoOnlyWhereTheStoryClosedTheScene() {
        link.current.value = link.current.value.copy(dayView = FakeFantasiaLink.dayView(ClosedBy.Story), headEntryID = "closed")
        openScene()
        compose.onNodeWithText("Redo").assertIsDisplayed()
        compose.runOnIdle { link.current.value = link.current.value.copy(dayView = FakeFantasiaLink.dayView(ClosedBy.Player)) }
        compose.onNodeWithText("Redo").assertDoesNotExist()
    }
}
