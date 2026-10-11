package com.openfantasia.app

import com.openfantasia.protocol.SceneView
import com.openfantasia.protocol.StoryEventKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.isActive
import java.io.IOException

class StoryStream(
    private val onConnection: (Boolean) -> Unit = {},
    private val loadScene: (suspend (String) -> SceneView)? = null,
    private val client: suspend () -> LinkClient
) {
    fun follow(initial: SceneView): Flow<SceneView> = flow {
        var projection = SceneProjection(initial)
        while (currentCoroutineContext().isActive) {
            try {
                client().events(initial.storyID, projection.lastEventID, projection.view.pathID, projection.view.headEntryID, onConnection).collect { envelope ->
                    val before = projection.view
                    val next = SceneProjection(before)
                    next.apply(envelope)
                    // A Scene's end writes entries the stream does not carry (the record, the plan, the fold), and its
                    // steps share the sequence of the entry before them: each step, the World moving on and a Path
                    // change read the Scene again, even when the signal leaves the projection unchanged.
                    val endSignal = envelope.event.kind in setOf(StoryEventKind.WorldMoved, StoryEventKind.SceneEndStep, StoryEventKind.SceneEndFailed, StoryEventKind.PathChanged) &&
                        envelope.event.seq >= before.seq
                    // A Move that opens the next Scene changes more than its exchange: the earlier Scenes, the card.
                    val opens = envelope.event.kind == StoryEventKind.Move && envelope.event.opening != null
                    if (endSignal || (next.view != before && (opens || envelope.event.kind in setOf(
                            StoryEventKind.SceneOpened, StoryEventKind.SceneClosed, StoryEventKind.Redo,
                            StoryEventKind.FocusSet, StoryEventKind.LingerSet)))) {
                        // Keep the old projection and cursor until the entire reload succeeds.
                        val snapshot = loadScene?.invoke(initial.storyID) ?: client().scene(initial.storyID)
                        next.replace(snapshot)
                    }
                    projection = next
                    val view = projection.view
                    if (view != before) emit(view)
                }
            } catch (e: CancellationException) { throw e
            } catch (e: LinkFailure) { throw e
            } catch (_: IOException) {
                onConnection(false)
                // The cursor advances only after applying a change, so interrupted streams can resume safely.
            }
            delay(500)
        }
    }
}
