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
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            assertEquals("list", connection.stories().traceID)
            assertEquals(found, store.read().lastAddress)
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"fallback"}"""))
            val fallback = MacConnection(store, MacDiscovery { emptyList() }, "Phone")
            assertEquals("fallback", fallback.stories().traceID)
        }
    }

    private class Paired(var paired: PairedMac?) : PairingStore {
        override fun read() = paired
        override fun write(mac: PairedMac) { paired = mac }
    }

    // GIVEN the phone was paired with the Mac at home
    // WHEN both are on a hotel's Wi-Fi
    // THEN the phone reaches the Mac without the player entering anything
    @Test fun `presence › The phone finds the Mac on any shared network › A new network`() = runBlocking {
        MacServer().use { mac ->
            val home = MacAddress("127.0.0.1", 1)
            val hotel = MacAddress("127.0.0.1", mac.server.port)
            val store = Paired(PairedMac("mac", "Mac", mac.fingerprint, "secret", home, knownAddresses = listOf(home)))
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"hotel"}"""))
            assertEquals("hotel", MacConnection(store, MacDiscovery { listOf(hotel) }, "Phone").stories().traceID)
            assertEquals(hotel, store.read()!!.lastAddress)
            assertEquals(listOf(hotel, home), store.read()!!.knownAddresses)
        }
    }

    // GIVEN the Mac gave the phone its address on a private network both are on, when they paired
    // WHEN the Wi-Fi they share does not let them see each other
    // THEN the phone reaches the Mac at that address without the player entering anything
    @Test fun `presence › The phone finds the Mac on any shared network › A network that keeps them apart`() = runBlocking {
        MacServer().use { mac ->
            val wifi = MacAddress("127.0.0.1", 1)
            val tailscale = MacAddress("127.0.0.1", mac.server.port)
            val store = Paired(null)
            val connection = MacConnection(store, MacDiscovery { emptyList() }, "Phone")
            mac.enqueue(MockResponse().setBody("""{"device_token":"secret","host_id":"mac","host_name":"Mac","trace_id":"pair"}"""))
            connection.pair(PairingInvite(code = "invite", hostID = "mac", hostName = "Mac", addresses = listOf(tailscale.host),
                port = mac.server.port.toLong(), fingerprint = mac.fingerprint, contract = CONTRACT_VERSION.toLong()))
            assertEquals(listOf(tailscale), store.read()!!.knownAddresses)
            // The Wi-Fi address stops answering, discovery finds nothing, and the private one still does.
            store.write(store.read()!!.copy(lastAddress = wifi, knownAddresses = listOf(wifi, tailscale)))
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"through"}"""))
            assertEquals("through", MacConnection(store, MacDiscovery { emptyList() }, "Phone").stories().traceID)
            assertEquals(tailscale, store.read()!!.lastAddress)
        }
    }

    @Test fun `a pairing stored before every address was kept still reads`() {
        val old = """{"hostID":"mac","hostName":"Mac","fingerprint":"ab","deviceToken":"secret","lastAddress":{"host":"10.0.0.2","port":8765}}"""
        val read = linkJson.decodeFromString(PairedMac.serializer(), old)
        assertEquals(emptyList<MacAddress>(), read.knownAddresses)
        assertEquals(MacAddress("10.0.0.2", 8765), read.lastAddress)
    }
}
