package com.example.open_fantasia.data.local.dao

import androidx.room.*
import com.example.open_fantasia.data.local.entity.CharacterEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CharacterDao {
    // @Upsert (in-place UPDATE on conflict) — NOT @Insert(REPLACE), whose DELETE+INSERT
    // would cascade-delete every thread/turn referencing this character (FK CASCADE).
    @Upsert
    suspend fun insertCharacter(character: CharacterEntity)

    @Query("SELECT * FROM characters WHERE id = :id")
    suspend fun getCharacter(id: String): CharacterEntity?

    @Query("SELECT * FROM characters")
    suspend fun getAllCharacters(): List<CharacterEntity>

    @Query("SELECT * FROM characters ORDER BY name ASC")
    fun getAllCharactersFlow(): Flow<List<CharacterEntity>>

    @Delete
    suspend fun deleteCharacter(character: CharacterEntity)
}
