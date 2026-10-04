package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class ReconnectionTest {
    // GIVEN the connection drops while a Reply is being written and returns after the Reply is finished
    // THEN the phone shows the whole finished Reply and everything after it, with nothing missing or repeated
    @Test fun `mac-link › A dropped connection loses nothing › Wi-Fi drops mid-Reply`() = runBlocking {
        MacServer().use { mac ->
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("2", StoryEvent(kind = StoryEventKind.Move, passage = Passage(entryID = "move", text = "I smile."), seq = 2)) +
                eventData(null, StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 2)) +
                eventData("2.1", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 2, text = "She "))
            ))
            val reply = StoryEvent(kind = StoryEventKind.Reply, passage = Passage(entryID = "reply", text = "She smiles back."), seq = 3)
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("2.1", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 2, text = "She ")) +
                eventData("3", reply) + eventData("3", reply) +
                eventData("4", StoryEvent(kind = StoryEventKind.Move, passage = Passage(entryID = "next", text = "I wait."), seq = 4)) +
                eventData("5", StoryEvent(kind = StoryEventKind.Reply, passage = Passage(entryID = "last", text = "The fire settles."), seq = 5))
            ))
            val view = withTimeout(5000) { StoryStream { mac.client }.follow(sceneFixture()).first { it.seq == 5L } }
            assertEquals(listOf("opening", "reply", "last"), view.exchanges.mapNotNull { it.reply?.entryID })
            assertEquals(listOf("move", "next"), view.exchanges.mapNotNull { it.move?.entryID })
            assertEquals("She smiles back.", view.exchanges[1].reply?.text)
            assertEquals("last", view.headEntryID)
            assertEquals(TurnStateKind.Idle, view.turn.kind)
            assertEquals("1", mac.server.takeRequest().getHeader("Last-Event-ID"))
            assertEquals("2.1", mac.server.takeRequest().getHeader("Last-Event-ID"))
        }
    }
}
