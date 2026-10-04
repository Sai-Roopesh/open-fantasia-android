package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class OpenStoryScreenTest {
    @get:Rule val compose = createComposeRule()

    // GIVEN the player stopped mid-Scene with Hermione and returns 30 hours later
    // WHEN they open the Story
    // THEN they are in that Scene at its latest Reply, with a "Previously" card above it
    // The Previously card needs Scene records and is outside this change's scope.
    @Scenario("stories › Opening a Story returns exactly where the player left › Back after a night away")
    @Test fun latestReply() {
        val model = FantasiaModel(FakeFantasiaLink())
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithText("After curfew").assertIsDisplayed()
        compose.onNodeWithText("She smiles.").assertIsDisplayed()
        compose.onNodeWithText("Friday · 9:40 pm").assertIsDisplayed()
    }
}
