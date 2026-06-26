package com.example.open_fantasia.data.local.entity

import androidx.room.*
import com.example.open_fantasia.domain.model.*

@Entity(tableName = "profiles")
data class ProfileEntity(
    @PrimaryKey val id: String,
    val username: String,
    val created_at: String,
    val updated_at: String
) {
    fun toDomain() = ProfileRecord(id, username, created_at, updated_at)
}

fun ProfileRecord.toEntity() = ProfileEntity(id, username, created_at, updated_at)

@Entity(
    tableName = "ai_connections",
    foreignKeys = [
        ForeignKey(
            entity = ProfileEntity::class,
            parentColumns = ["id"],
            childColumns = ["user_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("user_id")]
)
data class ConnectionEntity(
    @PrimaryKey val id: String,
    val user_id: String,
    val provider: String,
    val label: String,
    val base_url: String?,
    val encrypted_api_key: String?,
    val enabled: Boolean,
    val default_model_id: String?,
    val model_cache: List<ModelCatalogEntry>,
    val health_status: String,
    val health_message: String,
    val last_checked_at: String?,
    val last_model_refresh_at: String?,
    val last_synced_at: String?,
    val created_at: String,
    val updated_at: String
) {
    fun toDomain() = ConnectionRecord(
        id, user_id, provider, label, base_url, encrypted_api_key, enabled, default_model_id,
        model_cache, health_status, health_message, last_checked_at, last_model_refresh_at,
        last_synced_at, created_at, updated_at
    )
}

fun ConnectionRecord.toEntity() = ConnectionEntity(
    id, user_id, provider, label, base_url, encrypted_api_key, enabled, default_model_id,
    model_cache, health_status, health_message, last_checked_at, last_model_refresh_at,
    last_synced_at, created_at, updated_at
)

@Entity(
    tableName = "user_personas",
    foreignKeys = [
        ForeignKey(
            entity = ProfileEntity::class,
            parentColumns = ["id"],
            childColumns = ["user_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("user_id")]
)
data class PersonaEntity(
    @PrimaryKey val id: String,
    val user_id: String,
    val name: String,
    val identity: String,
    val backstory: String,
    val voice_style: String,
    val goals: String,
    val boundaries: String,
    val private_notes: String,
    val is_default: Boolean,
    val created_at: String,
    val updated_at: String
) {
    fun toDomain() = UserPersonaRecord(
        id, user_id, name, identity, backstory, voice_style, goals, boundaries, private_notes, is_default, created_at, updated_at
    )
}

fun UserPersonaRecord.toEntity() = PersonaEntity(
    id, user_id, name, identity, backstory, voice_style, goals, boundaries, private_notes, is_default, created_at, updated_at
)

@Entity(
    tableName = "characters",
    foreignKeys = [
        ForeignKey(
            entity = ProfileEntity::class,
            parentColumns = ["id"],
            childColumns = ["user_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("user_id")]
)
data class CharacterEntity(
    @PrimaryKey val id: String,
    val user_id: String,
    val name: String,
    val story: String,
    val core_persona: String,
    val greeting: String,
    val appearance: String,
    val style_rules: String,
    val definition: String,
    val negative_guidance: String,
    val temperature: Double,
    val top_p: Double,
    val starters: List<String>,
    val example_conversations: List<ExampleConversation>,
    val portrait_status: String,
    val portrait_path: String?,
    val portrait_prompt: String?,
    val portrait_seed: Int?,
    val portrait_source_hash: String?,
    val portrait_last_error: String?,
    val portrait_generated_at: String?,
    val created_at: String,
    val updated_at: String
) {
    fun toDomain() = CharacterRecord(
        id, user_id, name, story, core_persona, greeting, appearance, style_rules, definition, negative_guidance,
        temperature, top_p, starters, example_conversations, portrait_status, portrait_path, portrait_prompt,
        portrait_seed, portrait_source_hash, portrait_last_error, portrait_generated_at, created_at, updated_at
    )
}

fun CharacterRecord.toEntity() = CharacterEntity(
    id, user_id, name, story, core_persona, greeting, appearance, style_rules, definition, negative_guidance,
    temperature, top_p, starters, example_conversations, portrait_status, portrait_path, portrait_prompt,
    portrait_seed, portrait_source_hash, portrait_last_error, portrait_generated_at, created_at, updated_at
)

@Entity(
    tableName = "chat_threads",
    foreignKeys = [
        ForeignKey(
            entity = ProfileEntity::class,
            parentColumns = ["id"],
            childColumns = ["user_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = CharacterEntity::class,
            parentColumns = ["id"],
            childColumns = ["character_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = ConnectionEntity::class,
            parentColumns = ["id"],
            childColumns = ["connection_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = PersonaEntity::class,
            parentColumns = ["id"],
            childColumns = ["persona_id"],
            onDelete = ForeignKey.SET_NULL
        ),
        ForeignKey(
            entity = ConnectionEntity::class,
            parentColumns = ["id"],
            childColumns = ["brain_connection_id"],
            onDelete = ForeignKey.SET_NULL
        )
    ],
    indices = [
        Index("user_id"),
        Index("character_id"),
        Index("connection_id"),
        Index("persona_id"),
        Index("brain_connection_id")
    ]
)
data class ThreadEntity(
    @PrimaryKey val id: String,
    val user_id: String,
    val character_id: String,
    val connection_id: String,
    val model_id: String,
    val persona_id: String?,
    val brain_connection_id: String?,
    val brain_model_id: String?,
    val max_output_tokens: Int,
    val director_notes: String = "",
    val title: String,
    val is_title_autogenerated: Boolean,
    val status: String,
    val archived_at: String?,
    val pinned_at: String?,
    val created_at: String,
    val updated_at: String
) {
    fun toDomain() = ThreadRecord(
        id, user_id, character_id, connection_id, model_id, persona_id, brain_connection_id, brain_model_id,
        max_output_tokens, director_notes, title, is_title_autogenerated, status, archived_at, pinned_at, created_at, updated_at
    )
}

fun ThreadRecord.toEntity() = ThreadEntity(
    id, user_id, character_id, connection_id, model_id, persona_id, brain_connection_id, brain_model_id,
    max_output_tokens, director_notes, title, is_title_autogenerated, status, archived_at, pinned_at, created_at, updated_at
)

@Entity(
    tableName = "chat_branches",
    foreignKeys = [
        ForeignKey(
            entity = ThreadEntity::class,
            parentColumns = ["id"],
            childColumns = ["thread_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = BranchEntity::class,
            parentColumns = ["id"],
            childColumns = ["parent_branch_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("thread_id"),
        Index("parent_branch_id")
    ]
)
data class BranchEntity(
    @PrimaryKey val id: String,
    val thread_id: String,
    val name: String,
    val parent_branch_id: String?,
    val fork_turn_id: String?, // Set by application, can refer to chat_turns.id
    val head_turn_id: String?, // Set by application, can refer to chat_turns.id
    val is_active: Boolean,
    val generation_locked: Boolean,
    val locked_by_turn_id: String?,
    val locked_at: String?,
    val created_by: String,
    val created_at: String,
    val updated_at: String
) {
    fun toDomain() = ChatBranchRecord(
        id, thread_id, name, parent_branch_id, fork_turn_id, head_turn_id, is_active,
        generation_locked, locked_by_turn_id, locked_at, created_by, created_at, updated_at
    )
}

fun ChatBranchRecord.toEntity() = BranchEntity(
    id, thread_id, name, parent_branch_id, fork_turn_id, head_turn_id, is_active,
    generation_locked, locked_by_turn_id, locked_at, created_by, created_at, updated_at
)

@Entity(
    tableName = "chat_turns",
    foreignKeys = [
        ForeignKey(
            entity = ThreadEntity::class,
            parentColumns = ["id"],
            childColumns = ["thread_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = BranchEntity::class,
            parentColumns = ["id"],
            childColumns = ["branch_origin_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = TurnEntity::class,
            parentColumns = ["id"],
            childColumns = ["parent_turn_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("thread_id"),
        Index("branch_origin_id"),
        Index("parent_turn_id")
    ]
)
data class TurnEntity(
    @PrimaryKey val id: String,
    val thread_id: String,
    val branch_origin_id: String,
    val parent_turn_id: String?,
    val user_input_text: String,
    val user_input_payload: String,
    val user_input_hidden: Boolean,
    val starter_seed: Boolean,
    val assistant_output_text: String?,
    val assistant_output_payload: String?,
    val generation_status: String,
    val reserved_by_user_id: String,
    val assistant_provider: String?,
    val assistant_model: String?,
    val assistant_connection_label: String?,
    val finish_reason: String?,
    val total_tokens: Int?,
    val prompt_tokens: Int?,
    val completion_tokens: Int?,
    val feedback_rating: Int?,
    val generation_started_at: String,
    val generation_finished_at: String?,
    val failure_code: String?,
    val failure_message: String?,
    val created_at: String,
    val updated_at: String
) {
    fun toDomain() = ChatTurnRecord(
        id, thread_id, branch_origin_id, parent_turn_id, user_input_text, user_input_payload,
        user_input_hidden, starter_seed, assistant_output_text, assistant_output_payload,
        generation_status, reserved_by_user_id, assistant_provider, assistant_model,
        assistant_connection_label, finish_reason, total_tokens, prompt_tokens, completion_tokens,
        feedback_rating, generation_started_at, generation_finished_at, failure_code, failure_message,
        created_at, updated_at
    )
}

fun ChatTurnRecord.toEntity() = TurnEntity(
    id, thread_id, branch_origin_id, parent_turn_id, user_input_text, user_input_payload,
    user_input_hidden, starter_seed, assistant_output_text, assistant_output_payload,
    generation_status, reserved_by_user_id, assistant_provider, assistant_model,
    assistant_connection_label, finish_reason, total_tokens, prompt_tokens, completion_tokens,
    feedback_rating, generation_started_at, generation_finished_at, failure_code, failure_message,
    created_at, updated_at
)

@Entity(
    tableName = "world_snapshots",
    foreignKeys = [
        ForeignKey(
            entity = TurnEntity::class,
            parentColumns = ["id"],
            childColumns = ["turn_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = ThreadEntity::class,
            parentColumns = ["id"],
            childColumns = ["thread_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = BranchEntity::class,
            parentColumns = ["id"],
            childColumns = ["branch_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("turn_id"),
        Index("thread_id"),
        Index("branch_id")
    ]
)
data class SnapshotEntity(
    @PrimaryKey val turn_id: String,
    val thread_id: String,
    val branch_id: String,
    val based_on_turn_id: String?,
    val world_state: DurableMemorySnapshot,
    val version: Int,
    val is_full_materialization: Boolean
)

@Entity(
    tableName = "chat_timeline_events",
    foreignKeys = [
        ForeignKey(
            entity = ThreadEntity::class,
            parentColumns = ["id"],
            childColumns = ["thread_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = BranchEntity::class,
            parentColumns = ["id"],
            childColumns = ["branch_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = TurnEntity::class,
            parentColumns = ["id"],
            childColumns = ["turn_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("thread_id"),
        Index("branch_id"),
        Index("turn_id")
    ]
)
data class TimelineEntity(
    @PrimaryKey val id: String,
    val thread_id: String,
    val branch_id: String,
    val turn_id: String?,
    val title: String,
    val detail: String,
    val importance: Int,
    val event_type: String,
    val affected_entity_ids: List<String>,
    val affected_relationship_ids: List<String>,
    val created_at: String
) {
    fun toDomain() = TimelineEventRecord(
        id, thread_id, branch_id, turn_id, title, detail, importance, event_type,
        affected_entity_ids, affected_relationship_ids, created_at
    )
}

fun TimelineEventRecord.toEntity() = TimelineEntity(
    id, thread_id, branch_id, turn_id, title, detail, importance, event_type,
    affected_entity_ids, affected_relationship_ids, created_at
)

@Entity(
    tableName = "chat_pins",
    foreignKeys = [
        ForeignKey(
            entity = ThreadEntity::class,
            parentColumns = ["id"],
            childColumns = ["thread_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = BranchEntity::class,
            parentColumns = ["id"],
            childColumns = ["branch_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = TurnEntity::class,
            parentColumns = ["id"],
            childColumns = ["turn_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("thread_id"),
        Index("branch_id"),
        Index("turn_id")
    ]
)
data class PinEntity(
    @PrimaryKey val id: String,
    val thread_id: String,
    val branch_id: String,
    val turn_id: String?,
    val body: String,
    val status: String,
    val created_at: String,
    val updated_at: String
) {
    fun toDomain() = ChatPinRecord(id, thread_id, branch_id, turn_id, body, status, created_at, updated_at)
}

fun ChatPinRecord.toEntity() = PinEntity(id, thread_id, branch_id, turn_id, body, status, created_at, updated_at)

@Entity(
    tableName = "character_portrait_tasks",
    foreignKeys = [
        ForeignKey(
            entity = CharacterEntity::class,
            parentColumns = ["id"],
            childColumns = ["character_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = ProfileEntity::class,
            parentColumns = ["id"],
            childColumns = ["user_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("character_id"),
        Index("user_id")
    ]
)
data class PortraitTaskEntity(
    @PrimaryKey val id: String,
    val character_id: String,
    val user_id: String,
    val prompt: String,
    val seed: Long,
    val source_hash: String,
    val status: String,
    val attempts: Int,
    val max_attempts: Int,
    val available_at: String,
    val locked_at: String?,
    val last_error: String?,
    val created_at: String,
    val updated_at: String
) {
    fun toDomain() = CharacterPortraitTaskRecord(
        id, character_id, user_id, prompt, seed, source_hash, status, attempts, max_attempts,
        available_at, locked_at, last_error, created_at, updated_at
    )
}

fun CharacterPortraitTaskRecord.toEntity() = PortraitTaskEntity(
    id, character_id, user_id, prompt, seed, source_hash, status, attempts, max_attempts,
    available_at, locked_at, last_error, created_at, updated_at
)
