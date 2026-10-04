package com.openfantasia.app

import com.openfantasia.protocol.*
import org.junit.Assert.*
import org.junit.Test

class SceneCursorTest {
    @Test fun `a loaded view resumes after the words it already contains`() {
        val view = sceneFixture().copy(seq = 7, lastEventID = "7.9",
            turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "She "))
        val projection = SceneProjection(view)
        assertEquals("7.9", projection.lastEventID)
        projection.apply(StoryEventEnvelope("7.9", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 7, text = "She ")))
        projection.apply(StoryEventEnvelope("7.10", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 7, text = "smiles.")))
        assertEquals("She smiles.", projection.view.turn.textSoFar)
        assertEquals("7.10", projection.view.lastEventID)
        projection.replace(view.copy(lastEventID = "7.12", turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "She smiles back.")))
        assertEquals("7.12", projection.lastEventID)
        projection.replace(view)
        assertEquals("She smiles back.", projection.view.turn.textSoFar)
    }

    @Test fun `a queued live start cannot erase words included in a reloaded view`() {
        val snapshot = sceneFixture().copy(seq = 6, lastEventID = "6.2",
            turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "Harry and Ron ", traceID = "turn"))
        val projection = SceneProjection(snapshot)
        projection.apply(StoryEventEnvelope("6.0", StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 6, traceID = "turn")))
        projection.apply(StoryEventEnvelope("6.2", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 6, text = "and Ron ")))
        projection.apply(StoryEventEnvelope("6.3", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 6, text = "look up.")))
        assertEquals("Harry and Ron look up.", projection.view.turn.textSoFar)
        assertEquals("6.3", projection.lastEventID)
    }

    @Test fun `the newest Story entry does not replace the stream position`() {
        val projection = SceneProjection(sceneFixture().copy(seq = 20, lastEventID = "7.9",
            turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "She ")))
        projection.apply(StoryEventEnvelope("7.10", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 7, text = "smiles.")))
        assertEquals("She smiles.", projection.view.turn.textSoFar)
        val reply = Passage(entryID = "reply", text = "She smiles.")
        projection.apply(StoryEventEnvelope("8", StoryEvent(kind = StoryEventKind.Reply, seq = 8, passage = reply, scene = sceneFixture().scene)))
        assertEquals(reply, projection.view.exchanges.last().reply)
        assertEquals(20L, projection.view.seq)
        assertEquals("8", projection.view.lastEventID)
    }

    @Test fun `a failed Reply event keeps its reason and a resumable cursor`() {
        val projection = SceneProjection(sceneFixture().copy(seq = 7, lastEventID = "7.2",
            turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "She ")))
        projection.apply(StoryEventEnvelope("7.failed", StoryEvent(kind = StoryEventKind.ReplyFailed, seq = 7,
            reason = "The Actor is unavailable", traceID = "failed")))
        assertEquals(TurnStateKind.Failed, projection.view.turn.kind)
        assertEquals("The Actor is unavailable", projection.view.turn.reason)
        assertEquals("failed", projection.view.turn.traceID)
        assertEquals("7", projection.lastEventID)
    }

    @Test fun `Reply events advance seq to the entry they follow`() {
        val events = listOf(
            StoryEventEnvelope("2.0", StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 2, traceID = "turn")),
            StoryEventEnvelope("2.1", StoryEvent(kind = StoryEventKind.ReplyDelta, seq = 2, text = "She ")),
            StoryEventEnvelope("2.failed", StoryEvent(kind = StoryEventKind.ReplyFailed, seq = 2, reason = "The Actor is unavailable")))
        for (event in events) {
            val projection = SceneProjection(sceneFixture())
            projection.apply(event)
            assertEquals(2L, projection.view.seq)
        }
    }
}
