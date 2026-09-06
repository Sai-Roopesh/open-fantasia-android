package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.PromptBuilder
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Completeness as a check rather than a habit.
 *
 * Three pieces of context were lost three different ways — a parameter suppressed and forgotten, a
 * resolved list discarded at the call site, and fields dropped by a serializer nobody configured. Each
 * survived for months because nothing failed when context went missing. These tests fail instead.
 *
 * The reflection cases are the ones that matter: add a property to a context type and forget to render
 * it, and the build breaks. See ADR-0014.
 */
class PromptCompletenessTest {

    /**
     * Every field gets a sentinel derived from its own name. PromptCastMember declares no defaults, so
     * adding a field breaks this fixture until it is named here, and [everyCastFieldReachesTheModel]
     * then fails until it is rendered. That pairing is the guarantee.
     */
    private fun castMember(
        castId: String,
        name: String,
        origin: String = "Authored by the player"
    ) = PromptCastMember(
        castId = castId,
        entityId = "$name-entityId",
        canonicalName = name,
        aliases = listOf("$name-aliases"),
        roleBackground = "$name-roleBackground",
        personality = "$name-personality",
        voiceStyle = "$name-voiceStyle",
        appearance = "$name-appearance",
        goals = "$name-goals",
        boundaries = "$name-boundaries",
        origin = origin,
        evidence = listOf("$name-evidence"),
        status = "active",
        speakerEligible = true
    )

    /** The sentinels above, by the field they stand for. */
    private fun castSentinels(name: String) = listOf(
        "$name-entityId", "$name-aliases", "$name-roleBackground", "$name-personality",
        "$name-voiceStyle", "$name-appearance", "$name-goals", "$name-boundaries", "$name-evidence"
    )

    private fun world() = PromptWorldState(
        metadata = SnapshotMetadata("turn-9", "NARRATIVE-TIMESTAMP", "TRANSITION-TYPE", 4),
        spatial_state = SpatialState(
            current_location = LocationState("loc:ward", "WARD-NAME", "WARD-DESCRIPTION", listOf("MODIFIER")),
            adjacent_locations = listOf(LocationRef("loc:icu", "ICU-NAME")),
            known_locations = listOf(LocationState("loc:ward", "WARD-NAME", "WARD-DESCRIPTION", listOf("MODIFIER"))),
            edges = listOf(LocationEdge("edge:1", "loc:ward", "loc:icu", true)),
            entity_placements = listOf(EntityPlacement("e1", "PLACED-NAME", "loc:ward", "WARD-NAME", "MICRO-POSITION"))
        ),
        entity_state = listOf(
            EntityState(
                entity_id = "e1", canonical_name = "ENTITY-NAME", entity_type = "ENTITY-TYPE",
                aliases = listOf("ENTITY-ALIAS"), is_present = true,
                primary_emotion = "PRIMARY-EMOTION", emotion_intensity = 71, emotion_catalyst = "EMOTION-CATALYST",
                knowledge_boundary = listOf(FactRef("f1", "KNOWLEDGE-FACT")),
                traits = listOf(FactRef("f2", "TRAIT-FACT")),
                goals = listOf(FactRef("f3", "GOAL-FACT")),
                secrets = listOf(FactRef("f4", "SECRET-FACT")),
                abilities = listOf(FactRef("f5", "ABILITY-FACT")),
                possessions = listOf(FactRef("f6", "POSSESSION-FACT"))
            )
        ),
        relational_state = listOf(
            RelationalState("r1", "e1", "SOURCE-NAME", "e2", "TARGET-NAME", "RELATIONSHIP-TYPE", "DYNAMIC-STATUS")
        ),
        narrative_state = NarrativeState(
            story_summary = "STORY-SUMMARY",
            scene_summary = "SCENE-SUMMARY",
            last_turn_beat = "LAST-TURN-BEAT"
        )
    )

    private fun context(
        world: PromptWorldState? = world(),
        cast: List<PromptCastMember> = listOf(castMember("primary:t", "Ayushi", "Primary Character"), castMember("seed:1", "Arjun")),
        speakerMode: String = "single"
    ) = RoleplayContext(
        character = PromptCharacter(
            name = "Ayushi",
            story = "STORY-SETTING",
            corePersona = "CORE-PERSONA",
            appearance = "CHARACTER-APPEARANCE",
            styleRules = "STYLE-RULES",
            definition = "CHARACTER-DEFINITION",
            negativeGuidance = "NEGATIVE-GUIDANCE",
            exampleConversations = listOf(ExampleConversation("EXAMPLE-USER", "EXAMPLE-CHARACTER"))
        ),
        persona = PromptPersona(
            name = "PERSONA-NAME", identity = "PERSONA-IDENTITY", backstory = "PERSONA-BACKSTORY",
            voiceStyle = "PERSONA-VOICE", goals = "PERSONA-GOALS", boundaries = "PERSONA-BOUNDARIES"
        ),
        directorNotes = "DIRECTOR-NOTES",
        world = world,
        cast = cast,
        activeSpeaker = cast.firstOrNull(),
        speakerMode = speakerMode,
        sceneIntent = SceneIntent.Escalate, storyDirection = StoryDirection.Empty,
        pins = listOf(ChatPinRecord("p1", "t", "b", null, "PIN-BODY", "active", "", "")),
        timeline = listOf(
            TimelineEventRecord("tl1", "t", "b", "turn-9", "TIMELINE-TITLE", "TIMELINE-DETAIL", 5, "reveal", emptyList(), emptyList(), "")
        ),
        currentUserMessage = "CURRENT-USER-MESSAGE",
        revision = null,
        replyLength = ReplyLength.Full,
        modelId = "test-model"
    )

    private fun rendered(context: RoleplayContext = context()): String {
        val prompt = PromptBuilder.render(context)
        return prompt.systemPrompt + "\n" + prompt.currentUserMessage
    }

    @Test
    fun `every authored character and persona field reaches the model`() {
        val out = rendered()
        for (marker in listOf(
            "STORY-SETTING", "CORE-PERSONA", "CHARACTER-APPEARANCE", "STYLE-RULES",
            "CHARACTER-DEFINITION", "NEGATIVE-GUIDANCE", "EXAMPLE-USER", "EXAMPLE-CHARACTER",
            "PERSONA-IDENTITY", "PERSONA-BACKSTORY", "PERSONA-VOICE", "PERSONA-GOALS",
            "PERSONA-BOUNDARIES", "DIRECTOR-NOTES", "CURRENT-USER-MESSAGE"
        )) {
            assertTrue("$marker is missing from the prompt", out.contains(marker))
        }
    }

    // The reflection cases. Add a property to a context type without rendering it and these fail.
    @Test
    fun `every property of the world state reaches the model`() {
        val out = rendered()
        // Java reflection rather than kotlin-reflect: a build-breaking guarantee should not need a
        // dependency to hold. Data class properties are declared fields of the same name.
        val types = listOf(
            SnapshotMetadata::class.java, SpatialState::class.java, LocationState::class.java,
            LocationRef::class.java, LocationEdge::class.java, EntityPlacement::class.java,
            EntityState::class.java, FactRef::class.java, RelationalState::class.java,
            NarrativeState::class.java
        )
        for (type in types) {
            for (field in type.declaredFields) {
                if (field.isSynthetic || field.name == "Companion" || field.name.startsWith("\$")) continue
                assertTrue(
                    "${type.simpleName}.${field.name} never reaches the prompt",
                    out.contains(field.name)
                )
            }
        }
    }

    @Test
    fun everyCastFieldReachesTheModel() {
        val out = rendered()
        for (marker in castSentinels("Arjun") + castSentinels("Ayushi")) {
            assertTrue("$marker is carried in the context but never rendered", out.contains(marker))
        }
    }

    // The failure that started this: Continuity Updates run every fifteen exchanges, so binding cast
    // delivery to the Snapshot left authored Cast Seeds as bare names for a thread's first fifteen.
    @Test
    fun `the full cast is sent before any Continuity Snapshot exists`() {
        val out = rendered(context(world = null))
        for (marker in castSentinels("Arjun")) assertTrue(marker, out.contains(marker))
        assertTrue(out.contains("Ayushi"))
    }

    @Test
    fun `a silent cast member is described as fully as the Active Speaker`() {
        val out = rendered()
        assertTrue("the non-speaking member must carry its whole profile", out.contains("Arjun-voiceStyle"))
        assertTrue(out.contains("Ayushi-voiceStyle"))
    }

    @Test
    fun `ensemble mode receives the same cast knowledge as single speaker`() {
        val single = rendered(context(speakerMode = "single"))
        val ensemble = rendered(context(speakerMode = "ensemble"))
        for (marker in castSentinels("Arjun") + listOf("Ayushi-personality")) {
            assertTrue(marker, single.contains(marker))
            assertTrue(marker, ensemble.contains(marker))
        }
    }

    @Test
    fun `timeline events reach the model`() {
        val out = rendered()
        assertTrue("timeline detail never reached the prompt", out.contains("TIMELINE-DETAIL"))
        assertTrue(out.contains("TIMELINE-TITLE"))
    }

    @Test
    fun `pins reach the model`() {
        assertTrue(rendered().contains("PIN-BODY"))
    }

    // Cast lives in exactly one section. Sending it twice was the cost of moving it out of durable_state.
    @Test
    fun `no cast member is described twice`() {
        val out = rendered()
        val occurrences = out.split("Arjun-personality").size - 1
        assertTrue("expected one description, found $occurrences", occurrences == 1)
    }

    @Test
    fun `deliberately withheld fields stay withheld`() {
        val out = rendered()
        assertFalse("private_notes must never reach the model", out.contains("private_notes"))
        assertFalse(out.contains("greeting"))
    }
}
