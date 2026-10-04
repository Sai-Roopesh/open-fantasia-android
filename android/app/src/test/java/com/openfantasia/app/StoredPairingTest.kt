package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.runBlocking
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class StoredPairingTest {
    // WHEN the player runs the pairing command on the Mac and scans the QR code it shows with the phone
    // THEN the phone lists the Mac's Stories
    @Test fun `mac-link › Pairing happens once, by QR code › First pairing`() = runBlocking {
        MacServer().use { mac ->
            val store = object : PairingStore {
                var value: PairedMac? = null
                override fun read() = value
                override fun write(mac: PairedMac) { value = mac }
            }
            val invite = PairingInvite(addresses = listOf("127.0.0.1"), code = "code", contract = 2, fingerprint = mac.fingerprint, hostID = "mac", hostName = "Mac", port = mac.server.port.toLong())
            val link = MacConnection(store, MacDiscovery { emptyList() }, "Phone")
            mac.enqueue(MockResponse().setBody("""{"host_id":"mac","host_name":"Mac","device_token":"token","trace_id":"pair"}"""))
            link.pair(invite)
            val paired = requireNotNull(store.read())
            assertEquals("mac", paired.hostID)
            assertEquals("Mac", paired.hostName)
            assertEquals(mac.fingerprint, paired.fingerprint)
            assertEquals("token", paired.deviceToken)
            assertEquals(MacAddress("127.0.0.1", mac.server.port), paired.lastAddress)
            mac.server.takeRequest()
            val reopened = MacConnection(store, MacDiscovery { emptyList() }, "Phone")
            assertTrue(reopened.isPaired)
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            assertEquals("list", reopened.stories().traceID)
            mac.server.takeRequest()
            val portrait = requireNotNull(reopened.portrait("/portraits/hermione.jpg"))
            mac.enqueue(MockResponse().setBody("portrait"))
            portrait.http.newCall(Request.Builder().url(portrait.url).build()).execute().close()
            val request = mac.server.takeRequest()
            assertEquals("/portraits/hermione.jpg", request.path)
            assertEquals("Bearer token", request.getHeader("Authorization"))
            assertEquals("2", request.getHeader("Fantasia-Contract"))
            assertNull(reopened.portrait("http://127.0.0.1/portrait.jpg"))
        }
    }
}
