package com.openfantasia.app

import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import com.openfantasia.protocol.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

class WatchTestApplication : Application(), LinkHolder {
    override val link = FakeFantasiaLink()
}

@RunWith(RobolectricScenarioRunner::class)
@Config(sdk = [35], application = WatchTestApplication::class)
class ReplyWatchTest {
    private val app get() = ApplicationProvider.getApplicationContext<WatchTestApplication>()
    private val link get() = app.link
    private val notes get() = shadowOf(app.getSystemService(NotificationManager::class.java))
    private fun idle() = shadowOf(Looper.getMainLooper()).idle()
    private fun Notification.text() = extras.getCharSequence(Notification.EXTRA_TEXT).toString()
    private fun Notification.title() = extras.getCharSequence(Notification.EXTRA_TITLE).toString()
    private fun importance(note: Notification) = app.getSystemService(NotificationManager::class.java).getNotificationChannel(note.channelId).importance

    private val written = FakeFantasiaLink.sceneView()
    private val writing = written.copy(exchanges = written.exchanges.dropLast(1) + Exchange(move = Passage(entryID = "move", text = "I sit beside her.")),
        headEntryID = "move", seq = 2, turn = TurnState(kind = TurnStateKind.Writing))
    private fun start(watched: Watched) = Robolectric.buildService(ReplyWatch::class.java,
        ReplyWatch.intent(app, "story", "The Malfoy Problem", watched)).create().startCommand(0, 1).get()

    // GIVEN the player sent a Move and locked the phone
    // WHEN the Reply is finished
    // THEN the phone shows one notification that the Reply is ready
    @Scenario("presence › The phone buzzes for two things only › A Reply finishes while the phone is locked")
    @Test fun replyFinishes() {
        link.current.value = writing
        val watch = start(Watched.Reply)
        idle()
        val quiet = notes.allNotifications.single()
        assertEquals("The Malfoy Problem", quiet.title())
        assertEquals("The Reply is being written", quiet.text())
        assertEquals(NotificationManager.IMPORTANCE_LOW, importance(quiet))
        assertTrue(quiet.flags and Notification.FLAG_ONGOING_EVENT != 0)

        link.current.value = written
        idle()
        val ready = notes.allNotifications.single()
        assertEquals("The Malfoy Problem", ready.title())
        assertEquals("The Reply is ready", ready.text())
        assertEquals(NotificationManager.IMPORTANCE_DEFAULT, importance(ready))
        assertNotNull(ready.contentIntent)
        assertEquals("story", shadowOf(ready.contentIntent).savedIntent.getStringExtra(ReplyWatch.STORY))
        assertTrue(shadowOf(watch).isStoppedBySelf)
    }

    // The quiet note names the step under way, and the Day View being ready is said once.
    @Test fun `the same for a Scene's end`() {
        val ending = written.copy(dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(step = SceneEndStep.Chronicler)))
        link.current.value = ending
        val watch = start(Watched.DayView)
        idle()
        assertEquals("Recording the Scene", notes.allNotifications.single().text())
        link.current.value = ending.copy(dayView = ending.dayView!!.copy(sceneEnd = SceneEnd(step = SceneEndStep.Director)), seq = 8)
        idle()
        assertEquals("The Director is reconsidering the Outline", notes.allNotifications.single().text())
        // Rethinking an Act is said as the Day View says it.
        link.current.value = ending.copy(dayView = ending.dayView!!.copy(sceneEnd = SceneEnd(step = SceneEndStep.Director, rethinking = "Year One")), seq = 8)
        idle()
        assertEquals("Rethinking Year One…", notes.allNotifications.single().text())
        assertFalse(shadowOf(watch).isStoppedBySelf)
        link.current.value = ending.copy(dayView = FakeFantasiaLink.dayView(), seq = 9)
        idle()
        assertEquals("The Day View is ready", notes.allNotifications.single().text())
        assertEquals(NotificationManager.IMPORTANCE_DEFAULT, importance(notes.allNotifications.single()))
        assertTrue(shadowOf(watch).isStoppedBySelf)
    }

    // A Scene's end that stops waits for the player: the phone says once which step failed, and the watch stops.
    @Test fun `a Scene's end that stops is said once`() {
        val ending = written.copy(dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(step = SceneEndStep.Director)))
        link.current.value = ending
        val watch = start(Watched.DayView)
        idle()
        link.current.value = ending.copy(dayView = ending.dayView!!.copy(sceneEnd = SceneEnd(failed = SceneEndFailure(
            step = SceneEndStep.Director, reason = "Fable 5.1 and GPT 6.1 Sol both ran out of time.", traceID = "3f1c09ab"))))
        idle()
        val stopped = notes.allNotifications.single()
        assertEquals("The Malfoy Problem", stopped.title())
        assertEquals("The Director could not reconsider the Outline", stopped.text())
        assertEquals(NotificationManager.IMPORTANCE_DEFAULT, importance(stopped))
        assertEquals("story", shadowOf(stopped.contentIntent).savedIntent.getStringExtra(ReplyWatch.STORY))
        assertTrue(shadowOf(watch).isStoppedBySelf)
    }

    // A failure is shown when the app is opened; the watch stops without a sound.
    @Test fun `a failed Reply stops the watch quietly`() {
        link.current.value = writing
        val watch = start(Watched.Reply)
        idle()
        link.current.value = writing.copy(turn = TurnState(kind = TurnStateKind.Failed, reason = "The model refused"))
        idle()
        assertTrue(notes.allNotifications.isEmpty())
        assertTrue(shadowOf(watch).isStoppedBySelf)
    }

    @Test fun `the watch stops quietly when the app comes back`() {
        link.current.value = writing
        val watch = Robolectric.buildService(ReplyWatch::class.java, ReplyWatch.intent(app, "story", "The Malfoy Problem", Watched.Reply))
            .create().startCommand(0, 1)
        idle()
        watch.destroy()
        link.current.value = written
        idle()
        assertTrue(notes.allNotifications.isEmpty())
    }

    @Test fun `the watch gives up quietly after its time`() = runBlocking {
        assertEquals(WatchEnd.Quiet, followUntilDone(MutableSharedFlow(), Watched.Reply, giveUpAfterMillis = 50))
    }

    // Nothing else buzzes: the watch starts only for a Reply under way or a Scene's end running, not one that stopped.
    @Test fun `nothing is watched when nothing is under way`() {
        val idle = FantasiaState(paired = true, scene = written, reachable = true)
        assertNull(idle.watched())
        assertNull(FantasiaState(paired = true).watched())
        assertNull(idle.copy(scene = written.copy(dayView = FakeFantasiaLink.dayView())).watched())
        assertEquals(Watched.Reply, idle.copy(scene = writing).watched())
        assertEquals(Watched.Reply, idle.copy(waiting = true).watched())
        assertEquals(Watched.DayView, idle.copy(scene = written.copy(dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(step = SceneEndStep.Weaver)))).watched())
        assertNull(idle.copy(scene = written.copy(dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(failed = SceneEndFailure(
            step = SceneEndStep.Weaver, reason = "Unavailable", traceID = "weaver"))))).watched())
    }
}
