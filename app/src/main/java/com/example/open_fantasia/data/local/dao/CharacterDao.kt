package com.example.open_fantasia.data.local.dao

import androidx.room.*
import com.example.open_fantasia.data.local.entity.CharacterEntity
import kotlinx.coroutines.flow.Flow

@Dao
abstract class CharacterDao {
    // @Upsert (in-place UPDATE on conflict) — NOT @Insert(REPLACE), whose DELETE+INSERT
    // would cascade-delete every thread/turn referencing this character (FK CASCADE).
    @Upsert
    abstract suspend fun insertCharacter(character: CharacterEntity)

    @Query("SELECT * FROM characters WHERE id = :id")
    abstract suspend fun getCharacter(id: String): CharacterEntity?

    @Query("SELECT * FROM characters")
    abstract suspend fun getAllCharacters(): List<CharacterEntity>

    @Query("SELECT * FROM characters ORDER BY name ASC")
    abstract fun getAllCharactersFlow(): Flow<List<CharacterEntity>>

    @Delete
    protected abstract suspend fun deleteCharacterInternal(character: CharacterEntity)

    @Query("SELECT COUNT(*) FROM chat_threads WHERE character_id = :characterId")
    abstract suspend fun countDependentThreads(characterId: String): Int

    @Query("""
        UPDATE cast_seeds
        SET entity_id = :characterId,
            canonical_name = :name,
            role_background = :story,
            personality = :corePersona,
            voice_style = :styleRules,
            appearance = :appearance,
            boundaries = :negativeGuidance,
            manual_locks = '["canonical_name","role_background","personality","voice_style","appearance","boundaries"]',
            updated_at = :updatedAt
        WHERE provenance = 'primary'
          AND thread_id IN (SELECT id FROM chat_threads WHERE character_id = :characterId)
    """)
    protected abstract suspend fun syncPrimaryCastSeeds(
        characterId: String,
        name: String,
        story: String,
        corePersona: String,
        styleRules: String,
        appearance: String,
        negativeGuidance: String,
        updatedAt: String
    ): Int

    @Transaction
    open suspend fun saveCharacterAndSyncPrimarySeeds(character: CharacterEntity) {
        insertCharacter(character)
        syncPrimarySeeds(character)
    }

    @Transaction
    open suspend fun repairAllPrimaryCastSeeds() {
        getAllCharacters().forEach { syncPrimarySeeds(it) }
    }

    private suspend fun syncPrimarySeeds(character: CharacterEntity) {
        syncPrimaryCastSeeds(
            character.id,
            character.name,
            character.story,
            character.core_persona,
            character.style_rules,
            character.appearance,
            character.negative_guidance,
            character.updated_at
        )
    }

    @Transaction
    open suspend fun deleteCharacterIfUnused(character: CharacterEntity): Boolean {
        if (countDependentThreads(character.id) != 0) return false
        deleteCharacterInternal(character)
        return true
    }
}
