package com.openfantasia.app

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class ResponseVersionTest {
    // GIVEN the Mac speaks a newer contract than the app
    // WHEN the app connects
    // THEN the app says it needs updating to match the Mac
    @Test fun `mac-link › The phone and the Mac agree on what they speak › An old app`() = runBlocking {
        MacServer().use { mac ->
            mac.server.enqueue(MockResponse().setHeader("Fantasia-Contract", "2")
                .setBody("""{"stories":[],"trace_id":"version"}"""))
            val error = runCatching { mac.client.stories() }.exceptionOrNull() as LinkFailure
            assertEquals(UPDATE_REQUIRED, error.reason)
            assertEquals("version", error.traceID)
            assertTrue(error.versionMismatch)
        }
    }
}
