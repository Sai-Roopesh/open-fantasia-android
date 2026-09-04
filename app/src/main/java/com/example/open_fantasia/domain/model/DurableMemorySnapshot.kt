package com.example.open_fantasia.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class DurableMemorySnapshot(
    val metadata: SnapshotMetadata,
    val spatial_state: SpatialState,
    val entity_state: List<EntityState>,
    val relational_state: List<RelationalState>,
    val narrative_state: NarrativeState,
    /** Complete, branch-valid speakable cast at this snapshot. */
    val cast_roster: List<CastProfile> = emptyList(),
    /**
     * The snapshot version at which the story last had anything to do with each entity, relationship,
     * and thread, keyed by identifier. Maintained by the Continuity Compiler; age is
     * `metadata.version - salience[id]`.
     *
     * It is bookkeeping about a record rather than a fact about the story, which is why it sits beside
     * the records instead of inside them: `entity_state` is serialized into the prompt verbatim, so a
     * field added there would read to the model as though it were one of a character's secrets.
     * [PromptWorldState] therefore does not carry it, the same way and for the same kind of reason it
     * does not carry `cast_roster`.
     *
     * Empty on any snapshot written before salience existed. An absent entry means the record is
     * current, so an old snapshot ages nothing until its next Continuity Update.
     */
    val salience: Map<String, Int> = emptyMap()
)

@Serializable
data class CastProfile(
    val cast_id: String,
    val entity_id: String? = null,
    val canonical_name: String,
    val aliases: List<String> = emptyList(),
    val role_background: String = "",
    val personality: String = "",
    val voice_style: String = "",
    val appearance: String = "",
    val goals: String = "",
    val boundaries: String = "",
    val provenance: String, // primary | manual_seed | continuity_discovered
    val first_seen_turn_id: String? = null,
    val evidence: List<String> = emptyList(),
    val status: String = "active", // active | archived
    val speaker_eligible: Boolean = true,
    val player_controlled: Boolean = false,
    val manual_locks: List<String> = emptyList()
)

@Serializable
data class SnapshotMetadata(
    val current_turn_id: String,
    val narrative_timestamp: String,
    val transition_type: String, // "continuation" | "scene_transition" | "time_skip"
    val version: Int
)

@Serializable
data class SpatialState(
    val current_location: LocationState?,
    val adjacent_locations: List<LocationRef>,
    val known_locations: List<LocationState>,
    val edges: List<LocationEdge>,
    val entity_placements: List<EntityPlacement>
)

@Serializable
data class LocationState(
    val id: String,
    val name: String,
    val description: String,
    val environmental_modifiers: List<String>
)

@Serializable
data class LocationRef(
    val id: String,
    val name: String
)

@Serializable
data class LocationEdge(
    val edge_id: String,
    val from_location_id: String,
    val to_location_id: String,
    val is_bidirectional: Boolean
)

@Serializable
data class EntityPlacement(
    val entity_id: String,
    val entity_name: String,
    val location_id: String,
    val location_name: String,
    val micro_position: String
)

@Serializable
data class EntityState(
    val entity_id: String,
    val canonical_name: String,
    val entity_type: String, // "character" | "npc" | "creature" | "object" | "group"
    val aliases: List<String>,
    val is_present: Boolean,
    val primary_emotion: String,
    val emotion_intensity: Int,
    val emotion_catalyst: String,
    val knowledge_boundary: List<FactRef>,
    val traits: List<FactRef>,
    val goals: List<FactRef>,
    val secrets: List<FactRef>,
    val abilities: List<FactRef>,
    val possessions: List<FactRef>
)

@Serializable
data class FactRef(
    val id: String,
    val body: String
)

@Serializable
data class RelationalState(
    val relationship_id: String,
    val source_entity_id: String,
    val source_entity_name: String,
    val target_entity_id: String,
    val target_entity_name: String,
    val relationship_type: String, // "social" | "romantic" | "familial" | "professional" | "adversarial" | "alliance" | "other"
    val dynamic_status: String
)

@Serializable
data class NarrativeState(
    val story_summary: String,
    val scene_summary: String,
    val last_turn_beat: String,
    val active_threads: List<NarrativeThread>,
    val resolved_threads: List<String>
)

@Serializable
data class NarrativeThread(
    val thread_id: String,
    val objective: String,
    val status: String, // "open" | "blocked" | "resolving" | "resolved"
    val dependencies: List<String>
)
