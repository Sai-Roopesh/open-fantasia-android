package com.example.open_fantasia.data.continuity

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.example.open_fantasia.OpenFantasiaApplication
import java.util.concurrent.TimeUnit

class ContinuityCheckpointWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as OpenFantasiaApplication).appContainer
        val chatDao = container.database.chatDao()
        val characterDao = container.database.characterDao()
        val personaDao = container.database.personaDao()
        container.continuityCheckpointCoordinator.flushAcknowledgements()
        val pending = chatDao.getPendingCheckpoints()
        if (pending.isEmpty()) {
            return if (container.continuityCheckpointCoordinator.hasPendingAcknowledgements()) Result.retry()
            else Result.success()
        }

        pending.forEach { request ->
            val thread = chatDao.getThread(request.thread_id) ?: return@forEach
            val character = characterDao.getCharacter(thread.character_id) ?: return@forEach
            val persona = thread.persona_id?.let { personaDao.getPersona(it) }
            container.continuityCheckpointCoordinator.sync(
                request,
                character,
                persona,
                thread.director_notes
            )
        }
        val remaining = chatDao.getPendingCheckpoints()
        return if (remaining.any { it.status != "failed" } ||
            container.continuityCheckpointCoordinator.hasPendingAcknowledgements()
        ) Result.retry() else Result.success()
    }
}

object ContinuityCheckpointScheduler {
    private const val UNIQUE_WORK = "continuity-checkpoint-sync"

    fun enqueue(context: Context) {
        val work = OneTimeWorkRequestBuilder<ContinuityCheckpointWorker>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            UNIQUE_WORK,
            ExistingWorkPolicy.KEEP,
            work
        )
    }
}
