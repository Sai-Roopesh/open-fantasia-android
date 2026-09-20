package com.example.open_fantasia.data.continuity

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.open_fantasia.OpenFantasiaApplication

class PortraitGenerationWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as OpenFantasiaApplication).appContainer
        val dao = container.database.portraitTaskDao()
        container.portraitGenerationCoordinator.flushAcknowledgements()
        dao.getPendingJobs().forEach { container.portraitGenerationCoordinator.sync(it) }
        if (dao.getPendingJobs().any { it.status !in setOf("failed", "accepted", "superseded") } ||
            container.portraitGenerationCoordinator.hasPendingAcknowledgements()
        ) {
            PortraitGenerationScheduler.enqueueNextPoll(applicationContext)
        }
        return Result.success()
    }
}

object PortraitGenerationScheduler {
    private const val UNIQUE_WORK = "portrait-generation-sync"

    /** Polls now — portrait work was just queued. */
    fun enqueue(context: Context) =
        DurableJobPoll.enqueue<PortraitGenerationWorker>(context, UNIQUE_WORK)

    /** Polls again in ten seconds because portrait work is still outstanding on the Mac Host. */
    fun enqueueNextPoll(context: Context) =
        DurableJobPoll.enqueue<PortraitGenerationWorker>(context, UNIQUE_WORK, DurableJobPoll.INTERVAL_SECONDS)
}
