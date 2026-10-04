package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.flow.callbackFlow
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.io.IOException
import java.util.concurrent.TimeUnit

data class StoryEventEnvelope(val id: String?, val event: StoryEvent)

fun LinkClient.events(storyID: String, lastEventID: String, onConnection: (Boolean) -> Unit = {}): Flow<StoryEventEnvelope> = callbackFlow {
    val request = request(listOf("stories", storyID, "events")).newBuilder()
        .header("Accept", "text/event-stream")
        .header("Last-Event-ID", lastEventID).build()
    val client = http.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build()
    val source = EventSources.createFactory(client).newEventSource(request, object : EventSourceListener() {
        override fun onOpen(eventSource: EventSource, response: Response) {
            try { requireContract(response); onConnection(true)
            } catch (e: LinkFailure) { close(e); eventSource.cancel() }
        }
        override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
            try {
                val event = linkJson.decodeFromString<StoryEvent>(data)
                if (!trySend(StoryEventEnvelope(id, event)).isSuccess) eventSource.cancel()
            } catch (e: Exception) { close(LinkFailure("The Mac sent an unreadable Story change")); eventSource.cancel() }
        }
        override fun onClosed(eventSource: EventSource) { onConnection(false); close() }
        override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
            onConnection(false)
            val error = if (response != null && !response.isSuccessful) {
                response.use { failure(it.code, it.body.string()) }
            } else t ?: IOException("The Mac link was interrupted")
            close(error)
        }
    })
    awaitClose { source.cancel(); onConnection(false) }
}.buffer(Channel.UNLIMITED)

private data class EventOrder(val seq: Long, val delta: Long = 0) : Comparable<EventOrder> {
    override fun compareTo(other: EventOrder): Int = compareValuesBy(this, other, { it.seq }, { it.delta })
    companion object {
        fun parse(id: String): EventOrder {
            require(id.matches(Regex("[0-9]+(\\.[0-9]+)?"))) { "Invalid Story event id" }
            val parts = id.split('.')
            return EventOrder(parts[0].toLong(), parts.getOrNull(1)?.toLong() ?: 0)
        }
    }
}

class SceneProjection(initial: SceneView) {
    var view: SceneView = initial
        private set
    var lastEventID: String = initial.seq.toString()
        private set

    fun apply(envelope: StoryEventEnvelope): SceneView {
        val event = envelope.event
        if (event.seq < view.seq) return view
        val order = envelope.id?.let(EventOrder::parse)
        if (order != null && order.seq != event.seq) throw LinkFailure("The Mac sent an out-of-order Story change")
        val entry = event.kind in setOf(StoryEventKind.Move, StoryEventKind.Reply, StoryEventKind.SceneOpened)
        if (entry && event.seq <= view.seq) return view
        if (event.kind == StoryEventKind.ReplyDelta && order != null && order <= EventOrder.parse(lastEventID)) return view
        view = when (event.kind) {
            StoryEventKind.SceneOpened -> view.copy(
                scene = requireNotNull(event.scene),
                exchanges = event.passage?.let { listOf(Exchange(reply = it)) } ?: emptyList(),
                headEntryID = event.passage?.entryID ?: view.headEntryID,
                seq = event.seq, turn = TurnState(TurnStateKind.Idle)
            )
            StoryEventKind.Move -> view.copy(
                exchanges = view.exchanges + Exchange(move = requireNotNull(event.passage)),
                headEntryID = event.passage.entryID, seq = event.seq,
                turn = TurnState(TurnStateKind.Idle)
            )
            StoryEventKind.Reply -> {
                val reply = requireNotNull(event.passage)
                val exchanges = view.exchanges.toMutableList()
                if (exchanges.lastOrNull()?.let { it.move != null && it.reply == null } == true) {
                    exchanges[exchanges.lastIndex] = exchanges.last().copy(reply = reply)
                } else exchanges += Exchange(reply = reply)
                view.copy(exchanges = exchanges, headEntryID = reply.entryID, seq = event.seq,
                    turn = TurnState(TurnStateKind.Idle))
            }
            StoryEventKind.ReplyStarted -> view.copy(turn = TurnState(TurnStateKind.Writing,
                textSoFar = "", traceID = event.traceID))
            StoryEventKind.ReplyDelta -> view.copy(turn = TurnState(TurnStateKind.Writing,
                textSoFar = view.turn.textSoFar.orEmpty() + requireNotNull(event.text),
                traceID = event.traceID ?: view.turn.traceID))
            StoryEventKind.ReplyFailed -> view.copy(turn = TurnState(TurnStateKind.Failed,
                reason = requireNotNull(event.reason), traceID = event.traceID))
        }
        // A resumed turn starts with its complete text so far, then new deltas; Retry can reuse the Move's seq.
        if (event.kind == StoryEventKind.ReplyStarted) lastEventID = event.seq.toString()
        else if (envelope.id != null && (entry || event.kind == StoryEventKind.ReplyDelta)) lastEventID = envelope.id
        return view
    }

    fun replace(snapshot: SceneView) {
        if (snapshot.seq >= view.seq) {
            view = snapshot
            lastEventID = snapshot.seq.toString()
        }
    }
}
