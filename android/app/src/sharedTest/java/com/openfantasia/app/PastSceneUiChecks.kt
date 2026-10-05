package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Assert.*
import org.junit.Rule
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.activity.OnBackPressedDispatcher
import com.openfantasia.protocol.*

open class PastSceneUiChecks {
    @get:Rule val compose = createComposeRule()
    protected val link = FakeFantasiaLink()

    // GIVEN the player is in Scene 14
    // THEN Scenes 1 to 13 appear above it as one-line summaries
    // AND tapping Scene 13's summary shows that Scene in full
    fun scrollingBack() {
        compose.setContent { FantasiaApp(FantasiaModel(link), PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        for (number in 1..13) {
            compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("earlier-$number"))
            compose.onNodeWithTag("earlier-$number").assertIsDisplayed()
            val title = if (number == 13) "The troll" else "Earlier Scene $number"
            val summary = if (number == 13) "He got Hermione out before the club came down." else "What happened in Scene $number."
            compose.onNodeWithText("Scene $number · $title · $summary").assertIsDisplayed()
        }
        // A draft in the composer survives reading back. It is typed once the player has scrolled up, as a player
        // does: scrolling within the keyboard's opening animation is not something a person can do.
        compose.onNodeWithTag("composer").performTextInput("I wait by the fire.")
        // The keyboard is down when the place is taken, as it is on coming back: a place is the same place only in a
        // viewport of the same size, and near the end a taller one settles the list lower.
        androidx.test.espresso.Espresso.closeSoftKeyboard()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("earlier-13"))
        val position = compose.onNodeWithTag("earlier-13").fetchSemanticsNode().boundsInRoot
        compose.onNodeWithTag("earlier-13").performClick()
        compose.onNodeWithText("Scene 13 · The troll").assertIsDisplayed()
        compose.onNodeWithText("The girls' bathroom · Friday 8:10 pm").assertIsDisplayed()
        compose.onNodeWithText("He got Hermione out before the club came down.").assertIsDisplayed()
        compose.onNodeWithText("The troll raises its club.").assertIsDisplayed()
        compose.onNodeWithText("ROOPESH").assertIsDisplayed()
        compose.onNodeWithText("I pull Hermione through the door.").assertIsDisplayed()
        compose.onNodeWithText("The club comes down behind them.").assertIsDisplayed()
        compose.onNodeWithTag("past-scene-passages").performScrollToNode(hasText("They reach the corridor."))
        compose.onNodeWithText("They reach the corridor.").assertIsDisplayed()
        for (tag in listOf("composer", "send-move", "scene-title")) compose.onNodeWithTag(tag).assertDoesNotExist()
        for (action in listOf("Copy", "Redo", "Edit", "Try another way", "Linger", "End scene")) compose.onNodeWithText(action).assertDoesNotExist()
        compose.onNodeWithContentDescription("Back to Scene 14").performClick()
        compose.onNodeWithTag("earlier-13").assertIsDisplayed()
        assertEquals(position, compose.onNodeWithTag("earlier-13").fetchSemanticsNode().boundsInRoot)
        compose.onNodeWithTag("composer").assertTextContains("I wait by the fire.")
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("She smiles."))
        compose.onNodeWithText("She smiles.").assertIsDisplayed()
        compose.runOnIdle { assertTrue(link.moves.isEmpty()); assertTrue(link.redos.isEmpty()); assertTrue(link.endScenes.isEmpty()) }
    }

    fun loadFailureShowsReasonAndTrace() {
        link.pastSceneFailure = LinkFailure("There is no Scene 13 on this Path", "missing-scene")
        compose.setContent { FantasiaApp(FantasiaModel(link), PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithTag("composer").performTextInput("An unfinished Move")
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("earlier-13"))
        compose.onNodeWithTag("earlier-13").performClick()
        compose.onNodeWithText("There is no Scene 13 on this Path").assertIsDisplayed()
        compose.onNodeWithText("Trace id: missing-scene").assertIsDisplayed()
        compose.onNodeWithText("Scene 13 · The troll").assertIsDisplayed()
        compose.onNodeWithTag("composer").assertDoesNotExist()
        compose.onNodeWithText("The Reply could not be written").assertDoesNotExist()
        compose.onNodeWithContentDescription("Back to Scene 14").performClick()
        compose.onNodeWithText("There is no Scene 13 on this Path").assertDoesNotExist()
        compose.onNodeWithTag("composer").assertTextContains("An unfinished Move")
        compose.runOnIdle { link.pastSceneFailure = null }
        compose.onNodeWithTag("earlier-13").performClick()
        compose.onNodeWithText("The troll raises its club.").assertIsDisplayed()
        compose.runOnIdle { assertEquals(listOf("story" to 13L, "story" to 13L), link.pastSceneRequests) }
    }

    fun emptySummaryAndSystemBack() {
        link.current.value = link.current.value.copy(earlierScenes = listOf(SceneSummaryLine(number = 13, title = "The troll", summary = "")))
        link.past = link.past.copy(summary = "", exchanges = listOf(
            Exchange(move = null, reply = Passage(entryID = "opening", text = "The troll raises its club.")),
            Exchange(move = Passage(entryID = "move", text = "I pull Hermione through the door."), reply = null)))
        lateinit var back: OnBackPressedDispatcher
        compose.setContent {
            back = LocalOnBackPressedDispatcherOwner.current!!.onBackPressedDispatcher
            FantasiaApp(FantasiaModel(link), PairingScanner { error("Already paired") })
        }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("earlier-13"))
        compose.onNodeWithText("Scene 13 · The troll").assertIsDisplayed().performClick()
        compose.onNodeWithText("The troll raises its club.").assertIsDisplayed()
        compose.onNodeWithText("I pull Hermione through the door.").assertIsDisplayed()
        compose.onNodeWithText("ROOPESH").assertIsDisplayed()
        compose.onNodeWithTag("past-scene-summary").assertDoesNotExist()
        compose.onNodeWithTag("composer").assertDoesNotExist()
        compose.runOnIdle { back.onBackPressed() }
        compose.onNodeWithTag("earlier-13").assertIsDisplayed()
        compose.onNodeWithTag("composer").assertIsDisplayed()
        compose.onNodeWithText("Open Fantasia").assertDoesNotExist()
        compose.runOnIdle { assertEquals(listOf("story" to 13L), link.pastSceneRequests) }
    }
}
