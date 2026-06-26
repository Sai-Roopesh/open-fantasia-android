package com.example.open_fantasia.data.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.example.open_fantasia.OpenFantasiaApplication
import com.example.open_fantasia.data.local.entity.PortraitTaskEntity
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.coroutines.CancellationException
import java.io.File
import java.net.URLEncoder
import java.time.Duration
import java.time.Instant

class CharacterPortraitWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "CharacterPortraitWorker"
    }

    private val app = context.applicationContext as OpenFantasiaApplication
    private val db = app.appContainer.database

    override suspend fun doWork(): Result {
        val now = Instant.now().toString()
        val taskDao = db.portraitTaskDao()
        val characterDao = db.characterDao()

        // Reclaim stale tasks (> 10 minutes)
        val cutoff = Instant.now().minusSeconds(600).toString()
        try {
            taskDao.reclaimStaleTasks(cutoff)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to reclaim stale tasks", e)
        }

        // 1. Claim next pending task
        val task = taskDao.claimNextTask(now, now)
        if (task == null) {
            val pendingTask = taskDao.peekPendingTask()
            if (pendingTask != null) {
                // A task is pending but its available_at is in the future (e.g. backoff after a
                // failure). Returning Result.retry() here would make WorkManager re-run within
                // seconds, busy-waiting and draining the battery. Instead, schedule a single
                // delayed run for when the task actually becomes available, then succeed.
                val delayMillis = try {
                    val availableAt = Instant.parse(pendingTask.available_at)
                    Duration.between(Instant.now(), availableAt).toMillis().coerceAtLeast(0L)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse available_at '${pendingTask.available_at}'", e)
                    0L
                }
                Log.d(TAG, "Pending task not yet available; scheduling delayed run in ${delayMillis}ms.")
                val request = OneTimeWorkRequestBuilder<CharacterPortraitWorker>()
                    .setInitialDelay(Duration.ofMillis(delayMillis))
                    .build()
                WorkManager.getInstance(applicationContext).enqueueUniqueWork(
                    "portrait_generation_${pendingTask.character_id}",
                    ExistingWorkPolicy.REPLACE,
                    request
                )
                return Result.success()
            }
            Log.d(TAG, "No pending portrait tasks found.")
            return Result.success()
        }

        Log.d(TAG, "Claimed task ${task.id} for character ${task.character_id}")
        val character = characterDao.getCharacter(task.character_id)
        if (character == null) {
            Log.e(TAG, "Character ${task.character_id} not found in database.")
            taskDao.insertTask(task.copy(status = "failed", last_error = "Character not found", updated_at = Instant.now().toString()))
            return Result.failure()
        }

        if (character.portrait_source_hash != task.source_hash) {
            Log.w(TAG, "Source hash mismatch for task ${task.id}: character=${character.portrait_source_hash}, task=${task.source_hash}")
            taskDao.insertTask(task.copy(status = "failed", last_error = "Source hash mismatch", updated_at = Instant.now().toString()))
            return Result.failure()
        }

        try {
            // 2. Fetch portrait from Pollinations API
            val prompt = task.prompt
            val seed = task.seed
            val encodedPrompt = URLEncoder.encode(prompt, "UTF-8")
            val url = "https://image.pollinations.ai/p/$encodedPrompt?width=768&height=768&nologo=true&seed=$seed&model=sana&safe=true&private=true&nofeed=true"

            Log.d(TAG, "Downloading portrait from $url")
            // Create the HttpClient locally and close it via .use { } so its CIO threads/sockets
            // are always released when this run ends (an instance-level client would leak).
            val body = HttpClient(CIO).use { client ->
                val response = client.get(url)
                if (response.status != HttpStatusCode.OK) {
                    throw Exception("Failed to fetch image: ${response.status}")
                }
                response.body<ByteArray>()
            }

            // Pollinations occasionally returns HTTP 200 with an empty/truncated body.
            // Without this guard a 0-byte file is written and the character is marked
            // "ready", so the UI shows a permanently broken portrait that never retries.
            // Throwing here routes the task into the normal backoff/retry path instead.
            if (body.isEmpty()) {
                throw Exception("Image fetch returned an empty body")
            }

            // 3. Save to local app storage
            val portraitsDir = File(applicationContext.filesDir, "portraits")
            if (!portraitsDir.exists()) {
                portraitsDir.mkdirs()
            }
            val destinationFile = File(portraitsDir, "${task.character_id}.jpg")
            destinationFile.outputStream().use { output ->
                output.write(body)
            }

            Log.d(TAG, "Successfully saved portrait to ${destinationFile.absolutePath}")

            // 4. Update Database
            taskDao.insertTask(
                task.copy(
                    status = "succeeded",
                    locked_at = null,
                    last_error = null,
                    updated_at = Instant.now().toString()
                )
            )

            val updatedCharacter = character.copy(
                portrait_status = "ready",
                portrait_path = destinationFile.absolutePath,
                portrait_prompt = task.prompt,
                portrait_seed = seed.toInt(),
                portrait_source_hash = task.source_hash,
                portrait_last_error = null,
                portrait_generated_at = Instant.now().toString(),
                updated_at = Instant.now().toString()
            )
            characterDao.insertCharacter(updatedCharacter)

            return Result.success()

        } catch (e: Exception) {
            // Cancellation (e.g. the worker being stopped) surfaces as a CancellationException.
            // It must propagate so the coroutine unwinds cleanly; swallowing it here would run
            // blocking DB writes on an already-cancelled coroutine.
            if (e is CancellationException) throw e
            Log.e(TAG, "Failed to generate portrait for character ${task.character_id}", e)
            val attempts = task.attempts
            val nextStatus = if (attempts >= task.max_attempts) "failed" else "pending"
            
            // Calculate exponential backoff time for availability if pending: 30s * 2^(attempts - 1)
            val backoffSeconds = 30L * (1L shl (attempts - 1))
            val availableAt = if (nextStatus == "pending") {
                Instant.now().plusSeconds(backoffSeconds).toString()
            } else {
                Instant.now().toString()
            }

            taskDao.insertTask(
                task.copy(
                    status = nextStatus,
                    locked_at = null,
                    last_error = e.message ?: "Unknown error",
                    available_at = availableAt,
                    updated_at = Instant.now().toString()
                )
            )

            val updatedCharacter = character.copy(
                portrait_status = nextStatus,
                portrait_last_error = e.message ?: "Unknown error",
                updated_at = Instant.now().toString()
            )
            characterDao.insertCharacter(updatedCharacter)

            return if (nextStatus == "pending") {
                Result.retry() // Schedules WorkManager retry
            } else {
                Result.failure()
            }
        }
    }
}
