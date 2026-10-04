package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OpenStoryTest {
    // GIVEN the player stopped mid-Scene with Hermione and returns 30 hours later
    // WHEN they open the Story
    // THEN they are in that Scene at its latest Reply, with a "Previously" card above it
    // The Previously card needs Scene records and is outside this change's scope.
    @Test fun `stories › Opening a Story returns exactly where the player left › Back after a night away`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val view = sceneFixture()
            val link = object : StubFantasiaLink() {
                override val isPaired = true
                override val reachable = MutableStateFlow(true)
                override suspend fun pair(invite: PairingInvite) = Unit
                override suspend fun stories() = StoryList(stories = emptyList(), traceID = "list")
                override suspend fun scene(storyID: String) = view
                override suspend fun move(storyID: String, move: MoveRequest) = TurnAccepted(moveEntryID = "move", traceID = "turn")
                override suspend fun retry(storyID: String) = TurnAccepted(moveEntryID = "move", traceID = "turn")
                override fun watch(initial: SceneView) = emptyFlow<SceneView>()
            }
            val model = FantasiaModel(link)
            model.openStory("story")
            advanceUntilIdle()
            assertEquals(view, model.state.value.scene)
            assertEquals("Hermione looks up.", model.state.value.scene?.exchanges?.last()?.reply?.text)
        } finally { Dispatchers.resetMain() }
    }
}
