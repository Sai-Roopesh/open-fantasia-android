package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class ReplyFailureTest {
    // GIVEN the Actor's model fails while writing a Reply
    // THEN the Scene shows that the Reply failed, with Retry and another model
    // AND the player's Move is still there
    @Test fun `presence › Nothing fails silently › A model is down`() = runBlocking {
        val projection = SceneProjection(sceneFixture())
        projection.apply(StoryEventEnvelope("2", StoryEvent(kind = StoryEventKind.Move, seq = 2, passage = Passage(entryID = "move", text = "I wait."))))
        projection.apply(StoryEventEnvelope(null, StoryEvent(kind = StoryEventKind.ReplyFailed, seq = 2, reason = "The Actor is unavailable", traceID = "failure")))
        assertEquals("I wait.", projection.view.exchanges.last().move?.text)
        assertEquals("move", projection.view.headEntryID)
        assertEquals("The Actor is unavailable", projection.view.turn.reason)
        assertEquals("failure", projection.view.turn.traceID)
        MacServer().use { mac ->
            mac.enqueue(MockResponse().setBody("""{"move_entry_id":"move","trace_id":"retry"}"""))
            assertEquals("move", mac.client.retry("story").moveEntryID)
            val request = mac.server.takeRequest()
            assertEquals("/stories/story/retry", request.path)
            assertEquals("POST", request.method)
            assertEquals("Bearer secret", request.getHeader("Authorization"))
            assertEquals(com.openfantasia.protocol.CONTRACT_VERSION.toString(), request.getHeader("Fantasia-Contract"))
        }
    }
}
