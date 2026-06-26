package com.example.open_fantasia.data.local.dao

import androidx.room.*
import com.example.open_fantasia.data.local.entity.PortraitTaskEntity

@Dao
abstract class PortraitTaskDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertTask(task: PortraitTaskEntity)

    @Query("SELECT * FROM character_portrait_tasks WHERE id = :id")
    abstract suspend fun getTask(id: String): PortraitTaskEntity?

    @Query("SELECT * FROM character_portrait_tasks WHERE status = 'pending' AND datetime(available_at) <= datetime(:now) ORDER BY created_at ASC LIMIT 1")
    abstract suspend fun getNextPendingTask(now: String): PortraitTaskEntity?

    @Query("UPDATE character_portrait_tasks SET status = :status, locked_at = :lockedAt WHERE id = :id")
    abstract suspend fun updateTaskStatus(id: String, status: String, lockedAt: String?)

    @Delete
    abstract suspend fun deleteTask(task: PortraitTaskEntity)

    // Order by available_at so the caller schedules its delayed re-run for the SOONEST upcoming
    // task, not an arbitrary future one (LIMIT 1 with no ORDER BY could starve an earlier task).
    @Query("SELECT * FROM character_portrait_tasks WHERE status = 'pending' ORDER BY available_at ASC LIMIT 1")
    abstract suspend fun peekPendingTask(): PortraitTaskEntity?

    @Query("UPDATE character_portrait_tasks SET status = 'pending', locked_at = null WHERE status = 'running' AND locked_at < :cutoffTimestamp")
    abstract suspend fun reclaimStaleTasks(cutoffTimestamp: String)

    @Transaction
    open suspend fun claimNextTask(now: String, lockedAt: String): PortraitTaskEntity? {
        val task = getNextPendingTask(now) ?: return null
        val updated = task.copy(
            status = "running",
            locked_at = lockedAt,
            attempts = task.attempts + 1,
            updated_at = lockedAt
        )
        insertTask(updated)
        return updated
    }
}
