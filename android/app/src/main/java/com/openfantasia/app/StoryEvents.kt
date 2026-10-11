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

fun LinkClient.events(storyID: String, lastEventID: String, pathID: String? = null, headEntryID: String? = null,
    onConnection: (Boolean) -> Unit = {}): Flow<StoryEventEnvelope> = callbackFlow {
    val events = request(listOf("stories", storyID, "events"))
    // The Path and the head the phone shows: when the Story has moved to another Path, or that head was edited away
    // or rewound past, the Mac says so first.
    val request = events.newBuilder().url(events.url.newBuilder().apply {
        pathID?.let { addQueryParameter("path", it) }
        headEntryID?.let { addQueryParameter("head", it) }
    }.build())
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
    var lastEventID: String = initial.lastEventID
        private set

    fun apply(envelope: StoryEventEnvelope): SceneView {
        val event = envelope.event
        val cursor = EventOrder.parse(lastEventID)
        if (event.seq < cursor.seq) return view
        // A failure and a Scene end's steps write no entry: their ids ("12.step.weaver") are not a place in the order.
        val order = if (event.kind in setOf(StoryEventKind.ReplyFailed, StoryEventKind.SceneEndStep, StoryEventKind.SceneEndFailed)) null else envelope.id?.let(EventOrder::parse)
        // SSE carries the preceding id into an id-less reply_started event. A view reloaded
        // mid-turn can already contain its words; that queued start must not erase them.
        if (event.kind == StoryEventKind.ReplyStarted && view.turn.kind == TurnStateKind.Writing &&
            EventOrder.parse(lastEventID).let { it.seq == event.seq && it.delta > 0 } &&
            (order == null || order.seq != event.seq || envelope.id?.endsWith(".0") == true)) return view
        if (order != null && order.seq != event.seq && event.kind != StoryEventKind.ReplyStarted) throw LinkFailure("The Mac sent an out-of-order Story change")
        val entry = event.kind in setOf(StoryEventKind.Move, StoryEventKind.Reply, StoryEventKind.SceneOpened, StoryEventKind.SceneClosed, StoryEventKind.FocusSet, StoryEventKind.LingerSet, StoryEventKind.Redo)
        if (entry && (order ?: EventOrder(event.seq)) <= cursor) return view
        if (event.kind == StoryEventKind.ReplyDelta && order != null && order <= EventOrder.parse(lastEventID)) return view
        view = when (event.kind) {
            // These say the Scene should be read again; the stream reads its snapshot.
            StoryEventKind.WorldMoved, StoryEventKind.PathChanged -> view
            // The step of the Scene's end under way, or none when it is done (docs/adr/0016); the stream reads the rest.
            StoryEventKind.SceneEndStep -> view.copy(dayView = view.dayView?.copy(sceneEnd = SceneEnd(step = event.step)))
            StoryEventKind.SceneEndFailed -> view.copy(dayView = view.dayView?.let { day ->
                event.step?.let { step -> day.copy(sceneEnd = SceneEnd(failed = SceneEndFailure(step = step, reason = event.reason.orEmpty(), traceID = event.traceID.orEmpty()))) } ?: day
            })
            StoryEventKind.SceneClosed -> view.copy(seq = maxOf(view.seq, event.seq), dayView = requireNotNull(event.dayView), focus = null, linger = false)
            StoryEventKind.FocusSet -> view.copy(seq = maxOf(view.seq, event.seq), focus = event.focus)
            StoryEventKind.LingerSet -> view.copy(seq = maxOf(view.seq, event.seq), linger = requireNotNull(event.linger))
            StoryEventKind.Redo -> view.copy(seq = maxOf(view.seq, event.seq))
            StoryEventKind.SceneOpened -> view.copy(
                scene = requireNotNull(event.scene), focus = event.focus, linger = false, dayView = null, opening = null,
                exchanges = event.passage?.let { listOf(Exchange(reply = it)) } ?: emptyList(),
                headEntryID = event.passage?.entryID ?: view.headEntryID,
                seq = maxOf(view.seq, event.seq), turn = TurnState(kind = TurnStateKind.Idle)
            )
            // A Move at the Day View opens the next Scene at once, under its card; the stream then reads the Mac's view.
            StoryEventKind.Move -> view.copy(
                exchanges = (if (event.opening != null) emptyList() else view.exchanges) + Exchange(move = requireNotNull(event.passage)),
                dayView = if (event.opening != null) null else view.dayView, opening = event.opening ?: view.opening,
                headEntryID = event.passage.entryID, seq = maxOf(view.seq, event.seq),
                turn = TurnState(kind = TurnStateKind.Idle)
            )
            StoryEventKind.Reply -> {
                val reply = requireNotNull(event.passage)
                val exchanges = view.exchanges.toMutableList()
                if (exchanges.lastOrNull()?.let { it.move != null && it.reply == null } == true) {
                    exchanges[exchanges.lastIndex] = exchanges.last().copy(reply = reply)
                } else exchanges += Exchange(reply = reply)
                view.copy(scene = event.scene ?: view.scene, exchanges = exchanges, headEntryID = reply.entryID, seq = maxOf(view.seq, event.seq),
                    turn = TurnState(kind = TurnStateKind.Idle))
            }
            StoryEventKind.ReplyStarted -> view.copy(seq = maxOf(view.seq, event.seq), turn = TurnState(kind = TurnStateKind.Writing,
                textSoFar = "", traceID = event.traceID))
            StoryEventKind.ReplyDelta -> view.copy(seq = maxOf(view.seq, event.seq), turn = TurnState(kind = TurnStateKind.Writing,
                textSoFar = view.turn.textSoFar.orEmpty() + requireNotNull(event.text),
                traceID = event.traceID ?: view.turn.traceID))
            StoryEventKind.ReplyFailed -> view.copy(seq = maxOf(view.seq, event.seq), turn = TurnState(kind = TurnStateKind.Failed,
                reason = requireNotNull(event.reason), traceID = event.traceID))
        }
        // A resumed turn starts with its complete text so far, then new deltas; Retry can reuse the Move's seq.
        if (event.kind == StoryEventKind.ReplyStarted) lastEventID = envelope.id?.takeIf { order?.seq == event.seq } ?: event.seq.toString()
        else if (event.kind == StoryEventKind.ReplyFailed) lastEventID = event.seq.toString()
        else if (envelope.id != null && (entry || event.kind == StoryEventKind.ReplyDelta)) lastEventID = envelope.id
        view = view.copy(lastEventID = lastEventID)
        return view
    }

    fun replace(snapshot: SceneView) {
        if (snapshot.seq >= view.seq && EventOrder.parse(snapshot.lastEventID) >= EventOrder.parse(lastEventID)) {
            view = snapshot
            lastEventID = snapshot.lastEventID
        }
    }
}
