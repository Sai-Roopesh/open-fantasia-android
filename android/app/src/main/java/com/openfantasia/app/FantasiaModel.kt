package com.openfantasia.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openfantasia.protocol.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

/** A Move written while the Mac was away, sent once it is back (openspec presence). */
data class WaitingMove(val storyID: String, val after: String, val text: String)
/** The person editor while it is open: whom it edits (null for someone new), and why a save was refused. */
data class PersonEditing(val person: PersonDetail?, val problem: String? = null, val saving: Boolean = false)
/** What The Story's editor sheet is editing (editing-the-story design decision 6). */
sealed interface StoryEdit {
    data object Premise : StoryEdit
    data object Style : StoryEdit
    data object World : StoryEdit
    data object Clock : StoryEdit
    /** An Arc by its place in the list, or a new one. */
    data class Arc(val index: Int?) : StoryEdit
    /** A Landmark by name, or a new one. */
    data class Landmark(val name: String?) : StoryEdit
    data class Place(val name: String?, val institution: Boolean) : StoryEdit
    /**
     * A lesson in a Taste, from Backstage: the Story's own, or the player's own across every Story ([scope]).
     */
    data class Taste(val line: String, val scope: Scope) : StoryEdit
    /** The player's brief, from Backstage: what they want more of and less of, as it stands. */
    data class Brief(val more: List<String>, val less: List<String>) : StoryEdit
}
data class StoryEditing(val target: StoryEdit, val problem: String? = null, val saving: Boolean = false)
data class AppProblem(val reason: String, val traceID: String? = null, val needsUpdate: Boolean = false)
/** A reaction given while the Scene's end runs: the Mac takes it once the end is done or stopped, as it takes no edit before. */
data class HeldReaction(val storyID: String, val sceneNumber: Long, val reaction: Reaction?)
data class FantasiaState(
    val paired: Boolean,
    val hostName: String = "Mac",
    val stories: List<StorySummary> = emptyList(),
    val scene: SceneView? = null,
    val readingScene: SceneSummaryLine? = null,
    val pastScene: PastScene? = null,
    val pastSceneLoading: Boolean = false,
    /** The Paths screen, while it is open (openspec paths: The Paths screen). */
    val showingPaths: Boolean = false,
    val paths: PathsView? = null,
    /** The Journal and Backstage, while open (openspec outside-the-scene). */
    val showingJournal: Boolean = false,
    val journal: JournalView? = null,
    val showingBackstage: Boolean = false,
    val backstage: BackstageView? = null,
    /** The World screen, while it is open (openspec outside-the-scene: The World screen shows what the Player Character knows). */
    val showingWorld: Boolean = false,
    val world: WorldView? = null,
    /** Everyone in the Story, for editing, and the person opened from it (openspec stories; editing-people decision 7). */
    val showingEveryone: Boolean = false,
    val people: PeopleView? = null,
    val personPage: PersonDetail? = null,
    val editing: PersonEditing? = null,
    /** The Story screen, while it is open, and its editor sheet (editing-the-story design decision 6). */
    val showingStory: Boolean = false,
    val story: StoryView? = null,
    val storyEditing: StoryEditing? = null,
    /** The Models screen while it is open; the Models view also feeds the model for one Reply (openspec presence, scenes). */
    val showingModels: Boolean = false,
    val models: ModelsView? = null,
    val draft: String = "",
    /** A steering note being written in Backstage, kept until the Mac has it (openspec the-outline). */
    val noteDraft: String = "",
    val waitingMove: WaitingMove? = null,
    val heldReaction: HeldReaction? = null,
    val sending: Boolean = false,
    val waiting: Boolean = false,
    val reachable: Boolean = false,
    val loading: Boolean = false,
    val problem: AppProblem? = null
)

class FantasiaModel(private val link: FantasiaLink, private val previouslyStore: PreviouslyStore = MemoryPreviouslyStore()) : ViewModel() {
    private val mutable = MutableStateFlow(FantasiaState(paired = link.isPaired, hostName = link.hostName))
    val state = mutable.asStateFlow()
    private var stream: Job? = null
    private var pastSceneJob: Job? = null
    private var pendingMoveID: String? = null
    private var afterSeq = 0L

    init {
        viewModelScope.launch { link.reachable.collect { reachable ->
            mutable.update { it.copy(reachable = reachable) }
            if (reachable) sendWaitingMove()
        } }
        if (link.isPaired) home()
    }

    fun pair(scanner: PairingScanner) {
        if (mutable.value.loading) return
        viewModelScope.launch {
            mutable.update { it.copy(loading = true, problem = null) }
            try {
                val invite = linkJson.decodeFromString<PairingInvite>(scanner.scan())
                if (invite.contract != CONTRACT_VERSION.toLong()) throw LinkFailure(UPDATE_REQUIRED, versionMismatch = true)
                link.pair(invite)
                val stories = link.stories().stories
                mutable.update { it.copy(paired = true, stories = stories, hostName = link.hostName) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                showProblem(if (e is SerializationException || e is IllegalArgumentException)
                    LinkFailure("The QR code does not contain valid Mac pairing details") else e)
            } finally { mutable.update { it.copy(loading = false) } }
        }
    }

    fun home() {
        stream?.cancel()
        closeModels()
        closePastScene()
        closePaths()
        closeJournal()
        closeBackstage()
        closeWorld()
        viewModelScope.launch {
            mutable.update { it.copy(scene = null, loading = true, problem = null) }
            try {
                val stories = link.stories().stories
                mutable.update { it.copy(stories = stories) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e)
            } finally { mutable.update { it.copy(loading = false) } }
        }
    }

    fun openStory(storyID: String) {
        stream?.cancel()
        stream = viewModelScope.launch {
            mutable.update { it.copy(loading = true, problem = null) }
            try {
                val scene = link.scene(storyID)
                pendingMoveID = null
                mutable.update { it.copy(scene = visibleScene(scene), loading = false, waiting = false) }
                if (mutable.value.reachable) sendWaitingMove()
                link.watch(scene).collect { updated ->
                    val finished = updated.turn.kind == TurnStateKind.Failed ||
                        (updated.seq > afterSeq && updated.headEntryID != pendingMoveID && updated.turn.kind == TurnStateKind.Idle)
                    if (finished) pendingMoveID = null
                    mutable.update { it.copy(scene = visibleScene(updated), waiting = if (finished) false else it.waiting) }
                    sendHeldReaction()
                }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e)
            } finally { mutable.update { it.copy(loading = false) } }
        }
    }

    private fun visibleScene(scene: SceneView): SceneView = scene.copy(previously = scene.previously?.takeUnless {
        previouslyStore.read(scene.storyID) == it.since
    })

    fun dismissPreviously() {
        val scene = mutable.value.scene ?: return
        val previously = scene.previously ?: return
        previouslyStore.write(scene.storyID, previously.since)
        mutable.update { it.copy(scene = it.scene?.let(::visibleScene)) }
    }

    fun pause() { stream?.cancel() }
    /** Back in front: the Story open is read again, or on Home every Story is, since the Mac may have moved one meanwhile. */
    fun resume() {
        val state = mutable.value
        when {
            state.scene != null -> openStory(state.scene.storyID)
            state.paired -> viewModelScope.launch {
                try { link.stories().stories.let { stories -> mutable.update { it.copy(stories = stories) } }
                } catch (e: CancellationException) { throw e
                } catch (_: Exception) { /* Home keeps what it showed; the connection line says the Mac is away. */ }
            }
        }
    }

    fun writeMove(text: String) { mutable.update { it.copy(draft = text) } }

    fun openPastScene(number: Long) {
        val scene = mutable.value.scene ?: return
        val earlier = scene.earlierScenes.firstOrNull { it.number == number } ?: return
        closePastScene()
        mutable.update { it.copy(readingScene = earlier, pastSceneLoading = true, problem = null) }
        pastSceneJob = viewModelScope.launch {
            try {
                val past = link.pastScene(scene.storyID, number)
                mutable.update { it.copy(pastScene = past) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e)
            } finally {
                if (currentCoroutineContext().isActive) mutable.update { it.copy(pastSceneLoading = false) }
            }
        }
    }

    fun openPaths() {
        val scene = mutable.value.scene ?: return
        mutable.update { it.copy(showingPaths = true, paths = null, problem = null) }
        viewModelScope.launch {
            try { val paths = link.paths(scene.storyID); mutable.update { it.copy(paths = paths) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e) }
        }
    }

    fun closePaths() { mutable.update { it.copy(showingPaths = false, paths = null) } }

    fun openWorld() = openOutside({ it.copy(showingWorld = true, world = null) }) { id -> link.world(id).let { view -> { s: FantasiaState -> s.copy(world = view) } } }
    fun closeWorld() { mutable.update { it.copy(showingWorld = false, world = null, showingEveryone = false, people = null, personPage = null, editing = null) } }

    fun openEveryone() {
        mutable.update { it.copy(showingEveryone = true, problem = null) }
        loadPeople()
    }
    fun closeEveryone() { mutable.update { it.copy(showingEveryone = false, people = null, personPage = null) } }

    /** Reads everyone in the Story, for the list and the Group picker. */
    fun loadPeople() {
        val scene = mutable.value.scene ?: return
        viewModelScope.launch {
            try { val people = link.people(scene.storyID); mutable.update { it.copy(people = people) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e) }
        }
    }

    /** Opens someone's page from Everyone in the Story. */
    fun openPersonPage(name: String) {
        val scene = mutable.value.scene ?: return
        viewModelScope.launch {
            try { val person = link.person(scene.storyID, name); mutable.update { it.copy(personPage = person) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e) }
        }
    }
    fun closePersonPage() { mutable.update { it.copy(personPage = null) } }

    /** Opens the editor on someone, as the Story keeps them, who they really are included. */
    fun editPerson(name: String) {
        val scene = mutable.value.scene ?: return
        viewModelScope.launch {
            try { val person = link.person(scene.storyID, name); mutable.update { it.copy(editing = PersonEditing(person)) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e) }
        }
    }
    fun newPerson() { mutable.update { it.copy(editing = PersonEditing(null)) } }
    fun closeEditor() { mutable.update { it.copy(editing = null) } }

    /**
     * Saves the editor: the person whole, then the Portrait chosen for someone new, each from the head the last edit
     * left. A refusal stays in the editor with what was written; the screens read the Story again afterwards.
     */
    fun savePerson(name: String, edit: PersonEdit, portrait: PickedImage?) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (!state.canChangePath) return
        mutable.update { it.copy(editing = it.editing?.copy(problem = null, saving = true)) }
        viewModelScope.launch {
            try {
                val accepted = link.setPerson(scene.storyID, name, edit.copy(after = scene.headEntryID))
                if (portrait != null) link.uploadPortrait(scene.storyID, name, portrait.bytes, portrait.type, accepted.headEntryID)
                mutable.update { it.copy(editing = null) }
                afterEdit(scene.storyID)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                val reason = (e as? LinkFailure)?.reason ?: "The Mac is unreachable. Nothing was saved."
                mutable.update { it.copy(editing = it.editing?.copy(problem = reason, saving = false)) }
            }
        }
    }

    fun setLead(name: String, lead: Boolean) = edit { scene -> link.setLead(scene.storyID, name, LeadRequest(after = scene.headEntryID, lead = lead)) }

    fun replacePortrait(name: String, image: PickedImage) = edit { scene -> link.uploadPortrait(scene.storyID, name, image.bytes, image.type, scene.headEntryID) }

    /** Puts someone in a Group, or none, changing nothing else about them. */
    fun setPersonGroup(name: String, group: String?) = edit { scene ->
        val person = link.person(scene.storyID, name)
        link.setPerson(scene.storyID, name, person.asEdit(after = scene.headEntryID, group = group))
    }

    /** Creates a Group, and puts [person] in it when there is one. */
    fun newGroup(group: String, description: String, person: String?) = edit { scene ->
        val accepted = link.setGroup(scene.storyID, group, GroupRequest(after = scene.headEntryID, description = description))
        if (person != null) link.setPerson(scene.storyID, person, link.person(scene.storyID, person).asEdit(after = accepted.headEntryID, group = group))
        else accepted
    }

    private fun edit(change: suspend (SceneView) -> Accepted) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (!state.canChangePath) return
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try { change(scene); afterEdit(scene.storyID)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e)
            } finally { mutable.update { it.copy(sending = false) } }
        }
    }

    /** Reads again what an edit changed: the Scene's head, and whichever of the World, Everyone and a page is open. */
    private suspend fun afterEdit(storyID: String) {
        val fresh = link.scene(storyID)
        mutable.update { it.copy(scene = visibleScene(fresh)) }
        val state = mutable.value
        if (state.showingWorld) link.world(storyID).let { world -> mutable.update { it.copy(world = world) } }
        if (state.showingEveryone) link.people(storyID).let { people -> mutable.update { it.copy(people = people) } }
        state.personPage?.let { page -> link.person(storyID, page.name).let { person -> mutable.update { it.copy(personPage = person) } } }
        if (state.showingBackstage) link.backstage(storyID).let { backstage -> mutable.update { it.copy(backstage = backstage) } }
    }
    fun openStoryScreen() = openOutside({ it.copy(showingStory = true, story = null) }) { id -> link.story(id).let { view -> { s: FantasiaState -> s.copy(story = view) } } }
    fun closeStoryScreen() { mutable.update { it.copy(showingStory = false, story = null, storyEditing = null) } }
    fun openStoryEditor(target: StoryEdit) { mutable.update { it.copy(storyEditing = StoryEditing(target)) } }
    fun closeStoryEditor() { mutable.update { it.copy(storyEditing = null) } }

    /** The reply length, sent as soon as a chip is tapped. */
    fun setReplyLength(length: Length) = storyChange(inSheet = false) { link.setReplyLength(it.storyID, ReplyLengthRequest(after = it.headEntryID, length = length)) }
    fun savePremise(premise: String) = storyChange { link.setPremise(it.storyID, PremiseRequest(after = it.headEntryID, premise = premise)) }
    fun saveStyle(style: String) = storyChange { link.setStyle(it.storyID, StyleRequest(after = it.headEntryID, style = style)) }
    fun saveWorld(summary: String, history: String) = storyChange { link.setWorld(it.storyID, WorldRequest(after = it.headEntryID, summary = summary, history = history)) }
    /** Moves the clock on to [at], with Day 1's date (YYYY-MM-DD), or null for a Story with no calendar. */
    fun saveClock(at: String, dayOne: String?) = storyChange { link.setClock(it.storyID, ClockRequest(after = it.headEntryID, at = at, dayOne = dayOne)) }
    fun saveLandmark(name: String, creating: Boolean, at: String, what: String) =
        storyChange { link.setLandmark(it.storyID, name, LandmarkRequest(after = it.headEntryID, at = at, what = what, create = creating)) }
    fun dropLandmark(name: String) = storyChange { link.dropLandmark(it.storyID, name, DropLandmarkRequest(after = it.headEntryID)) }
    fun savePlace(name: String, institution: Boolean, creating: Boolean, description: String) =
        storyChange { link.setPlace(it.storyID, name, PlaceRequest(after = it.headEntryID, description = description, institution = institution, create = creating)) }
    /** The brief, a line a thing (openspec long-run: The player steers with a brief and reactions). */
    fun saveBrief(more: List<String>, less: List<String>) = storyChange {
        link.setBrief(it.storyID, BriefRequest(more = more.map(String::trim).filter(String::isNotEmpty), less = less.map(String::trim).filter(String::isNotEmpty)))
    }

    /**
     * The player's reaction to the Scene that just ended, or none when [reaction] is null. While the Scene's end runs it
     * is held, shown as given, and sent once the end is done or stopped.
     */
    fun react(reaction: Reaction?) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (scene.dayView == null || !state.canReact) return
        mutable.update { it.copy(heldReaction = HeldReaction(scene.storyID, scene.scene.number, reaction)) }
        sendHeldReaction()
    }

    private fun sendHeldReaction() {
        val state = mutable.value
        val held = state.heldReaction ?: return
        val scene = state.scene
        val day = scene?.dayView
        if (scene == null || day == null || scene.storyID != held.storyID || scene.scene.number != held.sceneNumber) {
            mutable.update { it.copy(heldReaction = null) }
            return
        }
        if (day.sceneEnd.step != null || !state.canChangePath) return
        mutable.update { it.copy(heldReaction = null) }
        if (day.reaction == held.reaction) return
        edit { link.react(it.storyID, ReactionRequest(sceneNumber = held.sceneNumber, reaction = held.reaction)) }
    }

    /** Adds an Arc, or rewords the one at [index]; the Arcs are sent whole. */
    fun saveArc(index: Int?, words: String) {
        val arcs = mutable.value.story?.arcs ?: return
        storyChange { link.setArcs(it.storyID, ArcsRequest(after = it.headEntryID, arcs = if (index == null) arcs + words else arcs.mapIndexed { at, arc -> if (at == index) words else arc })) }
    }
    fun dropArc(index: Int) {
        val arcs = mutable.value.story?.arcs ?: return
        storyChange { link.setArcs(it.storyID, ArcsRequest(after = it.headEntryID, arcs = arcs.filterIndexed { at, _ -> at != index })) }
    }

    /**
     * Sends an edit to the Story from the head the phone saw. The answer is The Story as it now stands, or for the
     * brief only that it was taken; the Scene and whatever else is open are read again. A refusal stays in the sheet
     * with what was written, or, for a chip, shows as the screen's problem.
     */
    private fun storyChange(inSheet: Boolean = true, change: suspend (SceneView) -> Any) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (!state.canChangePath) return
        mutable.update { it.copy(sending = true, problem = null, storyEditing = it.storyEditing?.copy(problem = null, saving = true)) }
        viewModelScope.launch {
            try {
                val story = change(scene) as? StoryView
                mutable.update { it.copy(story = if (it.showingStory && story != null) story else it.story, storyEditing = null) }
                afterEdit(scene.storyID)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                if (inSheet && mutable.value.storyEditing != null) {
                    val reason = (e as? LinkFailure)?.reason ?: "The Mac is unreachable. Nothing was saved."
                    mutable.update { it.copy(storyEditing = it.storyEditing?.copy(problem = reason, saving = false)) }
                } else showProblem(e)
            } finally { mutable.update { it.copy(sending = false) } }
        }
    }

    fun openJournal() = openOutside({ it.copy(showingJournal = true, journal = null) }) { id -> link.journal(id).let { view -> { s: FantasiaState -> s.copy(journal = view) } } }
    fun closeJournal() { mutable.update { it.copy(showingJournal = false, journal = null) } }
    fun openBackstage() = openOutside({ it.copy(showingBackstage = true, backstage = null) }) { id -> link.backstage(id).let { view -> { s: FantasiaState -> s.copy(backstage = view) } } }
    fun closeBackstage() { mutable.update { it.copy(showingBackstage = false, backstage = null) } }

    /** Opens a screen outside the Scene and reads it from the Mac, only now that it is visited. */
    private fun openOutside(open: (FantasiaState) -> FantasiaState, read: suspend (String) -> (FantasiaState) -> FantasiaState) {
        val scene = mutable.value.scene ?: return
        mutable.update { open(it).copy(problem = null) }
        viewModelScope.launch {
            try { val apply = read(scene.storyID); mutable.update(apply)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e) }
        }
    }

    /** Deletes a lesson from the Story's Taste or the player's own (openspec long-run: Taste is short, readable and the player's). */
    fun removeTaste(scope: Scope, line: String) = besideChange { link.removeTaste(it, RemoveTasteRequest(line = line, scope = scope)) }
    /** Rewords a lesson, from the sheet: later Scenes read the new words, and the old ones are gone. */
    fun rewordTaste(scope: Scope, line: String, text: String) = besideChange { link.rewordTaste(it, RewordTasteRequest(line = line, scope = scope, text = text)) }

    fun writeNote(text: String) { mutable.update { it.copy(noteDraft = text) } }
    /**
     * Sends the note being written to the Director (openspec the-outline: The player sees and steers the Outline): it
     * shows in Backstage as waiting until the next Scene's end answers it. The words stay in the field if it is refused.
     */
    fun sendNote() {
        val text = mutable.value.noteDraft.trim()
        if (text.isEmpty()) return
        besideChange(done = { mutable.update { state -> state.copy(noteDraft = if (state.noteDraft.trim() == text) "" else state.noteDraft) } }) {
            link.writeNote(it, SteeringNoteRequest(text = text))
        }
    }
    fun deleteNote(id: String) = besideChange { link.deleteNote(it, id) }

    /**
     * Changes what lives beside the Story rather than on a Path (docs/adr/0020): Taste and the steering notes, taken
     * whatever the Scene is doing, then Backstage is read again. A refusal stays in the sheet that sent it with what was
     * written, or shows as the screen's problem.
     */
    private fun besideChange(done: () -> Unit = {}, change: suspend (String) -> Unit) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (!state.canChangeBeside) return
        mutable.update { it.copy(sending = true, problem = null, storyEditing = it.storyEditing?.copy(problem = null, saving = true)) }
        viewModelScope.launch {
            try {
                change(scene.storyID)
                mutable.update { it.copy(storyEditing = null) }
                done()
                if (mutable.value.showingBackstage) link.backstage(scene.storyID).let { backstage -> mutable.update { it.copy(backstage = backstage) } }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                if (mutable.value.storyEditing != null) {
                    val reason = (e as? LinkFailure)?.reason ?: "The Mac is unreachable. Nothing was saved."
                    mutable.update { it.copy(storyEditing = it.storyEditing?.copy(problem = reason, saving = false)) }
                } else showProblem(e)
            } finally { mutable.update { it.copy(sending = false) } }
        }
    }

    fun tryAnotherWay(from: String?) = changePath { link.tryAnotherWay(it.storyID, TryAnotherWayRequest(from = from, after = it.headEntryID)) }
    fun rewind(to: String) = changePath { link.rewind(it.storyID, RewindRequest(to = to, after = it.headEntryID)) }
    fun openPath(pathID: String) = changePath { link.openPath(it.storyID, pathID) }
    fun renamePath(pathID: String, name: String) = changePath(staysOnPaths = true) { link.renamePath(it.storyID, pathID, RenamePathRequest(name = name)) }
    fun deletePath(pathID: String) = changePath(staysOnPaths = true) { link.deletePath(it.storyID, pathID) }
    fun clearPaths() = changePath(staysOnPaths = true) { link.clearPaths(it.storyID) }
    /** Edit a Move or a Reply (openspec scenes: Editing): the Mac decides whether in place or on a new Path. */
    fun edit(entryID: String, text: String) = changePath { link.edit(it.storyID, EditRequest(entry = entryID, text = text, after = it.headEntryID)) }

    /**
     * Sends a Path command, then reads the Scene again from the Mac, which owns where the Story now stands; the
     * stream says the same to every other phone. A change that moves the player closes the Paths screen and the
     * earlier Scene being read; renaming, deleting and clearing stay on the Paths screen and read it again.
     */
    private fun changePath(staysOnPaths: Boolean = false, command: suspend (SceneView) -> Accepted) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (!state.canChangePath) return
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try {
                command(scene)
                val fresh = link.scene(scene.storyID)
                if (staysOnPaths) {
                    val paths = link.paths(scene.storyID)
                    mutable.update { it.copy(scene = visibleScene(fresh), paths = paths) }
                } else {
                    closePastScene()
                    mutable.update { it.copy(scene = visibleScene(fresh), showingPaths = false, paths = null) }
                }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e)
            } finally { mutable.update { it.copy(sending = false) } }
        }
    }

    fun closePastScene() {
        pastSceneJob?.cancel()
        pastSceneJob = null
        mutable.update { it.copy(readingScene = null, pastScene = null, pastSceneLoading = false, problem = null) }
    }

    fun sendMove() {
        val state = mutable.value
        val scene = state.scene ?: return
        if (!state.canSendMove) return
        if (!state.reachable) {
            mutable.update { it.copy(waitingMove = WaitingMove(scene.storyID, scene.headEntryID, state.draft), draft = "") }
            return
        }
        sendTurn(scene, clearDraft = state.draft) {
            link.move(scene.storyID, MoveRequest(after = scene.headEntryID, text = state.draft))
        }
    }

    /**
     * The Mac is back: the waiting Move is sent once, after the Scene is read again. If the Story moved on meanwhile
     * it goes back to the composer with the reason; it is never sent blind, and never twice.
     */
    private fun sendWaitingMove() {
        val move = mutable.value.waitingMove ?: return
        if (mutable.value.scene?.storyID != move.storyID) return
        mutable.update { it.copy(waitingMove = null, sending = true) }
        viewModelScope.launch {
            val fresh = try { link.scene(move.storyID)
            } catch (e: CancellationException) { mutable.update { it.copy(waitingMove = move, sending = false) }; throw e
            } catch (e: Exception) {
                // Not read, so not sent: it keeps waiting for the Mac.
                mutable.update { it.copy(waitingMove = move, sending = false) }
                return@launch
            }
            mutable.update { it.copy(scene = visibleScene(fresh), sending = false) }
            if (fresh.headEntryID != move.after || fresh.turn.kind != TurnStateKind.Idle || fresh.replyComing) {
                mutable.update { it.copy(draft = giveBack(move, it.draft), problem = AppProblem(MOVED_ON)) }
                return@launch
            }
            sendTurn(fresh, giveBack = move) { link.move(move.storyID, MoveRequest(after = move.after, text = move.text)) }
        }
    }

    private fun giveBack(move: WaitingMove, draft: String) = listOf(move.text, draft).filter { it.isNotBlank() }.joinToString("\n")

    fun choose(request: ChooseRequest) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (scene.dayView?.sceneEnd?.done != true || !state.canChangeScene || request.after != scene.headEntryID) return
        sendTurn(scene) { link.choose(scene.storyID, request) }
    }

    // Moves and Day View choices are the same turn on the Mac, including acceptance before the stream catches up.
    private fun sendTurn(scene: SceneView, clearDraft: String? = null, giveBack: WaitingMove? = null, command: suspend () -> TurnAccepted) {
        afterSeq = scene.seq
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try {
                val accepted = command()
                pendingMoveID = accepted.moveEntryID
                val current = mutable.value.scene
                val finished = current != null && (current.turn.kind == TurnStateKind.Failed ||
                    (current.seq > scene.seq && current.headEntryID != accepted.moveEntryID && current.turn.kind == TurnStateKind.Idle))
                mutable.update { it.copy(draft = if (clearDraft != null && it.draft == clearDraft) "" else it.draft, waiting = !finished) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                showProblem(e)
                if (giveBack != null) mutable.update { it.copy(draft = giveBack(giveBack, it.draft)) }
                // Re-read the Mac's head before another command; a refused or interrupted turn can leave the view behind.
                if (e !is LinkFailure || !e.versionMismatch) {
                    try { val fresh = link.scene(scene.storyID); mutable.update { it.copy(scene = visibleScene(fresh)) }
                    } catch (cancelled: CancellationException) { throw cancelled
                    } catch (_: Exception) { }
                }
            } finally { mutable.update { it.copy(sending = false) } }
        }
    }

    fun openModels() {
        mutable.update { it.copy(showingModels = true, problem = null) }
        loadModels()
    }

    fun closeModels() { mutable.update { it.copy(showingModels = false) } }

    /** Reads what the Mac's jobs run on and what each provider offers, for the Models screen or a choice of model. */
    fun loadModels() {
        viewModelScope.launch {
            try { val models = link.models(); mutable.update { it.copy(models = models) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e) }
        }
    }

    /** Sets a job's model from its next work; the Mac answers with the screen as it now stands. */
    fun setJobModel(job: ModelJob, choice: ModelChoice) = changeModels { link.setJobModel(job, SetJobModelRequest(model = choice)) }

    /** Sets a job's second model, tried once when its own fails or runs too long (openspec presence: Nothing fails silently). */
    fun setJobBackup(job: ModelJob, choice: ModelChoice) = changeModels { link.setJobModel(job, SetJobModelRequest(model = choice, backup = true)) }

    /** Sets a Story's own Actor, or null for the one its Story File names. */
    fun setActor(storyID: String, choice: ModelChoice?) = changeModels { link.setActor(storyID, SetActorRequest(model = choice)) }

    private fun changeModels(change: suspend () -> ModelsView) {
        if (!mutable.value.reachable) return
        mutable.update { it.copy(problem = null) }
        viewModelScope.launch {
            try { val models = change(); mutable.update { it.copy(models = models) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e) }
        }
    }

    /**
     * Goes on with a Scene's end from the step it stopped at; with a model, that step runs on it for this one try
     * (openspec presence: A step at a Scene's end fails). The steps before it are not run again.
     */
    fun retrySceneEnd(model: ModelChoice? = null) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (scene.dayView?.sceneEnd?.failed == null || state.loading || state.sending || state.waiting ||
            !state.reachable || state.problem?.needsUpdate == true) return
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try {
                link.retry(scene.storyID, RetryRequest(model = model))
                val fresh = link.scene(scene.storyID)
                mutable.update { it.copy(scene = visibleScene(fresh)) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e)
            } finally { mutable.update { it.copy(sending = false) } }
        }
    }

    /** Writes the failed Reply again; with a model, the job that failed runs on it for this one try (openspec presence). */
    fun retryReply(model: ModelChoice? = null) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (scene.turn.kind != TurnStateKind.Failed || state.sending || state.waiting || !state.reachable || state.problem?.needsUpdate == true) return
        afterSeq = scene.seq
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try {
                val accepted = link.retry(scene.storyID, RetryRequest(model = model))
                pendingMoveID = accepted.moveEntryID
                val current = mutable.value.scene
                val finished = current != null && current.seq > scene.seq && current.headEntryID != accepted.moveEntryID && current.turn.kind == TurnStateKind.Idle
                mutable.update { it.copy(waiting = !finished) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e)
            } finally { mutable.update { it.copy(sending = false) } }
        }
    }

    fun focus(name: String) {
        val scene = mutable.value.scene ?: return
        if (scene.dayView != null) return
        changeScene { link.focus(it.storyID, FocusRequest(after = it.headEntryID, on = name.takeUnless { it == scene.focus })) }
    }

    fun linger(on: Boolean) {
        if (mutable.value.scene?.dayView != null) return
        changeScene { link.linger(it.storyID, LingerRequest(after = it.headEntryID, on = on)) }
    }

    /** Writes the latest Reply again; with a model, on it for just this Reply (openspec scenes: Redo on another model). */
    fun redo(direction: String?, remember: Boolean, model: ModelChoice? = null) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (!state.canChangeScene || scene.exchanges.lastOrNull()?.let { it.move != null && it.reply != null } != true) return
        afterSeq = scene.seq
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try {
                val accepted = link.redo(scene.storyID, RedoRequest(after = scene.headEntryID,
                    direction = direction?.trim()?.takeIf { it.isNotEmpty() }, remember = remember, model = model))
                pendingMoveID = accepted.moveEntryID
                val current = mutable.value.scene
                val finished = current != null && current.seq > scene.seq && current.headEntryID != accepted.moveEntryID && current.turn.kind == TurnStateKind.Idle
                mutable.update { it.copy(waiting = !finished) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                showProblem(e)
                if (e !is LinkFailure || !e.versionMismatch) {
                    try { val fresh = link.scene(scene.storyID); mutable.update { it.copy(scene = visibleScene(fresh)) } }
                    catch (cancelled: CancellationException) { throw cancelled }
                    catch (_: Exception) { }
                }
            } finally { mutable.update { it.copy(sending = false) } }
        }
    }

    fun endScene() {
        val scene = mutable.value.scene ?: return
        if (scene.dayView != null) return
        changeScene { link.endScene(it.storyID, EndSceneRequest(after = it.headEntryID)) }
    }

    private fun changeScene(command: suspend (SceneView) -> Unit) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (!state.canChangeScene) return
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try {
                command(scene)
                openStory(scene.storyID)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                showProblem(e)
                if (e !is LinkFailure || !e.versionMismatch) {
                    // Reload before another command, preserving the reason for the refusal.
                    try { val fresh = link.scene(scene.storyID); mutable.update { it.copy(scene = visibleScene(fresh)) } }
                    catch (cancelled: CancellationException) { throw cancelled }
                    catch (_: Exception) { }
                }
            } finally { mutable.update { it.copy(sending = false) } }
        }
    }

    fun portrait(url: String) = link.portrait(url)

    // Only a network failure means the Mac is unreachable; anything else is said as it is, so nothing fails silently.
    private fun showProblem(e: Exception) {
        val problem = when (e) {
            is LinkFailure -> AppProblem(e.reason, e.traceID, e.versionMismatch)
            is java.io.IOException -> AppProblem("The Mac is unreachable. Check that the phone and Mac share a network.")
            else -> AppProblem("The phone could not show this: ${e::class.simpleName}: ${e.message}")
        }
        mutable.update { it.copy(problem = problem) }
    }
}

val FantasiaState.canChangeScene: Boolean
    get() = sceneSettled && reachable

/** Everything a change to the Scene needs but the Mac; a Move can wait for the Mac (openspec presence). */
private val FantasiaState.sceneSettled: Boolean
    get() = scene?.turn?.kind == TurnStateKind.Idle && sceneEndDone && !scene.replyComing && !loading && !sending && !waiting && problem?.needsUpdate != true

internal val FantasiaState.replyComing: Boolean
    get() = scene?.replyComing == true || (waiting && scene?.turn?.kind != TurnStateKind.Failed)
/**
 * Paths change only between Replies (openspec paths: A Path changes only between Replies); a failed one does not hold
 * them. Nor does the Story change while a Scene's end runs: the Mac takes no edit until it is done or stopped.
 */
internal val FantasiaState.canChangePath: Boolean
    get() = scene != null && !replyComing && scene.dayView?.sceneEnd?.step == null && reachable && !loading && !sending && problem?.needsUpdate != true

/** Taste and steering notes live beside the Story, not on a Path: they change whenever the Mac is there to take them. */
internal val FantasiaState.canChangeBeside: Boolean
    get() = scene != null && reachable && !loading && !sending && problem?.needsUpdate != true

/** A reaction can be given at any time after a Scene ends; one given while its end runs is held until it is done. */
internal val FantasiaState.canReact: Boolean
    get() = scene?.dayView != null && reachable && !loading && !sending && problem?.needsUpdate != true

/** The reaction the ended Scene's card shows: one held for the Mac, or the Mac's. */
internal val FantasiaState.shownReaction: Reaction?
    get() = heldReaction?.takeIf { it.storyID == scene?.storyID && it.sceneNumber == scene?.scene?.number }.let { held -> if (held != null) held.reaction else scene?.dayView?.reaction }
internal val FantasiaState.canSendMove: Boolean
    get() = draft.isNotBlank() && waitingMove == null && sceneSettled && !replyComing

private const val MOVED_ON = "The Story moved on while the Mac was away. Your Move is back to send again."

/** Whether the Day View is ready: no Scene's end under way or stopped, or no Day View at all. */
internal val FantasiaState.sceneEndDone: Boolean
    get() = scene?.dayView?.sceneEnd?.done ?: true

/** A Scene's end is done when no step is under way and none stopped (docs/adr/0016). */
internal val SceneEnd.done: Boolean get() = step == null && failed == null

/** A person as the editor sends them back, with what it changes. */
internal fun PersonDetail.asEdit(after: String, group: String? = this.group) = PersonEdit(after = after, create = false, aliases = aliases,
    whoTheyAre = whoTheyAre, known = known, appearance = appearance, wants = wants, voice = voice, knows = knows, group = group)

