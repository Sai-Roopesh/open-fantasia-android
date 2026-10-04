package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class VersionScreenTest {
    @get:Rule val compose = createComposeRule()

    // GIVEN the Mac speaks a newer contract than the app
    // WHEN the app connects
    // THEN the app says it needs updating to match the Mac
    @Scenario("mac-link › The phone and the Mac agree on what they speak › An old app")
    @Test fun oldApp() {
        val fake = FakeFantasiaLink()
        val link = object : FantasiaLink by fake {
            override suspend fun stories(): com.openfantasia.protocol.StoryList =
                throw LinkFailure(UPDATE_REQUIRED, "trace-version", true)
        }
        val model = FantasiaModel(link)
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("This app needs updating to match your Mac").assertIsDisplayed()
        compose.onNodeWithText("Trace id: trace-version").assertIsDisplayed()
        compose.onNodeWithText("Reply failed").assertDoesNotExist()
    }
}
