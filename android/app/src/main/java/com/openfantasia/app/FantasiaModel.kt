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

data class AppProblem(val reason: String, val traceID: String? = null, val needsUpdate: Boolean = false)
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
    val draft: String = "",
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
        viewModelScope.launch { link.reachable.collect { reachable -> mutable.update { it.copy(reachable = reachable) } } }
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
        closePastScene()
        closePaths()
        closeJournal()
        closeBackstage()
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
                link.watch(scene).collect { updated ->
                    val finished = updated.turn.kind == TurnStateKind.Failed ||
                        (updated.seq > afterSeq && updated.headEntryID != pendingMoveID && updated.turn.kind == TurnStateKind.Idle)
                    if (finished) pendingMoveID = null
                    mutable.update { it.copy(scene = visibleScene(updated), waiting = if (finished) false else it.waiting) }
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
    fun resume() { mutable.value.scene?.let { openStory(it.storyID) } }

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

    /** Deletes a lesson from Taste on this Path (openspec long-run), then reads Backstage again. */
    fun removeTaste(line: String) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (!state.canChangePath) return
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try {
                link.removeTaste(scene.storyID, RemoveTasteRequest(line = line, after = scene.headEntryID))
                val fresh = link.scene(scene.storyID)
                val backstage = link.backstage(scene.storyID)
                mutable.update { it.copy(scene = visibleScene(fresh), backstage = backstage) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e)
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
        sendTurn(scene, clearDraft = state.draft) {
            link.move(scene.storyID, MoveRequest(after = scene.headEntryID, text = state.draft))
        }
    }

    fun choose(request: ChooseRequest) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (scene.dayView?.world != World.Ready || !state.canChangeScene || request.after != scene.headEntryID) return
        sendTurn(scene) { link.choose(scene.storyID, request) }
    }

    // Moves and Day View choices are the same turn on the Mac, including acceptance before the stream catches up.
    private fun sendTurn(scene: SceneView, clearDraft: String? = null, command: suspend () -> TurnAccepted) {
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
                // Re-read the Mac's head before another command; a refused or interrupted turn can leave the view behind.
                if (e !is LinkFailure || !e.versionMismatch) {
                    try { val fresh = link.scene(scene.storyID); mutable.update { it.copy(scene = visibleScene(fresh)) }
                    } catch (cancelled: CancellationException) { throw cancelled
                    } catch (_: Exception) { }
                }
            } finally { mutable.update { it.copy(sending = false) } }
        }
    }

    fun retryWorld() {
        val state = mutable.value
        val scene = state.scene ?: return
        if (scene.dayView?.world != World.Failed || state.loading || state.sending || state.waiting ||
            !state.reachable || state.problem?.needsUpdate == true) return
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try {
                link.retryWorld(scene.storyID)
                val fresh = link.scene(scene.storyID)
                mutable.update { it.copy(scene = visibleScene(fresh)) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e)
            } finally { mutable.update { it.copy(sending = false) } }
        }
    }

    fun retryReply() {
        val state = mutable.value
        val scene = state.scene ?: return
        if (scene.turn.kind != TurnStateKind.Failed || state.sending || state.waiting || !state.reachable || state.problem?.needsUpdate == true) return
        afterSeq = scene.seq
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try {
                val accepted = link.retry(scene.storyID)
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

    fun redo(direction: String?, remember: Boolean) {
        val state = mutable.value
        val scene = state.scene ?: return
        if (!state.canChangeScene || scene.exchanges.lastOrNull()?.let { it.move != null && it.reply != null } != true) return
        afterSeq = scene.seq
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try {
                val accepted = link.redo(scene.storyID, RedoRequest(after = scene.headEntryID,
                    direction = direction?.trim()?.takeIf { it.isNotEmpty() }, remember = remember))
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
    get() = scene?.turn?.kind == TurnStateKind.Idle && worldReady && !scene.replyComing && reachable && !loading && !sending && !waiting && problem?.needsUpdate != true

internal val FantasiaState.replyComing: Boolean
    get() = scene?.replyComing == true || (waiting && scene?.turn?.kind != TurnStateKind.Failed)
/** Paths change only between Replies (openspec paths: A Path changes only between Replies); a failed one does not hold them. */
internal val FantasiaState.canChangePath: Boolean
    get() = scene != null && !replyComing && reachable && !loading && !sending && problem?.needsUpdate != true
internal val FantasiaState.canSendMove: Boolean
    get() = draft.isNotBlank() && canChangeScene && !replyComing

internal val FantasiaState.worldReady: Boolean
    get() = scene?.dayView?.world?.let { it == World.Ready } ?: true
