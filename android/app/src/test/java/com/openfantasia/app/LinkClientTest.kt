package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest

class LinkClientTest {
    // WHEN the player runs the pairing command on the Mac and scans the QR code it shows with the phone
    // THEN the phone lists the Mac's Stories
    @Test fun `mac-link › Pairing happens once, by QR code › First pairing`() = runBlocking {
        val certificate = HeldCertificate.Builder().commonName("Mac").build()
        val server = MockWebServer()
        server.useHttps(HandshakeCertificates.Builder().heldCertificate(certificate).build().sslSocketFactory(), false)
        server.start()
        try {
            val fingerprint = MessageDigest.getInstance("SHA-256").digest(certificate.certificate.encoded)
                .joinToString("") { "%02x".format(it) }
            val client = LinkClient(server.url("/"), fingerprint, null)
            server.enqueue(MockResponse().setBody("""{"device_token":"secret","host_id":"mac","host_name":"Mac","trace_id":"pair"}"""))
            val pair = client.pair(PairRequest(code = "invite", deviceName = "Phone"))
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/pair", request.path)
            assertEquals(CONTRACT_VERSION.toString(), request.getHeader("Fantasia-Contract"))
            assertNull(request.getHeader("Authorization"))
            assertEquals("""{"code":"invite","device_name":"Phone"}""", request.body.readUtf8())
            server.enqueue(MockResponse().setBody("""{"stories":[{"id":"story","title":"The Malfoy Problem","standing":"Scene 14 · After curfew","detail":"Friday 9:40 pm · with Hermione","updated_at":"now"}],"trace_id":"list"}"""))
            val paired = LinkClient(server.url("/"), fingerprint, pair.deviceToken)
            assertEquals("The Malfoy Problem", paired.stories().stories.single().title)
            assertEquals("Bearer secret", server.takeRequest().getHeader("Authorization"))
            server.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            val refused = runCatching { LinkClient(server.url("/"), "00".repeat(32), "secret").stories() }
            assertTrue("A different certificate must be refused", refused.isFailure)
        } finally { server.shutdown() }
    }

    // WHEN the player goes to the hospital wing at 11:00 and writes "I spent the morning in the library reading about life debts"
    // THEN that is what he did, and the Story can draw on it later
    // The Mac takes this body byte for byte (mac-link test "takes a choice the way the phone sends it"): the fields a
    // Skip does not use go as null, which the contract allows for every field a request may leave out.
    @Test fun `day-view › The Gap is the player's, and everything in it goes on without them › Filling the Gap`() = runBlocking {
        MacServer().use { mac ->
            mac.enqueue(MockResponse().setBody("""{"move_entry_id":"move","trace_id":"choose"}"""))
            val accepted = mac.client.choose("story", ChooseRequest(after = "head", kind = ChooseRequestKind.Skip,
                at = "Day 2 18:00", gap = "I ride on to Shimla."))
            assertEquals(TurnAccepted(moveEntryID = "move", traceID = "choose"), accepted)
            val request = mac.server.takeRequest()
            assertEquals("/stories/story/choose", request.path)
            assertEquals("""{"after":"head","at":"Day 2 18:00","gap":"I ride on to Shimla.","happening":null,"kind":"skip","place":null,"who":null}""",
                request.body.readUtf8())
        }
    }

    // The Mac takes each Path command as its routes read them (mac-link tests in host/test/link/paths.test.ts).
    @Test fun `Path commands go to the Mac's Path routes`() = runBlocking {
        MacServer().use { mac ->
            val accepted = """{"head_entry_id":"head","trace_id":"t"}"""
            repeat(6) { mac.enqueue(MockResponse().setBody(accepted)) }
            mac.enqueue(MockResponse().setBody("""{"story_id":"story","rows":[],"clearable":0,"trace_id":"t"}"""))
            mac.client.tryAnotherWay("story", TryAnotherWayRequest(from = null, after = "head"))
            mac.client.rewind("story", RewindRequest(to = "reply", after = "head"))
            mac.client.openPath("story", "p1")
            mac.client.renamePath("story", "p1", RenamePathRequest(name = "The long way"))
            mac.client.deletePath("story", "p1")
            mac.client.clearPaths("story")
            assertEquals(0L, mac.client.paths("story").clearable)
            val sent = List(7) { mac.server.takeRequest() }.map { Triple(it.method, it.path, it.body.readUtf8()) }
            assertEquals(listOf(
                Triple("POST", "/stories/story/paths", """{"after":"head","from":null}"""),
                Triple("POST", "/stories/story/rewind", """{"after":"head","to":"reply"}"""),
                Triple("POST", "/stories/story/paths/p1/open", "{}"),
                Triple("POST", "/stories/story/paths/p1/rename", """{"name":"The long way"}"""),
                Triple("DELETE", "/stories/story/paths/p1", ""),
                Triple("POST", "/stories/story/paths/clear", "{}"),
                Triple("GET", "/stories/story/paths", "")), sent)
        }
    }
}
