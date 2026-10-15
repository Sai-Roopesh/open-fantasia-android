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
    // This also checks catching up while the Reply is still under way: the start sent again does not set back its step.
    @Test fun `mac-link › A dropped connection loses nothing › Wi-Fi drops mid-Reply`() = runBlocking {
        MacServer().use { mac ->
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("2", StoryEvent(kind = StoryEventKind.Move, seq = 2, passage = Passage(entryID = "move", text = "I smile."))) +
                eventData(null, StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 2, turnStep = TurnStep.LookingBack)) +
                eventData(null, StoryEvent(kind = StoryEventKind.TurnStep, seq = 2, turnStep = TurnStep.Writing))
            ))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("2", StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 2, turnStep = TurnStep.LookingBack)) +
                eventData(null, StoryEvent(kind = StoryEventKind.TurnStep, seq = 2, turnStep = TurnStep.Checking)) +
                eventData("3", StoryEvent(kind = StoryEventKind.Reply, seq = 3, passage = Passage(entryID = "reply", text = "She smiles back.")))
            ))
            val views = mutableListOf<SceneView>()
            val view = withTimeout(5000) {
                StoryStream { mac.client }.follow(sceneFixture()).first { views += it; it.seq == 3L }
            }
            assertEquals(listOf(TurnStateKind.Idle, TurnStateKind.LookingBack, TurnStateKind.Writing, TurnStateKind.Checking, TurnStateKind.Idle),
                views.map { it.turn.kind })
            assertEquals("She smiles back.", view.exchanges.last().reply?.text)
            assertEquals(2, view.exchanges.size)
            assertEquals("2", mac.server.takeRequest().let { mac.server.takeRequest().getHeader("Last-Event-ID") })
        }
    }
}
