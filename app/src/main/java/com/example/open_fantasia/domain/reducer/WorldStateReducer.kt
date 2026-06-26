package com.example.open_fantasia.domain.reducer

import com.example.open_fantasia.domain.model.*
import java.util.UUID

object WorldStateReducer {

    private fun newId(): String = UUID.randomUUID().toString()

    private fun newRefKey(name: String): String {
        val withPrefix = if (name.startsWith("NEW:")) name else "NEW:$name"
        return withPrefix.uppercase()
    }

    private fun resolveRef(value: String, map: Map<String, String>): String {
        return map[newRefKey(value)] ?: value
    }

    private fun emptyEntity(id: String, name: String, type: String): EntityState {
        return EntityState(
            entity_id = id,
            canonical_name = name,
            entity_type = type,
            aliases = emptyList(),
            is_present = true,
            primary_emotion = "neutral",
            emotion_intensity = 5,
            emotion_catalyst = "",
            knowledge_boundary = emptyList(),
            traits = emptyList(),
            goals = emptyList(),
            secrets = emptyList(),
            abilities = emptyList(),
            possessions = emptyList()
        )
    }

    fun applyExtractionToSnapshot(
        previous: DurableMemorySnapshot,
        extraction: ExtractionOutput,
        turnId: String,
        idGenerator: () -> String = { newId() }
    ): ReducerResult {
        // Purity check: we will create a deep copy using structure copying or modifications.
        // In Kotlin, copy() on data classes is shallow for list references, so we must build lists explicitly.
        
        val newEntityIds = mutableMapOf<String, String>()
        val newLocationIds = mutableMapOf<String, String>()

        // 1. Entities
        val entityState = previous.entity_state.map { it.copy() }.toMutableList()
        val relationshipState = previous.relational_state.map { it.copy() }.toMutableList()
        var knownLocations = previous.spatial_state.known_locations.map { it.copy() }.toMutableList()
        var locationEdges = previous.spatial_state.edges.map { it.copy() }.toMutableList()
        var entityPlacements = previous.spatial_state.entity_placements.map { it.copy() }.toMutableList()

        for (mut in extraction.entity_mutations) {
            when (mut.op) {
                "add" -> {
                    val name = mut.canonical_name ?: ""
                    val type = mut.entity_type ?: "npc"
                    val existing = entityState.find { it.canonical_name.equals(name, ignoreCase = true) }
                    if (existing != null) {
                        val updated = existing.copy(
                            is_present = mut.is_present ?: existing.is_present,
                            primary_emotion = mut.primary_emotion ?: existing.primary_emotion,
                            emotion_intensity = mut.emotion_intensity ?: existing.emotion_intensity,
                            emotion_catalyst = mut.emotion_catalyst ?: existing.emotion_catalyst,
                            aliases = mut.aliases ?: existing.aliases
                        )
                        val idx = entityState.indexOf(existing)
                        entityState[idx] = updated
                        newEntityIds[newRefKey(name)] = existing.entity_id
                    } else {
                        val generatedId = idGenerator()
                        val newEnt = emptyEntity(generatedId, name, type).copy(
                            is_present = mut.is_present ?: true,
                            primary_emotion = mut.primary_emotion ?: "neutral",
                            emotion_intensity = mut.emotion_intensity ?: 5,
                            emotion_catalyst = mut.emotion_catalyst ?: "",
                            aliases = mut.aliases ?: emptyList()
                        )
                        entityState.add(newEnt)
                        newEntityIds[newRefKey(name)] = generatedId
                    }
                }
                "update" -> {
                    val id = mut.entity_id ?: ""
                    val existing = entityState.find { it.entity_id == id }
                    if (existing != null && mut.changes != null) {
                        val c = mut.changes
                        val updated = existing.copy(
                            is_present = c.is_present ?: existing.is_present,
                            primary_emotion = c.primary_emotion ?: existing.primary_emotion,
                            emotion_intensity = c.emotion_intensity ?: existing.emotion_intensity,
                            emotion_catalyst = c.emotion_catalyst ?: existing.emotion_catalyst,
                            aliases = c.aliases ?: existing.aliases
                        )
                        val idx = entityState.indexOf(existing)
                        entityState[idx] = updated
                    }
                }
                "invalidate" -> {
                    val id = mut.entity_id ?: ""
                    entityState.removeIf { it.entity_id == id }
                    // Cascade deletes:
                    relationshipState.removeIf { it.source_entity_id == id || it.target_entity_id == id }
                    entityPlacements.removeIf { it.entity_id == id }
                }
            }
        }

        // 2. Facts
        for (mut in extraction.fact_mutations) {
            when (mut.op) {
                "add" -> {
                    val rawEntityId = mut.entity_id ?: ""
                    val entityId = resolveRef(rawEntityId, newEntityIds)
                    val existing = entityState.find { it.entity_id == entityId }
                    if (existing != null) {
                        val fact = FactRef(id = idGenerator(), body = mut.body ?: "")
                        val updated = when (mut.fact_type?.lowercase()) {
                            "knowledge" -> existing.copy(knowledge_boundary = existing.knowledge_boundary + fact)
                            "trait" -> existing.copy(traits = existing.traits + fact)
                            "goal" -> existing.copy(goals = existing.goals + fact)
                            "secret" -> existing.copy(secrets = existing.secrets + fact)
                            "ability" -> existing.copy(abilities = existing.abilities + fact)
                            "possession" -> existing.copy(possessions = existing.possessions + fact)
                            else -> existing
                        }
                        val idx = entityState.indexOf(existing)
                        entityState[idx] = updated
                    }
                }
                "invalidate" -> {
                    val factId = mut.fact_id ?: ""
                    for (i in entityState.indices) {
                        val e = entityState[i]
                        entityState[i] = e.copy(
                            knowledge_boundary = e.knowledge_boundary.filter { it.id != factId },
                            traits = e.traits.filter { it.id != factId },
                            goals = e.goals.filter { it.id != factId },
                            secrets = e.secrets.filter { it.id != factId },
                            abilities = e.abilities.filter { it.id != factId },
                            possessions = e.possessions.filter { it.id != factId }
                        )
                    }
                }
            }
        }

        // 3. Relationships
        val nameMap = entityState.associate { it.entity_id to it.canonical_name }
        for (mut in extraction.relationship_mutations) {
            when (mut.op) {
                "add" -> {
                    val sId = resolveRef(mut.source_entity_id ?: "", newEntityIds)
                    val tId = resolveRef(mut.target_entity_id ?: "", newEntityIds)
                    val rel = RelationalState(
                        relationship_id = idGenerator(),
                        source_entity_id = sId,
                        source_entity_name = nameMap[sId] ?: mut.source_entity_id ?: "",
                        target_entity_id = tId,
                        target_entity_name = nameMap[tId] ?: mut.target_entity_id ?: "",
                        relationship_type = mut.relationship_type ?: "social",
                        dynamic_status = mut.dynamic_status ?: ""
                    )
                    relationshipState.add(rel)
                }
                "update" -> {
                    val relId = mut.relationship_id ?: ""
                    val existing = relationshipState.find { it.relationship_id == relId }
                    if (existing != null && mut.changes != null) {
                        val c = mut.changes
                        val updated = existing.copy(
                            dynamic_status = c.dynamic_status ?: existing.dynamic_status,
                            relationship_type = c.relationship_type ?: existing.relationship_type
                        )
                        val idx = relationshipState.indexOf(existing)
                        relationshipState[idx] = updated
                    }
                }
                "invalidate" -> {
                    val relId = mut.relationship_id ?: ""
                    relationshipState.removeIf { it.relationship_id == relId }
                }
            }
        }

        // 4. Locations
        for (mut in extraction.location_mutations) {
            when (mut.op) {
                "add" -> {
                    val name = mut.canonical_name ?: ""
                    val desc = mut.description ?: ""
                    val mods = mut.environmental_modifiers ?: emptyList()
                    val existing = knownLocations.find { it.name.equals(name, ignoreCase = true) }
                    if (existing != null) {
                        val updated = existing.copy(
                            description = if (desc.isNotEmpty()) desc else existing.description,
                            environmental_modifiers = if (mods.isNotEmpty()) mods else existing.environmental_modifiers
                        )
                        val idx = knownLocations.indexOf(existing)
                        knownLocations[idx] = updated
                        newLocationIds[newRefKey(name)] = existing.id
                    } else {
                        val generatedId = idGenerator()
                        val newLoc = LocationState(id = generatedId, name = name, description = desc, environmental_modifiers = mods)
                        knownLocations.add(newLoc)
                        newLocationIds[newRefKey(name)] = generatedId
                    }
                }
                "update" -> {
                    val id = mut.location_id ?: ""
                    val existing = knownLocations.find { it.id == id }
                    if (existing != null && mut.changes != null) {
                        val c = mut.changes
                        val updated = existing.copy(
                            description = c.description ?: existing.description,
                            environmental_modifiers = c.environmental_modifiers ?: existing.environmental_modifiers
                        )
                        val idx = knownLocations.indexOf(existing)
                        knownLocations[idx] = updated
                    }
                }
            }
        }

        // 5. Edges
        for (mut in extraction.location_edge_mutations) {
            when (mut.op) {
                "add" -> {
                    val fromId = resolveRef(mut.from_location_id ?: "", newLocationIds)
                    val toId = resolveRef(mut.to_location_id ?: "", newLocationIds)
                    val edge = LocationEdge(
                        edge_id = idGenerator(),
                        from_location_id = fromId,
                        to_location_id = toId,
                        is_bidirectional = mut.is_bidirectional ?: true
                    )
                    locationEdges.add(edge)
                }
                "invalidate" -> {
                    val edgeId = mut.edge_id ?: ""
                    locationEdges.removeIf { it.edge_id == edgeId }
                }
            }
        }

        // 6. Placements
        val locNameMap = knownLocations.associate { it.id to it.name }
        for (mut in extraction.placement_mutations) {
            if (mut.op == "move") {
                val entityId = resolveRef(mut.entity_id, newEntityIds)
                val toLocId = resolveRef(mut.to_location_id, newLocationIds)
                
                // Remove existing placements for this entity
                entityPlacements.removeIf { it.entity_id == entityId }
                
                val placement = EntityPlacement(
                    entity_id = entityId,
                    entity_name = nameMap[entityId] ?: mut.entity_id,
                    location_id = toLocId,
                    location_name = locNameMap[toLocId] ?: mut.to_location_id,
                    micro_position = mut.micro_position ?: ""
                )
                entityPlacements.add(placement)
            }
        }

        // 7. Narrative Threads
        val activeThreads = previous.narrative_state.active_threads.map { it.copy() }.toMutableList()
        val resolvedThreads = previous.narrative_state.resolved_threads.toMutableList()

        for (mut in extraction.narrative_thread_mutations) {
            when (mut.op) {
                "add" -> {
                    val thread = NarrativeThread(
                        thread_id = idGenerator(),
                        objective = mut.objective ?: "",
                        status = "open",
                        dependencies = emptyList()
                    )
                    activeThreads.add(thread)
                }
                "update" -> {
                    val id = mut.thread_id ?: ""
                    val existing = activeThreads.find { it.thread_id == id }
                    if (existing != null && mut.changes != null) {
                        val c = mut.changes
                        val updated = existing.copy(
                            objective = c.objective ?: existing.objective,
                            status = c.status ?: existing.status
                        )
                        val idx = activeThreads.indexOf(existing)
                        activeThreads[idx] = updated
                    }
                }
                "resolve" -> {
                    val id = mut.thread_id ?: ""
                    val existing = activeThreads.find { it.thread_id == id }
                    if (existing != null) {
                        activeThreads.remove(existing)
                        if (!resolvedThreads.contains(existing.objective)) {
                            resolvedThreads.add(existing.objective)
                        }
                    }
                }
            }
        }

        // Post-pass cleanup of threads with resolved status
        val resolvedFromUpdate = activeThreads.filter { it.status == "resolved" }
        for (t in resolvedFromUpdate) {
            activeThreads.remove(t)
            if (!resolvedThreads.contains(t.objective)) {
                resolvedThreads.add(t.objective)
            }
        }

        // 8. Narrative summaries + metadata
        val metadata = SnapshotMetadata(
            current_turn_id = turnId,
            narrative_timestamp = extraction.narrative_timestamp.ifEmpty { previous.metadata.narrative_timestamp },
            transition_type = extraction.transition_type,
            version = previous.metadata.version + 1
        )

        val narrativeState = NarrativeState(
            story_summary = extraction.story_summary.ifEmpty { previous.narrative_state.story_summary },
            scene_summary = extraction.scene_summary.ifEmpty { previous.narrative_state.scene_summary },
            last_turn_beat = extraction.last_turn_beat.ifEmpty { previous.narrative_state.last_turn_beat },
            active_threads = activeThreads,
            resolved_threads = resolvedThreads
        )

        // Build temporary snapshot for spatial recomputation
        val spatialState = SpatialState(
            current_location = null,
            adjacent_locations = emptyList(),
            known_locations = knownLocations,
            edges = locationEdges,
            entity_placements = entityPlacements
        )

        val tempSnapshot = DurableMemorySnapshot(
            metadata = metadata,
            spatial_state = spatialState,
            entity_state = entityState,
            relational_state = relationshipState,
            narrative_state = narrativeState
        )

        // 9. Recompute spatial
        val finalSpatial = recomputeSpatialDerived(tempSnapshot)
        
        val finalSnapshot = tempSnapshot.copy(spatial_state = finalSpatial)

        return ReducerResult(finalSnapshot, newEntityIds, newLocationIds)
    }

    private fun recomputeSpatialDerived(snapshot: DurableMemorySnapshot): SpatialState {
        val spatial = snapshot.spatial_state
        
        // Find POV entity: first character type
        val povChar = snapshot.entity_state.find { it.entity_type == "character" } ?: return spatial
        
        // Find placement of POV entity
        val placement = spatial.entity_placements.find { it.entity_id == povChar.entity_id } ?: return spatial
        
        // Current location state lookup
        val currentLocation = spatial.known_locations.find { it.id == placement.location_id } ?: return spatial

        // Compute adjacent locations
        val adjacent = mutableListOf<LocationRef>()
        for (edge in spatial.edges) {
            if (edge.from_location_id == currentLocation.id) {
                val loc = spatial.known_locations.find { it.id == edge.to_location_id }
                if (loc != null) adjacent.add(LocationRef(loc.id, loc.name))
            } else if (edge.is_bidirectional && edge.to_location_id == currentLocation.id) {
                val loc = spatial.known_locations.find { it.id == edge.from_location_id }
                if (loc != null) adjacent.add(LocationRef(loc.id, loc.name))
            }
        }

        return spatial.copy(
            current_location = currentLocation,
            adjacent_locations = adjacent.distinctBy { it.id }
        )
    }
}

data class ReducerResult(
    val snapshot: DurableMemorySnapshot,
    val newEntityIds: Map<String, String>,
    val newLocationIds: Map<String, String>
)
