package com.example.open_fantasia.data.continuity

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.example.open_fantasia.OpenFantasiaApplication
import com.example.open_fantasia.R
import java.util.concurrent.TimeUnit

class RoleplayGenerationWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as OpenFantasiaApplication).appContainer
        val dao = container.database.chatDao()
        container.roleplayGenerationCoordinator.flushAcknowledgements()
        val before = dao.getPendingRoleplayJobs().filter {
            it.execution_mode == RoleplayGenerationCoordinator.EXECUTION_MODE_MAC_HOST
        }
        before.filter { it.status != "failed" }.forEach { container.roleplayGenerationCoordinator.sync(it) }
        val after = dao.getPendingRoleplayJobs().filter {
            it.execution_mode == RoleplayGenerationCoordinator.EXECUTION_MODE_MAC_HOST
        }
        if (before.none { it.status == "accepted" } && after.size < before.size) notifyReady()
        return if (after.any { it.status !in setOf("failed", "accepted", "superseded") } ||
            container.roleplayGenerationCoordinator.hasPendingAcknowledgements()
        ) Result.retry() else Result.success()
    }

    private fun notifyReady() {
        val manager = applicationContext.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Roleplay replies", NotificationManager.IMPORTANCE_DEFAULT))
        if (!NotificationManagerCompat.from(applicationContext).areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) return
        val notification = NotificationCompat.Builder(applicationContext, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Open Fantasia")
            .setContentText("Reply ready")
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(applicationContext).notify(READY_NOTIFICATION, notification)
    }

    companion object {
        private const val CHANNEL = "roleplay-ready"
        private const val READY_NOTIFICATION = 2301
    }
}

object RoleplayGenerationScheduler {
    private const val UNIQUE_WORK = "roleplay-generation-sync"
    fun enqueue(context: Context) {
        val work = OneTimeWorkRequestBuilder<RoleplayGenerationWorker>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.KEEP, work)
    }
}
