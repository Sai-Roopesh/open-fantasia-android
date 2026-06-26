package com.example.open_fantasia.data.local.dao

import androidx.room.*
import com.example.open_fantasia.data.local.entity.PersonaEntity
import kotlinx.coroutines.flow.Flow
import java.time.Instant

@Dao
abstract class PersonaDao {
    // @Upsert (in-place UPDATE on conflict) — NOT @Insert(REPLACE), whose DELETE+INSERT
    // would SET_NULL the persona on every thread referencing it (FK SET_NULL).
    @Upsert
    abstract suspend fun insertPersona(persona: PersonaEntity)

    @Query("SELECT * FROM user_personas WHERE id = :id")
    abstract suspend fun getPersona(id: String): PersonaEntity?

    @Query("SELECT * FROM user_personas")
    abstract suspend fun getAllPersonas(): List<PersonaEntity>

    @Query("SELECT * FROM user_personas ORDER BY name ASC")
    abstract fun getAllPersonasFlow(): Flow<List<PersonaEntity>>

    @Delete
    abstract suspend fun deletePersona(persona: PersonaEntity)

    @Transaction
    open suspend fun setDefaultPersona(userId: String, personaId: String): PersonaEntity {
        val selected = getPersona(personaId) ?: throw IllegalArgumentException("Persona not found")
        if (selected.user_id != userId) {
            throw IllegalArgumentException("Persona not owned by user")
        }
        
        // Clear default flag for all other personas of this user
        clearDefaults(userId, Instant.now().toString())
        
        // Set this persona to default
        val updated = selected.copy(is_default = true, updated_at = Instant.now().toString())
        insertPersona(updated)
        return updated
    }

    @Query("UPDATE user_personas SET is_default = 0, updated_at = :timestamp WHERE user_id = :userId")
    protected abstract suspend fun clearDefaults(userId: String, timestamp: String)

    @Query("SELECT * FROM user_personas WHERE id != :excludeId AND user_id = :userId ORDER BY is_default DESC, updated_at DESC LIMIT 1")
    abstract suspend fun findReplacementPersona(excludeId: String, userId: String): PersonaEntity?

    @Query("SELECT * FROM user_personas WHERE user_id = :userId AND is_default = 1 LIMIT 1")
    abstract suspend fun getDefaultPersona(userId: String): PersonaEntity?

    @Query("SELECT persona_id, COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM chat_threads WHERE persona_id IS NOT NULL GROUP BY persona_id")
    abstract fun getPersonaUsageFlow(): Flow<List<PersonaUsage>>
}

data class PersonaUsage(
    val persona_id: String,
    val total: Int,
    val active: Int
)
