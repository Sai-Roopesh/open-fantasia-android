package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class PastSceneLinkTest {
    private fun connection(mac: MacServer): MacConnection {
        val paired = PairedMac(hostID = "mac", hostName = "Mac", fingerprint = mac.fingerprint,
            deviceToken = "secret", lastAddress = MacAddress("127.0.0.1", mac.server.port))
        val store = object : PairingStore {
            override fun read() = paired
            override fun write(mac: PairedMac) = Unit
        }
        return MacConnection(store, MacDiscovery { error("The saved address works") }, "Phone")
    }

    @Test fun `reading a past Scene uses an authenticated contract 4 GET and decodes every field`() = runBlocking {
        MacServer().use { mac ->
            val expected = FakeFantasiaLink.pastSceneFixture()
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(expected)))
            assertEquals(expected, connection(mac).pastScene("story/other", 13))
            val request = mac.server.takeRequest()
            assertEquals("GET", request.method)
            assertEquals("/stories/story%2Fother/scenes/13", request.path)
            assertEquals("Bearer secret", request.getHeader("Authorization"))
            assertEquals("4", request.getHeader("Fantasia-Contract"))
            assertEquals(0L, request.bodySize)
            assertEquals(1, mac.server.requestCount)
        }
    }

    @Test fun `a missing past Scene preserves the Mac reason and trace without retrying`() = runBlocking {
        MacServer().use { mac ->
            val link = connection(mac)
            mac.enqueue(MockResponse().setResponseCode(404).setBody(linkJson.encodeToString(ErrorBody(
                error = ErrorDetail(code = ErrorCode.NotFound, message = "There is no Scene 13 on this Path", traceID = "missing-scene")))))
            val failure = runCatching { link.pastScene("story", 13) }.exceptionOrNull() as LinkFailure
            assertEquals("There is no Scene 13 on this Path", failure.reason)
            assertEquals("missing-scene", failure.traceID)
            assertFalse(failure.versionMismatch)
            assertEquals("/stories/story/scenes/13", mac.server.takeRequest().path)
            assertEquals(1, mac.server.requestCount)
        }
    }
}
