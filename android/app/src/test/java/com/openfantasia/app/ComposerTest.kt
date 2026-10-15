package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ComposerTest {
    // GIVEN a Reply is being written
    // THEN the player can type in the composer, and sends once the Reply has appeared
    @Test fun `presence › The player can always write › Typing during a Reply`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val view = MutableStateFlow(sceneFixture().copy(turn = TurnState(kind = TurnStateKind.Writing)))
            val moves = mutableListOf<MoveRequest>()
            val link = object : StubFantasiaLink() {
                override val isPaired = true
                override val reachable = MutableStateFlow(true)
                override suspend fun pair(invite: PairingInvite) = Unit
                override suspend fun stories() = StoryList(stories = emptyList(), traceID = "list")
                override suspend fun scene(storyID: String) = view.value
                override suspend fun move(storyID: String, move: MoveRequest): TurnAccepted {
                    moves += move
                    return TurnAccepted(moveEntryID = "move", traceID = "turn")
                }
                override suspend fun retry(storyID: String, request: RetryRequest) = TurnAccepted(moveEntryID = "move", traceID = "turn")
                override fun watch(initial: SceneView): Flow<SceneView> = view
            }
            val model = FantasiaModel(link)
            model.openStory("story")
            advanceUntilIdle()
            model.writeMove("I wait.")
            model.sendMove()
            advanceUntilIdle()
            assertTrue(moves.isEmpty())
            assertEquals("I wait.", model.state.value.draft)
            view.value = view.value.copy(turn = TurnState(kind = TurnStateKind.Idle))
            advanceUntilIdle()
            model.sendMove()
            advanceUntilIdle()
            assertEquals(MoveRequest(after = "opening", text = "I wait."), moves.single())
            assertEquals("", model.state.value.draft)
            model.pause()
        } finally { Dispatchers.resetMain() }
    }
}
