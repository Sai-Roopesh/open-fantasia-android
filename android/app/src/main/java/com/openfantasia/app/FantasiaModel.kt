package com.openfantasia.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openfantasia.protocol.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

data class AppProblem(val reason: String, val traceID: String? = null, val needsUpdate: Boolean = false)
data class FantasiaState(
    val paired: Boolean,
    val stories: List<StorySummary> = emptyList(),
    val scene: SceneView? = null,
    val draft: String = "",
    val sending: Boolean = false,
    val waiting: Boolean = false,
    val reachable: Boolean = false,
    val loading: Boolean = false,
    val problem: AppProblem? = null
)

class FantasiaModel(private val link: FantasiaLink) : ViewModel() {
    private val mutable = MutableStateFlow(FantasiaState(link.isPaired))
    val state = mutable.asStateFlow()
    private var stream: Job? = null
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
                mutable.update { it.copy(paired = true, stories = link.stories().stories) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                showProblem(if (e is SerializationException || e is IllegalArgumentException)
                    LinkFailure("The QR code does not contain valid Mac pairing details") else e)
            } finally { mutable.update { it.copy(loading = false) } }
        }
    }

    fun home() {
        stream?.cancel()
        viewModelScope.launch {
            mutable.update { it.copy(scene = null, loading = true, problem = null) }
            try { mutable.update { it.copy(stories = link.stories().stories) }
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
                mutable.update { it.copy(scene = scene, loading = false, waiting = false) }
                link.watch(scene).collect { updated ->
                    val finished = updated.turn.kind == TurnStateKind.Failed ||
                        (updated.seq > afterSeq && updated.headEntryID != pendingMoveID && updated.turn.kind == TurnStateKind.Idle)
                    if (finished) pendingMoveID = null
                    mutable.update { it.copy(scene = updated, waiting = if (finished) false else it.waiting) }
                }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { showProblem(e)
            } finally { mutable.update { it.copy(loading = false) } }
        }
    }

    fun pause() { stream?.cancel() }
    fun resume() { mutable.value.scene?.let { openStory(it.storyID) } }

    fun writeMove(text: String) { mutable.update { it.copy(draft = text) } }

    fun sendMove() {
        val state = mutable.value
        val scene = state.scene ?: return
        if (state.draft.isBlank() || state.sending || state.waiting || state.loading || !state.reachable ||
            scene.turn.kind != TurnStateKind.Idle || state.problem?.needsUpdate == true) return
        afterSeq = scene.seq
        mutable.update { it.copy(sending = true, problem = null) }
        viewModelScope.launch {
            try {
                val accepted = link.move(scene.storyID, MoveRequest(scene.headEntryID, state.draft))
                pendingMoveID = accepted.moveEntryID
                val current = mutable.value.scene
                val finished = current != null && current.seq > scene.seq && current.headEntryID != accepted.moveEntryID && current.turn.kind == TurnStateKind.Idle
                mutable.update { it.copy(draft = if (it.draft == state.draft) "" else it.draft, waiting = !finished) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                showProblem(e)
                // Re-read the Mac's head before another Send; a refused or interrupted Move can leave the view behind.
                if (e !is LinkFailure || !e.versionMismatch) {
                    try { val fresh = link.scene(scene.storyID); mutable.update { it.copy(scene = fresh) }
                    } catch (cancelled: CancellationException) { throw cancelled
                    } catch (_: Exception) { }
                }
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

    fun portrait(url: String) = link.portrait(url)

    private fun showProblem(e: Exception) {
        val problem = if (e is LinkFailure) AppProblem(e.reason, e.traceID, e.versionMismatch)
            else AppProblem("The Mac is unreachable. Check that the phone and Mac share a network.")
        mutable.update { it.copy(problem = problem) }
    }
}
