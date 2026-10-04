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
        StorySummary(id = "story", standing = "Scene 14 · After curfew", title = "The Malfoy Problem", updatedAt = "now"),
        StorySummary(id = "other", standing = "Sunday 7:40 am · choosing where to go", title = "The coast", updatedAt = "now")
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
        // Named arguments throughout: the generated classes list their fields alphabetically, so positional ones
        // put a summary where a title belongs without a compiler error.
        fun sceneView() = SceneView(
            earlierScenes = (1L..13L).map { SceneSummaryLine(number = it, title = "Earlier Scene $it", summary = "What happened in Scene $it.") },
            exchanges = listOf(
                Exchange(reply = Passage(entryID = "opening", text = "Hermione looks up.")),
                Exchange(move = Passage(entryID = "move", text = "I sit beside her."), reply = Passage(entryID = "reply", text = "She smiles."))
            ),
            headEntryID = "reply", pathID = "path", playerCharacter = "Roopesh Gantasala",
            scene = SceneCard(at = "Day 1 21:40", atLabel = "Friday · 9:40 pm", number = 14,
                people = listOf(PersonCard(name = "Hermione", portraitURL = null)), place = "Common room", title = "After curfew"),
            seq = 3, storyID = "story", traceID = "view", turn = TurnState(TurnStateKind.Idle)
        )
    }
}
