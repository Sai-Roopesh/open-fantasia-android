package com.example.open_fantasia.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class ExtractionOutput(
    val transition_type: String = "continuation", // "continuation" | "scene_transition" | "time_skip"
    val story_summary: String = "",
    val scene_summary: String = "",
    val last_turn_beat: String = "",
    val narrative_timestamp: String = "",
    val entity_mutations: List<EntityMutation> = emptyList(),
    val fact_mutations: List<FactMutation> = emptyList(),
    val relationship_mutations: List<RelationshipMutation> = emptyList(),
    val location_mutations: List<LocationMutation> = emptyList(),
    val location_edge_mutations: List<LocationEdgeMutation> = emptyList(),
    val placement_mutations: List<PlacementMutation> = emptyList(),
    val narrative_thread_mutations: List<NarrativeThreadMutation> = emptyList(),
    val timeline_events: List<TimelineEventOutput> = emptyList()
)

@Serializable
data class EntityMutation(
    val op: String = "", // "add" | "update" | "invalidate"
    val entity_id: String? = null,
    val canonical_name: String? = null,
    val entity_type: String? = null,
    val aliases: List<String>? = null,
    val is_present: Boolean? = null,
    val primary_emotion: String? = null,
    val emotion_intensity: Int? = null,
    val emotion_catalyst: String? = null,
    val changes: EntityChanges? = null
)

@Serializable
data class EntityChanges(
    val is_present: Boolean? = null,
    val primary_emotion: String? = null,
    val emotion_intensity: Int? = null,
    val emotion_catalyst: String? = null,
    val aliases: List<String>? = null
)

@Serializable
data class FactMutation(
    val op: String = "", // "add" | "invalidate"
    val entity_id: String? = null, // Can be "NEW:Name"
    val fact_type: String? = null, // "knowledge" | "trait" | "goal" | "secret" | "ability" | "possession"
    val body: String? = null,
    val fact_id: String? = null
)

@Serializable
data class RelationshipMutation(
    val op: String = "", // "add" | "update" | "invalidate"
    val relationship_id: String? = null,
    val source_entity_id: String? = null, // Can be "NEW:Name"
    val target_entity_id: String? = null, // Can be "NEW:Name"
    val relationship_type: String? = null,
    val dynamic_status: String? = null,
    val changes: RelationshipChanges? = null
)

@Serializable
data class RelationshipChanges(
    val dynamic_status: String? = null,
    val relationship_type: String? = null
)

@Serializable
data class LocationMutation(
    val op: String = "", // "add" | "update"
    val location_id: String? = null,
    val canonical_name: String? = null,
    val description: String? = null,
    val environmental_modifiers: List<String>? = null,
    val changes: LocationChanges? = null
)

@Serializable
data class LocationChanges(
    val description: String? = null,
    val environmental_modifiers: List<String>? = null
)

@Serializable
data class LocationEdgeMutation(
    val op: String = "", // "add" | "invalidate"
    val edge_id: String? = null,
    val from_location_id: String? = null, // Can be "NEW:Name"
    val to_location_id: String? = null, // Can be "NEW:Name"
    val is_bidirectional: Boolean? = null
)

@Serializable
data class PlacementMutation(
    val op: String = "", // "move"
    val entity_id: String = "", // Can be "NEW:Name"
    val to_location_id: String = "", // Can be "NEW:Name"
    val micro_position: String? = null
)

@Serializable
data class NarrativeThreadMutation(
    val op: String = "", // "add" | "update" | "resolve"
    val thread_id: String? = null,
    val objective: String? = null,
    val changes: NarrativeThreadChanges? = null
)

@Serializable
data class NarrativeThreadChanges(
    val status: String? = null, // "open" | "blocked" | "resolving" | "resolved"
    val objective: String? = null
)

@Serializable
data class TimelineEventOutput(
    val title: String = "",
    val detail: String = "",
    val importance: Int = 1, // 1-5
    val event_type: String = "beat",
    val affected_entity_ids: List<String> = emptyList(),
    val affected_relationship_ids: List<String> = emptyList()
)
