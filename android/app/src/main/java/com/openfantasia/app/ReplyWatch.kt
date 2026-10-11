package com.openfantasia.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import com.openfantasia.protocol.SceneEndFailure
import com.openfantasia.protocol.SceneView
import com.openfantasia.protocol.TurnStateKind
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.onEach

/** The app's one link to the Mac, shared by the Activity and the watch. */
interface LinkHolder { val link: FantasiaLink }

enum class Watched { Reply, DayView }

/** What the watch follows when the app goes away (openspec presence: The phone buzzes for two things only), or nothing. */
fun FantasiaState.watched(): Watched? {
    val scene = scene ?: return null
    return when {
        scene.dayView?.sceneEnd?.step != null -> Watched.DayView
        replyComing -> Watched.Reply
        else -> null
    }
}

/**
 * How a watch ends: what it watched is ready, or a Scene's end stopped at a step, each said once; or quietly, for a
 * failed Reply, which the app shows when opened, and for giving up.
 */
sealed interface WatchEnd {
    data object Ready : WatchEnd
    data class Stopped(val failure: SceneEndFailure) : WatchEnd
    data object Quiet : WatchEnd
}

/** Follows [updates] until what is [watched] is ready, stops, fails or the watch gives up. */
suspend fun followUntilDone(updates: Flow<SceneView>, watched: Watched, giveUpAfterMillis: Long = WATCH_FOR_MILLIS): WatchEnd =
    withTimeoutOrNull(giveUpAfterMillis) {
        updates.mapNotNull { view ->
            when (watched) {
                Watched.Reply -> when {
                    view.turn.kind == TurnStateKind.Failed -> WatchEnd.Quiet
                    !view.replyComing -> WatchEnd.Ready
                    else -> null
                }
                Watched.DayView -> {
                    val end = view.dayView?.sceneEnd
                    val failed = end?.failed
                    when {
                        end == null -> WatchEnd.Quiet
                        failed != null -> WatchEnd.Stopped(failed)
                        end.step == null -> WatchEnd.Ready
                        else -> null
                    }
                }
            }
        }.first()
    } ?: WatchEnd.Quiet

/**
 * A short foreground service that follows one Story while the app is away: a silent note while the Reply is being
 * written or the Scene's end runs, naming its step, then one notification when it is ready or when the Scene's end
 * stopped, and it stops. It stops without a sound when the app comes back, after three minutes, or on a failed Reply,
 * which the app shows when opened.
 */
class ReplyWatch : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var following: Job? = null

    override fun onBind(intent: Intent?) = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val storyID = intent?.getStringExtra(STORY)
        val watched = intent?.getStringExtra(WATCHED)?.let { runCatching { Watched.valueOf(it) }.getOrNull() }
        if (storyID == null || watched == null) { stopSelf(); return START_NOT_STICKY }
        val title = intent.getStringExtra(TITLE) ?: "Open Fantasia"
        channels(this)
        fun quiet(text: String) = Notification.Builder(this, WRITING_CHANNEL).setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(title).setContentText(text).setOngoing(true).setContentIntent(opening(storyID)).build()
        val first = quiet(if (watched == Watched.Reply) "The Reply is being written" else "The Scene is ending")
        if (Build.VERSION.SDK_INT >= 34) startForeground(WRITING_NOTE, first, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE)
        else startForeground(WRITING_NOTE, first)
        following?.cancel()
        following = scope.launch {
            val notes = getSystemService(NotificationManager::class.java)
            var step: com.openfantasia.protocol.SceneEndStep? = null
            val end = try {
                val link = (application as LinkHolder).link
                val initial = link.scene(storyID)
                followUntilDone(flow { emit(initial); emitAll(link.watch(initial)) }.onEach { view ->
                    // The quiet note names the step under way, as the Day View's line does.
                    view.dayView?.sceneEnd?.step?.takeIf { watched == Watched.DayView && it != step }?.let {
                        step = it
                        notes.notify(WRITING_NOTE, quiet(sceneEndStepLine(it, underWay = true)))
                    }
                }, watched)
            } catch (e: CancellationException) { throw e
            } catch (_: Exception) { WatchEnd.Quiet }
            val text = when (end) {
                WatchEnd.Quiet -> null
                is WatchEnd.Stopped -> sceneEndFailureTitle(end.failure.step)
                WatchEnd.Ready -> if (watched == Watched.Reply) "The Reply is ready" else "The Day View is ready"
            }
            finish(text?.let { Notification.Builder(this@ReplyWatch, READY_CHANNEL).setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle(title).setContentText(it).setAutoCancel(true).setContentIntent(opening(storyID)).build() })
        }
        return START_NOT_STICKY
    }

    /** Android ends a short service at three minutes; it stops as it would at its own. */
    override fun onTimeout(startId: Int) { following?.cancel(); finish(null) }
    override fun onTimeout(startId: Int, fgsType: Int) { following?.cancel(); finish(null) }

    private fun finish(ready: Notification?) {
        stopForeground(STOP_FOREGROUND_REMOVE)
        if (ready != null) getSystemService(NotificationManager::class.java).notify(READY_NOTE, ready)
        stopSelf()
    }

    override fun onDestroy() {
        scope.cancel()
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun opening(storyID: String) = PendingIntent.getActivity(this, storyID.hashCode(),
        Intent(this, MainActivity::class.java).putExtra(STORY, storyID).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    companion object {
        const val STORY = "com.openfantasia.app.STORY"
        private const val TITLE = "com.openfantasia.app.TITLE"
        private const val WATCHED = "com.openfantasia.app.WATCHED"
        private const val WRITING_CHANNEL = "writing"
        private const val READY_CHANNEL = "ready"
        private const val WRITING_NOTE = 1
        private const val READY_NOTE = 2

        fun intent(context: Context, storyID: String, title: String, watched: Watched): Intent =
            Intent(context, ReplyWatch::class.java).putExtra(STORY, storyID).putExtra(TITLE, title).putExtra(WATCHED, watched.name)

        /** Called as the app goes away; Android may refuse a foreground service then, and nothing is lost but the buzz. */
        fun start(context: Context, storyID: String, title: String, watched: Watched) {
            try { context.startForegroundService(intent(context, storyID, title, watched))
            } catch (_: IllegalStateException) { }
        }

        fun stop(context: Context) { context.stopService(Intent(context, ReplyWatch::class.java)) }

        private fun channels(context: Context) {
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(WRITING_CHANNEL, "While a Reply is written or a Scene ends", NotificationManager.IMPORTANCE_LOW))
            manager.createNotificationChannel(NotificationChannel(READY_CHANNEL, "A Reply or Day View is ready", NotificationManager.IMPORTANCE_DEFAULT))
        }
    }
}

private const val WATCH_FOR_MILLIS = 3 * 60 * 1000L
