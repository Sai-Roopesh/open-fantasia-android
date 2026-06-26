package com.example.open_fantasia.domain.reducer

import com.example.open_fantasia.domain.model.*

object StateValidator {

    private fun validateEntityId(id: String, snapshot: DurableMemorySnapshot): Boolean {
        return snapshot.entity_state.any { it.entity_id == id }
    }

    private fun validateLocationId(id: String, snapshot: DurableMemorySnapshot): Boolean {
        if (snapshot.spatial_state.current_location?.id == id) return true
        if (snapshot.spatial_state.adjacent_locations.any { it.id == id }) return true
        if (snapshot.spatial_state.known_locations.any { it.id == id }) return true
        if (snapshot.spatial_state.entity_placements.any { it.location_id == id }) return true
        return false
    }

    private fun validateRelationshipId(id: String, snapshot: DurableMemorySnapshot): Boolean {
        return snapshot.relational_state.any { it.relationship_id == id }
    }

    private fun validateNarrativeThreadId(id: String, snapshot: DurableMemorySnapshot): Boolean {
        return snapshot.narrative_state.active_threads.any { it.thread_id == id }
    }

    private val VALID_ENTITY_TYPES = setOf("character", "npc", "creature", "object", "group")
    private val VALID_RELATIONSHIP_TYPES = setOf("social", "romantic", "familial", "professional", "adversarial", "alliance", "other")
    private val VALID_FACT_TYPES = setOf("knowledge", "trait", "goal", "secret", "ability", "possession")

    fun clampStability(value: Double): Double {
        return value.coerceIn(0.0, 1.0)
    }

    fun validateTimelineEvents(events: List<TimelineEventOutput>): List<TimelineEventOutput> {
        return events.map { event ->
            val clampedImportance = event.importance.coerceIn(1, 5)
            if (clampedImportance != event.importance) {
                event.copy(importance = clampedImportance)
            } else {
                event
            }
        }
    }

    fun validateEntityMutations(
        mutations: List<EntityMutation>,
        snapshot: DurableMemorySnapshot
    ): PartitionedMutations<EntityMutation> {
        val valid = mutableListOf<EntityMutation>()
        val invalid = mutableListOf<EntityMutation>()
        val errors = mutableListOf<String>()

        for (mut in mutations) {
            when (mut.op) {
                "add" -> {
                    val entityType = mut.entity_type
                    if (mut.canonical_name.isNullOrBlank()) {
                        invalid.add(mut)
                        errors.add("Entity add requires a non-empty canonical_name.")
                    } else if (entityType == null || !VALID_ENTITY_TYPES.contains(entityType.lowercase())) {
                        invalid.add(mut)
                        errors.add("Entity add has invalid or missing type: $entityType")
                    } else {
                        val clampedIntensity = mut.emotion_intensity?.coerceIn(0, 100)
                        val clampedMut = if (clampedIntensity != null && clampedIntensity != mut.emotion_intensity) {
                            mut.copy(emotion_intensity = clampedIntensity)
                        } else {
                            mut
                        }
                        valid.add(clampedMut)
                    }
                }
                "update" -> {
                    val id = mut.entity_id ?: ""
                    if (!validateEntityId(id, snapshot)) {
                        invalid.add(mut)
                        errors.add("Entity mutation references unknown entity_id: $id")
                    } else {
                        val clampedIntensity = mut.emotion_intensity?.coerceIn(0, 100)
                        val clampedChanges = mut.changes?.let { changes ->
                            val cIntensity = changes.emotion_intensity?.coerceIn(0, 100)
                            if (cIntensity != null && cIntensity != changes.emotion_intensity) {
                                changes.copy(emotion_intensity = cIntensity)
                            } else {
                                changes
                            }
                        }
                        var clampedMut = mut
                        if (clampedIntensity != null && clampedIntensity != mut.emotion_intensity) {
                            clampedMut = clampedMut.copy(emotion_intensity = clampedIntensity)
                        }
                        if (clampedChanges != mut.changes) {
                            clampedMut = clampedMut.copy(changes = clampedChanges)
                        }
                        valid.add(clampedMut)
                    }
                }
                "invalidate" -> {
                    val id = mut.entity_id ?: ""
                    if (!validateEntityId(id, snapshot)) {
                        invalid.add(mut)
                        errors.add("Entity mutation references unknown entity_id: $id")
                    } else {
                        valid.add(mut)
                    }
                }
                else -> valid.add(mut)
            }
        }

        return PartitionedMutations(valid, invalid, errors)
    }

    fun validateFactMutations(
        mutations: List<FactMutation>,
        snapshot: DurableMemorySnapshot,
        newEntityNames: Set<String> = emptySet()
    ): PartitionedMutations<FactMutation> {
        val valid = mutableListOf<FactMutation>()
        val invalid = mutableListOf<FactMutation>()
        val errors = mutableListOf<String>()

        for (mut in mutations) {
            when (mut.op) {
                "add" -> {
                    val id = mut.entity_id ?: ""
                    val entityValid = if (id.startsWith("NEW:")) {
                        newEntityNames.any { it.equals(id.substring(4), ignoreCase = true) }
                    } else {
                        validateEntityId(id, snapshot)
                    }
                    val factType = mut.fact_type
                    val typeValid = factType != null && VALID_FACT_TYPES.contains(factType.lowercase())

                    if (!entityValid) {
                        invalid.add(mut)
                        errors.add("Fact add references unknown entity_id: $id")
                    } else if (!typeValid) {
                        invalid.add(mut)
                        errors.add("Fact add has invalid fact_type: $factType")
                    } else {
                        valid.add(mut)
                    }
                }
                "invalidate" -> {
                    val factId = mut.fact_id ?: ""
                    if (factId.isEmpty()) {
                        invalid.add(mut)
                        errors.add("Fact invalidate requires a non-empty fact_id.")
                    } else {
                        valid.add(mut)
                    }
                }
                else -> valid.add(mut)
            }
        }

        return PartitionedMutations(valid, invalid, errors)
    }

    fun validateRelationshipMutations(
        mutations: List<RelationshipMutation>,
        snapshot: DurableMemorySnapshot,
        newEntityNames: Set<String> = emptySet()
    ): PartitionedMutations<RelationshipMutation> {
        val valid = mutableListOf<RelationshipMutation>()
        val invalid = mutableListOf<RelationshipMutation>()
        val errors = mutableListOf<String>()

        for (mut in mutations) {
            when (mut.op) {
                "add" -> {
                    val sId = mut.source_entity_id ?: ""
                    val tId = mut.target_entity_id ?: ""
                    val sourceValid = if (sId.startsWith("NEW:")) {
                        newEntityNames.any { it.equals(sId.substring(4), ignoreCase = true) }
                    } else {
                        validateEntityId(sId, snapshot)
                    }
                    val targetValid = if (tId.startsWith("NEW:")) {
                        newEntityNames.any { it.equals(tId.substring(4), ignoreCase = true) }
                    } else {
                        validateEntityId(tId, snapshot)
                    }
                    val relType = mut.relationship_type
                    val typeValid = relType != null && VALID_RELATIONSHIP_TYPES.contains(relType.lowercase())

                    if (!sourceValid || !targetValid) {
                        invalid.add(mut)
                        errors.add("Relationship add references unknown source/target_entity_id: source=$sId, target=$tId")
                    } else if (!typeValid) {
                        invalid.add(mut)
                        errors.add("Relationship add has invalid relationship_type: $relType")
                    } else {
                        valid.add(mut)
                    }
                }
                "update" -> {
                    val id = mut.relationship_id ?: ""
                    val relType = mut.changes?.relationship_type ?: mut.relationship_type
                    val typeValid = relType == null || VALID_RELATIONSHIP_TYPES.contains(relType.lowercase())
                    if (!validateRelationshipId(id, snapshot)) {
                        invalid.add(mut)
                        errors.add("Relationship mutation references unknown relationship_id: $id")
                    } else if (!typeValid) {
                        invalid.add(mut)
                        errors.add("Relationship update has invalid relationship_type: $relType")
                    } else {
                        valid.add(mut)
                    }
                }
                "invalidate" -> {
                    val id = mut.relationship_id ?: ""
                    if (!validateRelationshipId(id, snapshot)) {
                        invalid.add(mut)
                        errors.add("Relationship mutation references unknown relationship_id: $id")
                    } else {
                        valid.add(mut)
                    }
                }
                else -> valid.add(mut)
            }
        }

        return PartitionedMutations(valid, invalid, errors)
    }

    fun validateLocationEdgeMutations(
        mutations: List<LocationEdgeMutation>,
        snapshot: DurableMemorySnapshot,
        newLocationNames: Set<String> = emptySet()
    ): PartitionedMutations<LocationEdgeMutation> {
        val valid = mutableListOf<LocationEdgeMutation>()
        val invalid = mutableListOf<LocationEdgeMutation>()
        val errors = mutableListOf<String>()

        fun locationRefValid(ref: String): Boolean {
            return if (ref.startsWith("NEW:")) {
                newLocationNames.any { it.equals(ref.substring(4), ignoreCase = true) }
            } else {
                validateLocationId(ref, snapshot)
            }
        }

        for (mut in mutations) {
            when (mut.op) {
                "add" -> {
                    val fromId = mut.from_location_id ?: ""
                    val toId = mut.to_location_id ?: ""
                    val fromValid = locationRefValid(fromId)
                    val toValid = locationRefValid(toId)
                    if (!fromValid || !toValid) {
                        invalid.add(mut)
                        errors.add("Location edge add references unknown from/to_location_id: from=$fromId, to=$toId")
                    } else {
                        valid.add(mut)
                    }
                }
                "invalidate" -> {
                    val id = mut.edge_id ?: ""
                    if (id.isEmpty()) {
                        invalid.add(mut)
                        errors.add("Location edge invalidate requires a non-empty edge_id.")
                    } else {
                        valid.add(mut)
                    }
                }
                else -> valid.add(mut)
            }
        }

        return PartitionedMutations(valid, invalid, errors)
    }

    fun validateLocationMutations(
        mutations: List<LocationMutation>,
        snapshot: DurableMemorySnapshot
    ): PartitionedMutations<LocationMutation> {
        val valid = mutableListOf<LocationMutation>()
        val invalid = mutableListOf<LocationMutation>()
        val errors = mutableListOf<String>()

        for (mut in mutations) {
            when (mut.op) {
                "add" -> {
                    if (mut.canonical_name.isNullOrBlank()) {
                        invalid.add(mut)
                        errors.add("Location add requires a non-empty canonical_name.")
                    } else {
                        valid.add(mut)
                    }
                }
                "update" -> {
                    val id = mut.location_id ?: ""
                    if (!validateLocationId(id, snapshot)) {
                        invalid.add(mut)
                        errors.add("Location update references unknown location_id: $id")
                    } else {
                        valid.add(mut)
                    }
                }
                else -> {
                    invalid.add(mut)
                    errors.add("Location mutation has invalid op: ${mut.op}")
                }
            }
        }

        return PartitionedMutations(valid, invalid, errors)
    }

    fun validateSpatialMutations(
        placements: List<PlacementMutation>,
        locationMutations: List<LocationMutation>,
        snapshot: DurableMemorySnapshot,
        newEntityNames: Set<String> = emptySet()
    ): PartitionedMutations<PlacementMutation> {
        val valid = mutableListOf<PlacementMutation>()
        val invalid = mutableListOf<PlacementMutation>()
        val errors = mutableListOf<String>()

        val newLocations = locationMutations
            .filter { it.op == "add" && !it.canonical_name.isNullOrBlank() }
            .map { it.canonical_name!! }
            .toSet()

        for (mut in placements) {
            if (mut.op == "move") {
                val entityId = mut.entity_id
                val toLocId = mut.to_location_id
                
                val entityValid = if (entityId.startsWith("NEW:")) {
                    newEntityNames.any { it.equals(entityId.substring(4), ignoreCase = true) }
                } else {
                    validateEntityId(entityId, snapshot)
                }
                
                val cleanLocRef = if (toLocId.startsWith("NEW:")) toLocId.substring(4) else toLocId
                val locValid = toLocId.startsWith("NEW:") && newLocations.any { it.equals(cleanLocRef, ignoreCase = true) } 
                        || validateLocationId(toLocId, snapshot)

                if (!entityValid || !locValid) {
                    invalid.add(mut)
                    errors.add("Placement move references unknown entity_id=$entityId or location_id=$toLocId")
                } else {
                    valid.add(mut)
                }
            } else {
                valid.add(mut)
            }
        }

        return PartitionedMutations(valid, invalid, errors)
    }

    fun validateNarrativeThreadMutations(
        mutations: List<NarrativeThreadMutation>,
        snapshot: DurableMemorySnapshot
    ): PartitionedMutations<NarrativeThreadMutation> {
        val valid = mutableListOf<NarrativeThreadMutation>()
        val invalid = mutableListOf<NarrativeThreadMutation>()
        val errors = mutableListOf<String>()

        for (mut in mutations) {
            if (mut.op == "update" || mut.op == "resolve") {
                val id = mut.thread_id ?: ""
                if (!validateNarrativeThreadId(id, snapshot)) {
                    invalid.add(mut)
                    errors.add("Narrative thread mutation references unknown thread_id: $id")
                } else {
                    valid.add(mut)
                }
            } else {
                valid.add(mut) // add op is always valid
            }
        }

        return PartitionedMutations(valid, invalid, errors)
    }

    fun validateAllMutations(
        extraction: ExtractionOutput,
        snapshot: DurableMemorySnapshot
    ): FullValidationResult {
        val newEntityNames = extraction.entity_mutations
            .filter { it.op == "add" && !it.canonical_name.isNullOrBlank() }
            .map { it.canonical_name!! }
            .toSet()

        val newLocationNames = extraction.location_mutations
            .filter { it.op == "add" && !it.canonical_name.isNullOrBlank() }
            .map { it.canonical_name!! }
            .toSet()

        val entityPart = validateEntityMutations(extraction.entity_mutations, snapshot)
        val factPart = validateFactMutations(extraction.fact_mutations, snapshot, newEntityNames)
        val relPart = validateRelationshipMutations(extraction.relationship_mutations, snapshot, newEntityNames)
        val edgePart = validateLocationEdgeMutations(extraction.location_edge_mutations, snapshot, newLocationNames)
        val locationPart = validateLocationMutations(extraction.location_mutations, snapshot)
        val spatialPart = validateSpatialMutations(extraction.placement_mutations, extraction.location_mutations, snapshot, newEntityNames)
        val threadPart = validateNarrativeThreadMutations(extraction.narrative_thread_mutations, snapshot)

        val totalErrors = entityPart.errors.size + factPart.errors.size + relPart.errors.size +
                edgePart.errors.size + locationPart.errors.size + spatialPart.errors.size + threadPart.errors.size

        val totalOps = extraction.entity_mutations.size + extraction.fact_mutations.size +
                extraction.relationship_mutations.size + extraction.location_mutations.size +
                extraction.location_edge_mutations.size + extraction.placement_mutations.size +
                extraction.narrative_thread_mutations.size

        val shouldReflect = if (totalOps > 0) (totalErrors.toDouble() / totalOps.toDouble()) > 0.5 else false

        return FullValidationResult(
            entityErrors = entityPart.errors,
            factErrors = factPart.errors,
            relationshipErrors = relPart.errors,
            locationEdgeErrors = edgePart.errors,
            locationErrors = locationPart.errors,
            spatialErrors = spatialPart.errors,
            narrativeThreadErrors = threadPart.errors,
            totalErrors = totalErrors,
            totalOps = totalOps,
            shouldReflect = shouldReflect
        )
    }
}

data class PartitionedMutations<T>(
    val valid: List<T>,
    val invalid: List<T>,
    val errors: List<String>
)

data class FullValidationResult(
    val entityErrors: List<String>,
    val factErrors: List<String>,
    val relationshipErrors: List<String>,
    val locationEdgeErrors: List<String>,
    val locationErrors: List<String> = emptyList(),
    val spatialErrors: List<String>,
    val narrativeThreadErrors: List<String>,
    val totalErrors: Int,
    val totalOps: Int,
    val shouldReflect: Boolean
)
