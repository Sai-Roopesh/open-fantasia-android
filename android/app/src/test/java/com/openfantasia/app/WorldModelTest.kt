package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorldModelTest {
    @Test fun `a Move waits for the Scene's end and keeps the draft`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val link = FakeFantasiaLink()
            link.current.value = link.current.value.copy(headEntryID = "closed", dayView = FakeFantasiaLink.dayView())
            val model = FantasiaModel(link)
            model.openStory("story")
            advanceUntilIdle()
            model.writeMove("I go downstairs.")
            for (end in listOf(SceneEnd(step = SceneEndStep.Chronicler), SceneEnd(failed = SceneEndFailure(step = SceneEndStep.Weaver, reason = "Unavailable", traceID = "weaver")))) {
                link.current.value = link.current.value.copy(dayView = link.current.value.dayView!!.copy(sceneEnd = end))
                advanceUntilIdle()
                assertFalse(model.state.value.canSendMove)
                model.sendMove()
                advanceUntilIdle()
                assertTrue(link.moves.isEmpty())
                assertEquals("I go downstairs.", model.state.value.draft)
            }
            link.current.value = link.current.value.copy(dayView = link.current.value.dayView!!.copy(sceneEnd = SceneEnd()))
            advanceUntilIdle()
            model.sendMove()
            advanceUntilIdle()
            assertEquals(MoveRequest(after = "closed", text = "I go downstairs."), link.moves.single())
            model.pause()
        } finally { Dispatchers.resetMain() }
    }

    @Test fun `a refused Scene end retry shows its reason and trace and keeps the draft`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val fake = FakeFantasiaLink()
            val failed = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(failed = SceneEndFailure(step = SceneEndStep.Weaver,
                reason = "The Weaver failed", traceID = "weaver")))
            fake.current.value = fake.current.value.copy(headEntryID = "closed", dayView = failed)
            var requests = 0
            val link = object : FantasiaLink by fake {
                override suspend fun retry(storyID: String, request: RetryRequest): TurnAccepted {
                    requests++
                    throw LinkFailure("The Mac could not go on with the Scene's end", "retry-trace")
                }
            }
            val model = FantasiaModel(link)
            model.openStory("story")
            advanceUntilIdle()
            model.writeMove("My next Move")
            model.retrySceneEnd()
            advanceUntilIdle()
            assertEquals(1, requests)
            assertEquals(AppProblem("The Mac could not go on with the Scene's end", "retry-trace"), model.state.value.problem)
            assertEquals("My next Move", model.state.value.draft)
            assertEquals(failed, model.state.value.scene!!.dayView)
            assertFalse(model.state.value.sending)
            assertFalse(model.state.value.canSendMove)
            model.pause()
        } finally { Dispatchers.resetMain() }
    }

    // Retry is offered only for a Scene's end that stopped; one under way is not sent again.
    @Test fun `a Scene end under way is not retried`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val fake = FakeFantasiaLink()
            fake.current.value = fake.current.value.copy(headEntryID = "closed", dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(step = SceneEndStep.Director)))
            val model = FantasiaModel(fake)
            model.openStory("story")
            advanceUntilIdle()
            model.retrySceneEnd()
            advanceUntilIdle()
            assertEquals(0, fake.retries)
            model.pause()
        } finally { Dispatchers.resetMain() }
    }
}
