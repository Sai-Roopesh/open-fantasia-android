package com.openfantasia.app

import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.openfantasia.protocol.*
import org.junit.Assert.*
import org.junit.Rule

open class WorldUiChecks {
    @get:Rule val compose = createComposeRule()
    protected val link = FakeFantasiaLink()
    protected fun openScene(portraitPicker: PortraitPicker = PortraitPicker { null }) {
        val model = FantasiaModel(link)
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }, portraitPicker = portraitPicker) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
    }

    /** A step's line in the Scene's end, said as done, under way or still to come. */
    protected fun step(line: String, state: String): SemanticsNodeInteraction =
        compose.onNodeWithText(line).assertIsDisplayed().assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, state))

    /** The Mac's Day View as it stands: the Scene's end at [end], with what else the [change] puts on it. */
    protected fun sceneEndAt(end: SceneEnd, change: (DayView) -> DayView = { it }) {
        compose.runOnIdle {
            val view = link.current.value
            link.current.value = view.copy(seq = view.seq + 1, lastEventID = (view.seq + 1).toString(), dayView = change(view.dayView!!.copy(sceneEnd = end)))
        }
    }

    // WHEN the player ends a Scene
    // THEN a single line says each step in turn, until the Day View is ready with its choices
    fun worldMovesOn() {
        link.endedDayView = FakeFantasiaLink.dayView().copy(
            sceneEnd = SceneEnd(step = SceneEndStep.Chronicler), day = "Saturday", time = "7:10 am", place = "Gryffindor Tower")
        link.current.value = link.current.value.copy(scene = link.current.value.scene.copy(place = "The Gryffindor common room"))
        openScene()
        compose.onNodeWithTag("composer").performTextInput("I wait until morning.")
        compose.onNodeWithText("End scene").performClick()
        compose.onNodeWithTag("confirm-end-scene").performClick()
        compose.onNodeWithText("SCENE 14 · ENDED").assertIsDisplayed()
        compose.onNodeWithText("After curfew").assertIsDisplayed()
        compose.onNodeWithText("Friday 9:40 pm – 11:05 pm · The Gryffindor common room").assertIsDisplayed()
        compose.onNodeWithText("More like this").assertIsDisplayed().assertIsOff()
        compose.onNodeWithText("Less like this").assertIsDisplayed().assertIsOff()
        compose.onNodeWithText("Saturday").assertIsDisplayed()
        compose.onNodeWithText("7:10 am · you're in Gryffindor Tower").assertIsDisplayed()
        // The record first; the Director reconsiders the Outline after every Scene, so his row is there from the start.
        step("Recording the Scene", "Under way").assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
        step("The Director is reconsidering the Outline", "Still to come")
        step("The World moves on", "Still to come")
        compose.onNodeWithTag("world-placeholders", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("MEANWHILE", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("WHAT'S ON TODAY", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("3 days").assertDoesNotExist()
        compose.onNodeWithTag("composer").assertDoesNotExist()
        compose.onNodeWithTag("send-move").assertDoesNotExist()
        compose.runOnIdle { assertEquals(EndSceneRequest(after = "reply"), link.endScenes.single()) }
        sceneEndAt(SceneEnd(step = SceneEndStep.Director))
        step("The Scene is recorded", "Done")
        step("The Director is reconsidering the Outline", "Under way")
        step("The World moves on", "Still to come")
        compose.onAllNodesWithTag("scene-end").assertCountEquals(1)
        compose.preview("MovingOn")
        sceneEndAt(SceneEnd(step = SceneEndStep.Weaver))
        step("The Outline is reconsidered", "Done")
        step("The World moves on", "Under way")
        // The Folder's row shows only when it runs.
        compose.onNodeWithText("Folding The Story So Far").assertDoesNotExist()
        sceneEndAt(SceneEnd(step = SceneEndStep.Folder))
        step("The World has moved on", "Done")
        step("Folding The Story So Far", "Under way")
        sceneEndAt(SceneEnd()) { it.copy(meanwhile = listOf(MeanwhileItem(how = How.Seen, text = "A note waits under the door."))) }
        compose.onNodeWithTag("scene-end").assertDoesNotExist()
        compose.onNodeWithTag("world-placeholders", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithText("SCENE 14 · ENDED").assertDoesNotExist()
        compose.onNodeWithText("3 days").assertIsDisplayed()
        compose.onNodeWithText("MEANWHILE").assertIsDisplayed()
        compose.onNodeWithText("A note waits under the door.").assertIsDisplayed()
        compose.onNodeWithTag("composer").assertIsDisplayed().assertTextContains("I wait until morning.")
        compose.onNodeWithTag("send-move").assertIsEnabled()
        compose.runOnIdle { assertTrue(link.moves.isEmpty()) }
    }

    // The player reacts to the Scene that just ended, and can take it back (long-run: The player steers with a brief
    // and reactions). The Mac takes no edit while the Scene's end runs: a reaction then is shown at once and sent when
    // the end is done or stopped.
    fun reactingToTheSceneThatEnded() {
        link.current.value = link.current.value.copy(headEntryID = "closed", seq = 4, lastEventID = "4",
            dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(step = SceneEndStep.Weaver)))
        openScene()
        compose.onNodeWithContentDescription("Your reaction").assertIsDisplayed()
        compose.onNodeWithText("More like this").assertIsOff().performClick()
        compose.onNodeWithText("More like this").assertIsOn()
        compose.onNodeWithText("Less like this").assertIsOff().performClick()
        compose.onNodeWithText("Less like this").assertIsOn()
        compose.onNodeWithText("More like this").assertIsOff()
        compose.runOnIdle { assertTrue(link.reactions.isEmpty()) }
        // The end stops at the Weaver: the reaction held is sent, once.
        sceneEndAt(SceneEnd(failed = SceneEndFailure(step = SceneEndStep.Weaver, reason = "The Weaver is unavailable.", traceID = "weaver")))
        compose.runOnIdle { assertEquals(listOf(ReactionRequest(sceneNumber = 14, reaction = Reaction.Less)), link.reactions) }
        compose.onNodeWithText("Less like this").assertIsOn()
        // Now it goes to the Mac at once, and tapping it again takes it back.
        compose.onNodeWithText("Less like this").performClick()
        compose.onNodeWithText("Less like this").assertIsOff()
        compose.onNodeWithText("More like this").performClick()
        compose.onNodeWithText("More like this").assertIsOn()
        compose.runOnIdle {
            assertEquals(listOf(
                ReactionRequest(sceneNumber = 14, reaction = Reaction.Less),
                ReactionRequest(sceneNumber = 14, reaction = null),
                ReactionRequest(sceneNumber = 14, reaction = Reaction.More)), link.reactions)
        }
    }

    // Any Scene can be reacted to (long-run: The player steers with a brief and reactions): once the Day View is ready,
    // the Scene that ended stays at its top in a line, with More like this and Less like this, sent at once.
    fun reactingOnceTheDayViewIsReady() {
        link.current.value = link.current.value.copy(headEntryID = "closed", seq = 4, lastEventID = "4", dayView = FakeFantasiaLink.dayView())
        openScene()
        val line = compose.onNodeWithText("Scene 14 · After curfew").assertIsDisplayed().getUnclippedBoundsInRoot()
        val day = compose.onNodeWithText("Sunday").assertIsDisplayed().getUnclippedBoundsInRoot()
        assertTrue("The Scene that ended is above the day", line.bottom < day.top)
        compose.onNodeWithText("SCENE 14 · ENDED").assertDoesNotExist()
        compose.onNodeWithContentDescription("Your reaction").assertIsDisplayed()
        compose.onNodeWithText("More like this").assertIsOff().performClick()
        compose.onNodeWithText("More like this").assertIsOn()
        compose.runOnIdle { assertEquals(listOf(ReactionRequest(sceneNumber = 14, reaction = Reaction.More)), link.reactions) }
        compose.preview("DayViewReaction")
        compose.onNodeWithText("More like this").performClick()
        compose.onNodeWithText("More like this").assertIsOff()
        compose.runOnIdle { assertEquals(ReactionRequest(sceneNumber = 14, reaction = null), link.reactions.last()) }
        // The Day View's choices are as they were.
        compose.onNodeWithText("3 days").assertIsDisplayed()
        compose.onNodeWithTag("composer").assertIsDisplayed()
    }

    // GIVEN Lavender has been telling people Selwyn's bones broke one after another
    // AND the Player Character could have heard it at breakfast
    // THEN Meanwhile shows it marked as rumour
    fun rumourIsMarked() {
        val seen = "A note under the door: \"My office, nine o'clock. Bring only what you saw.\" M. McGonagall."
        val told = "Neville says the Selwyns came by Floo at eight, and Pomfrey has closed the hospital wing until noon."
        val rumour = "At breakfast, Lavender says Selwyn's bones broke one after another, \"like someone snapping kindling\"."
        link.current.value = link.current.value.copy(headEntryID = "closed", dayView = FakeFantasiaLink.dayView().copy(
            place = "Gryffindor Tower", meanwhile = listOf(
                MeanwhileItem(how = How.Seen, text = seen), MeanwhileItem(how = How.Told, text = told),
                MeanwhileItem(how = How.Rumour, text = rumour))))
        openScene()
        val heading = compose.onNodeWithText("MEANWHILE").assertIsDisplayed().getUnclippedBoundsInRoot()
        val countdown = compose.onNodeWithTag("countdown-Draconia's flying test").assertIsDisplayed().getUnclippedBoundsInRoot()
        assertTrue("Meanwhile follows the countdowns", heading.top > countdown.bottom)
        for ((label, line, color) in listOf(
            Triple("SEEN", seen, Color(0xFF63CDB5)), Triple("TOLD", told, Color(0xFF8EB8FF)),
            Triple("RUMOUR", rumour, Color(0xFFE9B95C)))) {
            val tag = compose.onNodeWithText(label).assertIsDisplayed().assertWidthIsEqualTo(58.dp)
            val text = compose.onNodeWithText(line).assertIsDisplayed()
            val tagBounds = tag.getUnclippedBoundsInRoot()
            val textBounds = text.getUnclippedBoundsInRoot()
            assertEquals("The line is beside its tag", 10f, (textBounds.left - tagBounds.right).value, .5f)
            assertEquals("The tag and line start together", tagBounds.top.value, textBounds.top.value, .5f)
            val layouts = mutableListOf<TextLayoutResult>()
            tag.performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
            assertEquals("The tag uses its drawn colour", color, layouts.single().layoutInput.style.color)
        }
        compose.onNodeWithText("WHAT'S ON TODAY").assertDoesNotExist()
        compose.onNodeWithText("OR").assertDoesNotExist()
        compose.onNodeWithTag("composer").assertIsDisplayed()
        compose.preview("DayViewMeanwhile")
    }

    fun emptyMeanwhileHasNoHeading() {
        link.current.value = link.current.value.copy(headEntryID = "closed", dayView = FakeFantasiaLink.dayView())
        openScene()
        compose.onNodeWithText("3 days").assertIsDisplayed()
        compose.onNodeWithText("MEANWHILE").assertDoesNotExist()
    }

    // GIVEN the Director's model and its second model both fail while planning the next Stretch
    // THEN the Scene's end stops there: the World does not move on without the plan, and the line says the Director
    //   failed and why, with Retry and another model
    // WHEN the player taps Retry
    // THEN the Scene's end goes on from the Director, and the steps before it are not run again
    fun aStepAtASceneEndFails() {
        openScene()
        compose.onNodeWithTag("composer").performTextInput("I go downstairs.")
        compose.runOnIdle {
            link.current.value = link.current.value.copy(headEntryID = "closed", seq = 4, lastEventID = "4",
                dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(failed = SceneEndFailure(
                    step = SceneEndStep.Director, reason = "Fable 5.1 and GPT 6.1 Sol both ran out of time.", traceID = "3f1c09ab"))))
        }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Trace 3f1c09ab"))
        compose.onNodeWithText("The Director could not reconsider the Outline").assertIsDisplayed()
        compose.onNodeWithText("Fable 5.1 and GPT 6.1 Sol both ran out of time. The World waits for the Outline.").assertIsDisplayed()
        compose.onNodeWithText("Trace 3f1c09ab").assertIsDisplayed()
        compose.onNodeWithText("Another model").assertIsDisplayed()
        compose.onNodeWithTag("scene-end-failure").assert(
            SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Assertive))
        // The steps done stay; nothing after the Director is offered as under way.
        step("The Scene is recorded", "Done")
        compose.onNodeWithText("The World moves on").assertDoesNotExist()
        compose.onNodeWithText("The Director is reconsidering the Outline").assertDoesNotExist()
        compose.onNodeWithTag("composer").assertDoesNotExist()
        compose.onNodeWithTag("send-move").assertDoesNotExist()
        compose.onNodeWithText("3 days").assertDoesNotExist()
        compose.preview("SceneEndFailed")
        compose.runOnIdle { link.reachable.value = false }
        compose.onNodeWithText("Retry").assertIsNotEnabled()
        compose.runOnIdle { link.reachable.value = true }
        compose.onNodeWithText("Retry").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(listOf(RetryRequest(model = null)), link.retryRequests) }
        step("The Director is reconsidering the Outline", "Under way")
        compose.onNodeWithText("The Director could not reconsider the Outline").assertDoesNotExist()
        compose.onNodeWithTag("composer").assertDoesNotExist()
        sceneEndAt(SceneEnd()) { it.copy(meanwhile = listOf(MeanwhileItem(how = How.Told, text = "Neville brings news from downstairs."))) }
        compose.onNodeWithText("Neville brings news from downstairs.").assertIsDisplayed()
        compose.onNodeWithTag("composer").assertTextContains("I go downstairs.")
        compose.onNodeWithTag("send-move").assertIsEnabled()
        compose.runOnIdle { assertTrue(link.moves.isEmpty()) }
    }

    fun worldReadyKeepsReadingPlace() {
        link.current.value = link.current.value.copy(headEntryID = "closed", seq = 4, lastEventID = "4",
            dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(step = SceneEndStep.Weaver)))
        openScene()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("earlier-13"))
        val position = compose.onNodeWithTag("earlier-13").assertIsDisplayed().getUnclippedBoundsInRoot()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(seq = 6, lastEventID = "6", dayView = link.current.value.dayView!!.copy(
                sceneEnd = SceneEnd(), meanwhile = listOf(MeanwhileItem(how = How.Seen, text = "A note waits under the door."))))
        }
        assertEquals(position, compose.onNodeWithTag("earlier-13").assertIsDisplayed().getUnclippedBoundsInRoot())
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("A note waits under the door."))
        compose.onNodeWithText("MEANWHILE").assertExists()
        compose.onNodeWithText("A note waits under the door.").assertIsDisplayed()
    }
}
