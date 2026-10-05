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
    private val status = "Recording the Scene. The World is moving on."

    protected fun openScene() {
        val model = FantasiaModel(link)
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
    }

    // WHEN the player ends a Scene
    // THEN a single line says the Scene is being recorded and the World is moving on, until the Day View is ready
    fun worldMovesOn() {
        link.endedDayView = FakeFantasiaLink.dayView(closedBy = ClosedBy.Player).copy(
            world = World.MovingOn, day = "Saturday", time = "7:10 am", place = "Gryffindor Tower")
        link.current.value = link.current.value.copy(scene = link.current.value.scene.copy(place = "The Gryffindor common room"))
        openScene()
        compose.onNodeWithTag("composer").performTextInput("I wait until morning.")
        compose.onNodeWithText("End scene").performClick()
        compose.onNodeWithText("SCENE 14 · ENDED").assertIsDisplayed()
        compose.onNodeWithText("After curfew").assertIsDisplayed()
        compose.onNodeWithText("Friday 9:40 pm – 11:05 pm · The Gryffindor common room").assertIsDisplayed()
        compose.onNodeWithText("Saturday").assertIsDisplayed()
        compose.onNodeWithText("7:10 am · you're in Gryffindor Tower").assertIsDisplayed()
        compose.onAllNodesWithText(status).assertCountEquals(1)
        compose.onNodeWithText(status).assertIsDisplayed().assert(
            SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
        compose.onNodeWithTag("world-placeholders", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("MEANWHILE", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("WHAT'S ON TODAY", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("3 days").assertDoesNotExist()
        compose.onNodeWithTag("composer").assertDoesNotExist()
        compose.onNodeWithTag("send-move").assertDoesNotExist()
        compose.preview("MovingOn")
        compose.runOnIdle {
            assertEquals(EndSceneRequest(after = "reply"), link.endScenes.single())
            link.current.value = link.current.value.copy(dayView = link.endedDayView.copy(world = World.Ready,
                meanwhile = listOf(MeanwhileItem(how = How.Seen, text = "A note waits under the door."))))
        }
        compose.onNodeWithText(status).assertDoesNotExist()
        compose.onNodeWithTag("world-placeholders", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithText("SCENE 14 · ENDED").assertDoesNotExist()
        compose.onNodeWithText("3 days").assertIsDisplayed()
        compose.onNodeWithText("MEANWHILE").assertIsDisplayed()
        compose.onNodeWithText("A note waits under the door.").assertIsDisplayed()
        compose.onNodeWithTag("composer").assertIsDisplayed().assertTextContains("I wait until morning.")
        compose.onNodeWithTag("send-move").assertIsEnabled()
        compose.runOnIdle { assertTrue(link.moves.isEmpty()) }
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

    fun failedWorldCanBeRetried() {
        openScene()
        compose.onNodeWithTag("composer").performTextInput("I go downstairs.")
        compose.runOnIdle {
            link.current.value = link.current.value.copy(headEntryID = "closed", seq = 4, lastEventID = "4",
                dayView = FakeFantasiaLink.dayView(closedBy = ClosedBy.Player).copy(world = World.Failed,
                    failure = WorldFailure(reason = "The Weaver is unavailable", traceID = "world-trace")))
        }
        compose.onNodeWithText("The World could not move on").assertIsDisplayed()
        compose.onNodeWithText("The Weaver is unavailable").assertIsDisplayed()
        compose.onNodeWithText("Trace world-trace").assertIsDisplayed()
        compose.onNodeWithTag("world-failure").assert(
            SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Assertive))
        compose.onNodeWithTag("composer").assertDoesNotExist()
        compose.onNodeWithTag("send-move").assertDoesNotExist()
        compose.onNodeWithText(status).assertDoesNotExist()
        compose.onNodeWithText("3 days").assertDoesNotExist()
        compose.runOnIdle { link.reachable.value = false }
        compose.onNodeWithText("Retry").assertIsNotEnabled()
        compose.runOnIdle { link.reachable.value = true }
        compose.onNodeWithText("Retry").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(listOf("story"), link.worldRetries); assertEquals(0, link.retries) }
        compose.onNodeWithText(status).assertIsDisplayed()
        compose.onNodeWithText("The Weaver is unavailable").assertDoesNotExist()
        compose.onNodeWithTag("composer").assertDoesNotExist()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(dayView = link.current.value.dayView!!.copy(world = World.Ready,
                meanwhile = listOf(MeanwhileItem(how = How.Told, text = "Neville brings news from downstairs."))))
        }
        compose.onNodeWithText("Neville brings news from downstairs.").assertIsDisplayed()
        compose.onNodeWithTag("composer").assertTextContains("I go downstairs.")
        compose.onNodeWithTag("send-move").assertIsEnabled()
        compose.runOnIdle { assertTrue(link.moves.isEmpty()) }
    }

    fun worldReadyKeepsReadingPlace() {
        link.current.value = link.current.value.copy(headEntryID = "closed", seq = 4, lastEventID = "4",
            dayView = FakeFantasiaLink.dayView().copy(world = World.MovingOn))
        openScene()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("earlier-13"))
        val position = compose.onNodeWithTag("earlier-13").assertIsDisplayed().getUnclippedBoundsInRoot()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(seq = 6, lastEventID = "6", dayView = link.current.value.dayView!!.copy(
                world = World.Ready, meanwhile = listOf(MeanwhileItem(how = How.Seen, text = "A note waits under the door."))))
        }
        assertEquals(position, compose.onNodeWithTag("earlier-13").assertIsDisplayed().getUnclippedBoundsInRoot())
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("A note waits under the door."))
        compose.onNodeWithText("MEANWHILE").assertExists()
        compose.onNodeWithText("A note waits under the door.").assertIsDisplayed()
    }
}
