package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorldModelTest {
    @Test fun `a Move waits for a ready World and keeps the draft`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val link = FakeFantasiaLink()
            link.current.value = link.current.value.copy(headEntryID = "closed", dayView = FakeFantasiaLink.dayView())
            val model = FantasiaModel(link)
            model.openStory("story")
            advanceUntilIdle()
            model.writeMove("I go downstairs.")
            for (world in listOf(World.MovingOn, World.Failed)) {
                link.current.value = link.current.value.copy(dayView = link.current.value.dayView!!.copy(world = world,
                    failure = if (world == World.Failed) WorldFailure(reason = "Unavailable", traceID = "world") else null))
                advanceUntilIdle()
                assertFalse(model.state.value.canSendMove)
                model.sendMove()
                advanceUntilIdle()
                assertTrue(link.moves.isEmpty())
                assertEquals("I go downstairs.", model.state.value.draft)
            }
            link.current.value = link.current.value.copy(dayView = link.current.value.dayView!!.copy(world = World.Ready, failure = null))
            advanceUntilIdle()
            model.sendMove()
            advanceUntilIdle()
            assertEquals(MoveRequest(after = "closed", text = "I go downstairs."), link.moves.single())
            model.pause()
        } finally { Dispatchers.resetMain() }
    }

    @Test fun `a refused World retry shows its reason and trace and keeps the draft`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val fake = FakeFantasiaLink()
            val failed = FakeFantasiaLink.dayView().copy(world = World.Failed,
                failure = WorldFailure(reason = "The Weaver failed", traceID = "weaver"))
            fake.current.value = fake.current.value.copy(headEntryID = "closed", dayView = failed)
            var requests = 0
            val link = object : FantasiaLink by fake {
                override suspend fun retryWorld(storyID: String, request: RetryWorldRequest): Accepted {
                    requests++
                    throw LinkFailure("The Mac could not retry the World", "retry-trace")
                }
            }
            val model = FantasiaModel(link)
            model.openStory("story")
            advanceUntilIdle()
            model.writeMove("My next Move")
            model.retryWorld()
            advanceUntilIdle()
            assertEquals(1, requests)
            assertEquals(AppProblem("The Mac could not retry the World", "retry-trace"), model.state.value.problem)
            assertEquals("My next Move", model.state.value.draft)
            assertEquals(failed, model.state.value.scene!!.dayView)
            assertFalse(model.state.value.sending)
            assertFalse(model.state.value.canSendMove)
            model.pause()
        } finally { Dispatchers.resetMain() }
    }
}
