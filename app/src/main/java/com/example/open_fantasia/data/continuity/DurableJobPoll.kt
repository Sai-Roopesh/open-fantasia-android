package com.example.open_fantasia.data.continuity

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ListenableWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Fixed poll cadence for durable Mac Host jobs.
 *
 * These pollers used to reschedule themselves with `Result.retry()` under an exponential backoff.
 * Backoff is the right shape for a failing operation and the wrong shape for waiting: a Continuity
 * Update takes minutes, so by the time the host had a result the interval had compounded well past
 * it, and a finished job sat unacknowledged while the app looked stuck. The work was never failing —
 * it was correctly reporting "not yet".
 *
 * A poll that finds work still outstanding now succeeds and queues the next one at a flat interval,
 * which is the ten seconds ADR-0004 specifies. Backoff remains configured for genuine crashes,
 * where a growing delay is appropriate.
 */
internal object DurableJobPoll {
    const val INTERVAL_SECONDS = 10L

    /**
     * Queues a poll, optionally after [delaySeconds]. KEEP means re-entering a screen cannot stack
     * duplicate pollers — an already-pending poll is left to fire on its own schedule.
     */
    inline fun <reified W : ListenableWorker> enqueue(
        context: Context,
        uniqueName: String,
        delaySeconds: Long = 0
    ) {
        val builder = OneTimeWorkRequestBuilder<W>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, INTERVAL_SECONDS, TimeUnit.SECONDS)
        if (delaySeconds > 0) builder.setInitialDelay(delaySeconds, TimeUnit.SECONDS)
        WorkManager.getInstance(context).enqueueUniqueWork(uniqueName, ExistingWorkPolicy.KEEP, builder.build())
    }
}
