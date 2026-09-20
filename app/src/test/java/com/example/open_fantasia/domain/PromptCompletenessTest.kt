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
 * The world state used to be checked by reflection over field *names*, which worked because the prompt
 * was the JSON. It is prose now ([com.example.open_fantasia.domain.reducer.DossierRendering]), so every
 * field is checked by its *value* — the stronger property, since a field can be named in a prompt without
 * its content arriving and cannot be valued there without it. What is deliberately withheld is listed at
 * the bottom, and asserted absent. See ADR-0014 and ADR-0024.
 */
class PromptCompletenessTest {

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
        speakerEligible = true,
        voiceSamples = listOf("$name-sample")
    )

    /** Every authored field of a non-primary member. */
    private fun castSentinels(name: String) = listOf(
        "$name-aliases", "$name-roleBackground", "$name-personality",
        "$name-voiceStyle", "$name-appearance", "$name-goals", "$name-boundaries", "$name-sample"
    )

    private fun world() = PromptWorldState(
        metadata = SnapshotMetadata("turn-9", "NARRATIVE-TIMESTAMP", "time_skip", 4),
        spatial_state = SpatialState(
            current_location = LocationState("loc:ward", "WARD-NAME", "WARD-DESCRIPTION", listOf("MODIFIER")),
            adjacent_locations = listOf(LocationRef("loc:icu", "ICU-NAME")),
            known_locations = listOf(
                LocationState("loc:ward", "WARD-NAME", "WARD-DESCRIPTION", listOf("MODIFIER")),
                LocationState("loc:icu", "ICU-NAME", "ICU-DESCRIPTION", emptyList())
            ),
            edges = listOf(LocationEdge("edge:1", "loc:ward", "loc:icu", true)),
            entity_placements = listOf(EntityPlacement("e1", "ENTITY-NAME", "loc:ward", "WARD-NAME", "MICRO-POSITION"))
        ),
        entity_state = listOf(
            EntityState(
                entity_id = "e1", canonical_name = "ENTITY-NAME", entity_type = "creature",
                account = "ENTITY-ACCOUNT",
                aliases = listOf("ENTITY-ALIAS"), is_present = true,
                primary_emotion = "primary-emotion", emotion_intensity = 71, emotion_catalyst = "emotion-catalyst",
                knowledge_boundary = listOf(FactRef("f1", "KNOWLEDGE-FACT")),
                traits = listOf(FactRef("f2", "TRAIT-FACT")),
                goals = listOf(FactRef("f3", "GOAL-FACT")),
                secrets = listOf(FactRef("f4", "SECRET-FACT")),
                abilities = listOf(FactRef("f5", "ABILITY-FACT")),
                possessions = listOf(FactRef("f6", "POSSESSION-FACT"))
            ),
            EntityState(
                entity_id = "e2", canonical_name = "ABSENT-NAME", entity_type = "character",
                account = "ABSENT-ACCOUNT",
                aliases = emptyList(), is_present = false,
                primary_emotion = "", emotion_intensity = 0, emotion_catalyst = "",
                knowledge_boundary = emptyList(), traits = emptyList(), goals = emptyList(),
                secrets = emptyList(), abilities = emptyList(), possessions = emptyList()
            )
        ),
        relational_state = listOf(
            RelationalState("r1", "e1", "ENTITY-NAME", "e2", "ABSENT-NAME", "adversarial", "DYNAMIC-STATUS")
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
            negativeGuidance = "NEGATIVE-GUIDANCE-1\nNEGATIVE-GUIDANCE-2",
            exampleConversations = listOf(ExampleConversation("EXAMPLE-USER", "EXAMPLE-CHARACTER")),
            voiceSamples = listOf("CHARACTER-SAMPLE")
        ),
        persona = PromptPersona(
            name = "PERSONA-NAME", identity = "PERSONA-IDENTITY", backstory = "PERSONA-BACKSTORY",
            voiceStyle = "PERSONA-VOICE", goals = "PERSONA-GOALS", boundaries = "PERSONA-BOUNDARIES",
            voiceSamples = listOf("PERSONA-SAMPLE")
        ),
        directorNotes = "DIRECTOR-NOTES",
        world = world,
        cast = cast,
        activeSpeaker = cast.firstOrNull(),
        speakerMode = speakerMode,
        sceneIntent = SceneIntent.Escalate,
        storyDirection = listOf(PlacedWant("WANT-AHEAD", reached = false, askedAgo = 3, reachedAgo = null), PlacedWant("WANT-DONE", reached = true, askedAgo = 9, reachedAgo = 2)),
        recalled = listOf(RecalledExchange("turn-2", 40, "RECALLED-PLAYER", "RECALLED-REPLY", listOf("match"))),
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
            "CHARACTER-DEFINITION", "NEGATIVE-GUIDANCE-1", "NEGATIVE-GUIDANCE-2", "CHARACTER-SAMPLE",
            "PERSONA-IDENTITY", "PERSONA-BACKSTORY", "PERSONA-VOICE", "PERSONA-GOALS",
            "PERSONA-BOUNDARIES", "PERSONA-SAMPLE", "DIRECTOR-NOTES", "CURRENT-USER-MESSAGE"
        )) {
            assertTrue("$marker is missing from the prompt", out.contains(marker))
        }
    }

    /**
     * Example conversations are not quoted in the prompt any more; they ride as real dialogue turns
     * ahead of the transcript. Their absence here is asserted so the move is not mistaken for a leak,
     * and their presence is asserted in [RoleplayContextAssemblerTest].
     */
    @Test
    fun `example conversations travel as turns, not as prompt text`() {
        val out = rendered()
        assertFalse(out.contains("EXAMPLE-USER"))
        assertFalse(out.contains("EXAMPLE-CHARACTER"))
        val anchor = RoleplayContextAssembler.voiceAnchor(context().character.exampleConversations)
        assertTrue(anchor.any { it.role == "user" && it.content == "EXAMPLE-USER" })
        assertTrue(anchor.any { it.role == "assistant" && it.content == "EXAMPLE-CHARACTER" })
    }

    /** Every value in the Continuity Snapshot the Stage sends, as prose. */
    @Test
    fun `every value of the world state reaches the model`() {
        val out = rendered()
        for (marker in listOf(
            "NARRATIVE-TIMESTAMP", "Time has passed",
            "WARD-NAME", "WARD-DESCRIPTION", "MODIFIER", "ICU-NAME", "ICU-DESCRIPTION", "MICRO-POSITION",
            "ENTITY-NAME", "creature", "ENTITY-ALIAS", "ENTITY-ACCOUNT",
            "KNOWLEDGE-FACT", "TRAIT-FACT", "GOAL-FACT", "SECRET-FACT", "ABILITY-FACT", "POSSESSION-FACT",
            "ABSENT-NAME", "ABSENT-ACCOUNT",
            "DYNAMIC-STATUS", "adversarial",
            "STORY-SUMMARY", "SCENE-SUMMARY", "LAST-TURN-BEAT"
        )) {
            assertTrue("$marker never reaches the prompt", out.contains(marker))
        }
        // The emotion arrives as words: "very primary-emotion, since emotion-catalyst."
        assertTrue(out.contains("Right now: very primary-emotion, since emotion-catalyst."))
        // Presence is stated by section, not by a boolean.
        assertTrue(out.indexOf("WHO'S HERE") < out.indexOf("ENTITY-NAME"))
        assertTrue(out.substringAfter("<who_else>").contains("ABSENT-NAME"))
        assertTrue(out.substringAfter("<who_else>").contains("Not here right now"))
    }

    @Test
    fun everyCastFieldReachesTheModel() {
        val out = rendered()
        for (marker in castSentinels("Arjun")) {
            assertTrue("$marker is carried in the context but never rendered", out.contains(marker))
        }
        // The Primary Character is described by the Character Sheet in the voice card. Of the seed's own
        // fields, the ones the sheet does not lock — voice, sample lines, goals — are rendered from the
        // seed; the locked ones are, by construction, the sheet's values under other names.
        for (marker in listOf("Ayushi-voiceStyle", "Ayushi-goals", "Ayushi-aliases")) {
            assertTrue("$marker is carried in the context but never rendered", out.contains(marker))
        }
    }

    // The failure that started this: Continuity Updates run every fifteen exchanges, so binding cast
    // delivery to the Snapshot left authored Cast Seeds as bare names for a thread's first fifteen.
    @Test
    fun `the full cast is sent before any Continuity Snapshot exists`() {
        val out = rendered(context(world = null))
        for (marker in castSentinels("Arjun")) assertTrue(marker, out.contains(marker))
        assertTrue(out.contains("THE CAST"))
        assertFalse("nobody is claimed present when nothing has been observed", out.contains("WHO'S HERE"))
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
        for (marker in castSentinels("Arjun")) {
            assertTrue(marker, single.contains(marker))
            assertTrue(marker, ensemble.contains(marker))
        }
        assertTrue(ensemble.contains("Anyone in the room can speak this time"))
    }

    @Test
    fun `timeline, pins, direction and recall reach the model`() {
        val out = rendered()
        for (marker in listOf("TIMELINE-DETAIL", "TIMELINE-TITLE", "PIN-BODY", "WANT-AHEAD", "WANT-DONE", "RECALLED-PLAYER", "RECALLED-REPLY", "40 exchanges ago")) {
            assertTrue("$marker never reached the prompt", out.contains(marker))
        }
    }

    // Cast lives in exactly one place.
    @Test
    fun `no cast member is described twice`() {
        val out = rendered()
        val occurrences = out.split("Arjun-personality").size - 1
        assertTrue("expected one description, found $occurrences", occurrences == 1)
        assertTrue("the primary's persona is in the voice card only", out.split("CORE-PERSONA").size - 1 == 1)
    }

    /**
     * What the model deliberately never sees. Identifiers and flags are bookkeeping (ADR-0008); the
     * integer behind an emotion becomes an adverb; provenance, evidence and eligibility describe the
     * record, not the person.
     */
    @Test
    fun `deliberately withheld fields stay withheld`() {
        val out = rendered()
        for (marker in listOf(
            "private_notes", "greeting",
            "loc:ward", "loc:icu", "edge:1", "\"e1\"", "f1", "r1",
            "Ayushi-entityId", "Arjun-entityId", "Arjun-evidence",
            "emotion_intensity", "is_present", "is_bidirectional", "entity_id",
            "eligible to speak", "World entity", "Origin:", "Status: active"
        )) {
            assertFalse("$marker must never reach the model", out.contains(marker))
        }
        assertFalse("the intensity integer must not leak", Regex("\\b71\\b").containsMatchIn(out))
    }
}
