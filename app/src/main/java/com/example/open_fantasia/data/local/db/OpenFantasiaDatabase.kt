package com.example.open_fantasia.data.local.db

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.open_fantasia.data.local.dao.*
import com.example.open_fantasia.data.local.entity.*

/** v1 -> v2: per-thread director's notes (free-text prompt instructions). */
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE chat_threads ADD COLUMN director_notes TEXT NOT NULL DEFAULT ''")
    }
}

val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE chat_threads ADD COLUMN supporting_cast TEXT NOT NULL DEFAULT ''")
    }
}

@Database(
    entities = [
        ProfileEntity::class,
        ConnectionEntity::class,
        PersonaEntity::class,
        CharacterEntity::class,
        ThreadEntity::class,
        BranchEntity::class,
        TurnEntity::class,
        SnapshotEntity::class,
        TimelineEntity::class,
        PinEntity::class,
        PortraitTaskEntity::class
    ],
    version = 3,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class OpenFantasiaDatabase : RoomDatabase() {
    abstract fun profileDao(): ProfileDao
    abstract fun connectionDao(): ConnectionDao
    abstract fun personaDao(): PersonaDao
    abstract fun characterDao(): CharacterDao
    abstract fun chatDao(): ChatDao
    abstract fun portraitTaskDao(): PortraitTaskDao
}
