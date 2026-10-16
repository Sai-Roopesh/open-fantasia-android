package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.*
import java.time.format.TextStyle
import java.util.Locale

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
    var journalView = journalFixture()
    var backstageView = backstageFixture()
    val tasteRemovals = mutableListOf<RemoveTasteRequest>()
    val tasteRewords = mutableListOf<RewordTasteRequest>()
    /** Steering notes as written, and the ids of those deleted (openspec the-outline: The player sees and steers the Outline). */
    val notes = mutableListOf<SteeringNoteRequest>()
    val deletedNotes = mutableListOf<String>()
    var retries = 0
    val retryRequests = mutableListOf<RetryRequest>()
    val briefs = mutableListOf<BriefRequest>()
    val reactions = mutableListOf<ReactionRequest>()
    var modelsView = modelsFixture()
    var worldView = worldFixture()
    var peopleView = peopleFixture()
    val leadSets = mutableListOf<Pair<String, LeadRequest>>()
    val personEdits = mutableListOf<Pair<String, PersonEdit>>()
    val groupSets = mutableListOf<Pair<String, GroupRequest>>()
    val portraitUploads = mutableListOf<Triple<String, String, ByteArray>>()
    var personFailure: LinkFailure? = null
    var storyView = storyFixture()
    /** Every edit to the Story as sent: its route and its request. */
    val storyEdits = mutableListOf<Pair<String, Any>>()
    var worldRequests = 0
    val jobModelSets = mutableListOf<Pair<ModelJob, ModelChoice>>()
    val backupSets = mutableListOf<Pair<ModelJob, ModelChoice>>()
    val actorSets = mutableListOf<Pair<String, ModelChoice?>>()
    var endedDayView = dayView()
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
        StorySummary(detail = "Friday 9:40 pm · with Hermione", id = "story", standing = "Scene 14 · After curfew", title = "The Malfoy Problem", updatedAt = java.time.Instant.now().minusSeconds(7200 + 300).toString()),
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
    /** A failed Reply is written again; a Scene's end that stopped goes on from its step, as the Mac does. */
    override suspend fun retry(storyID: String, request: RetryRequest): TurnAccepted {
        retries++
        retryRequests += request
        val day = current.value.dayView
        day?.sceneEnd?.failed?.let { failed -> current.value = current.value.copy(dayView = day.copy(sceneEnd = SceneEnd(step = failed.step))) }
        return TurnAccepted(moveEntryID = if (day != null) current.value.headEntryID else "move", traceID = "retry")
    }
    // The brief and reactions are kept beside the Story (docs/adr/0020): neither names nor moves a place on the Path.
    override suspend fun setBrief(storyID: String, request: BriefRequest): Accepted {
        briefs += request
        current.value = current.value.copy(brief = Brief(more = request.more, less = request.less))
        return Accepted(headEntryID = current.value.headEntryID, traceID = "brief")
    }
    override suspend fun react(storyID: String, request: ReactionRequest): Accepted {
        reactions += request
        current.value = current.value.copy(dayView = current.value.dayView?.copy(reaction = request.reaction))
        return Accepted(headEntryID = current.value.headEntryID, traceID = "reaction")
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
    override suspend fun models(): ModelsView = modelsView
    override suspend fun world(storyID: String): WorldView { worldRequests++; return worldView }
    override suspend fun people(storyID: String): PeopleView = peopleView
    override suspend fun person(storyID: String, name: String): PersonDetail = personDetail(name, peopleView)
    override suspend fun setPerson(storyID: String, name: String, request: PersonEdit): Accepted {
        personFailure?.let { throw it }
        personEdits += name to request
        return Accepted(headEntryID = current.value.headEntryID, traceID = "person")
    }
    override suspend fun setLead(storyID: String, name: String, request: LeadRequest): Accepted {
        leadSets += name to request
        worldView = worldView.copy(people = worldView.people.map { if (it.name == name) it.copy(lead = request.lead) else it })
        peopleView = peopleView.copy(people = peopleView.people.map { if (it.name == name) it.copy(lead = request.lead) else it })
        return Accepted(headEntryID = current.value.headEntryID, traceID = "lead")
    }
    override suspend fun setGroup(storyID: String, name: String, request: GroupRequest): Accepted {
        groupSets += name to request
        return Accepted(headEntryID = current.value.headEntryID, traceID = "group")
    }
    override suspend fun uploadPortrait(storyID: String, name: String, image: ByteArray, type: String, after: String): Accepted {
        portraitUploads += Triple(name, type, image)
        return Accepted(headEntryID = current.value.headEntryID, traceID = "portrait")
    }
    override suspend fun setJobModel(job: ModelJob, request: SetJobModelRequest): ModelsView {
        if (request.backup == true) backupSets += job to request.model else jobModelSets += job to request.model
        modelsView = if (request.backup == true && job == ModelJob.Actor) modelsView.copy(actorBackup = chosenOf(request.model))
        else modelsView.copy(jobs = modelsView.jobs.map {
            if (it.job != job) it else if (request.backup == true) it.copy(backup = chosenOf(request.model)) else it.copy(model = chosenOf(request.model))
        })
        return modelsView
    }
    override suspend fun setActor(storyID: String, request: SetActorRequest): ModelsView {
        actorSets += storyID to request.model
        modelsView = modelsView.copy(stories = modelsView.stories.map {
            if (it.storyID == storyID) it.copy(actor = request.model?.let(::chosenOf) ?: chosen(ModelProvider.Claude, "claude-opus-5-5", "Opus 5.5"), own = request.model != null) else it
        })
        return modelsView
    }
    /** As the Mac names a choice: the model's name from the catalog, and its effort. */
    private fun chosenOf(choice: ModelChoice): ChosenModel {
        val name = modelsView.providers.flatMap { it.models }.firstOrNull { it.id == choice.model }?.name ?: choice.model
        return ChosenModel(choice = choice, label = choice.effort?.let { "$name · $it" } ?: name)
    }
    override suspend fun journal(storyID: String): JournalView = journalView
    override suspend fun backstage(storyID: String): BackstageView = backstageView
    override suspend fun story(storyID: String): StoryView = storyView.copy(headEntryID = current.value.headEntryID)
    override suspend fun setPremise(storyID: String, request: PremiseRequest) = storyEdit("premise", request, request.after) { it.copy(premise = request.premise) }
    override suspend fun setStyle(storyID: String, request: StyleRequest) = storyEdit("style", request, request.after) { it.copy(style = request.style) }
    override suspend fun setReplyLength(storyID: String, request: ReplyLengthRequest) = storyEdit("reply-length", request, request.after) { it.copy(replyLength = request.length) }
    override suspend fun setArcs(storyID: String, request: ArcsRequest) = storyEdit("arcs", request, request.after) { it.copy(arcs = request.arcs) }
    override suspend fun setWorld(storyID: String, request: WorldRequest) = storyEdit("world", request, request.after) { it.copy(worldSummary = request.summary, worldHistory = request.history) }
    override suspend fun setPlace(storyID: String, name: String, request: PlaceRequest) = storyEdit("places/$name", request, request.after) { story ->
        val place = StoryPlace(name = name, description = request.description)
        val list = if (request.institution) story.institutions else story.places
        val next = if (list.any { it.name == name }) list.map { if (it.name == name) place else it } else list + place
        if (request.institution) story.copy(institutions = next) else story.copy(places = next)
    }
    override suspend fun setLandmark(storyID: String, name: String, request: LandmarkRequest) = storyEdit("landmarks/$name", request, request.after) { story ->
        if (story.landmarks.firstOrNull { it.name == name }?.passed == true) throw LinkFailure("$name has already happened on this Path.")
        if (minutes(request.at) <= minutes(story.worldStands)) throw LinkFailure("That time has passed on this Path.")
        val landmark = StoryLandmark(name = name, at = request.at, atLabel = "${request.at} label", what = request.what, passed = false)
        story.copy(landmarks = (story.landmarks.filter { it.name != name } + landmark).sortedBy { minutes(it.at) })
    }
    override suspend fun dropLandmark(storyID: String, name: String, request: DropLandmarkRequest) =
        storyEdit("landmarks/$name/drop", request, request.after) { it.copy(landmarks = it.landmarks.filter { landmark -> landmark.name != name }) }
    override suspend fun setClock(storyID: String, request: ClockRequest) = storyEdit("clock", request, request.after) { story ->
        if (minutes(request.at) <= minutes(story.clock.at)) throw LinkFailure("The clock only moves on.")
        val day = dayOf(request.at)
        val weekday = request.dayOne?.let(::dateOf)?.let { dayOne -> day?.let { dayOne.plusDays(it - 1L).dayOfWeek.getDisplayName(TextStyle.FULL, Locale.ENGLISH) } } ?: ""
        val time = sayMinute(minuteOf(request.at) ?: 0)
        current.value.dayView?.let { dayView -> current.value = current.value.copy(dayView = dayView.copy(at = request.at, atLabel = "$weekday $time", day = weekday, time = time)) }
        story.copy(clock = StoryClock(at = request.at, atLabel = "$weekday $time", dayOne = request.dayOne), worldStands = request.at)
    }
    /** An edit as the Mac takes it: against the head the phone saw, moving the head on, answering with The Story. */
    private fun storyEdit(route: String, request: Any, after: String, change: (StoryView) -> StoryView): StoryView {
        if (after != current.value.headEntryID) throw LinkFailure("The Story has moved on since you last looked. Nothing was changed.")
        val changed = change(storyView)
        storyEdits += route to request
        val head = "story-${storyEdits.size}"
        current.value = current.value.copy(headEntryID = head, seq = current.value.seq + 1, lastEventID = (current.value.seq + 1).toString())
        storyView = changed.copy(headEntryID = head)
        return storyView
    }
    private fun minutes(at: String) = ((dayOf(at) ?: 0) - 1) * 24 * 60 + (minuteOf(at) ?: 0)
    // Taste and steering notes live beside the Story: none moves the head (docs/adr/0020).
    override suspend fun removeTaste(storyID: String, request: RemoveTasteRequest) {
        tasteRemovals += request
        backstageView = if (request.scope == Scope.Player) backstageView.copy(playerTaste = backstageView.playerTaste - request.line)
            else backstageView.copy(taste = backstageView.taste - request.line)
    }
    override suspend fun rewordTaste(storyID: String, request: RewordTasteRequest) {
        val lessons = if (request.scope == Scope.Player) backstageView.playerTaste else backstageView.taste
        if (request.line !in lessons) throw LinkFailure("Taste has no such line.")
        tasteRewords += request
        val reworded = lessons.map { if (it == request.line) request.text else it }
        backstageView = if (request.scope == Scope.Player) backstageView.copy(playerTaste = reworded) else backstageView.copy(taste = reworded)
    }
    override suspend fun writeNote(storyID: String, request: SteeringNoteRequest) {
        notes += request
        backstageView = backstageView.copy(notes = backstageView.notes + SteeringNote(id = "note-${notes.size}", text = request.text,
            writtenAt = "2026-10-15T09:00:00Z", answered = false))
    }
    override suspend fun deleteNote(storyID: String, noteID: String) {
        deletedNotes += noteID
        backstageView = backstageView.copy(notes = backstageView.notes.filter { it.id != noteID })
    }
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
        // The World screen as drawn in World.dc.html and Person.dc.html: only what Roopesh knows.
        fun worldFixture() = WorldView(storyID = "story", traceID = "world",
            people = listOf(
                WorldPerson(name = "Draconia Malfoy", aliases = listOf("Connie"), portraitURL = null, lead = true, group = null, isGroup = false,
                    known = "Slytherin. Calls you Stray. You owe her nothing; she owes you.", knownFrom = SceneRef(number = 3, title = "The station"), heard = emptyList(),
                    between = Between(standing = "She owes you her life and treats you as hers to order about. She let you hold her when the room went cold, then ordered you to put her down, and has not thanked you.",
                        turns = listOf(
                            BetweenTurn(text = "She floated in your arms, went scarlet, and ordered you to put her down.", sceneNumber = 11, sceneTitle = "Twenty-nine minutes"),
                            BetweenTurn(text = "She billed you for the slap: Wednesdays, in the library, on her terms.", sceneNumber = 8, sceneTitle = "The price of a slap"),
                            BetweenTurn(text = "She slapped you in front of the Hall and said you were nothing to her.", sceneNumber = 6, sceneTitle = "Saturday lunch")))),
                WorldPerson(name = "Hermione Granger", aliases = emptyList(), portraitURL = null, lead = true, group = null, isGroup = false,
                    known = "Gryffindor. Noticed the inkwell. Wants a reason, not circumstances.", knownFrom = SceneRef(number = 14, title = "After curfew"),
                    heard = listOf(MeanwhileItem(text = "Lavender says she cried in the girls' bathroom after Charms.", how = How.Rumour))),
                WorldPerson(name = "Crabbe and Goyle", aliases = emptyList(), portraitURL = null, lead = false, group = null, isGroup = true,
                    known = "Draconia's shadows. Usually somewhere behind her.", knownFrom = null, heard = emptyList()),
                WorldPerson(name = "Minerva McGonagall", aliases = emptyList(), portraitURL = null, lead = false, group = null, isGroup = false,
                    known = "Head of Gryffindor. Wants your account of the troll at nine.", knownFrom = null, heard = emptyList()),
                WorldPerson(name = "Quirinus Quirrell", aliases = emptyList(), portraitURL = null, lead = false, group = null, isGroup = false,
                    known = "The nervous Defence teacher. He stammers, and smells of garlic.", knownFrom = null, heard = emptyList())),
            places = listOf(WorldPlace(name = "The Gryffindor common room", description = "Red and gold, a fire that never goes out.", been = true),
                WorldPlace(name = "The Owlery", description = "Cold, and full of owls.", been = false)),
            calendar = listOf(CalendarItem(kind = CalendarKind.Landmark, name = "Draconia's flying test", what = "Madam Hooch tests the first-years on brooms.",
                atLabel = "Wednesday 10:00 am", calendarItemWhen = "3 days")))
        // Everyone in the Malfoy Problem, for editing: no one's description.
        fun peopleFixture() = PeopleView(storyID = "story", traceID = "people",
            groups = listOf(GroupInfo(name = "Crabbe and Goyle", description = "Draconia's shadows. Usually somewhere behind her.")),
            people = listOf(
                PersonSummary(name = "Draconia Malfoy", lead = true, group = null, portraitURL = null, playerCharacter = false),
                PersonSummary(name = "Hermione Granger", lead = true, group = null, portraitURL = null, playerCharacter = false),
                PersonSummary(name = "Gregory Goyle", lead = false, group = "Crabbe and Goyle", portraitURL = null, playerCharacter = false),
                PersonSummary(name = "Minerva McGonagall", lead = false, group = null, portraitURL = null, playerCharacter = false),
                PersonSummary(name = "Quirinus Quirrell", lead = false, group = null, portraitURL = null, playerCharacter = false),
                PersonSummary(name = "Roopesh Gantasala", lead = false, group = null, portraitURL = null, playerCharacter = true)))
        private val WHO = mapOf(
            "Draconia Malfoy" to "Pure-blood heir, Slytherin, sharp-tongued and proud.",
            "Hermione Granger" to "Muggle-born, Gryffindor, top of every class.",
            "Gregory Goyle" to "Draconia's other bodyguard, larger and slower.",
            "Minerva McGonagall" to "Deputy Headmistress, Head of Gryffindor.",
            "Quirinus Quirrell" to "Serves Voldemort, who lives on the back of his head.",
            "Roopesh Gantasala" to "A Muggle-born from Bangalore with powers he hides.")
        /** A person as the Story keeps them, for the editor: who they really are included. */
        /** The Story as Story.dc.html draws it, at the fixture Scene's time: Friday 9:40 pm on Day 1. */
        fun storyFixture() = StoryView(storyID = "story", traceID = "story", title = "The Malfoy Problem",
            premise = "An enemies-to-lovers romance with Draconia Malfoy, from the first week at Hogwarts.",
            style = "Close third person, past tense. The slow burn is slow: weeks of insults before a slip.",
            replyLength = Length.Medium,
            arcs = listOf("Draconia comes round to Roopesh, slowly, against everything she was raised to be", "Harry and Roopesh become friends"),
            landmarks = listOf(
                StoryLandmark(name = "The welcome feast", at = "Day 1 19:00", atLabel = "Friday 7:00 pm · Day 1", what = "The Sorting, and the first dinner.", passed = true),
                StoryLandmark(name = "Draconia's flying test", at = "Day 4 10:00", atLabel = "Monday 10:00 am · Day 4", storyLandmarkWhen = "in 3 days",
                    what = "Madam Hooch tests the first-years. Her father is watching.", passed = false),
                StoryLandmark(name = "The betrothal", at = "Day 760 12:00", atLabel = "Monday 12:00 pm · Day 760", storyLandmarkWhen = "in 2 years",
                    what = "Lucius announces Draconia's engagement to a pure-blood heir.", passed = false)),
            worldSummary = "Hogwarts, 1991. The war is ten years over and nobody talks about who fought on which side.",
            worldHistory = "Voldemort fell at Godric's Hollow.",
            places = listOf(StoryPlace(name = "The Gryffindor common room", description = "Red and gold, a fire that never goes out."),
                StoryPlace(name = "The owlery", description = "Cold stone, straw, and every owl in the school.")),
            institutions = listOf(StoryPlace(name = "The Ministry of Magic", description = "Fudge's Ministry: slow, proud, and easily bought.")),
            clock = StoryClock(at = "Day 1 21:40", atLabel = "Friday 9:40 pm", dayOne = "1991-09-06"),
            worldStands = "Day 1 21:40", headEntryID = "reply")
        fun personDetail(name: String, people: PeopleView = peopleFixture()): PersonDetail {
            val summary = people.people.first { it.name == name }
            return PersonDetail(storyID = "story", traceID = "person", name = name, aliases = emptyList(), whoTheyAre = WHO.getValue(name),
                known = worldFixture().people.firstOrNull { it.name == name }?.known, appearance = "", wants = "", voice = emptyList(), knows = emptyList(),
                group = summary.group, lead = summary.lead, portraitURL = null, playerCharacter = summary.playerCharacter, groups = people.groups)
        }
        fun chosen(provider: ModelProvider, model: String, label: String, effort: String? = null) =
            ChosenModel(choice = ModelChoice(provider = provider, model = model, effort = effort), label = label)
        private val UP_TO_MAX = listOf("low", "medium", "high", "xhigh", "max")
        // The Models screen as drawn in Models.dc.html, the providers as they listed their models on 6 October 2026, and
        // every job on its default (the-storys-mind design decision 10): the Director on Fable 5.1 at high effort, the
        // Editor on Sonnet 5.5, the rest on Opus 5.5, and GPT 6.1 Sol as every second model.
        private val SECOND = chosen(ModelProvider.Codex, "gpt-6.1-sol", "GPT 6.1 Sol · low", "low")
        fun modelsFixture(antigravityReason: String? = null) = ModelsView(traceID = "models",
            actorBackup = SECOND,
            stories = listOf(
                StoryActor(storyID = "story", title = "The Malfoy Problem", actor = chosen(ModelProvider.Claude, "claude-opus-5-5", "Opus 5.5"), own = false),
                StoryActor(storyID = "other", title = "The coast", actor = chosen(ModelProvider.Claude, "claude-opus-5-5", "Opus 5.5"), own = false)),
            jobs = listOf(
                JobModel(job = ModelJob.Writer, title = "Writer", does = "Plans each Reply before it starts", model = chosen(ModelProvider.Claude, "claude-opus-5-5", "Opus 5.5"), backup = SECOND),
                JobModel(job = ModelJob.Editor, title = "Editor", does = "Checks each Reply before you read it", model = chosen(ModelProvider.Claude, "claude-sonnet-5-5", "Sonnet 5.5"), backup = SECOND),
                JobModel(job = ModelJob.Chronicler, title = "Chronicler", does = "Records what happened", model = chosen(ModelProvider.Claude, "claude-opus-5-5", "Opus 5.5"), backup = SECOND),
                JobModel(job = ModelJob.Director, title = "Director", does = "Keeps the Outline and plans the days ahead",
                    model = chosen(ModelProvider.Claude, "claude-fable-5-1", "Fable 5.1 · high", "high"), backup = SECOND),
                JobModel(job = ModelJob.Weaver, title = "Weaver", does = "Moves the World on", model = chosen(ModelProvider.Claude, "claude-opus-5-5", "Opus 5.5"), backup = SECOND),
                JobModel(job = ModelJob.Folder, title = "Folder", does = "Keeps The Story So Far short", model = chosen(ModelProvider.Claude, "claude-opus-5-5", "Opus 5.5"), backup = SECOND)),
            providers = listOf(
                ProviderModels(provider = ModelProvider.Claude, label = "CLAUDE", reachable = true, reason = null, models = listOf(
                    ModelOption(id = "claude-opus-5-5", name = "Opus 5.5", efforts = UP_TO_MAX, defaultEffort = null),
                    ModelOption(id = "claude-sonnet-5-5", name = "Sonnet 5.5", efforts = UP_TO_MAX, defaultEffort = null),
                    ModelOption(id = "claude-fable-5-1", name = "Fable 5.1", efforts = UP_TO_MAX, defaultEffort = null),
                    ModelOption(id = "claude-haiku-4-5-20251001", name = "Haiku 4.5", efforts = emptyList(), defaultEffort = null))),
                ProviderModels(provider = ModelProvider.Codex, label = "CODEX", reachable = true, reason = null, models = listOf(
                    ModelOption(id = "gpt-6.1-sol", name = "GPT 6.1 Sol", efforts = UP_TO_MAX + "ultra", defaultEffort = "low"),
                    ModelOption(id = "gpt-6-astra", name = "GPT 6 Astra", efforts = UP_TO_MAX + "ultra", defaultEffort = "low"),
                    ModelOption(id = "gpt-6-luna", name = "GPT 6 Luna", efforts = UP_TO_MAX, defaultEffort = "medium"))),
                ProviderModels(provider = ModelProvider.Antigravity, label = "ANTIGRAVITY", reachable = antigravityReason == null, reason = antigravityReason, models = listOf(
                    ModelOption(id = "gemini-3.8-flash", name = "Gemini 3.8 Flash", efforts = listOf("low", "medium", "high"), defaultEffort = null),
                    ModelOption(id = "gemini-3.1-pro", name = "Gemini 3.1 Pro", efforts = listOf("low", "high"), defaultEffort = null)))))
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
        fun dayView() = DayView(at = "Day 3 07:40", atLabel = "Sunday 7:40 am", day = "Sunday", time = "7:40 am", place = "Common room",
            happenings = emptyList(), choices = DayChoices(follow = emptyList(), places = emptyList(), skips = emptyList()),
            sceneEnd = SceneEnd(), reaction = null, sceneSpan = "Friday 9:40 pm – 11:05 pm", meanwhile = emptyList(),
            countdowns = listOf(Countdown(linkSchemaWhen = "3 days", landmark = "Draconia's flying test", label = "3 days to Draconia's flying test"),
                Countdown(linkSchemaWhen = "9 weeks", landmark = "Slytherin v Gryffindor", label = "9 weeks to Slytherin v Gryffindor")))
        // The Journal as drawn in Journal.dc.html.
        fun journalFixture() = JournalView(storyID = "story", traceID = "journal", days = listOf(JournalDay(day = "Friday", rows = listOf(
            JournalRow(kind = JournalRowKind.Scene, meanwhile = null, scene = JournalScene(number = 12, label = "Scene 12 · 6:10 pm · The Three Broomsticks",
                title = "The insult", summary = "Draconia calls him Stray in front of the whole pub, and Crabbe laughs a beat late.", now = false)),
            JournalRow(kind = JournalRowKind.Meanwhile, scene = null, meanwhile = MeanwhileItem(how = How.Told, text = "Ron says a troll got into the dungeons during the feast.")),
            JournalRow(kind = JournalRowKind.Scene, meanwhile = null, scene = JournalScene(number = 13, label = "Scene 13 · 8:05 pm · The girls' bathroom",
                title = "The troll", summary = "He gets Hermione out before the club comes down. Neither of them says how he moved that fast.", now = false)),
            JournalRow(kind = JournalRowKind.Scene, meanwhile = null, scene = JournalScene(number = 14, label = "Scene 14 · 9:40 pm · now",
                title = "After curfew", summary = "Hermione waited up, and wants a reason for the inkwell.", now = true))))))
        // Backstage as drawn in Backstage.dc.html.
        fun backstageFixture() = BackstageView(storyID = "story", traceID = "backstage",
            offscreen = listOf(BackstageDay(day = "Saturday", items = listOf(
                BackstageItem(time = "11:50 pm", what = "Quirrell tests the wards on the third-floor door. Nobody sees him.", knownTo = listOf("Quirinus Quirrell")),
                BackstageItem(time = "6:20 am", what = "Draconia writes to her mother about the bed Snape gave away. She leaves out the cuffs.", knownTo = listOf("Draconia Malfoy")))),
                BackstageDay(day = "Friday", items = listOf(BackstageItem(time = "10:00 pm", what = "Hagrid's lantern stops at the edge of the forest.", knownTo = listOf("Rubeus Hagrid"))))),
            threads = listOf(BackstageThread(name = "The third-floor door", now = "Quirrell has tried the wards twice and scorched the door")),
            lives = emptyList(),
            livesByTier = LivesByTier(
                close = listOf(LifeRow(who = "Draconia Malfoy", now = "Taken, and says so; furious that she means it.",
                    wants = "The Seeker's place, with her father watching.", heading = "Toward breaking with him.")),
                movers = listOf(LifeRow(who = "Quirinus Quirrell", now = "After the Stone. Tonight: the wards again.",
                    wants = "The Stone, for the one on the back of his head.", heading = "Through the wards by Christmas.")),
                others = listOf("Pansy Parkinson", "Crabbe and Goyle")),
            writer = WriterPlan(call = SceneCall.Land, purpose = "Hermione decides whether to ask what he is, before she finds out what she feels.",
                beats = listOf(WriterBeat(text = "She stops pretending to read.", status = BeatStatus.Done),
                    WriterBeat(text = "The lantern goes into the forest.", status = BeatStatus.InPlay)),
                exit = "she goes up to bed, or asks him to come and look."),
            taste = listOf("Keep school procedure to a line.", "Keep Ron in the background unless he's needed."),
            playerTaste = listOf("Don't decide what my character feels."),
            record = emptyList(), newThings = emptyList(), notes = emptyList(), outline = outlineFixture(), truth = truthFixture(),
            howItsGoing = HowItsGoing(sceneEndSeconds = listOf(150, 170, 160), replySeconds = listOf(40, 50, 54), picksOffered = 10, picksTaken = 7, more = 3, less = 1,
                editorFixed = 4, editorRewrote = 2,
                jobs = listOf(JobHealth(job = ModelJob.Actor, calls = 40, secondModel = 0, failed = 0), JobHealth(job = ModelJob.Editor, calls = 40, secondModel = 0, failed = 0),
                    JobHealth(job = ModelJob.Weaver, calls = 10, secondModel = 2, failed = 0)),
                pace = listOf(1L, 2L, 3L, 5L, 1L, 3L, 4L, 2L, 4L, 5L).mapIndexed { index, intensity -> PaceRow(sceneNumber = index + 5L, title = "Scene ${index + 5}", intensity = intensity) }))
        // The Outline as Backstage.dc.html draws it: Year One in detail, the years after outlined and sketched.
        fun outlineFixture() = OutlineView(revised = "after Scene 13, deeply", ending = "At the Battle of Hogwarts, Draconia beside him, her father's name behind her.",
            current = ActView(number = 1, title = "Year One", question = "Will Draconia choose him over the name she was raised to carry?",
                buildsTo = "the Philosopher's Stone, in June",
                turns = listOf(TurnRow(linkSchemaWhen = "September", what = "The Sorting, the slap, and the debt she bills him for", done = true),
                    TurnRow(linkSchemaWhen = "November", what = "Draconia's flying test, her father in the stands", done = false),
                    TurnRow(linkSchemaWhen = "June", what = "The Stone, and what Draconia does when it counts", done = false)),
                relationships = listOf(Relationship(people = listOf("Draconia", "Hermione"), byEnd = "Rivals who would fight for each other.")),
                intentions = listOf(Intention(who = "Draconia", pursues = "The Seeker's place, and a way out from under her father's plans for her", heading = "Toward breaking with him")),
                movers = listOf(Mover(who = "Quirrell", doing = "After the Stone: through the third-floor wards by Christmas"))),
            setups = listOf(SetupRow(what = "Nine dementors missing from Azkaban", payoff = "in June, at the Stone", planted = "Scene 12", state = State.Waiting),
                SetupRow(what = "Someone in the trophy room at night", payoff = "at Christmas, with the Mirror", planted = "Scene 9", state = State.Dropped)),
            later = listOf(ActSketch(number = 2, title = "Year Two", question = "Does the betrothal hold?", buildsTo = "the Chamber", detail = Detail.Outlined),
                ActSketch(number = 3, title = "Years Three to Seven", question = "The war comes back.", buildsTo = "the Battle of Hogwarts", detail = Detail.Sketched)),
            lookedUp = listOf("The Philosopher's Stone, chapters 13 to 17: the Stone's protections"))
        // What the Story keeps, as Backstage.dc.html draws it: the contract with where it was made, a betrothal that ended.
        fun truthFixture() = TruthView(
            people = listOf(Person(who = "Draconia Malfoy", now = "Declared him taken in front of the school, and no longer hides that she wants him.",
                sources = listOf(SourceRow(sceneNumber = 12, text = "He's mine. Anyone who wants to argue can do it to my face.")))),
            between = listOf(BetweenElement(people = listOf("Draconia", "Hermione"), stands = "Rivals bound by a contract neither will break first.",
                keepsakes = listOf("Saturdays are mine, Malfoy. Write it down."), sources = listOf(SourceRow(sceneNumber = 8, text = "Saturdays are mine, Malfoy. Write it down.")))),
            truths = listOf(
                Truth(kind = TruthKind.Agreement, what = "The contract", terms = listOf("Nobody comes second.", "Saturdays are Hermione's."),
                    knownTo = listOf("Draconia", "Hermione", "Roopesh"), sources = listOf(SourceRow(sceneNumber = 8, text = "Nobody comes second. Saturdays are mine. Sign it."))),
                Truth(kind = TruthKind.Promise, what = "Draconia says it back", terms = emptyList(), dueLabel = "By Christmas · in 9 weeks",
                    knownTo = listOf("Hermione", "Draconia"), sources = listOf(SourceRow(sceneNumber = 13, text = "You'll say it back by Christmas, or I'll say it for you."))),
                Truth(kind = TruthKind.Status, what = "Draconia is betrothed to Selwyn", terms = emptyList(), ended = "ended in Scene 13", knownTo = listOf("Draconia"),
                    sources = listOf(SourceRow(sceneNumber = 4, text = "Father has promised me to Selwyn.")))),
            rules = listOf(Rule(what = "His doubles last only minutes.", sources = listOf(SourceRow(sceneNumber = 9, text = "The second him was already thinning at the edges."))),
                Rule(what = "Everyone at Hogwarts is eighteen or older.", sources = listOf(SourceRow(sceneNumber = null, text = "Hogwarts is a university; its first-years are eighteen.")))),
            names = listOf(Name(name = "Silas Penhallow", kind = NameKind.Person, what = "An Auror of Madam Bones's office.", firstScene = 11)))
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
            lastEventID = "3", focus = null, linger = false, dayView = null, previously = null, brief = Brief(more = emptyList(), less = emptyList()),
            headEntryID = "reply", pathID = "path", playerCharacter = "Roopesh Gantasala",
            scene = SceneCard(at = "Day 1 21:40", atLabel = "Friday 9:40 pm", number = 14,
                people = listOf(PersonCard(name = "Hermione", portraitURL = null)), place = "Common room", title = "After curfew"),
            seq = 3, storyID = "story", traceID = "view", turn = TurnState(kind = TurnStateKind.Idle)
        )
    }
}
