package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class DiscoveryTest {
    // GIVEN the Mac's network address changed since pairing
    // WHEN the player opens the app on the same network
    // THEN the phone reaches the Mac without the player entering anything
    @Test fun `mac-link › The phone finds the Mac on the network they share › The Mac's address changes`() = runBlocking {
        MacServer().use { mac ->
            val old = MacAddress("127.0.0.1", 1)
            val found = MacAddress("127.0.0.1", mac.server.port)
            val store = object : PairingStore {
                var paired = PairedMac("mac", "Mac", mac.fingerprint, "secret", old)
                override fun read() = paired
                override fun write(mac: PairedMac) { paired = mac }
            }
            val connection = MacConnection(store, MacDiscovery { id ->
                assertEquals("mac", id)
                listOf(found)
            }, "Phone")
            mac.server.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            assertEquals("list", connection.stories().traceID)
            assertEquals(found, store.read().lastAddress)
            mac.server.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"fallback"}"""))
            val fallback = MacConnection(store, MacDiscovery { emptyList() }, "Phone")
            assertEquals("fallback", fallback.stories().traceID)
        }
    }
}
