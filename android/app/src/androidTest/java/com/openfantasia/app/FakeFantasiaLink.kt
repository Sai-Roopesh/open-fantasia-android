package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.flow.*

class FakeFantasiaLink(override var isPaired: Boolean = true) : FantasiaLink {
    override val reachable = MutableStateFlow(true)
    val current = MutableStateFlow(sceneView())
    var pairedInvite: PairingInvite? = null
    val moves = mutableListOf<MoveRequest>()
    var retries = 0
    override suspend fun pair(invite: PairingInvite) { pairedInvite = invite; isPaired = true }
    override suspend fun stories() = StoryList(listOf(
        StorySummary("story", "Scene 14 · After curfew", "The Malfoy Problem", "now"),
        StorySummary("other", "Sunday 7:40 am · choosing where to go", "The coast", "now")
    ), "list")
    override suspend fun scene(storyID: String) = current.value
    override suspend fun move(storyID: String, move: MoveRequest): TurnAccepted {
        moves += move
        return TurnAccepted("move", "turn")
    }
    override suspend fun retry(storyID: String): TurnAccepted {
        retries++
        return TurnAccepted("move", "retry")
    }
    override fun watch(initial: SceneView): Flow<SceneView> = current

    companion object {
        fun sceneView() = SceneView(
            (1L..13L).map { SceneSummaryLine(it, "Earlier Scene $it", "What happened in Scene $it.") },
            listOf(Exchange(reply = Passage("opening", "Hermione looks up.")),
                Exchange(Passage("move", "I sit beside her."), Passage("reply", "She smiles."))),
            "reply", "path", "Roopesh Gantasala",
            SceneCard("Day 1 21:40", "Friday · 9:40 pm", 14,
                listOf(PersonCard("Hermione", null)), "Common room", "After curfew"),
            3, "story", "view", TurnState(TurnStateKind.Idle)
        )
    }
}
