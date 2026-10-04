package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.openfantasia.protocol.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class FailureScreenTest {
    @get:Rule val compose = createComposeRule()

    // GIVEN the Actor's model fails while writing a Reply
    // THEN the Scene shows that the Reply failed, with Retry and another model
    // AND the player's Move is still there
    // Choosing another model is outside this change and has no contract endpoint.
    @Scenario("presence › Nothing fails silently › A model is down")
    @Test fun failedReply() {
        val link = FakeFantasiaLink()
        link.current.value = link.current.value.copy(turn = TurnState(kind = TurnStateKind.Failed,
            reason = "The Actor is unavailable", traceID = "trace-failure"))
        val model = FantasiaModel(link)
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithText("The Actor is unavailable").assertIsDisplayed()
        compose.onNodeWithText("Trace id: trace-failure").assertIsDisplayed()
        compose.onNodeWithText("I sit beside her.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("composer").performTextInput("Next Move")
        compose.onNodeWithText("Retry").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(1, link.retries); assertTrue(link.moves.isEmpty()) }
        compose.onNodeWithTag("composer").assertTextContains("Next Move")
    }
}
