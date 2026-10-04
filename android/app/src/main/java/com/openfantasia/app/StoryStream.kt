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
        val projection = SceneProjection(initial)
        while (currentCoroutineContext().isActive) {
            try {
                client().events(initial.storyID, projection.lastEventID, onConnection).collect { envelope ->
                    val before = projection.view
                    projection.apply(envelope)
                    if (projection.view != before && envelope.event.kind == StoryEventKind.SceneOpened) {
                        // The event has the new card; only the Mac can supply summaries of earlier Scenes.
                        loadScene?.invoke(initial.storyID)?.let(projection::replace)
                    }
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
