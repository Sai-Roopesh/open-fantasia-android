package com.example.open_fantasia.data.local.dao

import androidx.room.*
import com.example.open_fantasia.data.local.entity.ProfileEntity

@Dao
interface ProfileDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProfile(profile: ProfileEntity)

    @Query("SELECT * FROM profiles WHERE id = :id")
    suspend fun getProfile(id: String): ProfileEntity?

    @Query("SELECT COUNT(*) FROM profiles")
    suspend fun getProfileCount(): Int
}
