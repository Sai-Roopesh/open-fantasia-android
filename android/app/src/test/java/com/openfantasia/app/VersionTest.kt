package com.openfantasia.app

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class VersionTest {
    // GIVEN the Mac speaks a newer contract than the app
    // WHEN the app connects
    // THEN the app says it needs updating to match the Mac
    @Test fun `mac-link › The phone and the Mac agree on what they speak › An old app`() = runBlocking {
        MacServer().use { mac ->
            for ((status, body) in listOf(
                426 to "a newer contract cannot be decoded",
                409 to """{"error":{"code":"version_mismatch","message":"newer","trace_id":"trace-version"}}"""
            )) {
                mac.server.enqueue(MockResponse().setResponseCode(status).setBody(body))
                val error = runCatching { mac.client.scene("story") }.exceptionOrNull() as LinkFailure
                assertEquals("This app needs updating to match your Mac", error.reason)
                assertTrue(error.versionMismatch)
                if (status == 409) assertEquals("trace-version", error.traceID)
                val request = mac.server.takeRequest()
                assertEquals("/stories/story/scene", request.path)
                assertEquals("Bearer secret", request.getHeader("Authorization"))
                assertEquals("1", request.getHeader("Fantasia-Contract"))
            }
        }
    }
}
