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
        compose.onNodeWithTag("send-move").performClick()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "The fire "))
        }
        compose.onNodeWithText("The fire ").assertIsDisplayed()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "The fire settles."))
        }
        compose.onNodeWithText("The fire settles.").assertIsDisplayed()
        assertEquals("I wait.", link.moves.single().text)
    }

}
