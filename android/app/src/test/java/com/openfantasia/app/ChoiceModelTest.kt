package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChoiceModelTest {
    @Test fun `a choice waits streams fails and retries as a Move keeping the draft`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val fake = FakeFantasiaLink()
            fake.current.value = fake.current.value.copy(headEntryID = "closed", dayView = FakeFantasiaLink.dayView())
            val model = FantasiaModel(fake)
            model.openStory("story")
            advanceUntilIdle()
            model.writeMove("My own Move")
            val choice = ChooseRequest(after = "closed", kind = ChooseRequestKind.Go, happening = "hospital", gap = "I read.")
            model.choose(choice)
            model.choose(choice)
            advanceUntilIdle()
            assertEquals(listOf(choice), fake.choices)
            assertTrue(model.state.value.waiting)
            assertFalse(model.state.value.canChangeScene)
            assertEquals("My own Move", model.state.value.draft)
            fake.current.value = fake.current.value.copy(dayView = null, headEntryID = "move", seq = 4,
                turn = TurnState(kind = TurnStateKind.Writing, textSoFar = "The door opens."))
            advanceUntilIdle()
            assertTrue(model.state.value.replyComing)
            assertEquals("The door opens.", model.state.value.scene!!.turn.textSoFar)
            fake.current.value = fake.current.value.copy(turn = TurnState(kind = TurnStateKind.Failed,
                reason = "The Gap Weaver failed", traceID = "gap-trace"))
            advanceUntilIdle()
            assertFalse(model.state.value.waiting)
            assertEquals("gap-trace", model.state.value.scene!!.turn.traceID)
            model.retryReply()
            advanceUntilIdle()
            assertEquals(1, fake.retries)
            assertTrue(model.state.value.waiting)
            fake.current.value = fake.current.value.copy(headEntryID = "next-reply", seq = 5, turn = TurnState(kind = TurnStateKind.Idle))
            advanceUntilIdle()
            assertFalse(model.state.value.waiting)
            assertTrue(model.state.value.canSendMove)
            model.pause()
        } finally { Dispatchers.resetMain() }
    }

    @Test fun `choices are guarded while unavailable and refuse an old view head`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val fake = FakeFantasiaLink()
            fake.current.value = fake.current.value.copy(headEntryID = "closed", dayView = FakeFantasiaLink.dayView())
            val model = FantasiaModel(fake)
            model.openStory("story")
            advanceUntilIdle()
            val choice = ChooseRequest(after = "closed", kind = ChooseRequestKind.Story)
            for (end in listOf(SceneEnd(step = SceneEndStep.Weaver), SceneEnd(failed = SceneEndFailure(step = SceneEndStep.Weaver, reason = "Unavailable", traceID = "weaver")))) {
                fake.current.value = fake.current.value.copy(dayView = fake.current.value.dayView!!.copy(sceneEnd = end))
                advanceUntilIdle()
                model.choose(choice)
                advanceUntilIdle()
            }
            fake.current.value = fake.current.value.copy(dayView = FakeFantasiaLink.dayView())
            fake.reachable.value = false
            advanceUntilIdle()
            model.choose(choice)
            advanceUntilIdle()
            fake.reachable.value = true
            advanceUntilIdle()
            model.choose(choice.copy(after = "old-head"))
            advanceUntilIdle()
            assertTrue(fake.choices.isEmpty())
            model.pause()
        } finally { Dispatchers.resetMain() }
    }

    @Test fun `a refused choice preserves the reason trace and draft and reloads the head`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val fake = FakeFantasiaLink()
            fake.current.value = fake.current.value.copy(headEntryID = "closed", dayView = FakeFantasiaLink.dayView())
            val link = object : FantasiaLink by fake {
                override suspend fun choose(storyID: String, request: ChooseRequest): TurnAccepted {
                    fake.current.value = fake.current.value.copy(headEntryID = "fresh", seq = 4)
                    throw LinkFailure("The Story has moved on", "stale-trace")
                }
            }
            val model = FantasiaModel(link)
            model.openStory("story")
            advanceUntilIdle()
            model.writeMove("My own Move")
            model.choose(ChooseRequest(after = "closed", kind = ChooseRequestKind.Story))
            advanceUntilIdle()
            assertEquals(AppProblem("The Story has moved on", "stale-trace"), model.state.value.problem)
            assertEquals("fresh", model.state.value.scene!!.headEntryID)
            assertEquals("My own Move", model.state.value.draft)
            assertFalse(model.state.value.waiting)
            assertFalse(model.state.value.sending)
            model.pause()
        } finally { Dispatchers.resetMain() }
    }
}
