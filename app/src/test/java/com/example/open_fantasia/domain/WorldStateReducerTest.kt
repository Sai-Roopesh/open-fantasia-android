package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.WorldStateReducer
import org.junit.Assert.*
import org.junit.Test

class WorldStateReducerTest {

    private fun makeEmptySnapshot(turnId: String = "turn-0"): DurableMemorySnapshot {
        return DurableMemorySnapshot(
            metadata = SnapshotMetadata(
                current_turn_id = turnId,
                narrative_timestamp = "",
                transition_type = "continuation",
                version = 1
            ),
            spatial_state = SpatialState(
                current_location = null,
                adjacent_locations = emptyList(),
                known_locations = emptyList(),
                edges = emptyList(),
                entity_placements = emptyList()
            ),
            entity_state = emptyList(),
            relational_state = emptyList(),
            narrative_state = NarrativeState(
                story_summary = "",
                scene_summary = "",
                last_turn_beat = "",
                active_threads = emptyList(),
                resolved_threads = emptyList()
            )
        )
    }

    @Test
    fun testAddEntityAndResolveRefs() {
        val initial = makeEmptySnapshot()

        val extraction = ExtractionOutput(
            transition_type = "continuation",
            story_summary = "Ananya visits the clinic.",
            scene_summary = "At AIIMS.",
            last_turn_beat = "Ananya walks inside.",
            narrative_timestamp = "12:00 PM",
            entity_mutations = listOf(
                EntityMutation(op = "add", canonical_name = "Ananya", entity_type = "character")
            ),
            location_mutations = listOf(
                LocationMutation(op = "add", canonical_name = "AIIMS", description = "AIIMS Medical Clinic")
            ),
            fact_mutations = listOf(
                FactMutation(op = "add", entity_id = "NEW:Ananya", fact_type = "goal", body = "Get diagnosed.")
            ),
            placement_mutations = listOf(
                PlacementMutation(op = "move", entity_id = "NEW:Ananya", to_location_id = "NEW:AIIMS", micro_position = "lobby")
            )
        )

        var idCounter = 0
        val idGen: () -> String = { "uuid-${idCounter++}" }

        // Execution
        val result = WorldStateReducer.applyExtractionToSnapshot(initial, extraction, "turn-1", idGen)

        // Assertions
        val snapshot = result.snapshot
        
        assertEquals(2, snapshot.metadata.version)
        assertEquals("turn-1", snapshot.metadata.current_turn_id)
        
        // Entity added
        assertEquals(1, snapshot.entity_state.size)
        val ananya = snapshot.entity_state.first()
        assertEquals("Ananya", ananya.canonical_name)
        assertEquals("character", ananya.entity_type)
        assertEquals("uuid-0", ananya.entity_id) // First generated id is entity ID

        // Location added
        assertEquals(1, snapshot.spatial_state.known_locations.size)
        val clinic = snapshot.spatial_state.known_locations.first()
        assertEquals("AIIMS", clinic.name)
        assertEquals("uuid-2", clinic.id) // Location is processed after entity and fact

        // Fact added and resolved to Ananya
        assertEquals(1, ananya.goals.size)
        assertEquals("Get diagnosed.", ananya.goals.first().body)
        assertEquals("uuid-1", ananya.goals.first().id) // Fact is processed after entity

        // Placement added and resolved
        assertEquals(1, snapshot.spatial_state.entity_placements.size)
        val placement = snapshot.spatial_state.entity_placements.first()
        assertEquals("uuid-0", placement.entity_id)
        assertEquals("uuid-2", placement.location_id)
        assertEquals("lobby", placement.micro_position)

        // Spatial derived (POV current location)
        assertNotNull(snapshot.spatial_state.current_location)
        assertEquals("AIIMS", snapshot.spatial_state.current_location?.name)
    }

    @Test
    fun testPurity() {
        val initial = makeEmptySnapshot()
        val extraction = ExtractionOutput(
            transition_type = "continuation",
            story_summary = "Ananya visits the clinic.",
            scene_summary = "At AIIMS.",
            last_turn_beat = "Ananya walks inside.",
            narrative_timestamp = "12:00 PM",
            entity_mutations = listOf(
                EntityMutation(op = "add", canonical_name = "Ananya", entity_type = "character")
            )
        )

        WorldStateReducer.applyExtractionToSnapshot(initial, extraction, "turn-1")

        // Assert that the initial snapshot was not modified
        assertEquals(1, initial.metadata.version)
        assertEquals(0, initial.entity_state.size)
    }

    @Test
    fun testCascadeInvalidation() {
        // Setup initial snapshot with A, B, relationship A->B and placement A, B
        val aId = "uuid-a"
        val bId = "uuid-b"
        val locId = "uuid-loc"
        
        val initial = DurableMemorySnapshot(
            metadata = SnapshotMetadata("turn-0", "", "continuation", 1),
            spatial_state = SpatialState(
                current_location = null,
                adjacent_locations = emptyList(),
                known_locations = listOf(LocationState(locId, "Clinic", "Desc", emptyList())),
                edges = emptyList(),
                entity_placements = listOf(
                    EntityPlacement(aId, "A", locId, "Clinic", ""),
                    EntityPlacement(bId, "B", locId, "Clinic", "")
                )
            ),
            entity_state = listOf(
                EntityState(aId, "A", "character", emptyList(), true, "neutral", 5, "", emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList()),
                EntityState(bId, "B", "npc", emptyList(), true, "neutral", 5, "", emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList())
            ),
            relational_state = listOf(
                RelationalState("rel-1", aId, "A", bId, "B", "social", "acquaintance")
            ),
            narrative_state = NarrativeState("", "", "", emptyList(), emptyList())
        )

        // Invalidate B
        val extraction = ExtractionOutput(
            transition_type = "continuation",
            story_summary = "",
            scene_summary = "",
            last_turn_beat = "",
            narrative_timestamp = "",
            entity_mutations = listOf(
                EntityMutation(op = "invalidate", entity_id = bId)
            )
        )

        val result = WorldStateReducer.applyExtractionToSnapshot(initial, extraction, "turn-1")
        val snapshot = result.snapshot

        // B is removed
        assertEquals(1, snapshot.entity_state.size)
        assertEquals(aId, snapshot.entity_state.first().entity_id)

        // Relationship is removed cascaded
        assertEquals(0, snapshot.relational_state.size)

        // Placement of B is removed cascaded
        assertEquals(1, snapshot.spatial_state.entity_placements.size)
        assertEquals(aId, snapshot.spatial_state.entity_placements.first().entity_id)
    }

    @Test
    fun testResolveNarrativeThreads() {
        val initial = DurableMemorySnapshot(
            metadata = SnapshotMetadata("turn-0", "", "continuation", 1),
            spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
            entity_state = emptyList(),
            relational_state = emptyList(),
            narrative_state = NarrativeState(
                story_summary = "",
                scene_summary = "",
                last_turn_beat = "",
                active_threads = listOf(
                    NarrativeThread("thread-1", "Diagnose the diplomat", "open", emptyList())
                ),
                resolved_threads = emptyList()
            )
        )

        val extraction = ExtractionOutput(
            transition_type = "continuation",
            story_summary = "",
            scene_summary = "",
            last_turn_beat = "",
            narrative_timestamp = "",
            narrative_thread_mutations = listOf(
                NarrativeThreadMutation(op = "resolve", thread_id = "thread-1")
            )
        )

        val result = WorldStateReducer.applyExtractionToSnapshot(initial, extraction, "turn-1")
        val snapshot = result.snapshot

        // Assert thread resolved
        assertEquals(0, snapshot.narrative_state.active_threads.size)
        assertEquals(listOf("Diagnose the diplomat"), snapshot.narrative_state.resolved_threads)
    }
}
