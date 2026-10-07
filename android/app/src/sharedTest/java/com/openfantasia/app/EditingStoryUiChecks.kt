package com.openfantasia.app

import androidx.compose.ui.test.*
import com.openfantasia.protocol.*
import org.junit.Assert.*

/** The Story and its editor, as drawn in Story.dc.html and StoryEdit.dc.html, run on the JVM and on the device. */
open class EditingStoryUiChecks : WorldUiChecks() {
    private fun openTheStory() {
        openScene()
        compose.onNodeWithContentDescription("The Story").performClick()
        compose.onNodeWithText("PREMISE").assertIsDisplayed()
    }

    private fun row(text: String) = compose.onNodeWithTag("story-screen").performScrollToNode(hasText(text)).let { compose.onNodeWithText(text) }

    private fun lastEdit() = compose.runOnIdle { link.storyEdits.last() }

    // GIVEN the betrothal Landmark is set for Year 3 on two Paths
    // WHEN the player moves it to the end of Year 2 on one of them
    // THEN that Path brings it about at the end of Year 2
    // AND the other Path still has it in Year 3
    fun aLandmarkIsMovedOnOnePath() {
        openTheStory()
        compose.preview("Story")
        row("The betrothal").performClick()
        compose.onNodeWithTag("story-editor").assertIsDisplayed()
        compose.onNodeWithTag("story-day").assertTextContains("760")
        compose.onNodeWithText("Monday").assertIsDisplayed()
        compose.preview("StoryEdit")
        compose.onNodeWithTag("story-day").performTextReplacement("700")
        compose.onNodeWithText("Save").performClick()
        compose.waitUntil { link.storyEdits.isNotEmpty() }
        assertEquals("landmarks/The betrothal" to LandmarkRequest(after = "reply", at = "Day 700 12:00",
            what = "Lucius announces Draconia's engagement to a pure-blood heir.", create = false), lastEdit())
        compose.onNodeWithTag("story-editor").assertDoesNotExist()
        // The fake Mac labels a time it was sent as it was sent.
        row("Day 700 12:00 label").assertIsDisplayed()
    }

    // A Landmark the World has passed is shown as happened and does not open; a time already passed is refused in the
    // sheet, with what was written kept.
    fun aPassedLandmarkAndARefusal() {
        openTheStory()
        row("The welcome feast").performClick()
        compose.onNodeWithText("Happened").assertIsDisplayed()
        compose.onNodeWithTag("story-editor").assertDoesNotExist()
        row("Draconia's flying test").performClick()
        compose.onNodeWithTag("story-day").performTextReplacement("1")
        compose.onNodeWithTag("story-words").performTextReplacement("Moved to the first night.")
        compose.onNodeWithText("Save").performClick()
        compose.onNodeWithText("That time has passed on this Path.").assertIsDisplayed()
        compose.onNodeWithTag("story-words").assertTextContains("Moved to the first night.")
        compose.runOnIdle { assertTrue(link.storyEdits.isEmpty()) }
    }

    // WHEN the player adds "keep the humour dry and British" to the Style
    // THEN the Replies from then on are written that way
    fun changingTheStyleMidStory() {
        openTheStory()
        compose.onNodeWithContentDescription("Edit the Style").performClick()
        compose.onNodeWithTag("story-words").performTextReplacement("Close third person, past tense. The slow burn is slow: weeks of insults before a slip. Keep the humour dry and British.")
        compose.onNodeWithText("Save").performClick()
        compose.waitUntil { link.storyEdits.isNotEmpty() }
        assertEquals("style" to StyleRequest(after = "reply",
            style = "Close third person, past tense. The slow burn is slow: weeks of insults before a slip. Keep the humour dry and British."), lastEdit())
        compose.onNodeWithText("Close third person, past tense. The slow burn is slow: weeks of insults before a slip. Keep the humour dry and British.").assertIsDisplayed()
    }

    // GIVEN the reply length is Full
    // WHEN the player sets it to Short
    // THEN the Replies from then on are short
    fun changingTheReplyLength() {
        link.storyView = link.storyView.copy(replyLength = Length.Full)
        openTheStory()
        compose.onNode(hasText("Full") and isSelectable()).assertIsSelected()
        compose.onNode(hasText("Short") and isSelectable()).performClick()
        compose.waitUntil { link.storyEdits.isNotEmpty() }
        assertEquals("reply-length" to ReplyLengthRequest(after = "reply", length = Length.LengthShort), lastEdit())
        compose.onNode(hasText("Short") and isSelectable()).assertIsSelected()
    }

    // GIVEN the Arcs include "Harry and Roopesh become friends"
    // WHEN the player drops it during Scene 15
    // THEN the Scenes from then on on that Path no longer build toward it
    // AND the Arcs at Scene 14, and on other Paths, still include it
    fun anArcIsDropped() {
        openTheStory()
        row("Harry and Roopesh become friends").performClick()
        compose.onNodeWithText("An Arc").assertIsDisplayed()
        compose.onNodeWithText("Drop").performClick()
        compose.waitUntil { link.storyEdits.isNotEmpty() }
        assertEquals("arcs" to ArcsRequest(after = "reply", arcs = listOf("Draconia comes round to Roopesh, slowly, against everything she was raised to be")), lastEdit())
        compose.onNodeWithText("Harry and Roopesh become friends").assertDoesNotExist()
    }

    // WHEN the player adds the Room of Requirement, with a description, during Scene 12
    // THEN it is among the World screen's places from then on on that Path, and Scenes can be set there
    // AND another Path has no such place
    fun aPlaceIsAddedMidStory() {
        openTheStory()
        row("Add a place").performClick()
        compose.onNodeWithText("A new place").assertIsDisplayed()
        compose.onNodeWithTag("story-name").performTextInput("The Room of Requirement")
        compose.onNodeWithTag("story-words").performTextInput("A room that is whatever you need it to be.")
        compose.onNodeWithText("Add to the Story").performClick()
        compose.waitUntil { link.storyEdits.isNotEmpty() }
        assertEquals("places/The Room of Requirement" to PlaceRequest(after = "reply", description = "A room that is whatever you need it to be.",
            institution = false, create = true), lastEdit())
        row("The Room of Requirement").assertIsDisplayed()
    }

    // GIVEN the Day View is waiting on Saturday at 7:40 am
    // WHEN the player moves the clock on to Sunday at 9:00 am
    // THEN the Day View is waiting on Sunday at 9:00 am, with nothing on before then among its choices
    fun movingTheClockOn() {
        openScene()
        compose.onNodeWithText("End scene").performClick()
        compose.onNodeWithText("Sunday").assertIsDisplayed()
        compose.onNodeWithContentDescription("The Story").performClick()
        row("Move the clock on").performClick()
        compose.onNodeWithTag("story-day").assertTextContains("1")
        compose.onNodeWithTag("story-day").performTextReplacement("4")
        compose.onNodeWithText("Monday").assertIsDisplayed()
        compose.onNodeWithText("Save").performClick()
        compose.waitUntil { link.storyEdits.isNotEmpty() }
        assertEquals("clock" to ClockRequest(after = "closed", at = "Day 4 21:40", dayOneWeekday = DayOneWeekday.Friday), lastEdit())
        row("Monday 9:40 pm").assertIsDisplayed()
        compose.onNodeWithContentDescription("Back to the Scene").performClick()
        compose.onNodeWithText("Monday").assertIsDisplayed()
        compose.onAllNodesWithText("9:40 pm", substring = true).onFirst().assertIsDisplayed()
    }

    // GIVEN Taste has the line "keep Ron in the background"
    // WHEN the player rewords it to "keep Ron in the background unless he's needed"
    // THEN later Scenes read the new words, and the old ones are gone from Taste
    fun rewordingALesson() {
        link.backstageView = link.backstageView.copy(taste = listOf("Keep school procedure to a line.", "Keep Ron in the background."))
        openScene()
        compose.onNodeWithText("Backstage").performClick()
        compose.onNodeWithTag("backstage").performScrollToNode(hasText("Keep Ron in the background."))
        compose.onNodeWithText("Keep Ron in the background.").performClick()
        compose.onNodeWithText("A lesson").assertIsDisplayed()
        compose.onNodeWithTag("story-words").performTextReplacement("Keep Ron in the background unless he's needed.")
        compose.onNodeWithText("Save").performClick()
        compose.waitUntil { link.storyEdits.isNotEmpty() }
        assertEquals("taste/reword" to RewordTasteRequest(after = "reply", line = "Keep Ron in the background.", text = "Keep Ron in the background unless he's needed."), lastEdit())
        compose.onNodeWithTag("backstage").performScrollToNode(hasText("Keep Ron in the background unless he's needed."))
        compose.onNodeWithText("Keep Ron in the background.").assertDoesNotExist()
    }
}
