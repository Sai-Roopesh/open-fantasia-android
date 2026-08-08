package com.example.open_fantasia.data.local.dao

import androidx.room.*
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import kotlinx.coroutines.flow.Flow

@Dao
abstract class ConnectionDao {
    // @Upsert (in-place UPDATE on conflict) — NOT @Insert(REPLACE), whose DELETE+INSERT
    // would cascade-delete every thread referencing this connection (FK CASCADE).
    @Upsert
    abstract suspend fun insertConnection(connection: ConnectionEntity)

    @Query("SELECT * FROM ai_connections WHERE id = :id")
    abstract suspend fun getConnection(id: String): ConnectionEntity?

    @Query("SELECT * FROM ai_connections")
    abstract suspend fun getAllConnections(): List<ConnectionEntity>

    @Query("SELECT * FROM ai_connections ORDER BY label ASC")
    abstract fun getAllConnectionsFlow(): Flow<List<ConnectionEntity>>

    @Delete
    protected abstract suspend fun deleteConnectionInternal(connection: ConnectionEntity)

    @Query("SELECT COUNT(*) FROM chat_threads WHERE connection_id = :connectionId OR brain_connection_id = :connectionId")
    abstract suspend fun countDependentThreads(connectionId: String): Int

    @Transaction
    open suspend fun deleteConnectionIfUnused(connection: ConnectionEntity): Boolean {
        if (countDependentThreads(connection.id) != 0) return false
        deleteConnectionInternal(connection)
        return true
    }
}
