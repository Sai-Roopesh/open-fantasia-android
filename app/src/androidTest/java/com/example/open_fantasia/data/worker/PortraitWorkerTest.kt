package com.example.open_fantasia.data.worker

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.PortraitTaskEntity
import com.example.open_fantasia.data.local.entity.ProfileEntity
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class PortraitWorkerTest {

    private lateinit var context: Context
    private lateinit var db: OpenFantasiaDatabase
    private val userId = "worker-test-user"
    private val characterId = "worker-test-char"

    @Before
    fun setUp() = runBlocking {
        context = ApplicationProvider.getApplicationContext()
        val app = context.applicationContext as com.example.open_fantasia.OpenFantasiaApplication
        db = app.appContainer.database

        // Seed profile
        db.profileDao().insertProfile(
            ProfileEntity(userId, "WorkerTestUser", "", "")
        )

        // Seed character
        db.characterDao().insertCharacter(
            CharacterEntity(
                id = characterId,
                user_id = userId,
                name = "Alys",
                story = "Story",
                core_persona = "Persona",
                greeting = "Hello",
                appearance = "Robe",
                style_rules = "Formal",
                definition = "Definition",
                negative_guidance = "",
                temperature = 0.92,
                top_p = 0.94,
                starters = emptyList(),
                example_conversations = emptyList(),
                portrait_status = "idle",
                portrait_path = null,
                portrait_prompt = null,
                portrait_seed = null,
                portrait_source_hash = "correct_hash",
                portrait_last_error = null,
                portrait_generated_at = null,
                created_at = "",
                updated_at = ""
            )
        )
    }

    @After
    fun tearDown() = runBlocking {
        // Clear tasks
        val now = Instant.now().plusSeconds(3600).toString()
        db.portraitTaskDao().reclaimStaleTasks(now)
    }

    @Test
    fun returnsSuccess_whenNoPendingTasks() = runBlocking {
        val worker = TestListenableWorkerBuilder<CharacterPortraitWorker>(context).build()
        val result = worker.doWork()
        assertEquals(ListenableWorker.Result.success(), result)
    }

    @Test
    fun returnsRetry_whenPendingTaskNotYetDue() = runBlocking {
        val futureTime = Instant.now().plusSeconds(3600).toString()
        val task = PortraitTaskEntity(
            id = "task-future",
            character_id = characterId,
            user_id = userId,
            prompt = "A portrait",
            seed = 12345,
            source_hash = "correct_hash",
            status = "pending",
            attempts = 0,
            max_attempts = 3,
            available_at = futureTime,
            locked_at = null,
            last_error = null,
            created_at = Instant.now().toString(),
            updated_at = Instant.now().toString()
        )
        db.portraitTaskDao().insertTask(task)

        val worker = TestListenableWorkerBuilder<CharacterPortraitWorker>(context).build()
        val result = worker.doWork()
        assertEquals(ListenableWorker.Result.retry(), result)
    }

    @Test
    fun reclaimsStaleTasks_onStartup() = runBlocking {
        val staleTime = Instant.now().minusSeconds(900).toString() // 15 mins ago
        val task = PortraitTaskEntity(
            id = "task-stale",
            character_id = characterId,
            user_id = userId,
            prompt = "A portrait",
            seed = 12345,
            source_hash = "correct_hash",
            status = "running",
            attempts = 1,
            max_attempts = 3,
            available_at = staleTime,
            locked_at = staleTime,
            last_error = null,
            created_at = staleTime,
            updated_at = staleTime
        )
        db.portraitTaskDao().insertTask(task)

        val worker = TestListenableWorkerBuilder<CharacterPortraitWorker>(context).build()
        // Run doWork. It will reclaim the stale task to "pending", then claim it to "running" and try to execute it.
        // It might fail on network if offline, but either way it won't be in status "running" with stale time.
        val result = worker.doWork()
        
        val updatedTask = db.portraitTaskDao().getTask("task-stale")
        assertNotNull(updatedTask)
        // If it attempted execution and failed or succeeded, status won't be stale "running" with the old locked_at.
        // If it succeeded, status = "succeeded". If failed, status = "pending" (with new lock/attempts) or "failed".
        assertNotEquals(staleTime, updatedTask?.locked_at)
    }

    @Test
    fun skipsDownload_whenSourceHashMismatch() = runBlocking {
        val task = PortraitTaskEntity(
            id = "task-mismatch",
            character_id = characterId,
            user_id = userId,
            prompt = "A portrait",
            seed = 12345,
            source_hash = "outdated_hash", // Mismatch with character's hash "correct_hash"
            status = "pending",
            attempts = 0,
            max_attempts = 3,
            available_at = Instant.now().toString(),
            locked_at = null,
            last_error = null,
            created_at = Instant.now().toString(),
            updated_at = Instant.now().toString()
        )
        db.portraitTaskDao().insertTask(task)

        val worker = TestListenableWorkerBuilder<CharacterPortraitWorker>(context).build()
        val result = worker.doWork()
        
        assertEquals(ListenableWorker.Result.failure(), result)
        val updatedTask = db.portraitTaskDao().getTask("task-mismatch")
        assertEquals("failed", updatedTask?.status)
        assertEquals("Source hash mismatch", updatedTask?.last_error)
    }
}
