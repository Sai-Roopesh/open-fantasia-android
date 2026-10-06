package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OpenStoryTest {
    // Loading preserves the Mac's Scene and Previously data; the shared UI check proves the full scenario.
    @Test fun openingPreservesTheSceneAndPreviously() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val view = sceneFixture().copy(previously = Previously(summary = "Hermione waited up.", since = "2026-10-03T18:00:00Z"))
            val link = object : StubFantasiaLink() {
                override val isPaired = true
                override val reachable = MutableStateFlow(true)
                override suspend fun pair(invite: PairingInvite) = Unit
                override suspend fun stories() = StoryList(stories = emptyList(), traceID = "list")
                override suspend fun scene(storyID: String) = view
                override suspend fun move(storyID: String, move: MoveRequest) = TurnAccepted(moveEntryID = "move", traceID = "turn")
                override suspend fun retry(storyID: String, request: RetryRequest) = TurnAccepted(moveEntryID = "move", traceID = "turn")
                override fun watch(initial: SceneView) = emptyFlow<SceneView>()
            }
            val model = FantasiaModel(link)
            model.openStory("story")
            advanceUntilIdle()
            assertEquals(view, model.state.value.scene)
            assertEquals(view.previously, model.state.value.scene?.previously)
            assertEquals("Hermione looks up.", model.state.value.scene?.exchanges?.last()?.reply?.text)
        } finally { Dispatchers.resetMain() }
    }
}
