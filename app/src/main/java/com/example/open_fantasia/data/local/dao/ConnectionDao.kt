package com.example.open_fantasia.data.local.dao

import androidx.room.*
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ConnectionDao {
    // @Upsert (in-place UPDATE on conflict) — NOT @Insert(REPLACE), whose DELETE+INSERT
    // would cascade-delete every thread referencing this connection (FK CASCADE).
    @Upsert
    suspend fun insertConnection(connection: ConnectionEntity)

    @Query("SELECT * FROM ai_connections WHERE id = :id")
    suspend fun getConnection(id: String): ConnectionEntity?

    @Query("SELECT * FROM ai_connections")
    suspend fun getAllConnections(): List<ConnectionEntity>

    @Query("SELECT * FROM ai_connections ORDER BY label ASC")
    fun getAllConnectionsFlow(): Flow<List<ConnectionEntity>>

    @Delete
    suspend fun deleteConnection(connection: ConnectionEntity)
}
