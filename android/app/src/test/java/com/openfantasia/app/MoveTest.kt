package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class MoveTest {
    // GIVEN a Reply is still being written
    // WHEN the phone sends another Move
    // THEN the Mac refuses it with a reason and a trace id, and the app shows the reason
    @Test fun `mac-link › Every request is answered or refused with a reason › A refused Move`() = runBlocking {
        MacServer().use { mac ->
            mac.enqueue(MockResponse().setResponseCode(409).setBody(
                """{"error":{"code":"busy","message":"A Reply is still being written","trace_id":"busy-trace"}}"""))
            val error = runCatching { mac.client.move("story", MoveRequest(after = "opening", text = "I wait.")) }.exceptionOrNull() as LinkFailure
            assertEquals("A Reply is still being written", error.reason)
            assertEquals("busy-trace", error.traceID)
            val request = mac.server.takeRequest()
            assertEquals("/stories/story/moves", request.path)
            assertEquals("POST", request.method)
            assertEquals("""{"after":"opening","text":"I wait."}""", request.body.readUtf8())
            assertEquals("Bearer secret", request.getHeader("Authorization"))
            assertEquals("2", request.getHeader("Fantasia-Contract"))
        }
    }
}
