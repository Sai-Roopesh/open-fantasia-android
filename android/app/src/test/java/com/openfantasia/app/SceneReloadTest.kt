package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.encodeToString
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.*
import org.junit.Test

class SceneReloadTest {
    // WHEN a Reply brings the Scene to its close
    // THEN the Day View opens after it
    @Test fun `scenes › A Scene ends in one of three ways › The Story closes a Scene`() = runBlocking {
        MacServer().use { mac ->
            val snapshot = sceneFixture().copy(dayView = FakeFantasiaLink.dayView(), focus = null, linger = false,
                headEntryID = "closed", seq = 5, lastEventID = "5")
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("5", StoryEvent(kind = StoryEventKind.SceneClosed, seq = 5, dayView = snapshot.dayView))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }
                .follow(sceneFixture()).first { it.dayView != null } }
            assertEquals(snapshot, view)
            assertEquals("/stories/story/events", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    @Test fun `World moved reloads Meanwhile without changing the Path head`() = runBlocking {
        MacServer().use { mac ->
            val initial = sceneFixture().copy(dayView = FakeFantasiaLink.dayView().copy(world = World.MovingOn),
                headEntryID = "closed", seq = 4, lastEventID = "4")
            val snapshot = initial.copy(seq = 6, lastEventID = "6", dayView = initial.dayView!!.copy(world = World.Ready,
                meanwhile = listOf(MeanwhileItem(how = How.Rumour, text = "Lavender brings a rumour to breakfast."))))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("6", StoryEvent(kind = StoryEventKind.WorldMoved, seq = 6))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }.follow(initial).first() }
            assertEquals(snapshot, view)
            assertEquals("closed", view.headEntryID)
            assertEquals("/stories/story/events", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    @Test fun `World failed reloads the reason and trace even at the same sequence`() = runBlocking {
        MacServer().use { mac ->
            val initial = sceneFixture().copy(dayView = FakeFantasiaLink.dayView().copy(world = World.MovingOn),
                headEntryID = "closed", seq = 4, lastEventID = "4")
            val snapshot = initial.copy(dayView = initial.dayView!!.copy(world = World.Failed,
                failure = WorldFailure(reason = "The Weaver is unavailable", traceID = "world-trace")))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("4.world_failed", StoryEvent(kind = StoryEventKind.WorldFailed, seq = 4,
                    reason = "The Weaver is unavailable", traceID = "world-trace"))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }.follow(initial).first() }
            assertEquals(snapshot, view)
            assertEquals("/stories/story/events", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    // GIVEN a Scene in the Gryffindor common room
    // WHEN the Move is "I go to my room; Harry, Ron and Neville are playing a board game"
    // THEN a new Scene opens in the dormitory with its title card, and the Reply plays it
    // AND no Day View appears
    @Test fun `scenes › A Scene ends in one of three ways › Walking out of a Scene`() = runBlocking {
        MacServer().use { mac ->
            val move = Passage(entryID = "walk", text = "I go to my room; Harry, Ron and Neville are playing a board game")
            val card = sceneFixture().scene.copy(number = 15, title = "A board game", place = "Dormitory",
                people = listOf("Harry", "Ron", "Neville").map { PersonCard(name = it, portraitURL = null) })
            val snapshot = sceneFixture().copy(scene = card, exchanges = listOf(Exchange(move = move, reply = null)),
                seq = 6, lastEventID = "6.2", headEntryID = "writer", focus = null, linger = false, dayView = null,
                turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "Harry and Ron ", traceID = "turn"))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("4", StoryEvent(kind = StoryEventKind.Move, seq = 4, passage = move)) +
                eventData("5", StoryEvent(kind = StoryEventKind.SceneOpened, seq = 5, scene = card, focus = null)) +
                eventData(null, StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 6, traceID = "turn")) +
                eventData("6.2", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 6, text = "and Ron ")) +
                eventData("6.3", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 6, text = "look up."))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val views = mutableListOf<SceneView>()
            withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }.follow(sceneFixture())
                .first { views += it; it.turn.textSoFar?.endsWith("look up.") == true } }
            val opened = views.first { it.scene.number == 15L }
            assertEquals(snapshot, opened)
            val view = views.last()
            assertEquals("A board game", view.scene.title)
            assertEquals("Dormitory", view.scene.place)
            assertEquals(move, view.exchanges.first().move)
            assertNull(view.exchanges.first().reply)
            assertEquals(TurnStateKind.Writing, view.turn.kind)
            assertEquals("Harry and Ron look up.", view.turn.textSoFar)
            assertNull(view.dayView)
            assertEquals("6.3", view.lastEventID)
            assertEquals("/stories/story/events", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    @Test fun `Focus and Linger events reload the head before the next Move`() = runBlocking {
        for (kind in listOf(StoryEventKind.FocusSet, StoryEventKind.LingerSet)) MacServer().use { mac ->
            val snapshot = sceneFixture().copy(focus = "Hermione", linger = true, headEntryID = "control", seq = 5, lastEventID = "5")
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("5", StoryEvent(kind = kind, seq = 5, focus = "Hermione", linger = true))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }
                .follow(sceneFixture()).first() }
            assertEquals(snapshot, view)
            assertEquals("/stories/story/events", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    @Test fun `Redo reloads away the old Reply and streams its replacement`() = runBlocking {
        MacServer().use { mac ->
            val move = Passage(entryID = "move", text = "I wait.")
            val initial = sceneFixture().copy(exchanges = listOf(Exchange(move = move,
                reply = Passage(entryID = "old", text = "She smiles."))), headEntryID = "old", seq = 3, lastEventID = "3")
            val snapshot = initial.copy(exchanges = listOf(Exchange(move = move, reply = null)), headEntryID = "writer", seq = 5, lastEventID = "5.1",
                turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "She "))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("4", StoryEvent(kind = StoryEventKind.Redo, seq = 4)) +
                eventData("5.2", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 5, text = "looks up."))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }
                .follow(initial).first { it.turn.textSoFar?.endsWith("looks up.") == true } }
            assertEquals(listOf(Exchange(move = move, reply = null)), view.exchanges)
            assertEquals("She looks up.", view.turn.textSoFar)
            assertEquals("writer", view.headEntryID)
            assertEquals("5.2", view.lastEventID)
            assertEquals("/stories/story/events", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    @Test fun `an interrupted Scene reload does not advance the stream cursor`() = runBlocking {
        MacServer().use { mac ->
            val move = Passage(entryID = "move", text = "I wait.")
            val initial = sceneFixture().copy(exchanges = listOf(Exchange(move = move,
                reply = Passage(entryID = "old", text = "She smiles."))), headEntryID = "old", seq = 3, lastEventID = "3")
            val snapshot = initial.copy(exchanges = listOf(Exchange(move = move, reply = null)), headEntryID = "writer", seq = 5, lastEventID = "5.1",
                turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "She "))
            val redo = eventData("4", StoryEvent(kind = StoryEventKind.Redo, seq = 4))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(redo))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)).setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(redo +
                eventData("5.2", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 5, text = "looks up."))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }
                .follow(initial).first { it.turn.textSoFar?.endsWith("looks up.") == true } }
            assertEquals("She looks up.", view.turn.textSoFar)
            assertEquals(listOf(Exchange(move = move, reply = null)), view.exchanges)
            assertEquals("3", mac.server.takeRequest().getHeader("Last-Event-ID"))
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
            assertEquals("3", mac.server.takeRequest().getHeader("Last-Event-ID"))
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }
}
