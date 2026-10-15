package com.openfantasia.app

import com.openfantasia.protocol.*
import org.junit.Assert.*
import org.junit.Test

class SceneCursorTest {
    // A Reply's words arrive whole, once checked (openspec presence: A Reply arrives checked and whole): what the turn
    // under way is doing arrives as steps, which write no entry and never move the cursor.
    @Test fun `a turn's steps say what the Reply is doing and never move the cursor`() {
        val projection = SceneProjection(sceneFixture().copy(seq = 7, lastEventID = "7"))
        projection.apply(StoryEventEnvelope("7", StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 7, traceID = "turn")))
        assertEquals(TurnState(kind = TurnStateKind.Writing, traceID = "turn"), projection.view.turn)
        projection.apply(StoryEventEnvelope("7", StoryEvent(kind = StoryEventKind.TurnStep, seq = 7, turnStep = TurnStep.Checking)))
        assertEquals(TurnState(kind = TurnStateKind.Checking, traceID = "turn"), projection.view.turn)
        // Whatever the Mac calls a step's id, it is not a place in the order.
        projection.apply(StoryEventEnvelope("7.step.checking", StoryEvent(kind = StoryEventKind.TurnStep, seq = 7, turnStep = TurnStep.Checking)))
        assertEquals("7", projection.lastEventID)
        assertEquals("7", projection.view.lastEventID)
    }

    @Test fun `a turn that starts by looking something up says so`() {
        val projection = SceneProjection(sceneFixture().copy(seq = 7, lastEventID = "7"))
        projection.apply(StoryEventEnvelope("7.0", StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 7, turnStep = TurnStep.LookingBack, traceID = "turn")))
        assertEquals(TurnStateKind.LookingBack, projection.view.turn.kind)
        projection.apply(StoryEventEnvelope(null, StoryEvent(kind = StoryEventKind.TurnStep, seq = 7, turnStep = TurnStep.Writing)))
        assertEquals(TurnStateKind.Writing, projection.view.turn.kind)
        assertTrue(projection.view.turn.underWay)
    }

    @Test fun `a queued start cannot set back a view read mid-turn`() {
        val snapshot = sceneFixture().copy(seq = 6, lastEventID = "6", turn = TurnState(kind = TurnStateKind.Checking, traceID = "turn"))
        val projection = SceneProjection(snapshot)
        projection.apply(StoryEventEnvelope("6.0", StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 6, traceID = "turn")))
        assertEquals(TurnStateKind.Checking, projection.view.turn.kind)
        projection.replace(snapshot.copy(lastEventID = "6.0"))
        assertEquals("6.0", projection.lastEventID)
    }

    // The Reply arrives whole, with the Editor's note when it still breaks something (docs/adr/0019); a step that comes
    // after it is stale.
    @Test fun `the Reply arrives whole with its note, and a late step changes nothing`() {
        val projection = SceneProjection(sceneFixture().copy(seq = 20, lastEventID = "7", turn = TurnState(kind = TurnStateKind.Checking)))
        val reply = Passage(entryID = "reply", text = "She smiles.", note = "She could not know about the egg yet.")
        projection.apply(StoryEventEnvelope("8", StoryEvent(kind = StoryEventKind.Reply, seq = 8, passage = reply, scene = sceneFixture().scene)))
        assertEquals(reply, projection.view.exchanges.last().reply)
        assertEquals(TurnStateKind.Idle, projection.view.turn.kind)
        assertEquals(20L, projection.view.seq)
        assertEquals("8", projection.view.lastEventID)
        projection.apply(StoryEventEnvelope(null, StoryEvent(kind = StoryEventKind.TurnStep, seq = 7, turnStep = TurnStep.Checking)))
        assertEquals(TurnStateKind.Idle, projection.view.turn.kind)
    }

    @Test fun `a failed Reply event keeps its reason and a resumable cursor`() {
        val projection = SceneProjection(sceneFixture().copy(seq = 7, lastEventID = "7", turn = TurnState(kind = TurnStateKind.Writing)))
        projection.apply(StoryEventEnvelope("7.failed", StoryEvent(kind = StoryEventKind.ReplyFailed, seq = 7,
            reason = "The Actor is unavailable", traceID = "failed")))
        assertEquals(TurnStateKind.Failed, projection.view.turn.kind)
        assertEquals("The Actor is unavailable", projection.view.turn.reason)
        assertEquals("failed", projection.view.turn.traceID)
        assertEquals("7", projection.lastEventID)
        // Retry starts the turn again from the same Move.
        projection.apply(StoryEventEnvelope("7.0", StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 7, traceID = "retry")))
        assertEquals(TurnState(kind = TurnStateKind.Writing, traceID = "retry"), projection.view.turn)
    }

    @Test fun `Reply events advance seq to the entry they follow`() {
        val events = listOf(
            StoryEventEnvelope("2.0", StoryEvent(kind = StoryEventKind.ReplyStarted, seq = 2, traceID = "turn")),
            StoryEventEnvelope(null, StoryEvent(kind = StoryEventKind.TurnStep, seq = 2, turnStep = TurnStep.Writing)),
            StoryEventEnvelope("2.failed", StoryEvent(kind = StoryEventKind.ReplyFailed, seq = 2, reason = "The Actor is unavailable")))
        for (event in events) {
            val projection = SceneProjection(sceneFixture())
            projection.apply(event)
            assertEquals(2L, projection.view.seq)
        }
    }
}
