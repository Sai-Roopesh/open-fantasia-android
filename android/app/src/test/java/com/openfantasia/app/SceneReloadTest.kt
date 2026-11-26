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
    // A Scene closed on the Mac arrives as an event; the phone reads the Scene again and shows its Day View.
    @Test fun `follows a closed Scene into its Day View`() = runBlocking {
        MacServer().use { mac ->
            val snapshot = sceneFixture().copy(dayView = FakeFantasiaLink.dayView(), focus = null, linger = false,
                headEntryID = "closed", seq = 5, lastEventID = "5")
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("5", StoryEvent(kind = StoryEventKind.SceneClosed, seq = 5, dayView = snapshot.dayView))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }
                .follow(sceneFixture()).first { it.dayView != null } }
            assertEquals(snapshot, view)
            assertEquals("/stories/story/events?path=path&head=${sceneFixture().headEntryID}", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    // GIVEN the Night Train's Day View at 9:05 am
    // WHEN the player chooses Skip to later, This evening, and writes "I ride on to Shimla, go to the interview at eleven, and come out not sure of anything."
    // THEN the Scene opens at once with that Move, under a card that says Friday 6:00 pm and that the Scene is being written
    @Test fun `presence › Between Scenes is quiet, and shows progress › The next Scene is being written`() = runBlocking {
        MacServer().use { mac ->
            val initial = sceneFixture().copy(dayView = FakeFantasiaLink.dayView(), headEntryID = "closed", seq = 4, lastEventID = "4")
            val move = Passage(entryID = "move", text = "I ride on to Shimla. I let the time pass until this evening: Friday 6:00 pm.")
            val opening = NextScene(at = "Day 2 18:00", atLabel = "Friday 6:00 pm")
            val snapshot = initial.copy(dayView = null, opening = opening, exchanges = listOf(Exchange(move = move)), headEntryID = "move",
                earlierScenes = listOf(SceneSummaryLine(number = 14, title = "After curfew", summary = "")), seq = 5, lastEventID = "5",
                turn = TurnState(kind = TurnStateKind.Writing, traceID = "choose"))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("5", StoryEvent(kind = StoryEventKind.Move, seq = 5, passage = move, opening = opening))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }.follow(initial).first() }
            assertEquals(snapshot, view)
            assertEquals("/stories/story/events?path=path&head=${initial.headEntryID}", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    @Test fun `A Path change reloads the Scene, and the stream says which Path the phone shows`() = runBlocking {
        MacServer().use { mac ->
            val initial = sceneFixture().copy(seq = 4, lastEventID = "4")
            val snapshot = initial.copy(pathID = "tried", headEntryID = "opening", seq = 4, lastEventID = "4")
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("4", StoryEvent(kind = StoryEventKind.PathChanged, seq = 4))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }.follow(initial).first() }
            assertEquals(snapshot, view)
            assertEquals("/stories/story/events?path=path&head=${initial.headEntryID}", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    @Test fun `World moved reloads Meanwhile without changing the Path head`() = runBlocking {
        MacServer().use { mac ->
            val initial = sceneFixture().copy(dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(step = SceneEndStep.Weaver)),
                headEntryID = "closed", seq = 4, lastEventID = "4")
            val snapshot = initial.copy(seq = 6, lastEventID = "6", dayView = initial.dayView!!.copy(sceneEnd = SceneEnd(),
                meanwhile = listOf(MeanwhileItem(how = How.Rumour, text = "Lavender brings a rumour to breakfast."))))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("6", StoryEvent(kind = StoryEventKind.WorldMoved, seq = 6))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }.follow(initial).first() }
            assertEquals(snapshot, view)
            assertEquals("closed", view.headEntryID)
            assertEquals("/stories/story/events?path=path&head=${initial.headEntryID}", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    // A step of a Scene's end follows an entry the stream does not carry (the record, here): the Scene is read again,
    // so the Day View says the step and the head is the Mac's.
    @Test fun `A step of the Scene's end reads the Scene again`() = runBlocking {
        MacServer().use { mac ->
            val initial = sceneFixture().copy(dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(step = SceneEndStep.Chronicler)),
                headEntryID = "closed", seq = 4, lastEventID = "4")
            val snapshot = initial.copy(seq = 5, lastEventID = "5", headEntryID = "chronicle",
                dayView = initial.dayView!!.copy(sceneEnd = SceneEnd(step = SceneEndStep.Director)))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("5.step.director", StoryEvent(kind = StoryEventKind.SceneEndStep, seq = 5, step = SceneEndStep.Director))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }.follow(initial).first() }
            assertEquals(snapshot, view)
            assertEquals("chronicle", view.headEntryID)
            assertEquals("/stories/story/scene", mac.server.run { takeRequest(); takeRequest() }.path)
        }
    }

    @Test fun `A Scene's end that stopped shows its step and why, even at the same sequence`() = runBlocking {
        MacServer().use { mac ->
            val initial = sceneFixture().copy(dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(step = SceneEndStep.Director)),
                headEntryID = "chronicle", seq = 4, lastEventID = "4")
            val failure = SceneEndFailure(step = SceneEndStep.Director, reason = "Opus 5.5 and Sonnet 5.5 both ran out of time.", traceID = "3f1c09ab")
            val snapshot = initial.copy(dayView = initial.dayView!!.copy(sceneEnd = SceneEnd(failed = failure)))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("4.failed.director", StoryEvent(kind = StoryEventKind.SceneEndFailed, seq = 4, step = SceneEndStep.Director,
                    reason = failure.reason, traceID = failure.traceID))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }.follow(initial).first() }
            assertEquals(snapshot, view)
            assertEquals("/stories/story/events?path=path&head=${initial.headEntryID}", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    // The projection says the step at once, before the Scene is read again; ids like "5.step.director" are no place
    // in the order, so the cursor stays at the last entry.
    @Test fun `A step and a stop change only the Scene's end`() {
        val projection = SceneProjection(sceneFixture().copy(dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(step = SceneEndStep.Chronicler)),
            headEntryID = "closed", seq = 4, lastEventID = "4"))
        val stepped = projection.apply(StoryEventEnvelope("5.step.weaver", StoryEvent(kind = StoryEventKind.SceneEndStep, seq = 5, step = SceneEndStep.Weaver)))
        assertEquals(SceneEnd(step = SceneEndStep.Weaver), stepped.dayView!!.sceneEnd)
        assertEquals("4", projection.lastEventID)
        val stopped = projection.apply(StoryEventEnvelope("5.failed.weaver", StoryEvent(kind = StoryEventKind.SceneEndFailed, seq = 5,
            step = SceneEndStep.Weaver, reason = "The Weaver is unavailable", traceID = "weaver-trace")))
        assertEquals(SceneEnd(failed = SceneEndFailure(step = SceneEndStep.Weaver, reason = "The Weaver is unavailable", traceID = "weaver-trace")), stopped.dayView!!.sceneEnd)
        val done = projection.apply(StoryEventEnvelope("6.step.done", StoryEvent(kind = StoryEventKind.SceneEndStep, seq = 6, step = null)))
        assertEquals(SceneEnd(), done.dayView!!.sceneEnd)
        assertEquals("4", projection.lastEventID)
    }

    // GIVEN a Scene in the Gryffindor common room
    // WHEN the Move is "I go to my room; Harry, Ron and Neville are playing a board game"
    // THEN a new Scene opens in the dormitory with its title card, and the Reply plays it
    // AND no Day View appears
    @Test fun `scenes › A Scene ends when a Move leaves it or the player ends it › Walking out of a Scene`() = runBlocking {
        MacServer().use { mac ->
            val move = Passage(entryID = "walk", text = "I go to my room; Harry, Ron and Neville are playing a board game")
            val card = sceneFixture().scene.copy(number = 15, title = "A board game", place = "Dormitory",
                people = listOf("Harry", "Ron", "Neville").map { PersonCard(name = it, portraitURL = null) })
            val snapshot = sceneFixture().copy(scene = card, exchanges = listOf(Exchange(move = move, reply = null)),
                seq = 6, lastEventID = "6", headEntryID = "writer", focus = null, linger = false, dayView = null,
                turn = TurnState(kind = TurnStateKind.Writing, traceID = "turn"))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("4", StoryEvent(kind = StoryEventKind.Move, seq = 4, passage = move)) +
                eventData("5", StoryEvent(kind = StoryEventKind.SceneOpened, seq = 5, scene = card, focus = null)) +
                eventData(null, StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 6, traceID = "turn")) +
                eventData(null, StoryEvent(kind = StoryEventKind.TurnStep, seq = 6, turnStep = TurnStep.Checking, traceID = "turn"))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val views = mutableListOf<SceneView>()
            withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }.follow(sceneFixture())
                .first { views += it; it.turn.kind == TurnStateKind.Checking } }
            val opened = views.first { it.scene.number == 15L }
            assertEquals(snapshot, opened)
            val view = views.last()
            assertEquals("A board game", view.scene.title)
            assertEquals("Dormitory", view.scene.place)
            assertEquals(move, view.exchanges.first().move)
            assertNull(view.exchanges.first().reply)
            assertEquals(TurnStateKind.Checking, view.turn.kind)
            assertNull(view.dayView)
            assertEquals("6", view.lastEventID)
            assertEquals("/stories/story/events?path=path&head=${sceneFixture().headEntryID}", mac.server.takeRequest().path)
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
            assertEquals("/stories/story/events?path=path&head=${sceneFixture().headEntryID}", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    @Test fun `Redo reloads away the old Reply and follows its replacement`() = runBlocking {
        MacServer().use { mac ->
            val move = Passage(entryID = "move", text = "I wait.")
            val initial = sceneFixture().copy(exchanges = listOf(Exchange(move = move,
                reply = Passage(entryID = "old", text = "She smiles."))), headEntryID = "old", seq = 3, lastEventID = "3")
            val snapshot = initial.copy(exchanges = listOf(Exchange(move = move, reply = null)), headEntryID = "writer", seq = 5, lastEventID = "5",
                turn = TurnState(kind = TurnStateKind.Writing))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                eventData("4", StoryEvent(kind = StoryEventKind.Redo, seq = 4)) +
                eventData(null, StoryEvent(kind = StoryEventKind.TurnStep, seq = 5, turnStep = TurnStep.Checking))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }
                .follow(initial).first { it.turn.kind == TurnStateKind.Checking } }
            assertEquals(listOf(Exchange(move = move, reply = null)), view.exchanges)
            assertEquals("writer", view.headEntryID)
            assertEquals("5", view.lastEventID)
            assertEquals("/stories/story/events?path=path&head=${initial.headEntryID}", mac.server.takeRequest().path)
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }

    @Test fun `an interrupted Scene reload does not advance the stream cursor`() = runBlocking {
        MacServer().use { mac ->
            val move = Passage(entryID = "move", text = "I wait.")
            val initial = sceneFixture().copy(exchanges = listOf(Exchange(move = move,
                reply = Passage(entryID = "old", text = "She smiles."))), headEntryID = "old", seq = 3, lastEventID = "3")
            val snapshot = initial.copy(exchanges = listOf(Exchange(move = move, reply = null)), headEntryID = "writer", seq = 5, lastEventID = "5",
                turn = TurnState(kind = TurnStateKind.Writing))
            val redo = eventData("4", StoryEvent(kind = StoryEventKind.Redo, seq = 4))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(redo))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)).setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY))
            mac.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(redo +
                eventData(null, StoryEvent(kind = StoryEventKind.TurnStep, seq = 5, turnStep = TurnStep.Checking))))
            mac.enqueue(MockResponse().setBody(linkJson.encodeToString(snapshot)))
            val view = withTimeout(5000) { StoryStream(loadScene = { mac.client.scene(it) }) { mac.client }
                .follow(initial).first { it.turn.kind == TurnStateKind.Checking } }
            assertEquals(TurnStateKind.Checking, view.turn.kind)
            assertEquals(listOf(Exchange(move = move, reply = null)), view.exchanges)
            assertEquals("3", mac.server.takeRequest().getHeader("Last-Event-ID"))
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
            assertEquals("3", mac.server.takeRequest().getHeader("Last-Event-ID"))
            assertEquals("/stories/story/scene", mac.server.takeRequest().path)
        }
    }
}
