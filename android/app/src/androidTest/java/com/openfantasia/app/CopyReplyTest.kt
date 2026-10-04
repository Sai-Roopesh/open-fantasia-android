package com.openfantasia.app

import android.content.ClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class CopyReplyTest {
    @get:Rule val compose = createComposeRule()

    // WHEN the player taps Copy on the latest Reply
    // THEN the Reply's text is on the clipboard
    @Scenario("scenes › The latest Reply has its actions in view › Copying the latest Reply")
    @Test fun copyingLatestReply() {
        val model = FantasiaModel(FakeFantasiaLink())
        lateinit var clipboard: ClipboardManager
        compose.setContent {
            clipboard = LocalContext.current.getSystemService(ClipboardManager::class.java)
            FantasiaApp(model, PairingScanner { error("Already paired") })
        }
        compose.onNodeWithText("The Malfoy Problem").performClick()
        compose.onNodeWithText("Copy").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals("She smiles.", clipboard.primaryClip?.getItemAt(0)?.text?.toString()) }
    }
}
