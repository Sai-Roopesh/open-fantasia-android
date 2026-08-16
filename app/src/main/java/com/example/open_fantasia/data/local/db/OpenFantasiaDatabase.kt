package com.example.open_fantasia.data.local.db

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.open_fantasia.data.local.dao.*
import com.example.open_fantasia.data.local.entity.*
import com.example.open_fantasia.domain.model.CastSeedHealAction
import com.example.open_fantasia.domain.model.CastSeedRow
import com.example.open_fantasia.domain.model.planCastSeedDeduplication

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

val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS continuity_checkpoint_requests (
                id TEXT NOT NULL PRIMARY KEY,
                protocol_version INTEGER NOT NULL DEFAULT 1,
                thread_id TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                target_turn_id TEXT NOT NULL,
                baseline_turn_id TEXT,
                baseline_version INTEGER NOT NULL,
                baseline_hash TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending_export',
                attempt_count INTEGER NOT NULL DEFAULT 0,
                failure_detail TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                accepted_at TEXT,
                FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
                FOREIGN KEY(branch_id) REFERENCES chat_branches(id) ON DELETE CASCADE,
                FOREIGN KEY(target_turn_id) REFERENCES chat_turns(id) ON DELETE CASCADE
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS index_continuity_checkpoint_requests_thread_id ON continuity_checkpoint_requests(thread_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_continuity_checkpoint_requests_branch_id ON continuity_checkpoint_requests(branch_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_continuity_checkpoint_requests_target_turn_id ON continuity_checkpoint_requests(target_turn_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_continuity_checkpoint_requests_status ON continuity_checkpoint_requests(status)")
    }
}

val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE continuity_checkpoint_requests ADD COLUMN trigger_reason TEXT NOT NULL DEFAULT 'cadence'")
        db.execSQL("ALTER TABLE continuity_checkpoint_requests ADD COLUMN old_head_turn_id TEXT")
        db.execSQL("ALTER TABLE continuity_checkpoint_requests ADD COLUMN discarded_exchange_count INTEGER NOT NULL DEFAULT 0")
    }
}

/** Normalized cast seeds, sticky branch speaker, and immutable model input per exchange. */
val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS cast_seeds (
                cast_id TEXT NOT NULL PRIMARY KEY,
                thread_id TEXT NOT NULL,
                entity_id TEXT,
                canonical_name TEXT NOT NULL,
                aliases TEXT NOT NULL DEFAULT '[]',
                role_background TEXT NOT NULL DEFAULT '',
                personality TEXT NOT NULL DEFAULT '',
                voice_style TEXT NOT NULL DEFAULT '',
                appearance TEXT NOT NULL DEFAULT '',
                goals TEXT NOT NULL DEFAULT '',
                boundaries TEXT NOT NULL DEFAULT '',
                provenance TEXT NOT NULL DEFAULT 'manual_seed',
                first_seen_turn_id TEXT,
                evidence TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'active',
                speaker_eligible INTEGER NOT NULL DEFAULT 1,
                player_controlled INTEGER NOT NULL DEFAULT 0,
                manual_locks TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS index_cast_seeds_thread_id ON cast_seeds(thread_id)")
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS cast_profile_overrides (
                branch_id TEXT NOT NULL,
                cast_id TEXT NOT NULL,
                entity_id TEXT,
                canonical_name TEXT NOT NULL,
                aliases TEXT NOT NULL DEFAULT '[]',
                role_background TEXT NOT NULL DEFAULT '',
                personality TEXT NOT NULL DEFAULT '',
                voice_style TEXT NOT NULL DEFAULT '',
                appearance TEXT NOT NULL DEFAULT '',
                goals TEXT NOT NULL DEFAULT '',
                boundaries TEXT NOT NULL DEFAULT '',
                provenance TEXT NOT NULL,
                first_seen_turn_id TEXT,
                evidence TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'active',
                speaker_eligible INTEGER NOT NULL DEFAULT 1,
                player_controlled INTEGER NOT NULL DEFAULT 0,
                manual_locks TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL,
                PRIMARY KEY(branch_id, cast_id),
                FOREIGN KEY(branch_id) REFERENCES chat_branches(id) ON DELETE CASCADE
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS index_cast_profile_overrides_branch_id ON cast_profile_overrides(branch_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_cast_profile_overrides_cast_id ON cast_profile_overrides(cast_id)")

        db.execSQL("ALTER TABLE chat_branches ADD COLUMN active_speaker_id TEXT")
        db.execSQL("ALTER TABLE chat_branches ADD COLUMN speaker_mode TEXT NOT NULL DEFAULT 'single'")
        db.execSQL("ALTER TABLE chat_turns ADD COLUMN requested_speaker_id TEXT")
        db.execSQL("ALTER TABLE chat_turns ADD COLUMN requested_speaker_name TEXT")
        db.execSQL("ALTER TABLE chat_turns ADD COLUMN speaker_mode TEXT NOT NULL DEFAULT 'single'")
        db.execSQL("ALTER TABLE chat_turns ADD COLUMN rendered_user_message TEXT")

        db.execSQL("""
            INSERT OR IGNORE INTO cast_seeds (
                cast_id, thread_id, entity_id, canonical_name, aliases, role_background,
                personality, voice_style, appearance, goals, boundaries, provenance,
                evidence, manual_locks, created_at, updated_at
            )
            SELECT 'primary:' || t.id, t.id, c.id, c.name, '[]', c.story,
                   c.core_persona, c.style_rules, c.appearance, '', c.negative_guidance,
                   'primary', '[]',
                   '["canonical_name","role_background","personality","voice_style","appearance","boundaries"]',
                   t.created_at, t.updated_at
            FROM chat_threads t JOIN characters c ON c.id = t.character_id
        """.trimIndent())

        // SQLite JSON1 ships with Android SQLite. Each old side-character becomes a stable seed.
        db.execSQL("""
            INSERT OR IGNORE INTO cast_seeds (
                cast_id, thread_id, canonical_name, aliases, role_background, provenance,
                evidence, manual_locks, created_at, updated_at
            )
            SELECT 'seed:' || t.id || ':' || CAST(j.key AS TEXT), t.id,
                   TRIM(COALESCE(json_extract(j.value, '$.name'), '')), '[]',
                   COALESCE(json_extract(j.value, '$.description'), ''), 'manual_seed',
                   '[]', '["canonical_name","role_background"]', t.created_at, t.updated_at
            FROM chat_threads t, json_each(
                CASE WHEN json_valid(t.supporting_cast) THEN t.supporting_cast ELSE '[]' END
            ) j
            WHERE TRIM(COALESCE(json_extract(j.value, '$.name'), '')) != ''
        """.trimIndent())

        db.execSQL("""
            UPDATE chat_branches
            SET active_speaker_id = 'primary:' || thread_id
            WHERE active_speaker_id IS NULL
        """.trimIndent())
        db.execSQL("""
            UPDATE chat_turns
            SET requested_speaker_id = 'primary:' || thread_id,
                requested_speaker_name = (
                    SELECT c.name FROM chat_threads t JOIN characters c ON c.id = t.character_id
                    WHERE t.id = chat_turns.thread_id
                ),
                rendered_user_message = user_input_text
        """.trimIndent())
    }
}

/** Protocol v2: frozen Continuity Engine identity and durable Mac-hosted roleplay jobs. */
val MIGRATION_6_7 = object : Migration(6, 7) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE continuity_checkpoint_requests ADD COLUMN engine_id TEXT NOT NULL DEFAULT 'codex:gpt-5.6-terra:high'")
        db.execSQL("UPDATE continuity_checkpoint_requests SET protocol_version = 2")
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS roleplay_generation_jobs (
                id TEXT NOT NULL PRIMARY KEY,
                protocol_version INTEGER NOT NULL DEFAULT 2,
                turn_id TEXT NOT NULL,
                thread_id TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                expected_head_turn_id TEXT,
                replace_turn_id TEXT,
                requested_speaker_id TEXT,
                speaker_mode TEXT NOT NULL,
                model_id TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                messages_json TEXT NOT NULL,
                temperature REAL NOT NULL,
                top_p REAL NOT NULL,
                max_tokens INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending_export',
                attempt_count INTEGER NOT NULL DEFAULT 0,
                failure_detail TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                accepted_at TEXT,
                FOREIGN KEY(turn_id) REFERENCES chat_turns(id) ON DELETE CASCADE,
                FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
                FOREIGN KEY(branch_id) REFERENCES chat_branches(id) ON DELETE CASCADE
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS index_roleplay_generation_jobs_turn_id ON roleplay_generation_jobs(turn_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_roleplay_generation_jobs_thread_id ON roleplay_generation_jobs(thread_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_roleplay_generation_jobs_branch_id ON roleplay_generation_jobs(branch_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_roleplay_generation_jobs_status ON roleplay_generation_jobs(status)")
    }
}

/** Mac-hosted portraits and per-thread speaker-aware chat backdrop preferences. */
val MIGRATION_7_8 = object : Migration(7, 8) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE chat_threads ADD COLUMN portrait_background_enabled INTEGER NOT NULL DEFAULT 1")
        db.execSQL("ALTER TABLE chat_threads ADD COLUMN portrait_background_dimness REAL NOT NULL DEFAULT 0.55")

        // Pending Pollinations work cannot be resumed by the new private Mac Host protocol.
        db.execSQL("DROP TABLE IF EXISTS character_portrait_tasks")
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS portrait_generation_jobs (
                id TEXT NOT NULL PRIMARY KEY,
                protocol_version INTEGER NOT NULL DEFAULT 2,
                subject_type TEXT NOT NULL,
                character_id TEXT NOT NULL,
                thread_id TEXT,
                branch_id TEXT,
                cast_id TEXT,
                source_hash TEXT NOT NULL,
                prompt_version INTEGER NOT NULL,
                portrait_brief_json TEXT NOT NULL,
                model_id TEXT NOT NULL,
                status TEXT NOT NULL,
                attempt_count INTEGER NOT NULL,
                failure_detail TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                accepted_at TEXT,
                FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE,
                FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
                FOREIGN KEY(branch_id) REFERENCES chat_branches(id) ON DELETE CASCADE
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS index_portrait_generation_jobs_character_id ON portrait_generation_jobs(character_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_portrait_generation_jobs_thread_id ON portrait_generation_jobs(thread_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_portrait_generation_jobs_branch_id ON portrait_generation_jobs(branch_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_portrait_generation_jobs_status ON portrait_generation_jobs(status)")

        db.execSQL("""
            CREATE TABLE IF NOT EXISTS cast_portraits (
                id TEXT NOT NULL PRIMARY KEY,
                thread_id TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                cast_id TEXT NOT NULL,
                source_hash TEXT NOT NULL,
                portrait_path TEXT,
                thumbnail_path TEXT,
                portrait_brief_json TEXT NOT NULL,
                status TEXT NOT NULL,
                last_error TEXT,
                generated_at TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
                FOREIGN KEY(branch_id) REFERENCES chat_branches(id) ON DELETE CASCADE
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS index_cast_portraits_thread_id ON cast_portraits(thread_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_cast_portraits_branch_id ON cast_portraits(branch_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_cast_portraits_cast_id ON cast_portraits(cast_id)")
    }
}

/** One provider-neutral Roleplay Generation Job lifecycle for direct and Mac-hosted models. */
val MIGRATION_8_9 = object : Migration(8, 9) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE roleplay_generation_jobs ADD COLUMN provider TEXT NOT NULL DEFAULT 'antigravity_host'")
        db.execSQL("ALTER TABLE roleplay_generation_jobs ADD COLUMN connection_id TEXT NOT NULL DEFAULT 'builtin:mac-antigravity'")
        db.execSQL("ALTER TABLE roleplay_generation_jobs ADD COLUMN connection_label TEXT NOT NULL DEFAULT 'Antigravity (Mac)'")
        db.execSQL("ALTER TABLE roleplay_generation_jobs ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'mac_host'")
        db.execSQL("ALTER TABLE roleplay_generation_jobs ADD COLUMN request_hash TEXT NOT NULL DEFAULT ''")
    }
}

/**
 * Cast Seed names become unique per thread.
 *
 * The unique index cannot be created while duplicates exist, and threads in the wild have them, so the
 * migration heals first. Healing never discards authored work: a duplicate whose content matches the
 * seed it collides with is a re-paste of the same character and is removed, while one that genuinely
 * differs keeps everything it has and is given a numbered name so a person can tell the two apart and
 * decide. The oldest seed always keeps its name.
 */
val MIGRATION_9_10 = object : Migration(9, 10) {
    private val contentColumns = listOf(
        "entity_id", "aliases", "role_background", "personality", "voice_style", "appearance",
        "goals", "boundaries", "provenance", "first_seen_turn_id", "evidence", "status",
        "speaker_eligible", "player_controlled", "manual_locks"
    )

    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE cast_seeds ADD COLUMN canonical_name_key TEXT NOT NULL DEFAULT ''")
        db.execSQL("UPDATE cast_seeds SET canonical_name_key = lower(trim(canonical_name))")
        healDuplicateNames(db)
        db.execSQL(
            "CREATE UNIQUE INDEX IF NOT EXISTS index_cast_seeds_thread_id_canonical_name_key " +
                "ON cast_seeds(thread_id, canonical_name_key)"
        )
    }

    private fun healDuplicateNames(db: SupportSQLiteDatabase) {
        val columns = listOf("cast_id", "thread_id", "canonical_name", "created_at") + contentColumns
        val rows = mutableListOf<CastSeedRow>()
        db.query("SELECT " + columns.joinToString(", ") + " FROM cast_seeds").use { cursor ->
            val read = { name: String ->
                cursor.getColumnIndex(name).let { if (it < 0 || cursor.isNull(it)) null else cursor.getString(it) }
            }
            while (cursor.moveToNext()) {
                rows += CastSeedRow(
                    castId = read("cast_id").orEmpty(),
                    threadId = read("thread_id").orEmpty(),
                    canonicalName = read("canonical_name").orEmpty(),
                    createdAt = read("created_at").orEmpty(),
                    content = contentColumns.map(read)
                )
            }
        }

        for (action in planCastSeedDeduplication(rows)) when (action) {
            is CastSeedHealAction.Remove -> {
                // Branch-valid side state that pointed at the removed seed goes with it, and a branch
                // speaking as it falls back to the Primary Character rather than to a dangling id.
                db.execSQL("DELETE FROM cast_profile_overrides WHERE cast_id = ?", arrayOf(action.castId))
                db.execSQL("DELETE FROM cast_portraits WHERE cast_id = ?", arrayOf(action.castId))
                db.execSQL(
                    "UPDATE chat_branches SET active_speaker_id = 'primary:' || thread_id WHERE active_speaker_id = ?",
                    arrayOf(action.castId)
                )
                db.execSQL("DELETE FROM cast_seeds WHERE cast_id = ?", arrayOf(action.castId))
            }
            is CastSeedHealAction.Rename -> db.execSQL(
                "UPDATE cast_seeds SET canonical_name = ?, canonical_name_key = ? WHERE cast_id = ?",
                arrayOf(action.canonicalName, action.canonicalNameKey, action.castId)
            )
        }
    }
}

@Database(
    entities = [
        ProfileEntity::class,
        ConnectionEntity::class,
        PersonaEntity::class,
        CharacterEntity::class,
        ThreadEntity::class,
        CastSeedEntity::class,
        BranchEntity::class,
        CastProfileOverrideEntity::class,
        TurnEntity::class,
        SnapshotEntity::class,
        ContinuityCheckpointEntity::class,
        RoleplayGenerationJobEntity::class,
        TimelineEntity::class,
        PinEntity::class,
        PortraitGenerationJobEntity::class,
        CastPortraitEntity::class
    ],
    version = 10,
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
