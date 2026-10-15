package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.runtime.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalDensity
import com.openfantasia.protocol.*
import java.time.Instant
import org.junit.Assert.*
import org.junit.Rule

open class PreviouslyUiChecks {
    @get:Rule val compose = createComposeRule()
    protected val link = FakeFantasiaLink()
    private val summary = "After the troll, Hermione waited up in the common room. She brought up the inkwell in Charms, and wasn't having \"maybe it likes you\"."

    // GIVEN the player stopped mid-Scene with Hermione and returns 30 hours later
    // WHEN they open the Story
    // THEN they are in that Scene at its latest Reply, with a "Previously" card above it
    fun backAfterANightAway() {
        val reply = "She closes the book on her thumb.\n" + (1..60).joinToString("\n") { "Hermione speaks beside the fire, line $it." }
        link.current.value = link.current.value.copy(previously = Previously(summary = summary,
            since = Instant.now().minusSeconds(30 * 3600).toString()), exchanges = link.current.value.exchanges.dropLast(1) +
            Exchange(move = Passage(entryID = "move", text = "I sit beside her."), reply = Passage(entryID = "reply", text = reply)))
        var pixelsPerDp = 1f
        compose.setContent {
            pixelsPerDp = LocalDensity.current.density
            FantasiaApp(FantasiaModel(link), PairingScanner { error("Already paired") })
        }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        val card = compose.onNodeWithTag("previously-card").assertIsDisplayed()
        compose.onNodeWithText("PREVIOUSLY · 30 HOURS AGO").assertIsDisplayed()
        compose.onNodeWithText(summary).assertIsDisplayed()
        compose.onNodeWithContentDescription("Dismiss").assertIsDisplayed().assertHasClickAction()
            .assertWidthIsAtLeast(44.dp).assertHeightIsAtLeast(44.dp)
        val passages = compose.onNodeWithTag("scene-passages").fetchSemanticsNode().boundsInRoot
        val cardBounds = card.fetchSemanticsNode().boundsInRoot
        assertTrue("The card opens at the top of the passages", cardBounds.top >= passages.top && cardBounds.top - passages.top < 24 * pixelsPerDp)
        val replyBounds = compose.onNodeWithText(reply).assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertTrue("The latest Reply is directly below the card", replyBounds.top > cardBounds.bottom && replyBounds.top - cardBounds.bottom < 24 * pixelsPerDp)
        compose.preview("SceneReturn")
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("I sit beside her."))
        assertTrue("The latest Move precedes the card", compose.onNodeWithText("I sit beside her.").fetchSemanticsNode().boundsInRoot.bottom <=
            card.fetchSemanticsNode().boundsInRoot.top)
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("scene-title"))
        compose.onNodeWithText("After curfew").assertIsDisplayed()
        compose.onNodeWithText("Common room · Friday 9:40 pm").assertIsDisplayed()
        // The initial landing is the only special scroll: reading back still keeps the player's place.
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("earlier-13"))
        compose.runOnIdle { link.current.value = link.current.value.copy(turn = TurnState(kind = TurnStateKind.Writing)) }
        compose.onNodeWithTag("earlier-13").assertIsDisplayed()
        val position = compose.onNodeWithTag("earlier-13").fetchSemanticsNode().boundsInRoot
        compose.onNodeWithTag("earlier-13").performClick()
        compose.onNodeWithText("Scene 13 · The troll").assertIsDisplayed()
        compose.onNodeWithContentDescription("Back to Scene 14").performClick()
        assertEquals(position, compose.onNodeWithTag("earlier-13").assertIsDisplayed().fetchSemanticsNode().boundsInRoot)
    }

    // GIVEN the player ended "After curfew", stopped at the Day View, and returns two days later
    // WHEN they open the Story
    // THEN the Day View has a "Previously" card saying what happened in "After curfew"
    fun backToADayView() {
        link.current.value = link.current.value.copy(dayView = FakeFantasiaLink.dayView(ClosedBy.Player),
            headEntryID = "closed", previously = Previously(summary = summary, since = Instant.now().minusSeconds(2 * 86400).toString()))
        compose.setContent { FantasiaApp(FantasiaModel(link), PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        val card = compose.onNodeWithTag("previously-card").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        compose.onNodeWithText(summary).assertIsDisplayed()
        compose.onNodeWithText("PREVIOUSLY · 2 DAYS AGO").assertIsDisplayed()
        compose.onNodeWithContentDescription("Dismiss").assertIsDisplayed()
        val day = compose.onNodeWithText("Sunday").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertTrue("The card is above the day", card.bottom < day.top)
        val passages = compose.onNodeWithTag("scene-passages").fetchSemanticsNode().boundsInRoot
        assertTrue("The card is above all Day View content", card.top >= passages.top && card.top - passages.top < day.top - card.bottom)
        compose.onNodeWithText("7:40 am · you're in Common room").assertIsDisplayed()
        compose.onNodeWithText("3 days").assertIsDisplayed()
        compose.preview("DayViewReturn")
    }

    // GIVEN the "Previously" card is above the latest Reply
    // WHEN the player dismisses it, leaves, and opens the Story again without playing
    // THEN the card does not come back
    fun dismissingTheCard() {
        val since = Instant.now().minusSeconds(30 * 3600).toString()
        link.current.value = link.current.value.copy(previously = Previously(summary = summary, since = since))
        val store = object : PreviouslyStore {
            val dismissed = mutableMapOf<String, String>()
            override fun read(storyID: String) = dismissed[storyID]
            override fun write(storyID: String, since: String) { dismissed[storyID] = since }
        }
        var model by mutableStateOf(FantasiaModel(link, store))
        compose.setContent { key(model) { FantasiaApp(model, PairingScanner { error("Already paired") }) } }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithTag("previously-card").assertIsDisplayed()
        compose.onNodeWithContentDescription("Dismiss").performClick()
        compose.onNodeWithTag("previously-card").assertDoesNotExist()
        compose.onNodeWithText(summary).assertDoesNotExist()
        // A refresh from the Mac must not undo the phone's dismissal.
        compose.runOnIdle { link.current.value = link.current.value.copy(traceID = "refresh") }
        compose.onNodeWithTag("previously-card").assertDoesNotExist()
        compose.onNodeWithContentDescription("Stories").performClick()
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithTag("previously-card").assertDoesNotExist()
        compose.runOnIdle { model.pause(); model = FantasiaModel(link, store) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithTag("previously-card").assertDoesNotExist()
        val later = Instant.parse(since).plusSeconds(3600).toString()
        compose.runOnIdle { link.current.value = link.current.value.copy(previously = Previously(summary = "Hermione brought up the inkwell again.", since = later)) }
        compose.onNodeWithTag("previously-card").assertIsDisplayed()
        compose.onNodeWithText("Hermione brought up the inkwell again.").assertIsDisplayed()
        compose.onNodeWithContentDescription("Dismiss").performClick()
        compose.onNodeWithTag("previously-card").assertDoesNotExist()
        // The same timestamp in another Story is a different card.
        compose.onNodeWithContentDescription("Stories").performClick()
        compose.runOnIdle { link.current.value = link.current.value.copy(storyID = "other") }
        compose.onNodeWithText("The coast").performClick()
        compose.onNodeWithTag("previously-card").assertIsDisplayed()
        compose.runOnIdle {
            assertTrue(link.moves.isEmpty()); assertTrue(link.redos.isEmpty()); assertTrue(link.endScenes.isEmpty())
        }
    }

    // As drawn: a Reply short enough to share the screen with the card opens at the Scene's end, the card above it,
    // with nothing padded below to push the card to the top.
    fun shortReplyOpensAtTheEndWithTheCardAboveIt() {
        link.current.value = link.current.value.copy(previously = Previously(summary = summary,
            since = Instant.now().minusSeconds(30 * 3600).toString()),
            exchanges = listOf(Exchange(reply = Passage(entryID = "reply", text = "She smiles."))))
        var pixelsPerDp = 1f
        val model = FantasiaModel(link)
        compose.setContent {
            pixelsPerDp = LocalDensity.current.density
            FantasiaApp(model, PairingScanner { error("Already paired") })
        }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        val card = compose.onNodeWithTag("previously-card").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val passages = compose.onNodeWithTag("scene-passages").fetchSemanticsNode().boundsInRoot
        assertTrue("The whole card is in view", card.top >= passages.top)
        assertTrue("The Reply follows the card without a Move", compose.onNodeWithText("She smiles.").assertIsDisplayed().fetchSemanticsNode().boundsInRoot.top > card.bottom)
        val copy = compose.onNodeWithText("Copy").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertTrue("The Scene ends just below the Reply's actions", passages.bottom - copy.bottom < 48 * pixelsPerDp)
        compose.preview("SceneReturnShort")
    }

    fun onlyTheMacDecidesWhetherACardIsDue() {
        val model = FantasiaModel(link)
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithTag("previously-card").assertDoesNotExist()
        compose.runOnIdle { link.current.value = link.current.value.copy(previously = Previously(summary = summary,
            since = Instant.now().minusSeconds(3 * 3600).toString())) }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("previously-card"))
        compose.onNodeWithText("PREVIOUSLY · 3 HOURS AGO").assertIsDisplayed()
        compose.runOnIdle { link.current.value = link.current.value.copy(previously = null) }
        compose.onNodeWithTag("previously-card").assertDoesNotExist()
    }

}
