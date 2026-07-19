package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.PromptBuilder
import org.junit.Assert.*
import org.junit.Test

class PromptBuilderTest {

    private fun makeCharacterBundle(story: String = "Lore"): CharacterBundle {
        return CharacterBundle(
            character = CharacterRecord(
                id = "char-1",
                user_id = "user-1",
                name = "Mara Vale",
                story = story,
                core_persona = "Alchemist",
                appearance = "Cloaked",
                style_rules = "Scientific prose",
                definition = "Cautious",
                negative_guidance = "No modern slang",
                created_at = "",
                updated_at = ""
            ),
            starters = emptyList(),
            exampleConversations = listOf(
                ExampleConversation("Who are you?", "I am Mara.")
            )
        )
    }

    private fun makeDurableSnapshot(): DurableMemorySnapshot {
        return DurableMemorySnapshot(
            metadata = SnapshotMetadata("turn-0", "", "continuation", 1),
            spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
            entity_state = emptyList(),
            relational_state = emptyList(),
            narrative_state = NarrativeState("Story", "Scene", "Beat", emptyList(), emptyList())
        )
    }

    @Test
    fun testPromptSectionPresenceAndOrdering() {
        val charBundle = makeCharacterBundle()
        val persona = UserPersonaRecord(
            id = "pers-1",
            user_id = "user-1",
            name = "Ash Rowan",
            identity = "Smuggler",
            created_at = "",
            updated_at = ""
        )
        val snapshot = makeDurableSnapshot()
        val pins = listOf(ChatPinRecord("pin-1", "thread-1", "branch-1", "turn-1", "A secret box.", "active", "", ""))
        val timeline = listOf(TimelineEventRecord("time-1", "thread-1", "branch-1", "turn-1", "Arrival", "We met Mara.", 4, "beat", emptyList(), emptyList(), ""))

        // Execution
        val prompt = PromptBuilder.buildRoleplaySystemPrompt(charBundle, persona, snapshot, pins, timeline)

        // Presence checks
        assertTrue(prompt.contains("<role_objective>"))
        assertTrue(prompt.contains("<story_setting>"))
        assertTrue(prompt.contains("<character_persona>"))
        assertTrue(prompt.contains("<user_persona>"))
        assertTrue(prompt.contains("<core_directives>"))
        assertTrue(prompt.contains("<example_conversations>"))
        assertTrue(prompt.contains("<response_contract>"))
        assertTrue(prompt.contains("<continuity_and_variation>"))
        assertTrue(prompt.contains("<durable_state>"))
        assertTrue(prompt.contains("<pins_timeline>"))

        // Ordering check: continuity_and_variation must be before durable_state (cache optimization)
        val continuityIndex = prompt.indexOf("\n<continuity_and_variation>\n")
        val stateIndex = prompt.indexOf("\n<durable_state>\n")
        assertTrue("continuity_and_variation should be placed before durable_state", continuityIndex < stateIndex)

        // Formatting verification
        assertTrue(prompt.contains("Mara Vale"))
        assertTrue(prompt.contains("Ash Rowan"))
        assertTrue(prompt.contains("A secret box."))
        assertTrue(prompt.contains("[4/5] Arrival: We met Mara."))
    }

    @Test
    fun testCacheSplitKeepsVolatileStateOutOfSystemPrompt() {
        val charBundle = makeCharacterBundle()
        val snapshot = makeDurableSnapshot()
        val pins = listOf(ChatPinRecord("pin-1", "thread-1", "branch-1", "turn-1", "A secret box.", "active", "", ""))

        // Prefix-cache invariant: the static system prompt must NOT carry the volatile
        // world-state section (asserted via the closing tag, which only a real section emits).
        val system = PromptBuilder.buildSystemPrompt(charBundle, null, null)
        assertFalse(system.contains("</durable_state>"))
        assertFalse(system.contains("</pins_timeline>"))
        assertTrue(system.contains("<role_objective>"))
        assertTrue(system.contains("<continuity_and_variation>"))

        // The volatile block carries the world state; it rides on the latest user turn.
        val state = PromptBuilder.buildStateContext(snapshot, pins, emptyList())
        assertTrue(state.contains("</durable_state>"))
        assertTrue(state.contains("</pins_timeline>"))
        assertTrue(state.contains("A secret box."))
    }

    @Test
    fun testEmptyLoreSkipsStorySetting() {
        val charBundle = makeCharacterBundle(story = "")
        
        val prompt = PromptBuilder.buildRoleplaySystemPrompt(charBundle, null, null, emptyList(), emptyList())

        assertFalse(prompt.contains("<story_setting>"))
        assertFalse(prompt.contains("<user_persona>"))
        assertFalse(prompt.contains("<pins_timeline>"))
        
        // Dynamic state empty state fallback
        assertTrue(prompt.contains("No world state has been materialized yet. This is the beginning of the story."))
    }

    @Test
    fun testExampleConversationsFormatting() {
        val bundle = makeCharacterBundle().copy(
            exampleConversations = listOf(
                ExampleConversation("Who are you?", "I am Mara."),
                ExampleConversation("  ", "Empty user line"),
                ExampleConversation("", "") // fully empty, should be filtered out
            )
        )

        val prompt = PromptBuilder.buildRoleplaySystemPrompt(bundle, null, null, emptyList(), emptyList())
        
        // 1. Verify fully empty example is filtered out (only 2 examples should be printed)
        assertFalse(prompt.contains("Example 3"))
        
        // 2. Verify headers are uppercase and user blank is formatted as "(left blank)"
        assertTrue(prompt.contains("Example 1\nUSER: Who are you?\nMARA VALE: I am Mara."))
        assertTrue(prompt.contains("Example 2\nUSER: (left blank)\nMARA VALE: Empty user line"))
    }

    @Test
    fun testLengthTargetReflectsTokenBudgetAndRidesOnSuffix() {
        val snapshot = makeDurableSnapshot()

        val concise = PromptBuilder.buildStateContext(snapshot, emptyList(), emptyList(), replyLengthTokens = 750)
        val expansive = PromptBuilder.buildStateContext(snapshot, emptyList(), emptyList(), replyLengthTokens = 8192)

        // The preset must produce a real, differing prose directive — not just a token cap.
        assertTrue(concise.contains("<length_target>"))
        assertTrue(concise.contains("2-4 sentences"))
        assertTrue(expansive.contains("5 or more paragraphs"))
        assertNotEquals(
            "Different length presets must yield different length directives",
            concise.substringAfter("<length_target>"),
            expansive.substringAfter("<length_target>")
        )
    }

    @Test
    fun testDriveThisTurnRidesOnSuffixNotCachedPrefix() {
        val charBundle = makeCharacterBundle()
        val snapshot = makeDurableSnapshot()

        // The positive forcing function lives on the volatile suffix (recency), never in the
        // cached system prefix — so it must not invalidate prefix-cache stability.
        val system = PromptBuilder.buildSystemPrompt(charBundle, null, null)
        val state = PromptBuilder.buildStateContext(snapshot, emptyList(), emptyList())
        assertFalse(system.contains("<drive_this_turn>"))
        assertTrue(state.contains("<drive_this_turn>"))
    }

    @Test
    fun testCastRendersOnlyInVolatileSuffix() {
        val charBundle = makeCharacterBundle()
        val cast = listOf(
            CastProfile("cast-1", canonical_name = "Joren", role_background = "Gruff ex-soldier barkeep.", provenance = "manual_seed"),
            CastProfile("cast-2", canonical_name = "Mira", role_background = "Nervous serving girl.", provenance = "manual_seed")
        )

        val system = PromptBuilder.buildSystemPrompt(charBundle, null, null)
        val suffix = PromptBuilder.buildStateContext(makeDurableSnapshot(), emptyList(), emptyList(), activeSpeaker = cast[0], castRoster = cast)

        assertFalse(system.contains("Joren"))
        assertFalse(system.contains("Mira"))
        assertTrue(suffix.contains("Joren"))
        assertTrue(suffix.contains("Gruff ex-soldier barkeep."))
    }

    @Test
    fun testEmptyCastKeepsPrefixByteIdentical() {
        val charBundle = makeCharacterBundle()

        // Legacy caller arguments are deliberately ignored: cast changes never alter the prefix.
        val noCast = PromptBuilder.buildSystemPrompt(charBundle, null, null)
        val empty = PromptBuilder.buildSystemPrompt(charBundle, null, null, emptyList())
        val populated = PromptBuilder.buildSystemPrompt(charBundle, null, null, listOf(CastMember("Joren", "Barkeep")))

        assertEquals(noCast, empty)
        assertEquals(noCast, populated)
        assertFalse(noCast.contains("<supporting_cast>"))
    }

    @Test
    fun testSupportingCastJsonRoundTripDropsBlanks() {
        val cast = listOf(
            CastMember("Joren", "Barkeep"),
            CastMember("", ""),                         // fully blank — dropped
            CastMember("  Mira  ", "  Serving girl  ")  // trimmed
        )
        val parsed = parseSupportingCast(cast.toSupportingCastJson())

        assertEquals(2, parsed.size)
        assertEquals("Joren", parsed[0].name)
        assertEquals("Mira", parsed[1].name)
        assertEquals("Serving girl", parsed[1].description)

        // Empty / garbage input is tolerated.
        assertTrue(parseSupportingCast("").isEmpty())
        assertTrue(parseSupportingCast("not json").isEmpty())
        assertEquals("", emptyList<CastMember>().toSupportingCastJson())
    }

    @Test
    fun testPinsTimelineHeaders() {
        val charBundle = makeCharacterBundle()
        val pins = listOf(ChatPinRecord("pin-1", "thread-1", "branch-1", "turn-1", "A secret box.", "active", "", ""))
        val timeline = listOf(TimelineEventRecord("time-1", "thread-1", "branch-1", "turn-1", "Arrival", "We met Mara.", 4, "beat", emptyList(), emptyList(), ""))

        val prompt = PromptBuilder.buildRoleplaySystemPrompt(charBundle, null, null, pins, timeline)

        assertTrue(prompt.contains("Pinned branch facts:"))
        assertTrue(prompt.contains("Recent high-importance timeline beats:"))
    }
}
