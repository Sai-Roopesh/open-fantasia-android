package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class SceneScreenTest {
    @get:Rule val compose = createComposeRule()

    // GIVEN the player opens a Story in the Scene "After curfew" in the Common room on Friday at 9:40 pm, with Hermione there
    // THEN the title card shows "After curfew", "Common room", "Friday · 9:40 pm" and Hermione's Portrait
    @Scenario("scenes › Every Scene opens with a title card › The title card")
    @Test fun theTitleCard() {
        val model = FantasiaModel(FakeFantasiaLink())
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithText("After curfew").assertIsDisplayed()
        compose.onNodeWithText("Common room").assertIsDisplayed()
        compose.onNodeWithText("Friday · 9:40 pm").assertIsDisplayed()
        compose.onNodeWithContentDescription("Hermione's Portrait").assertIsDisplayed()
    }

    // Not yet the "Scrolling back" scenario: reading an earlier Scene in full needs it in the contract. This only
    // shows that the summaries the Mac sends are there and open on a tap.
    @Test fun earlierScenesShowTheirSummaries() {
        val model = FantasiaModel(FakeFantasiaLink())
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        for (number in 1..13) {
            compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("earlier-$number"))
            compose.onNodeWithTag("earlier-$number").assertIsDisplayed()
        }
        compose.onNodeWithText("What happened in Scene 13.", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithTag("earlier-13").performClick()
        // The collapsed line holds the summary inside "Scene 13 · …"; opened, it is also shown on its own.
        compose.onNodeWithText("What happened in Scene 13.", useUnmergedTree = true).assertExists()
    }
}
