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
        narrative_state = NarrativeState("STORY-SUMMARY", "SCENE", "BEAT")
    )

    private fun context(
        story: String = "STORY-SETTING",
        world: PromptWorldState? = world(),
        cast: List<PromptCastMember> = listOf(cast("Ayushi", "primary:t", "Primary Character")),
        pins: List<ChatPinRecord> = emptyList(),
        timeline: List<TimelineEventRecord> = emptyList(),
        replyLength: ReplyLength = ReplyLength.Full,
        revision: Revision? = null,
        sceneIntent: SceneIntent = SceneIntent.Escalate
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
        sceneIntent = sceneIntent, storyDirection = StoryDirection.Empty, recalled = emptyList(),
        pins = pins,
        timeline = timeline,
        currentUserMessage = "USER-PROSE",
        revision = revision,
        replyLength = replyLength,
        modelId = "test-model"
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
        // Renamed from <drive_this_turn>, which named one of four policies as though it were the only
        // one. What the turn block carries now depends on the Scene Intent. See [TurnPolicy].
        assertTrue(rendered.currentUserMessage.contains("<this_turn>\n"))
        assertTrue(rendered.currentUserMessage.contains("<variation_rules>\n"))
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
    fun testLengthTargetReflectsTheChosenLength() {
        val terse = PromptBuilder.render(context(replyLength = ReplyLength.Terse)).currentUserMessage
        val expansive = PromptBuilder.render(context(replyLength = ReplyLength.Expansive)).currentUserMessage
        assertFalse("the length directive must track the chosen length", terse == expansive)
        // Stated in words, because paragraphs are elastic and a model sizes them to taste: measured,
        // "roughly 3-4 paragraphs" produced 2,536 characters of Sonnet prose, about 430 words.
        assertTrue(terse.contains("words of visible prose"))
        assertFalse("the target must not withdraw its own authority", terse.contains("not a hard cap"))
    }

    @Test
    fun testLengthTargetIsTheLastThingReadBeforeGeneration() {
        val message = PromptBuilder.render(context()).currentUserMessage
        assertTrue(message.indexOf("<length_target>") > message.indexOf("USER-PROSE"))
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
        // The heading has been wrong twice, both times by promising a selection the Stage was not
        // making. It now sends the strongest beat of each era plus the recent tail, so the list covers
        // the whole story and the heading says that, in story order.
        assertTrue(prompt.contains("Beats of this story so far, oldest first:"))
        assertTrue(prompt.contains("TL-DETAIL"))
    }
}

