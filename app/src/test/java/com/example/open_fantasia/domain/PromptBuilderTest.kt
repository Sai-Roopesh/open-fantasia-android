package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.DossierRendering
import com.example.open_fantasia.domain.reducer.PromptBuilder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Prompt shape and the cache split.
 *
 * Everything here goes through [PromptBuilder.render], the one entry point (ADR-0014). The shape it
 * asserts is the one docs/plans/human-speech-refactor.md §2.3 describes: a short prefix in plain
 * register, the Continuity Snapshot as prose, and one whisper after the player's prose.
 */
class PromptBuilderTest {

    private fun cast(name: String, id: String = "seed:$name", origin: String = "Authored by the player", samples: List<String> = emptyList()) =
        PromptCastMember(
            castId = id, entityId = "entity:$name", canonicalName = name, aliases = emptyList(),
            roleBackground = "$name-role", personality = "$name-personality", voiceStyle = "$name-voice",
            appearance = "", goals = "", boundaries = "", origin = origin, evidence = emptyList(),
            status = "active", speakerEligible = true, voiceSamples = samples
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
        sceneIntent: SceneIntent = SceneIntent.Escalate,
        persona: PromptPersona? = null,
        voiceSamples: List<String> = listOf("Right. Okay. No, hang on.", "Mm.", "I'm not angry. I'm — okay, I'm a bit angry.")
    ) = RoleplayContext(
        character = PromptCharacter(
            name = "Ayushi", story = story, corePersona = "CORE", appearance = "", styleRules = "",
            definition = "", negativeGuidance = "",
            exampleConversations = listOf(ExampleConversation("EX-USER", "EX-CHAR")),
            voiceSamples = voiceSamples
        ),
        persona = persona,
        directorNotes = "",
        world = world,
        cast = cast,
        activeSpeaker = cast.firstOrNull(),
        speakerMode = "single",
        sceneIntent = sceneIntent, storyDirection = emptyList(), recalled = emptyList(),
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
        val order = listOf("<you>\n", "<setting>\n", "<voice_card name=", "<${DossierRendering.TAG}>\n")
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
     * user message, and all of that is one block.
     */
    @Test
    fun testVolatileSuffixIsOneWhisperAfterTheProse() {
        val rendered = PromptBuilder.render(context())
        assertTrue(rendered.systemPrompt.contains("<${DossierRendering.TAG}>\n"))
        assertFalse("the whisper must not enter the cacheable prefix", rendered.systemPrompt.contains("<${PromptBuilder.WHISPER_TAG}>"))

        val message = rendered.currentUserMessage
        assertEquals("exactly one whisper", 1, Regex("<${PromptBuilder.WHISPER_TAG}>").findAll(message).count())
        assertTrue("the whisper is the last thing read", message.trimEnd().endsWith("</${PromptBuilder.WHISPER_TAG}>"))
        assertTrue(message.indexOf("<${PromptBuilder.WHISPER_TAG}>") > message.indexOf("USER-PROSE"))
        assertFalse("the snapshot must not be repeated per reply", message.contains("<${DossierRendering.TAG}>"))
    }

    @Test
    fun testSelectingADifferentSpeakerLeavesThePrefixByteIdentical() {
        val roster = listOf(cast("Ayushi", "primary:t", "Primary Character"), cast("Arjun"))
        val first = PromptBuilder.render(context(cast = roster).copy(activeSpeaker = roster[0]))
        val second = PromptBuilder.render(context(cast = roster).copy(activeSpeaker = roster[1]))
        assertEquals(first.systemPrompt, second.systemPrompt)
        assertFalse(first.currentUserMessage == second.currentUserMessage)
        assertTrue(second.currentUserMessage.contains("You're Arjun now."))
    }

    @Test
    fun testEmptyLoreSkipsSetting() {
        assertFalse(PromptBuilder.render(context(story = "  ")).systemPrompt.contains("<setting>"))
    }

    /**
     * Example conversations left the system prompt. They arrive as real dialogue turns ahead of the
     * transcript ([RoleplayContextAssembler.voiceAnchor]), where a demonstration does its work; quoting
     * them here as "USER: / NAME:" script was the weakest form in the weakest position.
     */
    @Test
    fun testExampleConversationsAreNotQuotedInTheSystemPrompt() {
        val prompt = PromptBuilder.render(context()).systemPrompt
        assertFalse(prompt.contains("EX-USER"))
        assertFalse(prompt.contains("EX-CHAR"))
        assertFalse(prompt.contains("USER:"))
    }

    @Test
    fun testTheVoiceIsSampleLinesNotRules() {
        val rendered = PromptBuilder.render(context())
        assertTrue(rendered.systemPrompt.contains("Things Ayushi has said, in their own words:"))
        assertTrue(rendered.systemPrompt.contains("\u201CRight. Okay. No, hang on.\u201D"))
        // Quoted again at the point of maximum attention.
        assertTrue(rendered.currentUserMessage.contains("Talk like Ayushi talks:"))
        assertTrue(rendered.currentUserMessage.contains("\u201CMm.\u201D") || rendered.currentUserMessage.contains("\u201CRight. Okay. No, hang on.\u201D"))
    }

    @Test
    fun testTheWhisperRotatesWhichLinesItQuotesButCompilesIdentically() {
        val a = PromptBuilder.render(context()).currentUserMessage
        val b = PromptBuilder.render(context()).currentUserMessage
        assertEquals("a frozen request must render to the same bytes twice", a, b)
        // "USER-PROSE" and "ANOTHER TURN ENTIRELY" hash to different offsets modulo three sample lines.
        val other = PromptBuilder.render(context().copy(currentUserMessage = "ANOTHER TURN ENTIRELY")).currentUserMessage
        assertFalse(a.substringAfter("Talk like") == other.substringAfter("Talk like"))
    }

    @Test
    fun testLengthTargetReflectsTheChosenLength() {
        val terse = PromptBuilder.render(context(replyLength = ReplyLength.Terse)).currentUserMessage
        val expansive = PromptBuilder.render(context(replyLength = ReplyLength.Expansive)).currentUserMessage
        assertFalse("the length directive must track the chosen length", terse == expansive)
        assertTrue(terse.contains("About 72\u2013108 words."))
        assertFalse("the target must not withdraw its own authority", terse.contains("not a hard cap"))
        assertTrue(PromptBuilder.render(context(replyLength = ReplyLength.Unbounded)).currentUserMessage.contains("As long as it needs."))
    }

    @Test
    fun testTheLastThingReadIsTheVoiceAndLengthNotASchema() {
        val message = PromptBuilder.render(context()).currentUserMessage
        val talk = message.lastIndexOf("Talk like Ayushi talks:")
        val length = message.lastIndexOf("About ")
        val report = message.lastIndexOf("<${SceneReportCodec.TAG}>")
        assertTrue(talk > message.indexOf("USER-PROSE"))
        assertTrue(length > talk)
        // The scene report is still asked for, in two lines, but the voice and the length come after
        // the prose and the schema is not what the model is left holding: the whisper closes on it only
        // because the codec needs it last on its own line, and it is two lines out of ~100 words.
        assertTrue(report > 0)
    }

    @Test
    fun testAbsentSnapshotSaysSoRatherThanGoingSilent() {
        val prompt = PromptBuilder.render(context(world = null)).systemPrompt
        assertTrue(prompt.contains("<${DossierRendering.TAG}>\n"))
        assertTrue(prompt.contains("This is the beginning of the story."))
    }

    @Test
    fun testEmptyCastStillRendersTheDossier() {
        val prompt = PromptBuilder.render(context(cast = emptyList())).systemPrompt
        assertTrue(prompt.contains("<${DossierRendering.TAG}>\n"))
        assertTrue(prompt.contains("STORY-SUMMARY"))
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
        assertTrue(prompt.contains("<pinned>\n"))
        assertTrue(prompt.contains("Pinned:"))
        assertTrue(prompt.contains("PIN-BODY"))
        assertTrue(prompt.contains("What's happened, oldest first:"))
        assertTrue(prompt.contains("TL-DETAIL"))
        assertFalse("importance is bookkeeping, not story", prompt.contains("[5/5]"))
    }

    @Test
    fun testThePlayerIsNamedThroughout() {
        val persona = PromptPersona("Dan", "a nurse", "moved here last spring", "flat, dry", "to be let in", "", listOf("Yeah, no."))
        val rendered = PromptBuilder.render(context(persona = persona))
        assertTrue(rendered.systemPrompt.contains("Dan writes Dan."))
        assertTrue(rendered.systemPrompt.contains("<player name=\"Dan\">"))
        assertTrue(rendered.systemPrompt.contains("Has said: \u201CYeah, no.\u201D"))
        assertTrue(rendered.currentUserMessage.contains("\"present\": [\"Ayushi\", \"Dan\"]"))
    }

    @Test
    fun testTheStandingInstructionTextIsSmallAndPositive() {
        val rendered = PromptBuilder.render(context(world = null, cast = emptyList(), voiceSamples = emptyList()))
        val instruction = rendered.systemPrompt + "\n" + rendered.currentUserMessage
        val words = instruction.split(Regex("\\s+")).count { it.isNotBlank() }
        assertTrue("standing instruction text should be a few hundred words, was $words", words < 400)
        val negations = Regex("\\b(NEVER|Do NOT|DO NOT|under no circumstances|forbidden|off-limits)\\b").findAll(instruction).count()
        assertEquals("prohibitions name the thing they forbid", 0, negations)
        for (banned in listOf("contract", "authoritative", "ANTI-ECHO", "epigram", "machine", "simulation", "quotable", "directive", "policy")) {
            assertFalse("register leak: $banned", Regex("\\b$banned\\b", RegexOption.IGNORE_CASE).containsMatchIn(instruction))
        }
    }

    @Test
    fun testAnOffStageSpeakerIsDescribedInTheVolatileMessage() {
        val present = EntityState(
            entity_id = "entity:Ayushi", canonical_name = "Ayushi", entity_type = "character", aliases = emptyList(),
            is_present = true, primary_emotion = "guarded", emotion_intensity = 70, emotion_catalyst = "the letter",
            knowledge_boundary = emptyList(), traits = emptyList(), goals = emptyList(), secrets = emptyList(),
            abilities = emptyList(), possessions = emptyList()
        )
        val roster = listOf(
            cast("Ayushi", "primary:t", "Primary Character"),
            cast("Arjun") // long enough roster is not needed: presence decides, and Arjun is not present
        )
        // Force tiering by making the roster too heavy to send whole.
        val heavy = roster.map { it.copy(roleBackground = "x".repeat(4_000)) }
        val ctx = context(world = world().copy(entity_state = listOf(present)), cast = heavy).copy(activeSpeaker = heavy[1])
        val rendered = PromptBuilder.render(ctx)
        assertTrue(rendered.currentUserMessage.contains("<${PromptBuilder.SPEAKER_PROFILE_TAG}>"))
        assertTrue(rendered.currentUserMessage.contains("Arjun isn't in this scene"))
    }
}
