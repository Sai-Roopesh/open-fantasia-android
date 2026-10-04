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
            server.enqueue(MockResponse().setBody("""{"stories":[{"id":"story","title":"The Malfoy Problem","standing":"Scene 14 · After curfew","updated_at":"now"}],"trace_id":"list"}"""))
            val paired = LinkClient(server.url("/"), fingerprint, pair.deviceToken)
            assertEquals("The Malfoy Problem", paired.stories().stories.single().title)
            assertEquals("Bearer secret", server.takeRequest().getHeader("Authorization"))
            server.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            val refused = runCatching { LinkClient(server.url("/"), "00".repeat(32), "secret").stories() }
            assertTrue("A different certificate must be refused", refused.isFailure)
        } finally { server.shutdown() }
    }
}
