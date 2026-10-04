package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class ReplySnapshotTest {
    // GIVEN the connection drops while a Reply is being written and returns after the Reply is finished
    // THEN the phone shows the whole finished Reply and everything after it, with nothing missing or repeated
    // This also checks catching up while the Reply is still being written.
    @Test fun `mac-link › A dropped connection loses nothing › Wi-Fi drops mid-Reply`() = runBlocking {
        MacServer().use { mac ->
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("2", StoryEvent(kind = StoryEventKind.Move, seq = 2, passage = Passage(entryID = "move", text = "I smile."))) +
                eventData(null, StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 2)) +
                eventData("2.9", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 2, text = "She "))
            ))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("2", StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 2)) +
                eventData("2.10", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 2, text = "She smiles")) +
                eventData("2.11", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 2, text = " back."))
            ))
            val view = withTimeout(5000) {
                StoryStream { mac.client }.follow(sceneFixture()).first { it.turn.textSoFar == "She smiles back." }
            }
            assertEquals("She smiles back.", view.turn.textSoFar)
            assertEquals(2, view.exchanges.size)
            assertEquals("2.9", mac.server.takeRequest().let { mac.server.takeRequest().getHeader("Last-Event-ID") })
        }
    }
}
