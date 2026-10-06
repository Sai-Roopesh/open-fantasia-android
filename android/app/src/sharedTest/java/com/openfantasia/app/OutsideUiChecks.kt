package com.openfantasia.app

import androidx.compose.ui.test.*
import com.openfantasia.protocol.*
import org.junit.Assert.*

open class OutsideUiChecks : WorldUiChecks() {
    // WHEN the player opens the Journal and taps Scene 3
    // THEN Scene 3 is shown in full
    fun readingBack() {
        openScene()
        for (entry in listOf("Journal", "Paths", "Backstage")) compose.onNodeWithText(entry).assertIsDisplayed()
        compose.onNodeWithText("Journal").performClick()
        compose.onNodeWithText("FRIDAY").assertIsDisplayed()
        compose.onNodeWithText("Scene 12 · 6:10 pm · The Three Broomsticks").assertIsDisplayed()
        compose.onNodeWithText("The insult").assertIsDisplayed()
        compose.onNodeWithText("TOLD").assertIsDisplayed()
        compose.onNodeWithText("Ron says a troll got into the dungeons during the feast.").assertIsDisplayed()
        compose.onNodeWithText("Scene 14 · 9:40 pm · now").assertIsDisplayed()
        compose.preview("Journal")
        compose.onNodeWithText("The troll").performClick()
        compose.onNodeWithTag("past-scene-passages").assertIsDisplayed()
        compose.runOnIdle { assertEquals("story" to 13L, link.pastSceneRequests.last()) }
        compose.onNodeWithContentDescription("Back to Scene 14").performClick()
        compose.onNodeWithText("FRIDAY").assertIsDisplayed()
        compose.onNodeWithText("After curfew").performClick()
        compose.onNodeWithText("FRIDAY").assertDoesNotExist()
        compose.onNodeWithTag("scene-passages").assertIsDisplayed()
    }

    // WHEN the player opens Backstage for Saturday night
    // THEN it shows what Quirrell did that night
    fun quirrellsNights() {
        openScene()
        compose.onNodeWithText("Backstage").performClick()
        compose.onNodeWithText("Everything Roopesh doesn't know. Nothing here reaches the Scene, the Day View, the World or the Journal.").assertIsDisplayed()
        compose.onNodeWithText("OFF-SCREEN").assertIsDisplayed()
        compose.onNodeWithText("Saturday").assertIsDisplayed()
        compose.onNodeWithText("11:50 pm").assertIsDisplayed()
        compose.onNodeWithText("Quirrell tests the wards on the third-floor door. Nobody sees him.").assertIsDisplayed()
        compose.onNodeWithText("Hagrid's lantern stops at the edge of the forest.").assertDoesNotExist()
        compose.onNodeWithText("THREADS").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Quirrell has tried the wards twice and scorched the door").assertIsDisplayed()
        compose.onNodeWithText("LIVES").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("THE WRITER · THIS SCENE").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("LANDING").assertIsDisplayed()
        compose.onNodeWithText("Out: she goes up to bed, or asks him to come and look.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("TASTE · WHAT THE STORY HAS LEARNED").performScrollTo().assertIsDisplayed()
        compose.preview("Backstage")
        // Another day, from the day's chip.
        compose.onNodeWithText("Saturday").performScrollTo().performClick()
        compose.onNodeWithText("Friday").performClick()
        compose.onNodeWithText("Hagrid's lantern stops at the edge of the forest.").performScrollTo().assertIsDisplayed()
    }

    // GIVEN Taste has the line "keep Ron in the background"
    // WHEN the player deletes it
    // THEN later Scenes no longer keep Ron in the background on that account
    fun deletingALesson() {
        openScene()
        compose.onNodeWithText("Backstage").performClick()
        compose.onNodeWithText("Keep Ron in the background unless he's needed.").performScrollTo().assertIsDisplayed()
        compose.onAllNodesWithContentDescription("Delete this line")[1].performScrollTo().performClick()
        compose.runOnIdle { assertEquals(listOf(RemoveTasteRequest(line = "Keep Ron in the background unless he's needed.", after = "reply")), link.tasteRemovals) }
        compose.onNodeWithText("Keep Ron in the background unless he's needed.").assertDoesNotExist()
        compose.onNodeWithText("Keep school procedure to a line.").assertIsDisplayed()
    }
}
