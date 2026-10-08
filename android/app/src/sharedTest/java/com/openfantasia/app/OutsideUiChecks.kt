package com.openfantasia.app

import androidx.compose.ui.test.*
import com.openfantasia.protocol.*
import org.junit.Assert.*

open class OutsideUiChecks : WorldUiChecks() {
    /** A line of Backstage, scrolled to first: the screen is a list that only builds what it has shown. */
    private fun backstage(text: String): SemanticsNodeInteraction {
        compose.onNodeWithTag("backstage").performScrollToNode(hasText(text))
        return compose.onNodeWithText(text)
    }
    // WHEN the player opens the Journal and taps Scene 3
    // THEN Scene 3 is shown in full
    fun readingBack() {
        openScene()
        for (entry in listOf("Journal", "Paths", "Backstage")) compose.onNodeWithContentDescription(entry).assertIsDisplayed()
        compose.onNodeWithContentDescription("Journal").performClick()
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
        compose.onNodeWithContentDescription("Backstage").performClick()
        compose.onNodeWithText("Everything Roopesh doesn't know. Nothing here reaches the Scene, the Day View, the World or the Journal.").assertIsDisplayed()
        compose.onNodeWithText("OFF-SCREEN").assertIsDisplayed()
        compose.onNodeWithText("Saturday").assertIsDisplayed()
        compose.onNodeWithText("11:50 pm").assertIsDisplayed()
        compose.onNodeWithText("Quirrell tests the wards on the third-floor door. Nobody sees him.").assertIsDisplayed()
        compose.onNodeWithText("Hagrid's lantern stops at the edge of the forest.").assertDoesNotExist()
        backstage("THREADS").assertIsDisplayed()
        compose.onNodeWithText("Quirrell has tried the wards twice and scorched the door").assertIsDisplayed()
        backstage("LIVES").assertIsDisplayed()
        backstage("THE WRITER · THIS SCENE").assertIsDisplayed()
        compose.onNodeWithText("LANDING").assertIsDisplayed()
        backstage("Out: she goes up to bed, or asks him to come and look.").assertIsDisplayed()
        backstage("TASTE · WHAT THE STORY HAS LEARNED").assertIsDisplayed()
        compose.preview("Backstage")
        // Another day, from the day's chip.
        backstage("Saturday").performClick()
        compose.onNodeWithText("Friday").performClick()
        backstage("Hagrid's lantern stops at the edge of the forest.").assertIsDisplayed()
    }

    // GIVEN Taste has the line "keep Ron in the background"
    // WHEN the player deletes it
    // THEN later Scenes no longer keep Ron in the background on that account
    fun deletingALesson() {
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("Keep Ron in the background unless he's needed.").assertIsDisplayed()
        compose.onAllNodesWithContentDescription("Delete this line")[1].performClick()
        compose.runOnIdle { assertEquals(listOf(RemoveTasteRequest(line = "Keep Ron in the background unless he's needed.", after = "reply")), link.tasteRemovals) }
        compose.onNodeWithText("Keep Ron in the background unless he's needed.").assertDoesNotExist()
        compose.onNodeWithText("Keep school procedure to a line.").assertIsDisplayed()
    }

    // GIVEN the Director's plan builds toward the flying test on Wednesday
    // WHEN the player opens Backstage
    // THEN it says the Story is building toward the flying test on Wednesday, and that rest comes after it
    fun whatTheDirectorIsBuildingToward() {
        link.backstageView = FakeFantasiaLink.backstageFixture().copy(director = DirectorLine(toward = "the flying test on Wednesday",
            phase = DirectorPhase.Build, line = "Building toward the flying test on Wednesday. This stretch builds; rest comes after it."))
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("THE DIRECTOR").assertIsDisplayed()
        backstage("Building toward the flying test on Wednesday. This stretch builds; rest comes after it.").assertIsDisplayed()
        compose.preview("BackstageDirector")
    }

    fun noDirectorBeforeHePlans() {
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("TASTE · WHAT THE STORY HAS LEARNED").assertIsDisplayed()
        compose.onNodeWithText("THE DIRECTOR").assertDoesNotExist()
    }
}

