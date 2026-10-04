package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.openfantasia.protocol.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class ReplyScreenTest {
    @get:Rule val compose = createComposeRule()

    // WHEN the player sends a Move
    // THEN the Reply's first words appear before it is finished, and the rest follows as it is written
    @Scenario("presence › Replies stream in › Watching a Reply arrive")
    @Test fun watchingReply() {
        val link = FakeFantasiaLink()
        val model = FantasiaModel(link)
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithTag("composer").performTextInput("I wait.")
        compose.onNodeWithText("Send").performClick()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(turn = TurnState(TurnStateKind.Writing, textSoFar = "The fire "))
        }
        compose.onNodeWithText("The fire ").assertIsDisplayed()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(turn = TurnState(TurnStateKind.Writing, textSoFar = "The fire settles."))
        }
        compose.onNodeWithText("The fire settles.").assertIsDisplayed()
        assertEquals("I wait.", link.moves.single().text)
    }

    // GIVEN a Reply is still streaming in
    // THEN the player can type in the composer, and sends once the Reply is complete
    @Scenario("presence › The player can always write › Typing during a Reply")
    @Test fun typingDuringReply() {
        val link = FakeFantasiaLink()
        link.current.value = link.current.value.copy(turn = TurnState(TurnStateKind.Writing, textSoFar = "She "))
        val model = FantasiaModel(link)
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithTag("composer").performTextInput("I wait beside her.")
        compose.onNodeWithTag("composer").assertTextContains("I wait beside her.")
        compose.onNodeWithText("Send").assertIsNotEnabled()
        compose.runOnIdle { link.current.value = link.current.value.copy(turn = TurnState(TurnStateKind.Idle)) }
        compose.onNodeWithText("Send").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals("I wait beside her.", link.moves.single().text) }
    }
}
