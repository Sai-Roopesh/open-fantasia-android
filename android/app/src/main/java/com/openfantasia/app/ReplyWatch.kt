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
import com.openfantasia.protocol.SceneView
import com.openfantasia.protocol.TurnStateKind
import com.openfantasia.protocol.World
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.mapNotNull

/** The app's one link to the Mac, shared by the Activity and the watch. */
interface LinkHolder { val link: FantasiaLink }

enum class Watched { Reply, DayView }

/** What the watch follows when the app goes away (openspec presence: The phone buzzes for two things only), or nothing. */
fun FantasiaState.watched(): Watched? {
    val scene = scene ?: return null
    return when {
        scene.dayView?.world == World.MovingOn -> Watched.DayView
        replyComing -> Watched.Reply
        else -> null
    }
}

/** Follows [updates] until what is [watched] is ready (true), fails or gives up (false). */
suspend fun followUntilDone(updates: Flow<SceneView>, watched: Watched, giveUpAfterMillis: Long = WATCH_FOR_MILLIS): Boolean =
    withTimeoutOrNull(giveUpAfterMillis) {
        updates.mapNotNull { view ->
            when (watched) {
                Watched.Reply -> when {
                    view.turn.kind == TurnStateKind.Failed -> false
                    !view.replyComing -> true
                    else -> null
                }
                Watched.DayView -> when (view.dayView?.world) {
                    World.MovingOn -> null
                    World.Ready -> true
                    else -> false
                }
            }
        }.first()
    } ?: false

/**
 * A short foreground service that follows one Story while the app is away: a silent note while the Reply is being
 * written or the World moves on, then one notification when it is ready, and it stops. It stops without a sound
 * when the app comes back, after three minutes, or on a failure, which the app shows when opened.
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
        val quiet = Notification.Builder(this, WRITING_CHANNEL).setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(title).setContentText(if (watched == Watched.Reply) "The Reply is being written" else "The World is moving on")
            .setOngoing(true).setContentIntent(opening(storyID)).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(WRITING_NOTE, quiet, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE)
        else startForeground(WRITING_NOTE, quiet)
        following?.cancel()
        following = scope.launch {
            val ready = try {
                val link = (application as LinkHolder).link
                val initial = link.scene(storyID)
                followUntilDone(flow { emit(initial); emitAll(link.watch(initial)) }, watched)
            } catch (e: CancellationException) { throw e
            } catch (_: Exception) { false }
            finish(if (!ready) null else Notification.Builder(this@ReplyWatch, READY_CHANNEL).setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle(title).setContentText(if (watched == Watched.Reply) "The Reply is ready" else "The Day View is ready")
                .setAutoCancel(true).setContentIntent(opening(storyID)).build())
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
            manager.createNotificationChannel(NotificationChannel(WRITING_CHANNEL, "While a Reply is written", NotificationManager.IMPORTANCE_LOW))
            manager.createNotificationChannel(NotificationChannel(READY_CHANNEL, "A Reply or Day View is ready", NotificationManager.IMPORTANCE_DEFAULT))
        }
    }
}

private const val WATCH_FOR_MILLIS = 3 * 60 * 1000L
