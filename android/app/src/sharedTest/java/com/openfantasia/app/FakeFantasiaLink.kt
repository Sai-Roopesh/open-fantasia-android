package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.*

class FakeFantasiaLink(override var isPaired: Boolean = true) : FantasiaLink {
    override val hostName get() = pairedInvite?.hostName ?: "Sai's MacBook Air"
    override val reachable = MutableStateFlow(true)
    val current = MutableStateFlow(sceneView())
    var pairedInvite: PairingInvite? = null
    val moves = mutableListOf<MoveRequest>()
    val choices = mutableListOf<ChooseRequest>()
    /** While set, a choice waits for it; a choice refused with [chooseFailure] throws it. */
    var chooseGate: CompletableDeferred<Unit>? = null
    var chooseFailure: LinkFailure? = null
    var pathsView = pathsFixture()
    val tries = mutableListOf<TryAnotherWayRequest>()
    val rewinds = mutableListOf<RewindRequest>()
    val opened = mutableListOf<String>()
    val renames = mutableListOf<Pair<String, RenamePathRequest>>()
    val deleted = mutableListOf<String>()
    var clears = 0
    val edits = mutableListOf<EditRequest>()
    var retries = 0
    val worldRetries = mutableListOf<String>()
    var endedDayView = dayView(ClosedBy.Player)
    val redos = mutableListOf<RedoRequest>()
    val lingers = mutableListOf<LingerRequest>()
    val focuses = mutableListOf<FocusRequest>()
    val endScenes = mutableListOf<EndSceneRequest>()
    var storyRequests = 0
    val pastSceneRequests = mutableListOf<Pair<String, Long>>()
    var pastSceneFailure: LinkFailure? = null
    var past = pastSceneFixture()
    override suspend fun pair(invite: PairingInvite) { pairedInvite = invite; isPaired = true }
    override suspend fun stories(): StoryList {
        storyRequests++
        return StoryList(stories = listOf(
        StorySummary(detail = "Friday 9:40 pm · with Hermione", id = "story", standing = "Scene 14 · After curfew", title = "The Malfoy Problem", updatedAt = java.time.Instant.now().minusSeconds(7200).toString()),
        StorySummary(detail = "3 Scenes played", id = "other", standing = "Sunday 7:40 am · choosing where to go", title = "The coast", updatedAt = java.time.Instant.now().minusSeconds(86400).toString())
    ), traceID = "list")
    }
    override suspend fun scene(storyID: String) = current.value
    override suspend fun pastScene(storyID: String, number: Long): PastScene {
        pastSceneRequests += storyID to number
        pastSceneFailure?.let { throw it }
        return past.copy(number = number)
    }
    override suspend fun move(storyID: String, move: MoveRequest): TurnAccepted {
        moves += move
        return TurnAccepted(moveEntryID = "move", traceID = "turn")
    }
    override suspend fun endScene(storyID: String, request: EndSceneRequest): Accepted {
        endScenes += request
        current.value = current.value.copy(dayView = endedDayView, headEntryID = "closed", seq = 4, lastEventID = "4", focus = null, linger = false)
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
    override suspend fun choose(storyID: String, request: ChooseRequest): TurnAccepted {
        choices += request
        chooseGate?.await()
        chooseFailure?.let { throw it }
        return TurnAccepted(moveEntryID = "move", traceID = "choose")
    }
    override suspend fun retryWorld(storyID: String): Accepted {
        worldRetries += storyID
        current.value = current.value.copy(dayView = current.value.dayView!!.copy(world = World.MovingOn, failure = null))
        return Accepted(headEntryID = current.value.headEntryID, traceID = "world-retry")
    }
    override suspend fun retry(storyID: String): TurnAccepted {
        retries++
        return TurnAccepted(moveEntryID = "move", traceID = "retry")
    }
    override suspend fun edit(storyID: String, request: EditRequest): Accepted {
        edits += request
        val view = current.value
        val at = view.exchanges.indexOfFirst { it.reply?.entryID == request.entry || it.move?.entryID == request.entry }
        val exchange = view.exchanges[at]
        val isMove = exchange.move?.entryID == request.entry
        val latest = at == view.exchanges.lastIndex
        val edited = if (isMove) exchange.copy(move = exchange.move!!.copy(text = request.text)) else exchange.copy(reply = exchange.reply!!.copy(text = request.text))
        current.value = view.copy(seq = view.seq + 1, lastEventID = (view.seq + 1).toString(),
            pathID = if (latest) view.pathID else "edited", headEntryID = if (latest) view.headEntryID else request.entry,
            // An edited Move is answered again, in place or on its new Path.
            exchanges = view.exchanges.take(at) + (if (isMove) edited.copy(reply = null) else edited))
        return Accepted(headEntryID = current.value.headEntryID, traceID = "edit")
    }
    override suspend fun paths(storyID: String): PathsView = pathsView
    /** The Scene as the Mac would show it with its head at [entryID]: what came after is not on this Path. */
    private fun backTo(entryID: String, pathID: String) {
        val view = current.value
        val at = view.exchanges.indexOfFirst { it.reply?.entryID == entryID || it.move?.entryID == entryID }
        current.value = view.copy(pathID = pathID, headEntryID = entryID, seq = view.seq + 1, lastEventID = (view.seq + 1).toString(),
            exchanges = if (at >= 0) view.exchanges.take(at + 1) else view.exchanges)
    }
    override suspend fun tryAnotherWay(storyID: String, request: TryAnotherWayRequest): Accepted {
        tries += request
        backTo(request.from ?: "opening", "tried")
        return Accepted(headEntryID = current.value.headEntryID, traceID = "try")
    }
    override suspend fun rewind(storyID: String, request: RewindRequest): Accepted {
        rewinds += request
        backTo(request.to, current.value.pathID)
        return Accepted(headEntryID = request.to, traceID = "rewind")
    }
    override suspend fun openPath(storyID: String, pathID: String): Accepted {
        opened += pathID
        current.value = current.value.copy(pathID = pathID, headEntryID = "$pathID-head", seq = current.value.seq + 1,
            lastEventID = (current.value.seq + 1).toString(), exchanges = current.value.exchanges.take(1))
        return Accepted(headEntryID = current.value.headEntryID, traceID = "open")
    }
    override suspend fun renamePath(storyID: String, pathID: String, request: RenamePathRequest): Accepted {
        renames += pathID to request
        pathsView = pathsView.copy(rows = pathsView.rows.map { row ->
            if (row.path?.id == pathID) row.copy(path = row.path!!.copy(title = request.name)) else row })
        return Accepted(headEntryID = current.value.headEntryID, traceID = "rename")
    }
    override suspend fun deletePath(storyID: String, pathID: String): Accepted {
        deleted += pathID
        pathsView = pathsView.copy(rows = pathsView.rows.filter { it.path?.id != pathID })
        return Accepted(headEntryID = current.value.headEntryID, traceID = "delete")
    }
    override suspend fun clearPaths(storyID: String): Accepted {
        clears++
        pathsView = pathsView.copy(clearable = 0)
        return Accepted(headEntryID = current.value.headEntryID, traceID = "clear")
    }
    override fun watch(initial: SceneView): Flow<SceneView> = current

    companion object {
        fun pastSceneFixture() = PastScene(number = 13, title = "The troll", place = "The girls' bathroom",
            atLabel = "Friday 8:10 pm", summary = "He got Hermione out before the club came down.", traceID = "past-scene",
            exchanges = listOf(
                Exchange(move = null, reply = Passage(entryID = "past-opening", text = "The troll raises its club.")),
                Exchange(move = Passage(entryID = "past-move", text = "I pull Hermione through the door."),
                    reply = Passage(entryID = "past-reply", text = "The club comes down behind them.")),
                Exchange(move = null, reply = Passage(entryID = "past-long-reply", text = "The dust settles behind them. ".repeat(100))),
                Exchange(move = null, reply = Passage(entryID = "past-last-reply", text = "They reach the corridor."))))
        // Named arguments throughout: the generated classes list their fields alphabetically, so positional ones
        // put a summary where a title belongs without a compiler error.
        fun dayView(closedBy: ClosedBy = ClosedBy.Story) = DayView(at = "Day 3 07:40", atLabel = "Sunday 7:40 am", day = "Sunday", time = "7:40 am", place = "Common room", closedBy = closedBy,
            happenings = emptyList(), choices = DayChoices(follow = emptyList(), places = emptyList(), skips = emptyList()),
            world = World.Ready, sceneSpan = "Friday 9:40 pm – 11:05 pm", meanwhile = emptyList(), failure = null,
            countdowns = listOf(Countdown(linkSchemaWhen = "3 days", landmark = "Draconia's flying test", label = "3 days to Draconia's flying test"),
                Countdown(linkSchemaWhen = "9 weeks", landmark = "Slytherin v Gryffindor", label = "9 weeks to Slytherin v Gryffindor")))
        // The Paths screen as drawn in Paths.dc.html: Main, and the lantern tried from Scene 13 two days ago.
        fun pathsFixture() = PathsView(storyID = "story", traceID = "paths", clearable = 1, rows = listOf(
            PathRow(kind = PathRowKind.Scenes, depth = 0, label = "Scenes 1 – 12 · Friday 6:10 pm", title = null, path = null),
            PathRow(kind = PathRowKind.Fork, depth = 0, label = "Scene 13 · Friday 8:05 pm", title = "The troll", path = null),
            PathRow(kind = PathRowKind.Path, depth = 1, label = "MAIN · YOU ARE HERE", title = null, path = PathCard(id = "main",
                label = "MAIN · YOU ARE HERE", title = "Scene 14 · After curfew", detail = "14 Scenes · Friday 9:52 pm", current = true,
                playedAt = java.time.Instant.now().toString(), canDelete = false)),
            PathRow(kind = PathRowKind.Path, depth = 1, label = "FROM SCENE 13 · TRIED ANOTHER WAY", title = null, path = PathCard(id = "lantern",
                label = "FROM SCENE 13 · TRIED ANOTHER WAY", title = "Following the lantern", detail = "3 Scenes · Saturday 1:15 am", current = false,
                playedAt = java.time.Instant.now().minusSeconds(2 * 86400).toString(), canDelete = true))))
        fun sceneView() = SceneView(
            earlierScenes = (1L..13L).map { SceneSummaryLine(number = it,
                title = if (it == 13L) "The troll" else "Earlier Scene $it",
                summary = if (it == 13L) "He got Hermione out before the club came down." else "What happened in Scene $it.") },
            exchanges = listOf(
                Exchange(reply = Passage(entryID = "opening", text = "Hermione looks up.")),
                Exchange(move = Passage(entryID = "move", text = "I sit beside her."), reply = Passage(entryID = "reply", text = "She smiles."))
            ),
            lastEventID = "3", focus = null, linger = false, dayView = null, previously = null,
            headEntryID = "reply", pathID = "path", playerCharacter = "Roopesh Gantasala",
            scene = SceneCard(at = "Day 1 21:40", atLabel = "Friday 9:40 pm", number = 14,
                people = listOf(PersonCard(name = "Hermione", portraitURL = null)), place = "Common room", title = "After curfew"),
            seq = 3, storyID = "story", traceID = "view", turn = TurnState(kind = TurnStateKind.Idle)
        )
    }
}
