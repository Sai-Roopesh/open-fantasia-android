package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.flow.*

class FakeFantasiaLink(override var isPaired: Boolean = true) : FantasiaLink {
    override val hostName get() = pairedInvite?.hostName ?: "Sai's MacBook Air"
    override val reachable = MutableStateFlow(true)
    val current = MutableStateFlow(sceneView())
    var pairedInvite: PairingInvite? = null
    val moves = mutableListOf<MoveRequest>()
    var retries = 0
    val redos = mutableListOf<RedoRequest>()
    val lingers = mutableListOf<LingerRequest>()
    val focuses = mutableListOf<FocusRequest>()
    val endScenes = mutableListOf<EndSceneRequest>()
    var storyRequests = 0
    override suspend fun pair(invite: PairingInvite) { pairedInvite = invite; isPaired = true }
    override suspend fun stories(): StoryList {
        storyRequests++
        return StoryList(stories = listOf(
        StorySummary(detail = "Friday 9:40 pm · with Hermione", id = "story", standing = "Scene 14 · After curfew", title = "The Malfoy Problem", updatedAt = java.time.Instant.now().minusSeconds(7200).toString()),
        StorySummary(detail = "3 Scenes played", id = "other", standing = "Sunday 7:40 am · choosing where to go", title = "The coast", updatedAt = java.time.Instant.now().minusSeconds(86400).toString())
    ), traceID = "list")
    }
    override suspend fun scene(storyID: String) = current.value
    override suspend fun move(storyID: String, move: MoveRequest): TurnAccepted {
        moves += move
        return TurnAccepted(moveEntryID = "move", traceID = "turn")
    }
    override suspend fun endScene(storyID: String, request: EndSceneRequest): Accepted {
        endScenes += request
        current.value = current.value.copy(dayView = dayView(ClosedBy.Player), headEntryID = "closed", seq = 4, lastEventID = "4", focus = null, linger = false)
        return Accepted(headEntryID = "closed", traceID = "end")
    }
    override suspend fun focus(storyID: String, request: FocusRequest): Accepted {
        focuses += request
        current.value = current.value.copy(focus = request.on, headEntryID = "focus-${focuses.size}", seq = current.value.seq + 1,
            lastEventID = (current.value.seq + 1).toString())
        return Accepted(headEntryID = current.value.headEntryID, traceID = "focus")
    }
    override suspend fun linger(storyID: String, request: LingerRequest): Accepted {
        lingers += request
        current.value = current.value.copy(linger = request.on, headEntryID = "linger-${lingers.size}", seq = current.value.seq + 1,
            lastEventID = (current.value.seq + 1).toString())
        return Accepted(headEntryID = current.value.headEntryID, traceID = "linger")
    }
    override suspend fun redo(storyID: String, request: RedoRequest): TurnAccepted {
        redos += request
        return TurnAccepted(moveEntryID = "move", traceID = "redo")
    }
    override suspend fun retry(storyID: String): TurnAccepted {
        retries++
        return TurnAccepted(moveEntryID = "move", traceID = "retry")
    }
    override fun watch(initial: SceneView): Flow<SceneView> = current

    companion object {
        // Named arguments throughout: the generated classes list their fields alphabetically, so positional ones
        // put a summary where a title belongs without a compiler error.
        fun dayView(closedBy: ClosedBy = ClosedBy.Story) = DayView(at = "Day 3 07:40", atLabel = "Sunday · 7:40 am", day = "Sunday", time = "7:40 am", place = "Common room", closedBy = closedBy,
            countdowns = listOf(Countdown(linkSchemaWhen = "3 days", landmark = "Draconia's flying test", label = "3 days to Draconia's flying test"),
                Countdown(linkSchemaWhen = "9 weeks", landmark = "Slytherin v Gryffindor", label = "9 weeks to Slytherin v Gryffindor")))
        fun sceneView() = SceneView(
            earlierScenes = (1L..13L).map { SceneSummaryLine(number = it, title = "Earlier Scene $it", summary = "What happened in Scene $it.") },
            exchanges = listOf(
                Exchange(reply = Passage(entryID = "opening", text = "Hermione looks up.")),
                Exchange(move = Passage(entryID = "move", text = "I sit beside her."), reply = Passage(entryID = "reply", text = "She smiles."))
            ),
            lastEventID = "3", focus = null, linger = false, dayView = null,
            headEntryID = "reply", pathID = "path", playerCharacter = "Roopesh Gantasala",
            scene = SceneCard(at = "Day 1 21:40", atLabel = "Friday · 9:40 pm", number = 14,
                people = listOf(PersonCard(name = "Hermione", portraitURL = null)), place = "Common room", title = "After curfew"),
            seq = 3, storyID = "story", traceID = "view", turn = TurnState(kind = TurnStateKind.Idle)
        )
    }
}
