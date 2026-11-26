package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class DiscoveryScreenTest {
    @get:Rule val compose = createComposeRule()

    // GIVEN the Mac's network address changed since pairing
    // WHEN the player opens the app on the same network
    // THEN the phone reaches the Mac without the player entering anything
    @Scenario("mac-link › The phone finds the Mac on the network they share › The Mac's address changes")
    @Test fun changedAddress() {
        val old = MacAddress("192.168.1.3", 7443)
        val found = MacAddress("192.168.2.7", 7443)
        val mac = PairedMac("mac", "Mac", "ab".repeat(32), "token", old)
        val finder = MacFinder(MacDiscovery { id -> assertEquals("mac", id); listOf(found) })
        val fake = FakeFantasiaLink()
        val link = object : FantasiaLink by fake {
            override suspend fun stories() = fake.stories().also {
                assertEquals(found, finder.addresses(mac).first())
            }
        }
        val model = FantasiaModel(link)
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithText("The Malfoy Problem").assertIsDisplayed()
        assertEquals(listOf(old), runBlocking { MacFinder(MacDiscovery { emptyList() }).addresses(mac) })
    }
}
