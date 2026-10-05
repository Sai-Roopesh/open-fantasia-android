package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Assert.*
import com.openfantasia.protocol.*
import kotlinx.serialization.encodeToString

open class DesignUiChecks {
    @get:Rule val compose = createComposeRule()
    protected val link = FakeFantasiaLink()

    // GIVEN one Story mid-Scene in "After curfew" and another waiting at a Day View on Sunday at 7:40 am
    // THEN the home screen shows "Scene 14 · After curfew" for the first
    // AND "Sunday 7:40 am · choosing where to go" for the second
    fun twoStories() {
        compose.setContent { FantasiaApp(FantasiaModel(link), PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("Open Fantasia").assertIsDisplayed()
        compose.onNodeWithText("Sai's MacBook Air · connected").assertIsDisplayed()
        compose.onNodeWithText("The Malfoy Problem").assertIsDisplayed()
        compose.onNodeWithText("Scene 14 · After curfew").assertIsDisplayed()
        compose.onNodeWithText("Friday 9:40 pm · with Hermione").assertIsDisplayed()
        compose.onNodeWithText("2 h ago").assertIsDisplayed()
        compose.onNodeWithText("The coast").assertIsDisplayed()
        compose.onNodeWithText("Sunday 7:40 am · choosing where to go").assertIsDisplayed()
        compose.onNodeWithText("3 Scenes played").assertIsDisplayed()
        compose.onNodeWithText("yesterday").assertIsDisplayed()
        compose.onNodeWithText("New Stories are made with Claude on the Mac and appear here once imported.").assertIsDisplayed()
        compose.preview("Main")
        compose.runOnIdle { link.reachable.value = false }
        compose.onNodeWithText("Sai's MacBook Air · unreachable").assertIsDisplayed()
    }

    // WHEN the player runs the pairing command on the Mac and scans the QR code it shows with the phone
    // THEN the phone lists the Mac's Stories
    fun firstPairing() {
        link.isPaired = false
        val invite = PairingInvite(addresses = listOf("192.168.1.5"), code = "invite", contract = CONTRACT_VERSION.toLong(),
            fingerprint = "ab".repeat(32), hostID = "mac", hostName = "Paired Mac", port = 7443)
        compose.setContent { FantasiaApp(FantasiaModel(link), PairingScanner { linkJson.encodeToString(invite) }) }
        compose.onNodeWithText("Your Stories live on your Mac. Pair once, and this phone finds it on any network you share.").assertIsDisplayed()
        compose.onNodeWithText("fantasia pair", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Scan the code it shows. It works once, for ten minutes.").assertIsDisplayed()
        compose.preview("Pair")
        compose.onNodeWithText("Scan the QR code").assertIsDisplayed().performClick()
        compose.waitUntil(5000) { link.pairedInvite != null }
        compose.onNodeWithText("The Malfoy Problem").assertIsDisplayed()
        compose.onNodeWithText("Paired Mac · connected").assertIsDisplayed()
        assertEquals(invite, link.pairedInvite)
    }

    protected fun openScene() {
        compose.setContent { FantasiaApp(FantasiaModel(link), PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").performClick()
    }

    // GIVEN the player opens a Story in the Scene "After curfew" in the Common room on Friday at 9:40 pm, with Hermione there
    // THEN the title card shows "After curfew", "Common room", "Friday · 9:40 pm" and Hermione's Portrait
    fun titleCard() {
        link.current.value = link.current.value.copy(scene = link.current.value.scene.copy(
            people = listOf(PersonCard(name = "Hermione Granger", portraitURL = null))), focus = "Hermione Granger")
        openScene()
        compose.onNodeWithText("She smiles.").assertIsDisplayed()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("scene-title"))
        compose.preview("Scene")
        compose.onNodeWithText("SCENE 14").assertIsDisplayed()
        compose.onNodeWithText("After curfew").assertIsDisplayed()
        compose.onNodeWithText("Common room · Friday · 9:40 pm").assertIsDisplayed()
        compose.onNodeWithContentDescription("Hermione Granger's Portrait").assertIsDisplayed().assertIsSelected()
        compose.onNodeWithText("Hermione").assertIsDisplayed()
        compose.onNodeWithText("Focus on Hermione · tap a Portrait to change").assertIsDisplayed()
        compose.onNodeWithTag("portrait-Hermione Granger", useUnmergedTree = true).assertWidthIsEqualTo(56.dp).assertHeightIsEqualTo(56.dp)
        compose.onNodeWithTag("composer").assertHeightIsEqualTo(70.dp).assertIsEnabled()
        compose.onNodeWithText("What does Roopesh do?").assertIsDisplayed()
        compose.onNodeWithText("Linger").assertIsDisplayed()
        compose.onNodeWithText("End scene").assertIsDisplayed()
    }

    // Only summaries are available for earlier Scenes in this contract; expanding one still shows its summary.
    fun earlierScenes() {
        openScene()
        for (number in 1..13) {
            compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("earlier-$number"))
            compose.onNodeWithTag("earlier-$number").assertIsDisplayed()
        }
        compose.onNodeWithText("What happened in Scene 13.", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithTag("earlier-13").performClick()
        compose.onNodeWithText("What happened in Scene 13.", useUnmergedTree = true).assertExists()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Hermione looks up."))
        compose.onNodeWithText("Hermione looks up.").assertIsDisplayed()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("ROOPESH"))
        compose.onNodeWithText("ROOPESH").assertIsDisplayed()
    }

    // WHEN the player taps Copy on the latest Reply
    // THEN the Reply's text is on the clipboard
    fun copyReply() {
        openScene()
        compose.onNodeWithText("Copy").assertIsDisplayed().performClick()
        compose.runOnIdle {
            val context = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
            val clipboard = context.getSystemService(android.content.ClipboardManager::class.java)
            assertEquals("She smiles.", clipboard.primaryClip?.getItemAt(0)?.text?.toString())
        }
    }


    // GIVEN the Actor's model fails while writing a Reply
    // THEN the Scene shows that the Reply failed, with Retry and another model
    // AND the player's Move is still there
    // Another model comes with the Models screen.
    fun failedReply() {
        link.current.value = link.current.value.copy(turn = TurnState(kind = TurnStateKind.Failed,
            reason = "The Actor is unavailable", traceID = "trace-failure"))
        openScene()
        compose.preview("SceneFailed")
        compose.onNodeWithText("The Reply could not be written").assertIsDisplayed()
        compose.onNodeWithText("The Actor is unavailable").assertIsDisplayed()
        compose.onNodeWithText("Trace trace-failure").assertIsDisplayed()
        compose.onNodeWithTag("send-move").assertIsNotEnabled()
        compose.onNodeWithText("Retry the Reply first").assertIsDisplayed()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("I sit beside her."))
        compose.onNodeWithText("I sit beside her.").assertIsDisplayed()
        compose.onNodeWithTag("composer").performTextInput("Next Move")
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Retry"))
        compose.onNodeWithText("Retry").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(1, link.retries); assertTrue(link.moves.isEmpty()) }
        compose.onNodeWithTag("composer").assertTextContains("Next Move")
    }

}
