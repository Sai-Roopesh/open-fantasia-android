package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class HomeScreenTest {
    @get:Rule val compose = createComposeRule()

    // GIVEN one Story mid-Scene in "After curfew" and another waiting at a Day View on Sunday at 7:40 am
    // THEN the home screen shows "Scene 14 · After curfew" for the first
    // AND "Sunday 7:40 am · choosing where to go" for the second
    @Scenario("stories › Home shows where every Story stands › Two Stories on the home screen")
    @Test fun twoStories() {
        val model = FantasiaModel(FakeFantasiaLink())
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").assertIsDisplayed()
        compose.onNodeWithText("Scene 14 · After curfew").assertIsDisplayed()
        compose.onNodeWithText("The coast").assertIsDisplayed()
        compose.onNodeWithText("Sunday 7:40 am · choosing where to go").assertIsDisplayed()
    }
}
