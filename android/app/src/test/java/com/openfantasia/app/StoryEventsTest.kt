package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.encodeToString
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

fun eventData(id: String?, event: StoryEvent): String =
    (id?.let { "id: $it\n" } ?: "") + "data: ${linkJson.encodeToString(event)}\n\n"

class StoryEventsTest {
    // WHEN the Mac starts writing a Reply
    // THEN the phone shows its words as they are written, in order
    // A Reply's words now arrive whole, once the Editor has checked them (the-storys-mind; openspec presence: A Reply
    // arrives checked and whole): what reaches the phone live and in order is the turn's steps, then the Reply.
    @Test fun `mac-link › A Story's changes reach the phone live and in order › A Reply arrives live`() = runBlocking {
        MacServer().use { mac ->
            val opened = sceneFixture().scene.copy(number = 15, title = "By the fire")
            val events = listOf(
                "2" to StoryEvent(kind = StoryEventKind.SceneOpened, scene = opened, passage = Passage(entryID = "scene", text = "The fire crackles."), seq = 2),
                "3" to StoryEvent(kind = StoryEventKind.Move, passage = Passage(entryID = "move", text = "I sit beside her."), seq = 3),
                null to StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 3, turnStep = TurnStep.LookingBack, traceID = "turn"),
                null to StoryEvent(kind = StoryEventKind.TurnStep, seq = 3, turnStep = TurnStep.Writing, traceID = "turn"),
                null to StoryEvent(kind = StoryEventKind.TurnStep, seq = 3, turnStep = TurnStep.Checking, traceID = "turn"),
                "4" to StoryEvent(kind = StoryEventKind.Reply, passage = Passage(entryID = "reply", text = "She smiles."), seq = 4)
            )
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream")
                .setBody(events.joinToString("") { eventData(it.first, it.second) }))
            val projection = SceneProjection(sceneFixture())
            val views = withTimeout(5000) { mac.client.events("story", "1").toList().map { projection.apply(it) } }
            assertEquals(listOf(TurnStateKind.Idle, TurnStateKind.Idle, TurnStateKind.LookingBack, TurnStateKind.Writing, TurnStateKind.Checking, TurnStateKind.Idle),
                views.map { it.turn.kind })
            assertTrue("No word of the Reply arrives before it is whole", views.dropLast(1).none { view -> view.exchanges.any { it.reply?.text == "She smiles." } })
            assertEquals("reply", projection.view.headEntryID)
            assertEquals("By the fire", projection.view.scene.title)
            assertEquals("The fire crackles.", projection.view.exchanges.first().reply?.text)
            assertEquals("She smiles.", projection.view.exchanges.last().reply?.text)
            assertEquals(2, projection.view.exchanges.size)
            val request = mac.server.takeRequest()
            assertEquals("/stories/story/events", request.path)
            assertEquals("1", request.getHeader("Last-Event-ID"))
            assertEquals("Bearer secret", request.getHeader("Authorization"))
            assertEquals(com.openfantasia.protocol.CONTRACT_VERSION.toString(), request.getHeader("Fantasia-Contract"))
        }
    }
}
