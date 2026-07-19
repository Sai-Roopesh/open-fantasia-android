package com.example.open_fantasia.data.continuity

import com.example.open_fantasia.data.local.dao.ChatDao
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.ContinuityCheckpointEntity
import com.example.open_fantasia.data.local.entity.PersonaEntity
import com.example.open_fantasia.data.local.entity.PinEntity
import com.example.open_fantasia.data.local.entity.TimelineEntity
import com.example.open_fantasia.domain.model.DurableMemorySnapshot
import com.example.open_fantasia.domain.model.CastProfile
import com.example.open_fantasia.domain.model.resolveCastRoster
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.security.MessageDigest

@Serializable data class CheckpointPin(val id: String, val body: String)
@Serializable data class CheckpointExchange(val turn_id: String, val parent_turn_id: String?, val user: String, val assistant: String, val created_at: String)
@Serializable data class CheckpointCharacter(val name: String, val story: String, val core_persona: String, val appearance: String, val definition: String, val style_rules: String, val negative_guidance: String)
@Serializable data class CheckpointPersona(val name: String, val identity: String, val backstory: String, val goals: String, val boundaries: String)

@Serializable
data class ContinuityRequestEnvelope(
    val protocol_version: Int = 1,
    val request_id: String,
    val thread_id: String,
    val branch_id: String,
    val target_turn_id: String,
    val baseline_turn_id: String?,
    val baseline_version: Int,
    val baseline_hash: String,
    val trigger_reason: String,
    val old_head_turn_id: String?,
    val discarded_exchange_count: Int,
    val attempt_count: Int,
    val character: CheckpointCharacter,
    val persona: CheckpointPersona?,
    val cast_seeds: List<CastProfile>,
    val current_cast_roster: List<CastProfile>,
    val director_notes: String,
    val pins: List<CheckpointPin>,
    val baseline_snapshot: DurableMemorySnapshot?,
    val exchanges: List<CheckpointExchange>,
    val story_summary_limit: Int = 20_000,
    val scene_summary_limit: Int = 8_000,
    val latest_beat_limit: Int = 4_000
)

@Serializable
data class ContinuityResponseEnvelope(
    val protocol_version: Int = 1,
    val request_id: String,
    val attempt_count: Int,
    val thread_id: String,
    val branch_id: String,
    val target_turn_id: String,
    val baseline_hash: String,
    val world_state: DurableMemorySnapshot,
    val timeline_events: List<CheckpointTimelineEvent> = emptyList()
)

@Serializable
data class CheckpointTimelineEvent(
    val turn_id: String,
    val title: String,
    val detail: String,
    val importance: Int,
    val event_type: String,
    val affected_entity_ids: List<String> = emptyList(),
    val affected_relationship_ids: List<String> = emptyList()
)

object ContinuityCheckpointProtocol {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    suspend fun buildRequest(
        dao: ChatDao, request: ContinuityCheckpointEntity, character: CharacterEntity, persona: PersonaEntity?,
        pins: List<PinEntity>, directorNotes: String
    ): ContinuityRequestEnvelope {
        val baseline = request.baseline_turn_id?.let { dao.getSnapshot(it) }
        val baselineJson = baseline?.let { json.encodeToString(it.world_state) }.orEmpty()
        val hash = sha256(baselineJson)
        val seeds = dao.getCastSeeds(request.thread_id).map { it.toDomain() }
        val overrides = dao.getCastOverrides(request.branch_id).map { it.toDomain() }
        val constraints = buildMap {
            seeds.forEach { put(it.cast_id, it) }
            overrides.forEach { put(it.cast_id, it) }
        }.values.toList()
        val currentRoster = resolveCastRoster(baseline?.world_state, seeds, overrides, persona?.name)
        val ancestors = dao.getAncestorTurns(request.target_turn_id).associateBy { it.id }
        val ordered = mutableListOf<com.example.open_fantasia.data.local.entity.TurnEntity>()
        var cursor: String? = request.target_turn_id
        while (cursor != null) { val t = ancestors[cursor] ?: break; ordered += t; cursor = t.parent_turn_id }
        ordered.reverse()
        val baselineIndex = request.baseline_turn_id?.let { id -> ordered.indexOfFirst { it.id == id } } ?: -1
        val exchanges = ordered.drop(baselineIndex + 1).filter { it.generation_status == "committed" && !it.starter_seed }.map {
            CheckpointExchange(it.id, it.parent_turn_id, it.user_input_text, it.assistant_output_text.orEmpty(), it.created_at)
        }
        return ContinuityRequestEnvelope(
            request_id=request.id, thread_id=request.thread_id, branch_id=request.branch_id,
            target_turn_id=request.target_turn_id, baseline_turn_id=request.baseline_turn_id,
            baseline_version=request.baseline_version, baseline_hash=hash,
            trigger_reason=request.trigger_reason, old_head_turn_id=request.old_head_turn_id,
            discarded_exchange_count=request.discarded_exchange_count, attempt_count=request.attempt_count,
            character=CheckpointCharacter(character.name, character.story, character.core_persona, character.appearance, character.definition, character.style_rules, character.negative_guidance),
            persona=persona?.let { CheckpointPersona(it.name,it.identity,it.backstory,it.goals,it.boundaries) },
            cast_seeds=constraints, current_cast_roster=currentRoster, director_notes=directorNotes,
            pins=pins.map { CheckpointPin(it.id,it.body) }, baseline_snapshot=baseline?.world_state, exchanges=exchanges
        )
    }

    suspend fun acceptResponse(
        dao: ChatDao,
        request: ContinuityCheckpointEntity,
        env: ContinuityResponseEnvelope
    ) {
        require(env.protocol_version == 1) { "Continuity protocol is incompatible" }
        require(env.attempt_count == request.attempt_count) { "Continuity response belongs to a stale attempt" }
        require(env.request_id == request.id && env.thread_id == request.thread_id && env.branch_id == request.branch_id)
        require(env.target_turn_id == request.target_turn_id && env.baseline_hash == request.baseline_hash)
        val timelineEvents = validateAndMaterializeTimeline(dao, request, env.world_state, env.timeline_events)
        val constraints = buildMap {
            dao.getCastSeeds(request.thread_id).forEach { put(it.cast_id, it.toDomain()) }
            dao.getCastOverrides(request.branch_id).forEach { put(it.cast_id, it.toDomain()) }
        }.values.toList()
        validate(env.world_state, request.target_turn_id, request.baseline_version, constraints)
        dao.acceptCheckpoint(request.id, env.world_state, timelineEvents)
    }

    private fun validate(s: DurableMemorySnapshot, target: String, baselineVersion: Int, seeds: List<CastProfile>) {
        require(s.metadata.current_turn_id == target) { "Snapshot targets the wrong exchange" }
        require(s.metadata.version == baselineVersion + 1) { "Snapshot has the wrong version" }
        require(s.narrative_state.story_summary.length <= 20_000) { "Story Summary exceeds 20,000 characters" }
        require(s.narrative_state.scene_summary.length <= 8_000) { "Scene Summary exceeds 8,000 characters" }
        require(s.narrative_state.last_turn_beat.length <= 4_000) { "Latest Beat exceeds 4,000 characters" }
        val entityIds=s.entity_state.map { it.entity_id }; require(entityIds.size == entityIds.toSet().size) { "Duplicate entity IDs" }
        val locationIds=s.spatial_state.known_locations.map { it.id }.toSet()
        require(s.spatial_state.entity_placements.all { it.entity_id in entityIds && it.location_id in locationIds }) { "Invalid placement reference" }
        require(s.relational_state.all { it.source_entity_id in entityIds && it.target_entity_id in entityIds }) { "Invalid relationship reference" }
        val roster = s.cast_roster
        require(roster.isNotEmpty()) { "Cast Roster is missing" }
        require(roster.none { it.canonical_name.isBlank() || it.cast_id.isBlank() }) { "Cast member identity is missing" }
        require(roster.map { it.cast_id }.distinct().size == roster.size) { "Duplicate cast IDs" }
        require(roster.map { it.canonical_name.trim().lowercase() }.distinct().size == roster.size) { "Duplicate cast names" }
        require(roster.none { it.player_controlled }) { "Player persona cannot enter Cast Roster" }
        val byId = roster.associateBy { it.cast_id }
        seeds.forEach { seed ->
            val result = requireNotNull(byId[seed.cast_id]) { "Cast Roster dropped seed ${seed.canonical_name}" }
            seed.manual_locks.forEach { field ->
                require(castField(result, field) == castField(seed, field)) { "Locked cast field changed: ${seed.canonical_name}.$field" }
            }
        }
    }

    private fun castField(profile: CastProfile, field: String): Any? = when (field) {
        "canonical_name" -> profile.canonical_name
        "aliases" -> profile.aliases
        "role_background" -> profile.role_background
        "personality" -> profile.personality
        "voice_style" -> profile.voice_style
        "appearance" -> profile.appearance
        "goals" -> profile.goals
        "boundaries" -> profile.boundaries
        "status" -> profile.status
        "speaker_eligible" -> profile.speaker_eligible
        else -> null
    }

    private suspend fun validateAndMaterializeTimeline(
        dao: ChatDao,
        request: ContinuityCheckpointEntity,
        snapshot: DurableMemorySnapshot,
        events: List<CheckpointTimelineEvent>
    ): List<TimelineEntity> {
        require(events.size <= 7) { "Too many timeline events" }
        val ancestors = dao.getAncestorTurns(request.target_turn_id).associateBy { it.id }
        val ordered = mutableListOf<com.example.open_fantasia.data.local.entity.TurnEntity>()
        var cursor: String? = request.target_turn_id
        while (cursor != null) {
            val turn = ancestors[cursor] ?: break
            ordered += turn
            cursor = turn.parent_turn_id
        }
        ordered.reverse()
        val baselineIndex = request.baseline_turn_id?.let { id -> ordered.indexOfFirst { it.id == id } } ?: -1
        val checkpointTurns = ordered.drop(baselineIndex + 1)
            .filter { it.generation_status == "committed" && !it.starter_seed }
            .associateBy { it.id }
        val entityIds = snapshot.entity_state.map { it.entity_id }.toSet()
        val relationshipIds = snapshot.relational_state.map { it.relationship_id }.toSet()

        return events.mapIndexed { index, event ->
            val turn = requireNotNull(checkpointTurns[event.turn_id]) { "Invalid timeline turn reference" }
            require(event.title.isNotBlank() && event.detail.isNotBlank()) { "Timeline event is missing content" }
            require(event.importance in 1..5) { "Invalid timeline importance" }
            require(event.affected_entity_ids.all { it in entityIds }) { "Invalid timeline entity reference" }
            require(event.affected_relationship_ids.all { it in relationshipIds }) { "Invalid timeline relationship reference" }
            TimelineEntity(
                id = "${request.id}:timeline:$index",
                thread_id = request.thread_id,
                branch_id = request.branch_id,
                turn_id = event.turn_id,
                title = event.title,
                detail = event.detail,
                importance = event.importance,
                event_type = event.event_type,
                affected_entity_ids = event.affected_entity_ids,
                affected_relationship_ids = event.affected_relationship_ids,
                created_at = turn.created_at
            )
        }
    }

    private fun sha256(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
}
