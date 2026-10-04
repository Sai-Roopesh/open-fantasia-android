package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class SceneScreenTest {
    @get:Rule val compose = createComposeRule()

    // GIVEN the player is in Scene 14
    // THEN Scenes 1 to 13 appear above it as one-line summaries
    // AND tapping Scene 13's summary shows that Scene in full
    // The contract supplies summaries only; full earlier Scenes need a contract addition.
    @Scenario("scenes › Every Scene opens with a title card › Scrolling back")
    @Test fun scrollingBack() {
        val model = FantasiaModel(FakeFantasiaLink())
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithText("After curfew").assertIsDisplayed()
        compose.onNodeWithText("Common room").assertIsDisplayed()
        compose.onNodeWithText("Friday · 9:40 pm").assertIsDisplayed()
        compose.onNodeWithContentDescription("Hermione's Portrait").assertIsDisplayed()
        for (number in 1..13) compose.onNodeWithTag("earlier-$number").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("earlier-13").performScrollTo().performClick()
        compose.onNodeWithText("What happened in Scene 13.").assertIsDisplayed()
    }
}
