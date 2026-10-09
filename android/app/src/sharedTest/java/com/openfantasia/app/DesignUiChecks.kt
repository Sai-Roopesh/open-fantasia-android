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
        // "2 h ago", or "yesterday" when two hours ago was before midnight: the label is the Home's own, for the fixture's time.
        val first = playedAgo(java.time.Instant.now().minusSeconds(7200 + 300).toString())
        compose.onAllNodesWithText(first)[0].assertIsDisplayed()
        compose.onNodeWithText("The coast").assertIsDisplayed()
        compose.onNodeWithText("Sunday 7:40 am · choosing where to go").assertIsDisplayed()
        compose.onNodeWithText("3 Scenes played").assertIsDisplayed()
        compose.onAllNodesWithText("yesterday").assertCountEquals(if (first == "yesterday") 2 else 1)
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
    // THEN the title card shows "After curfew", "Common room", "Friday 9:40 pm" and Hermione's Portrait
    fun titleCard() {
        link.current.value = link.current.value.copy(scene = link.current.value.scene.copy(
            people = listOf(PersonCard(name = "Hermione Granger", portraitURL = null))), focus = "Hermione Granger")
        openScene()
        compose.onNodeWithText("She smiles.").assertIsDisplayed()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("scene-title"))
        compose.preview("Scene")
        compose.onNodeWithText("SCENE 14").assertIsDisplayed()
        compose.onNodeWithText("After curfew").assertIsDisplayed()
        compose.onNodeWithText("Common room · Friday 9:40 pm").assertIsDisplayed()
        compose.onNodeWithContentDescription("Hermione Granger's Portrait").assertIsDisplayed().assertIsSelected()
        compose.onNodeWithText("Hermione").assertIsDisplayed()
        compose.onNodeWithText("Focus on Hermione · tap a Portrait to change").assertIsDisplayed()
        compose.onNodeWithTag("portrait-Hermione Granger", useUnmergedTree = true).assertWidthIsEqualTo(56.dp).assertHeightIsEqualTo(56.dp)
        compose.onNodeWithTag("composer").assertHeightIsEqualTo(70.dp).assertIsEnabled()
        compose.onNodeWithText("What does Roopesh do?").assertIsDisplayed()
        compose.onNodeWithText("Linger").assertIsDisplayed()
        compose.onNodeWithText("End scene").assertIsDisplayed()
    }

    // Earlier rows stay folded; contract 4 opens the full Scene, then returns to the current passages.
    fun earlierScenes() {
        openScene()
        for (number in 1..13) {
            compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("earlier-$number"))
            compose.onNodeWithTag("earlier-$number").assertIsDisplayed()
        }
        compose.onNodeWithText("He got Hermione out before the club came down.", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithTag("earlier-13").performClick()
        compose.onNodeWithText("He got Hermione out before the club came down.", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("Scene 13 · The troll").assertIsDisplayed()
        compose.onNodeWithContentDescription("Back to Scene 14").performClick()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Hermione looks up."))
        compose.onNodeWithText("Hermione looks up.").assertIsDisplayed()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("ROOPESH"))
        compose.onNodeWithText("ROOPESH").assertIsDisplayed()
    }

    // A Reply reads as prose: the words the Actor marks with asterisks are in italics, and no asterisk shows.
    fun italicReply() {
        link.current.value = link.current.value.copy(headEntryID = "opening", exchanges = listOf(
            Exchange(reply = Passage(entryID = "opening", text = "A chai seller comes down the aisle, *chai, chai garam*, and she says *fine*."))))
        openScene()
        val reply = compose.onNodeWithText("A chai seller comes down the aisle, chai, chai garam, and she says fine.").assertIsDisplayed()
        val text = reply.fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.Text].single()
        val italic = text.spanStyles.filter { it.item.fontStyle == androidx.compose.ui.text.font.FontStyle.Italic }
            .map { text.text.substring(it.start, it.end) }
        assertEquals(listOf("chai, chai garam", "fine"), italic)
    }

    // A Scene without Focus says how to put someone in it: Focus is set with words, not by guessing at a Portrait.
    fun noFocus() {
        openScene()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasTestTag("scene-title"))
        compose.onNodeWithContentDescription("Hermione's Portrait").assertIsNotSelected()
        compose.onNodeWithText("Tap a Portrait to focus on someone").assertIsDisplayed()
    }

    // WHEN the player taps Copy on the latest Reply
    // THEN the Reply's text is on the clipboard
    fun copyReply() {
        openScene()
        // The latest Reply's actions, in view without a menu, as drawn in Scene.dc.html.
        val row = { label: String -> compose.onNode(hasText(label) and hasAnyAncestor(hasTestTag("latest-actions"))) }
        for (label in listOf("Copy", "Redo", "Edit", "Try another way")) row(label).assertIsDisplayed()
        compose.preview("LatestReply")
        row("Copy").performClick()
        compose.runOnIdle {
            val context = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
            val clipboard = context.getSystemService(android.content.ClipboardManager::class.java)
            assertEquals("She smiles.", clipboard.primaryClip?.getItemAt(0)?.text?.toString())
        }
    }


    // GIVEN the Actor's model fails while writing a Reply
    // THEN the Scene shows that the Reply failed, with Retry and another model
    // AND the player's Move is still there
    // Another model is checked with the Models screen (ModelsUiChecks).
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
