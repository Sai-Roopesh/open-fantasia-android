package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.StateValidator
import org.junit.Assert.*
import org.junit.Test

class StateValidatorTest {

    private fun makeSnapshotWithEntitiesAndLocations(): DurableMemorySnapshot {
        val aId = "uuid-a"
        val locId = "uuid-loc"
        val threadId = "thread-1"
        return DurableMemorySnapshot(
            metadata = SnapshotMetadata("turn-0", "", "continuation", 1),
            spatial_state = SpatialState(
                current_location = null,
                adjacent_locations = emptyList(),
                known_locations = listOf(LocationState(locId, "Clinic", "Desc", emptyList())),
                edges = emptyList(),
                entity_placements = emptyList()
            ),
            entity_state = listOf(
                EntityState(aId, "A", "character", emptyList(), true, "neutral", 5, "", emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList())
            ),
            relational_state = emptyList(),
            narrative_state = NarrativeState(
                story_summary = "",
                scene_summary = "",
                last_turn_beat = "",
                active_threads = listOf(
                    NarrativeThread(threadId, "Diagnose", "open", emptyList())
                ),
                resolved_threads = emptyList()
            )
        )
    }

    @Test
    fun testValidateEntityIdUnknown() {
        val snapshot = makeSnapshotWithEntitiesAndLocations()
        val mutations = listOf(
            EntityMutation(op = "update", entity_id = "unknown-id", changes = EntityChanges(is_present = false)),
            EntityMutation(op = "add", canonical_name = "Newbie", entity_type = "npc")
        )

        val result = StateValidator.validateEntityMutations(mutations, snapshot)

        assertEquals(1, result.valid.size)
        assertEquals("add", result.valid.first().op)
        
        assertEquals(1, result.invalid.size)
        assertEquals("update", result.invalid.first().op)
        assertEquals(1, result.errors.size)
        assertTrue(result.errors.first().contains("unknown-id"))
    }

    @Test
    fun testValidateFactAllowsNewPrefix() {
        val snapshot = makeSnapshotWithEntitiesAndLocations()
        val mutations = listOf(
            FactMutation(op = "add", entity_id = "NEW:Newbie", fact_type = "goal", body = "Diagnose"),
            FactMutation(op = "add", entity_id = "unknown-id", fact_type = "trait", body = "Sick")
        )

        val result = StateValidator.validateFactMutations(mutations, snapshot, setOf("Newbie"))

        assertEquals(1, result.valid.size)
        assertEquals("NEW:Newbie", result.valid.first().entity_id)

        assertEquals(1, result.invalid.size)
        assertEquals("unknown-id", result.invalid.first().entity_id)
        assertEquals(1, result.errors.size)
    }

    @Test
    fun testValidateRelationshipAllowsNewPrefix() {
        val snapshot = makeSnapshotWithEntitiesAndLocations()
        val mutations = listOf(
            RelationshipMutation(op = "add", source_entity_id = "uuid-a", target_entity_id = "NEW:Newbie", relationship_type = "social"),
            RelationshipMutation(op = "add", source_entity_id = "unknown-id", target_entity_id = "NEW:Newbie", relationship_type = "social")
        )

        val result = StateValidator.validateRelationshipMutations(mutations, snapshot, setOf("Newbie"))

        assertEquals(1, result.valid.size)
        assertEquals("uuid-a", result.valid.first().source_entity_id)

        assertEquals(1, result.invalid.size)
        assertEquals("unknown-id", result.invalid.first().source_entity_id)
    }

    @Test
    fun testValidateSpatialAllowsNewLocations() {
        val snapshot = makeSnapshotWithEntitiesAndLocations()
        
        // Placement move references new location "AIIMS"
        val placements = listOf(
            PlacementMutation(op = "move", entity_id = "uuid-a", to_location_id = "NEW:AIIMS", micro_position = ""),
            PlacementMutation(op = "move", entity_id = "uuid-a", to_location_id = "NEW:UnknownPlace", micro_position = "")
        )

        val locationMutations = listOf(
            LocationMutation(op = "add", canonical_name = "AIIMS", description = "New Clinic")
        )

        val result = StateValidator.validateSpatialMutations(placements, locationMutations, snapshot)

        assertEquals(1, result.valid.size)
        assertEquals("NEW:AIIMS", result.valid.first().to_location_id)

        assertEquals(1, result.invalid.size)
        assertEquals("NEW:UnknownPlace", result.invalid.first().to_location_id)
    }

    @Test
    fun testValidateNarrativeThreads() {
        val snapshot = makeSnapshotWithEntitiesAndLocations()
        val mutations = listOf(
            NarrativeThreadMutation(op = "resolve", thread_id = "thread-1"),
            NarrativeThreadMutation(op = "update", thread_id = "unknown-thread", changes = NarrativeThreadChanges(status = "blocked"))
        )

        val result = StateValidator.validateNarrativeThreadMutations(mutations, snapshot)

        assertEquals(1, result.valid.size)
        assertEquals("thread-1", result.valid.first().thread_id)

        assertEquals(1, result.invalid.size)
        assertEquals("unknown-thread", result.invalid.first().thread_id)
    }

    @Test
    fun testValidateAllMutationsThreshold() {
        val snapshot = makeSnapshotWithEntitiesAndLocations()
        
        // Total ops = 3, errors = 2. Error rate = 2/3 = 66% > 50%. shouldReflect = true.
        val extraction = ExtractionOutput(
            transition_type = "continuation",
            story_summary = "",
            scene_summary = "",
            last_turn_beat = "",
            narrative_timestamp = "",
            entity_mutations = listOf(
                EntityMutation(op = "update", entity_id = "unknown-id-1", changes = EntityChanges(is_present = false)),
                EntityMutation(op = "update", entity_id = "unknown-id-2", changes = EntityChanges(is_present = false)),
                EntityMutation(op = "update", entity_id = "uuid-a", changes = EntityChanges(is_present = true))
            )
        )

        val result = StateValidator.validateAllMutations(extraction, snapshot)

        assertEquals(2, result.totalErrors)
        assertEquals(3, result.totalOps)
        assertTrue(result.shouldReflect)
    }

    @Test
    fun testClampsEmotionIntensity_toValidRange() {
        val snapshot = makeSnapshotWithEntitiesAndLocations()
        // emotion_intensity is a 0-100 scale (matches the extraction prompt): clamp to [0, 100].
        val addMut = EntityMutation(op = "add", canonical_name = "New", entity_type = "npc", emotion_intensity = 150)
        val updateMut = EntityMutation(
            op = "update",
            entity_id = "uuid-a",
            changes = EntityChanges(emotion_intensity = -5)
        )

        val addResult = StateValidator.validateEntityMutations(listOf(addMut), snapshot)
        assertEquals(1, addResult.valid.size)
        assertEquals(100, addResult.valid.first().emotion_intensity)

        val updateResult = StateValidator.validateEntityMutations(listOf(updateMut), snapshot)
        assertEquals(1, updateResult.valid.size)
        assertEquals(0, updateResult.valid.first().changes?.emotion_intensity)
    }

    @Test
    fun testClampsImportance_toValidRange() {
        val events = listOf(
            TimelineEventOutput(title = "Title", detail = "Detail", importance = 10, event_type = "beat"),
            TimelineEventOutput(title = "Title2", detail = "Detail2", importance = -1, event_type = "beat")
        )
        val validated = StateValidator.validateTimelineEvents(events)
        assertEquals(5, validated[0].importance)
        assertEquals(1, validated[1].importance)
    }

    @Test
    fun testClampsStability_toValidRange() {
        assertEquals(1.0, StateValidator.clampStability(1.5), 0.0)
        assertEquals(0.0, StateValidator.clampStability(-0.5), 0.0)
        assertEquals(0.5, StateValidator.clampStability(0.5), 0.0)
    }

    @Test
    fun testRejectsInvalidEntityType() {
        val snapshot = makeSnapshotWithEntitiesAndLocations()
        val mut = EntityMutation(op = "add", canonical_name = "New", entity_type = "invalid-type")
        val result = StateValidator.validateEntityMutations(listOf(mut), snapshot)
        assertEquals(0, result.valid.size)
        assertEquals(1, result.invalid.size)
        assertEquals(1, result.errors.size)
        assertTrue(result.errors.first().contains("invalid-type"))
    }

    @Test
    fun testRejectsInvalidRelationshipType() {
        val snapshot = makeSnapshotWithEntitiesAndLocations()
        val mut = RelationshipMutation(op = "add", source_entity_id = "uuid-a", target_entity_id = "uuid-a", relationship_type = "invalid-type")
        val result = StateValidator.validateRelationshipMutations(listOf(mut), snapshot)
        assertEquals(0, result.valid.size)
        assertEquals(1, result.invalid.size)
        assertEquals(1, result.errors.size)
        assertTrue(result.errors.first().contains("invalid-type"))
    }

    @Test
    fun testFlagsDanglingEntityReferences() {
        val snapshot = makeSnapshotWithEntitiesAndLocations()
        val mut = FactMutation(op = "add", entity_id = "NEW:Stranger", fact_type = "goal", body = "Diagnose")
        val result = StateValidator.validateFactMutations(listOf(mut), snapshot, setOf("Newbie"))
        assertEquals(0, result.valid.size)
        assertEquals(1, result.invalid.size)
        assertEquals(1, result.errors.size)
        assertTrue(result.errors.first().contains("NEW:Stranger"))

        val relMut = RelationshipMutation(op = "add", source_entity_id = "uuid-a", target_entity_id = "NEW:Stranger", relationship_type = "social")
        val relResult = StateValidator.validateRelationshipMutations(listOf(relMut), snapshot, setOf("Newbie"))
        assertEquals(0, relResult.valid.size)
        assertEquals(1, relResult.invalid.size)
    }
}
