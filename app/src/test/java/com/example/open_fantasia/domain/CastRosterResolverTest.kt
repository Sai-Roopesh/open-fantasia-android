package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CastRosterResolverTest {
    @Test
    fun legacySnapshotPromotesMeaningfulNamedCharacterButNotPlayerOrUnnamedRole() {
        fun entity(id: String, name: String, goals: Int = 0) = EntityState(
            id, name, "character", emptyList(), true, "calm", 1, "", emptyList(), emptyList(),
            List(goals) { FactRef("$id-g$it", "Goal $it") }, emptyList(), emptyList(), emptyList()
        )
        val snapshot = DurableMemorySnapshot(
            SnapshotMetadata("t7", "", "continuation", 7),
            SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
            listOf(entity("primary", "Ananya Panday"), entity("player", "Sai Roopesh", 3), entity("yunxi", "Yunxi", 2), entity("cashier", "D-Mart Cashier", 2)),
            listOf(RelationalState("r1", "yunxi", "Yunxi", "primary", "Ananya Panday", "social", "Trusted friend")),
            NarrativeState("", "", "", emptyList(), emptyList())
        )
        val seeds = listOf(CastProfile("p", "primary", "Ananya Panday", provenance = "primary"))

        val roster = resolveCastRoster(snapshot, seeds, playerName = "Sai Roopesh -")

        assertTrue(roster.any { it.canonical_name == "Yunxi" })
        assertFalse(roster.any { it.canonical_name == "Sai Roopesh" })
        assertFalse(roster.any { it.canonical_name == "D-Mart Cashier" })
        assertEquals(2, roster.size)
    }

    @Test
    fun authoritativeRosterDisablesLegacyInference() {
        val authoritative = CastProfile("yunxi", canonical_name = "Yunxi", provenance = "continuity_discovered")
        val snapshot = DurableMemorySnapshot(
            SnapshotMetadata("t7", "", "continuation", 7),
            SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
            emptyList(), emptyList(), NarrativeState("", "", "", emptyList(), emptyList()),
            cast_roster = listOf(authoritative)
        )
        assertEquals(listOf(authoritative), resolveCastRoster(snapshot, emptyList()))
    }
}
