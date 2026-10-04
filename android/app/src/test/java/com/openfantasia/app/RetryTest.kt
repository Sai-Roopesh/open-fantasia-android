package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RetryTest {
    // GIVEN the Actor's model fails while writing a Reply
    // THEN the Scene shows that the Reply failed, with Retry and another model
    // AND the player's Move is still there
    @Test fun `presence › Nothing fails silently › A model is down`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val failed = sceneFixture().copy(exchanges = listOf(Exchange(move = Passage("move", "I wait."))),
                headEntryID = "move", turn = TurnState(TurnStateKind.Failed, reason = "Actor unavailable", traceID = "failed"))
            var retries = 0
            val link = object : FantasiaLink {
                override val isPaired = true
                override val reachable = MutableStateFlow(true)
                override suspend fun pair(invite: PairingInvite) = Unit
                override suspend fun stories() = StoryList(emptyList(), "list")
                override suspend fun scene(storyID: String) = failed
                override suspend fun move(storyID: String, move: MoveRequest): TurnAccepted = error("Retry must keep the original Move")
                override suspend fun retry(storyID: String): TurnAccepted { retries++; return TurnAccepted("move", "retry") }
                override fun watch(initial: SceneView) = emptyFlow<SceneView>()
            }
            val model = FantasiaModel(link)
            model.openStory("story")
            advanceUntilIdle()
            model.writeMove("My next Move")
            model.retryReply()
            advanceUntilIdle()
            assertEquals(1, retries)
            assertEquals("My next Move", model.state.value.draft)
            assertEquals("I wait.", model.state.value.scene?.exchanges?.single()?.move?.text)
        } finally { Dispatchers.resetMain() }
    }
}
