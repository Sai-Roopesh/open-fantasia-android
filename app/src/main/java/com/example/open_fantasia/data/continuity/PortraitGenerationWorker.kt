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

class PortraitGenerationWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as OpenFantasiaApplication).appContainer
        val dao = container.database.portraitTaskDao()
        container.portraitGenerationCoordinator.flushAcknowledgements()
        dao.getPendingJobs().forEach { container.portraitGenerationCoordinator.sync(it) }
        return if (dao.getPendingJobs().any { it.status !in setOf("failed", "accepted", "superseded") } ||
            container.portraitGenerationCoordinator.hasPendingAcknowledgements()
        ) Result.retry() else Result.success()
    }
}

object PortraitGenerationScheduler {
    private const val UNIQUE_WORK = "portrait-generation-sync"

    fun enqueue(context: Context) {
        val work = OneTimeWorkRequestBuilder<PortraitGenerationWorker>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.KEEP, work)
    }
}
