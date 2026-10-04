package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.openfantasia.protocol.PairingInvite
import kotlinx.serialization.encodeToString
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class PairScreenTest {
    @get:Rule val compose = createComposeRule()

    // WHEN the player runs the pairing command on the Mac and scans the QR code it shows with the phone
    // THEN the phone lists the Mac's Stories
    @Scenario("mac-link › Pairing happens once, by QR code › First pairing")
    @Test fun firstPairing() {
        val link = FakeFantasiaLink(false)
        val invite = PairingInvite(listOf("192.168.1.5"), "invite", 1, "ab".repeat(32), "mac", "Mac", 7443)
        compose.setContent { FantasiaApp(FantasiaModel(link), PairingScanner { linkJson.encodeToString(invite) }) }
        compose.onNodeWithText("Scan Mac QR code").performClick()
        compose.waitUntil(5000) { link.pairedInvite != null }
        compose.onNodeWithText("The Malfoy Problem").assertIsDisplayed()
        assertEquals(invite, link.pairedInvite)
    }
}
