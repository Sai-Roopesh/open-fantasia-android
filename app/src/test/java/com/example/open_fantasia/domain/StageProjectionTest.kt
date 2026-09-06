package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Stage decides how much of the archive reaches one reply, so the cases that matter are the ones
 * where it could quietly lose somebody. Every test here is a way a character could disappear, asserted
 * not to.
 */
class StageProjectionTest {

    private fun entity(id: String, name: String, present: Boolean = false, facts: Int = 1) = EntityState(
        entity_id = id, canonical_name = name, entity_type = "character", aliases = emptyList(),
        is_present = present, primary_emotion = "calm", emotion_intensity = 10, emotion_catalyst = "",
        knowledge_boundary = emptyList(),
        traits = (1..facts).map { FactRef("$id-t$it", "trait $it of $name") },
        goals = emptyList(), secrets = emptyList(), abilities = emptyList(), possessions = emptyList()
    )

    private fun member(castId: String, name: String, entityId: String?) = PromptCastMember(
        castId = castId, entityId = entityId, canonicalName = name, aliases = emptyList(),
        roleBackground = "$name background", personality = "$name personality", voiceStyle = "dry",
        appearance = "tall", goals = "goal", boundaries = "", origin = "Authored by the player",
        evidence = emptyList(), status = "active", speakerEligible = true
    )

    private fun world(
        entities: List<EntityState>,
        relationships: List<RelationalState> = emptyList()
    ) = PromptWorldState(
        metadata = SnapshotMetadata("turn-1", "", "continuation", 3),
        spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
        entity_state = entities,
        relational_state = relationships,
        narrative_state = NarrativeState("", "", "")
    )

    @Test
    fun `every entity reaches the model at some tier`() {
        val entities = (1..40).map { entity("e$it", "Person $it", present = it <= 2) }
        val stage = StageProjection.project(
            world = world(entities), cast = emptyList(), salience = emptyMap(), timeline = emptyList()
        )
        assertEquals(
            "an entity vanished from the Stage entirely",
            entities.map { it.entity_id }.toSet(),
            stage.entities.map { it.entity.entity_id }.toSet()
        )
    }

    @Test
    fun `a cast member off-screen for a long time is never dropped`() {
        val entities = listOf(entity("here", "Present", present = true), entity("away", "Absent"))
        // The worst case the ordering can produce: the oldest possible salience, and no room anywhere.
        val stage = StageProjection.project(
            world = world(entities),
            cast = listOf(member("c1", "Absent", "away")),
            salience = mapOf("away" to 0, "here" to 999),
            timeline = emptyList(),
            budget = StageBudget(onStageChars = 1, wingsChars = 1, timelineEvents = 1, fullRosterChars = 1)
        )
        assertTrue(
            "a Cast Member was demoted out of the wings",
            stage.entitiesAt(StageTier.Wings).any { it.entity_id == "away" }
        )
        assertEquals(
            "every Cast Member must keep a roster line whatever the budget",
            1, stage.cast.size
        )
    }

    @Test
    fun `with nobody on stage nothing is resolved away`() {
        val entities = (1..30).map { entity("e$it", "Person $it") }
        val cast = (1..20).map { member("c$it", "Person $it", "e$it") }
        val stage = StageProjection.project(
            world = world(entities), cast = cast, salience = emptyMap(), timeline = emptyList()
        )
        assertTrue(
            "a thread with no established scene must send the whole roster",
            stage.castAt(StageTier.OnStage).size == 20
        )
        assertTrue(stage.entitiesAt(StageTier.Index).isEmpty())
    }

    @Test
    fun `a small cast is sent whole rather than tiered`() {
        val entities = listOf(entity("a", "Ana", present = true), entity("b", "Bo"))
        val stage = StageProjection.project(
            world = world(entities),
            cast = listOf(member("c1", "Ana", "a"), member("c2", "Bo", "b")),
            salience = emptyMap(), timeline = emptyList()
        )
        assertEquals("tiering a two-person cast buys nothing", 2, stage.castAt(StageTier.OnStage).size)
    }

    @Test
    fun `a relationship survives when either end is in the room`() {
        val entities = listOf(entity("here", "Present", present = true), entity("away", "Absent"))
        val stage = StageProjection.project(
            world = world(entities, relationships = listOf(
                RelationalState("r1", "here", "Present", "away", "Absent", "familial", "strained"),
                RelationalState("r2", "away", "Absent", "away", "Absent", "other", "")
            )),
            cast = emptyList(), salience = emptyMap(), timeline = emptyList()
        )
        assertTrue(stage.relationships.any { it.relationship_id == "r1" })
        assertTrue("a relationship between two absent people is not this scene's business",
            stage.relationships.none { it.relationship_id == "r2" })
    }

    @Test
    fun `the least recently used record is the one a budget gives up`() {
        val entities = listOf(
            entity("here", "Present", present = true),
            entity("recent", "Recent", facts = 20),
            entity("stale", "Stale", facts = 20)
        )
        val relationships = listOf(
            RelationalState("r1", "here", "Present", "recent", "Recent", "social", ""),
            RelationalState("r2", "here", "Present", "stale", "Stale", "social", "")
        )
        val stage = StageProjection.project(
            world = world(entities, relationships),
            cast = emptyList(),
            salience = mapOf("here" to 9, "recent" to 9, "stale" to 1),
            timeline = emptyList(),
            // The wings render as one line each, so their ceiling is counted in lines, not in records.
            budget = StageBudget(onStageChars = 30_000, wingsChars = 60, timelineEvents = 24, fullRosterChars = 0)
        )
        assertTrue("the stale record should be the one to go",
            stage.entitiesAt(StageTier.Index).any { it.entity_id == "stale" })
        assertTrue("the recently used record should have been kept",
            stage.entitiesAt(StageTier.Wings).any { it.entity_id == "recent" })
        assertTrue("a budget must say what it gave up", stage.omissions.isNotEmpty())
    }

    @Test
    fun `a reported room outranks a snapshot that has not caught up`() {
        // The snapshot still believes the ward scene; the last reply says they moved to the balcony.
        val entities = listOf(
            entity("ward", "Ward Nurse", present = true),
            entity("avni", "Avni"),
            entity("ayushi", "Ayushi")
        )
        val stage = StageProjection.project(
            world = world(entities), cast = emptyList(), salience = emptyMap(), timeline = emptyList(),
            observedPresence = setOf("Avni", "ayushi")
        )
        val onStage = stage.entitiesAt(StageTier.OnStage).map { it.entity_id }.toSet()
        assertEquals(setOf("avni", "ayushi"), onStage)
        assertTrue("someone the scene left must still be reachable",
            stage.entities.any { it.entity.entity_id == "ward" })
    }

    @Test
    fun `with no report the snapshot stands unchallenged`() {
        val entities = listOf(entity("here", "Present", present = true), entity("away", "Absent"))
        val stage = StageProjection.project(
            world = world(entities), cast = emptyList(), salience = emptyMap(), timeline = emptyList(),
            observedPresence = emptySet()
        )
        assertEquals(listOf("here"), stage.entitiesAt(StageTier.OnStage).map { it.entity_id })
    }

    @Test
    fun `the same input projects the same stage twice`() {
        val entities = (1..25).map { entity("e$it", "Person $it", present = it == 1, facts = it % 4) }
        val salience = entities.associate { it.entity_id to it.entity_id.length }
        fun run() = StageProjection.project(
            world = world(entities), cast = emptyList(), salience = salience, timeline = emptyList(),
            budget = StageBudget(onStageChars = 400, wingsChars = 400, timelineEvents = 5, fullRosterChars = 0)
        ).entities.map { "${it.tier}:${it.entity.entity_id}" }
        assertEquals("a frozen request cannot be built from a projection that reorders itself", run(), run())
    }

    @Test
    fun `timeline keeps the most recent beats and reports the rest`() {
        val events = (1..40).map {
            TimelineEventRecord("tl$it", "t", "b", null, "Title $it", "Detail $it", 5, "beat", emptyList(), emptyList(),
                "2026-08-%02d".format(it % 28 + 1))
        }
        val stage = StageProjection.project(
            world = world(listOf(entity("here", "Present", present = true))),
            cast = emptyList(), salience = emptyMap(), timeline = events,
            budget = StageBudget(timelineEvents = 10)
        )
        assertEquals(10, stage.timeline.size)
        assertEquals("the kept beats must stay in story order",
            stage.timeline.map { it.created_at }.sorted(), stage.timeline.map { it.created_at })
        assertTrue(stage.omissions.any { it.contains("timeline") })
    }
}
