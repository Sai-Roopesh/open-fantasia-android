package com.openfantasia.app

import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class SseVersionTest {
    // GIVEN the Mac speaks a newer contract than the app
    // WHEN the app connects
    // THEN the app says it needs updating to match the Mac
    @Test fun `mac-link › The phone and the Mac agree on what they speak › An old app`() = runBlocking {
        MacServer().use { mac ->
            mac.server.enqueue(MockResponse().setResponseCode(426).setBody(
                """{"error":{"code":"version_mismatch","message":"newer","trace_id":"stream-version"}}"""))
            val error = runCatching {
                withTimeout(5000) { StoryStream { mac.client }.follow(sceneFixture()).toList() }
            }.exceptionOrNull() as LinkFailure
            assertEquals(UPDATE_REQUIRED, error.reason)
            assertEquals("stream-version", error.traceID)
            assertTrue(error.versionMismatch)
            assertEquals(1, mac.server.requestCount)
        }
    }
}
