package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.PromptBuilder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Prompt shape and the cache split.
 *
 * The earlier suite exercised `buildRoleplaySystemPrompt` and `buildStateContext`, which production
 * never called — a second prompt path kept alive only by its tests. Everything here goes through
 * [PromptBuilder.render], the one entry point. See ADR-0014.
 */
class PromptBuilderTest {

    private fun cast(name: String, id: String = "seed:$name", origin: String = "Authored by the player") =
        PromptCastMember(
            castId = id, entityId = "entity:$name", canonicalName = name, aliases = emptyList(),
            roleBackground = "$name-role", personality = "$name-personality", voiceStyle = "$name-voice",
            appearance = "", goals = "", boundaries = "", origin = origin, evidence = emptyList(),
            status = "active", speakerEligible = true
        )

    private fun world() = PromptWorldState(
        metadata = SnapshotMetadata("turn-9", "dusk", "continuation", 3),
        spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
        entity_state = emptyList(),
        relational_state = emptyList(),
        narrative_state = NarrativeState("STORY-SUMMARY", "SCENE", "BEAT", emptyList(), emptyList())
    )

    private fun context(
        story: String = "STORY-SETTING",
        world: PromptWorldState? = world(),
        cast: List<PromptCastMember> = listOf(cast("Ayushi", "primary:t", "Primary Character")),
        pins: List<ChatPinRecord> = emptyList(),
        timeline: List<TimelineEventRecord> = emptyList(),
        replyLengthTokens: Int = 4096
    ) = RoleplayContext(
        character = PromptCharacter(
            name = "Ayushi", story = story, corePersona = "CORE", appearance = "", styleRules = "",
            definition = "", negativeGuidance = "",
            exampleConversations = listOf(ExampleConversation("EX-USER", "EX-CHAR"))
        ),
        persona = null,
        directorNotes = "",
        world = world,
        cast = cast,
        activeSpeaker = cast.firstOrNull(),
        speakerMode = "single",
        pins = pins,
        timeline = timeline,
        currentUserMessage = "USER-PROSE",
        replyLengthTokens = replyLengthTokens
    )

    @Test
    fun testSystemPromptSectionsAreOrdered() {
        val prompt = PromptBuilder.render(context()).systemPrompt
        val order = listOf(
            "<role_objective>\n", "<story_setting>\n", "<character_persona>\n", "<core_directives>\n",
            "<example_conversations>\n", "<response_contract>\n", "<continuity_and_variation>\n",
            "<durable_state>\n", "<cast_roster>\n"
        )
        var cursor = -1
        for (tag in order) {
            val at = prompt.indexOf(tag)
            assertTrue("$tag is missing", at >= 0)
            assertTrue("$tag is out of order", at > cursor)
            cursor = at
        }
    }

    /**
     * The split is by rate of change, not by importance. Everything that holds still between Continuity
     * Updates belongs in the cacheable system prompt; only what changes every single reply rides on the
     * user message.
     *
     * The Cast Roster moved from the volatile suffix into the stable prefix, which is a reversal of the
     * previous design. It is stable between checkpoints, it belongs beside the world state it describes,
     * and it must be complete on every call — so editing a Cast Seed now invalidates the cached prefix.
     * That is the accepted cost of never again playing a character the model has only heard the name of.
     */
    @Test
    fun testVolatileSuffixCarriesOnlyPerReplyControls() {
        val rendered = PromptBuilder.render(context())
        assertTrue(rendered.systemPrompt.contains("<durable_state>\n"))
        assertTrue(rendered.systemPrompt.contains("<cast_roster>\n"))
        assertFalse("reply controls must not enter the cacheable prefix", rendered.systemPrompt.contains("<reply_control>\n"))
        assertFalse(rendered.systemPrompt.contains("<length_target>\n"))

        assertTrue(rendered.currentUserMessage.contains("<reply_control>\n"))
        assertTrue(rendered.currentUserMessage.contains("<length_target>\n"))
        assertTrue(rendered.currentUserMessage.contains("<drive_this_turn>\n"))
        assertFalse("the snapshot must not be repeated per reply", rendered.currentUserMessage.contains("<durable_state>\n"))
        assertFalse("cast must not be repeated per reply", rendered.currentUserMessage.contains("<cast_roster>\n"))
    }

    @Test
    fun testSelectingADifferentSpeakerLeavesThePrefixByteIdentical() {
        val roster = listOf(cast("Ayushi", "primary:t", "Primary Character"), cast("Arjun"))
        val first = PromptBuilder.render(context(cast = roster).copy(activeSpeaker = roster[0]))
        val second = PromptBuilder.render(context(cast = roster).copy(activeSpeaker = roster[1]))
        assertEquals(first.systemPrompt, second.systemPrompt)
        assertFalse(first.currentUserMessage == second.currentUserMessage)
    }

    @Test
    fun testEmptyLoreSkipsStorySetting() {
        assertFalse(PromptBuilder.render(context(story = "  ")).systemPrompt.contains("<story_setting>"))
    }

    @Test
    fun testExampleConversationsFormatting() {
        val prompt = PromptBuilder.render(context()).systemPrompt
        assertTrue(prompt.contains("USER: EX-USER"))
        assertTrue(prompt.contains("AYUSHI: EX-CHAR"))
    }

    @Test
    fun testLengthTargetReflectsTokenBudget() {
        val concise = PromptBuilder.render(context(replyLengthTokens = 750)).currentUserMessage
        val expansive = PromptBuilder.render(context(replyLengthTokens = 8192)).currentUserMessage
        assertFalse("the length directive must track the budget", concise == expansive)
    }

    @Test
    fun testAbsentSnapshotSaysSoRatherThanGoingSilent() {
        val prompt = PromptBuilder.render(context(world = null)).systemPrompt
        assertTrue(prompt.contains("<durable_state>\n"))
        assertTrue(prompt.contains("No world state has been materialized yet"))
    }

    @Test
    fun testEmptyCastSaysSoRatherThanGoingSilent() {
        val prompt = PromptBuilder.render(context(cast = emptyList())).systemPrompt
        assertTrue(prompt.contains("<cast_roster>\n"))
        assertTrue(prompt.contains("No cast has been established"))
    }

    @Test
    fun testPinsAndTimelineShareASectionWithHeaders() {
        val prompt = PromptBuilder.render(
            context(
                pins = listOf(ChatPinRecord("p1", "t", "b", null, "PIN-BODY", "active", "", "")),
                timeline = listOf(
                    TimelineEventRecord("tl1", "t", "b", "turn-9", "TL-TITLE", "TL-DETAIL", 5, "reveal", emptyList(), emptyList(), "")
                )
            )
        ).systemPrompt
        assertTrue(prompt.contains("<pins_timeline>\n"))
        assertTrue(prompt.contains("Pinned branch facts:"))
        assertTrue(prompt.contains("PIN-BODY"))
        assertTrue(prompt.contains("Recent high-importance timeline beats:"))
        assertTrue(prompt.contains("TL-DETAIL"))
    }
}
