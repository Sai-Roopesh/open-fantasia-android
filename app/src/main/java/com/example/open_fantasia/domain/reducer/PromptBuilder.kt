package com.example.open_fantasia.domain.reducer

import com.example.open_fantasia.domain.model.*
import kotlinx.serialization.json.Json

object PromptBuilder {

    private val json = Json

    private fun formatSection(tag: String, content: String): String {
        return "<$tag>\n$content\n</$tag>"
    }

    private fun compactLabeledLines(items: List<Pair<String, String?>>): String {
        return items.mapNotNull { (label, value) ->
            val clean = value?.trim() ?: ""
            if (clean.isNotEmpty()) "$label: $clean" else null
        }.joinToString("\n")
    }

    /**
     * Maps the thread's max-output-token budget (the Response-length preset) to a concrete
     * prose-length directive. The raw token value is only a ceiling — the model stops well
     * below it on its own — so the actual length steering has to be an instruction the model
     * reads. This rides on the volatile suffix, never the cached prefix.
     */
    private fun lengthDirective(replyLengthTokens: Int): String {
        return when {
            replyLengthTokens <= 750 -> "Keep this reply tight — one short paragraph, roughly 2-4 sentences."
            replyLengthTokens <= 2048 -> "Aim for a focused reply of about 2 paragraphs."
            replyLengthTokens <= 4096 -> "Write a developed reply of roughly 3-4 paragraphs."
            replyLengthTokens <= 8192 -> "Write a rich, immersive reply of 5 or more paragraphs."
            else -> "Write at whatever length the scene genuinely needs; do not artificially shorten it."
        }
    }

    /**
     * The STATIC, per-thread system prompt: role, setting, personas, directives, examples,
     * and the response/continuity contracts. This is byte-stable across turns (it changes
     * only when the character/persona/director-notes are edited), so it forms the cacheable
     * prefix. The reachable Continuity Snapshot ([buildContinuityContext]) is appended after
     * this stable prefix and remains byte-stable between Continuity Updates. Per-attempt speaker
     * and style controls ([buildReplyControlContext]) live only on the latest user message.
     */
    fun buildSystemPrompt(
        characterBundle: CharacterBundle,
        persona: UserPersonaRecord?,
        directorNotes: String? = null,
        @Suppress("UNUSED_PARAMETER") supportingCast: List<CastMember> = emptyList()
    ): String {
        val sections = mutableListOf<String>()

        val charName = characterBundle.character.name

        // Section 1: role_objective
        val objective = """
            You are a roleplay simulation engine. $charName is the story's primary character, but the latest turn's <reply_control> selects who owns the reply.
            Play the selected Active Speaker as a proactive co-protagonist with personal goals, opinions, and agency. In Ensemble mode, follow the listed ensemble contract.
            NEVER speak, act, decide, think, feel, or narrate for the user, and never write from the user's point of view. The user controls their own character exclusively — end your reply at the point where it is their turn to act, and never put words, choices, or reactions in their mouth.
            The recent transcript already contains the exact last scene beats. Build on them instead of re-summarizing them.
            ANTI-ECHO RULE: The user's turn is already visible in the transcript — the reader saw it. NEVER repeat, paraphrase, recap, quote, or verbally acknowledge what the user just said or did. Do not have the Active Speaker narrate, comment on, or internally catalogue the user's actions, words, or choices. Instead, react implicitly through the Active Speaker's own fresh actions, dialogue, emotions, and forward-moving narrative. Show the impact of the user's move through consequences, not through restating the move itself.
        """.trimIndent()
        sections.add(formatSection("role_objective", objective))

        // Section 2: story_setting
        val story = characterBundle.character.story.trim()
        if (story.isNotEmpty()) {
            sections.add(formatSection("story_setting", story))
        }

        // Section 3: character_persona
        val charLines = compactLabeledLines(listOf(
            "Personality" to characterBundle.character.core_persona,
            "Appearance" to characterBundle.character.appearance,
            "Writing style" to characterBundle.character.style_rules,
            "Behavior rules" to characterBundle.character.definition,
            "Boundaries" to characterBundle.character.negative_guidance
        ))
        val charPersonaContent = charLines.ifEmpty { "No character guidance has been filled in yet." }
        sections.add(formatSection("character_persona", charPersonaContent))

        // Section 4: user_persona
        if (persona != null) {
            val userLines = compactLabeledLines(listOf(
                "Name" to persona.name,
                "Identity" to persona.identity,
                "Backstory" to persona.backstory,
                "Voice style" to persona.voice_style,
                "Goals" to persona.goals,
                "Boundaries" to persona.boundaries
            ))
            if (userLines.isNotEmpty()) {
                sections.add(formatSection("user_persona", userLines))
            }
        }

        // Section 4b: director_notes (per-thread user instructions)
        val notes = directorNotes?.trim()
        if (!notes.isNullOrEmpty()) {
            val dn = """
                Out-of-character directions the user has set for THIS thread. Treat them as authoritative instructions you must follow (tone, pacing, length, focus, content). They override default stylistic choices, but never the hard constraints in <durable_state> or the rule that you never act, speak, or decide for the user.
                $notes
            """.trimIndent()
            sections.add(formatSection("director_notes", dn))
        }

        // Section 5: core_directives
        val directives = """
            - You are a high-fidelity simulation engine executing a narrative reality.
            - You are bound absolutely by the constraints in <durable_state>.
            - The system prompt ends with the current <durable_state> and any pinned facts. They are authoritative continuity context, not story dialogue.
            - The latest user turn opens with <reply_control>, which selects the speaker and reply mode for this reply only.
            - COGNITIVE BOUNDARY: Under no circumstances may an entity act upon, reference, or hint at information absent from their specific knowledge_boundary in the state JSON.
            - AFFECTIVE OVERRIDE: Do not allow genre tropes to override the emotional parameters in the state. The JSON state is absolute truth.
            - SPATIAL ENFORCEMENT: Characters can only interact with entities at their current location. Characters can only move to adjacent locations.
            - Treat every field in <durable_state> as hard programmatic constraints, not fluid prose suggestions.
        """.trimIndent()
        sections.add(formatSection("core_directives", directives))

        // Section 6: example_conversations (Filtered and uppercase formatted)
        val populatedExamples = characterBundle.exampleConversations.filter {
            it.user_line.trim().isNotEmpty() || it.character_line.trim().isNotEmpty()
        }
        if (populatedExamples.isNotEmpty()) {
            val examplesContent = populatedExamples.mapIndexed { idx, ex ->
                val uLine = ex.user_line.trim().ifEmpty { "(left blank)" }
                val cLine = ex.character_line.trim().ifEmpty { "(left blank)" }
                "Example ${idx + 1}\nUSER: $uLine\n${charName.uppercase()}: $cLine"
            }.joinToString("\n\n")
            sections.add(formatSection("example_conversations", examplesContent))
        }

        // Section 7: response_contract
        val contract = """
            - React to the user's latest move through immediate in-world consequences — the Active Speaker's own actions, dialogue, body language, and emotional shifts — NOT by restating, summarizing, or verbally acknowledging what the user just did. The user's words are already in the transcript; never echo them.
            - Advance the plot by at least one concrete, NEW beat in every reply — a fresh action, decision, revelation, or shift in place. The scene must end somewhere meaningfully different from where it began.
            - Avoid restating stable facts, repeated emotional processing, or recycled body language unless something materially changed.
            - Do NOT have the Active Speaker verbally catalogue, diagnose, or comment on patterns in the user's behavior (e.g. "You caught yourself," "You're still apologizing," "That's the first time you…"). Real people rarely narrate each other's habits aloud. Show awareness through subtext and action, not exposition.
            - Prefer acting over asking. Drive the scene with your own choices rather than handing control back; if you do ask a question, attach it to a concrete action or new development so the scene still moves. Never ask more than one question, and never revisit an answered topic.
            - Never write dialogue, thoughts, decisions, or physical actions for the user.
            - Stay fully in character and never mention prompts, memory, summaries, or system instructions.
            - Treat <continuity_and_variation> as a hard constraint: no reply may echo the sentence structures, rhetorical devices, gestures, or emotional beats of the one before it.
            - End on an actionable narrative handoff that gives the user a clear opening to respond.
            - COMPLETION RULE: Always finish your response with a complete sentence and a natural stopping point, matching the length target supplied with the latest turn rather than cutting the scene short. Never stop mid-sentence, mid-paragraph, or mid-thought.
        """.trimIndent()
        sections.add(formatSection("response_contract", contract))

        // Section 7b: show_not_tell (agnostic examples of what to avoid vs what to do)
        val showNotTell = """
            SHOW, DON'T TELL — DON'T REPEAT. Never narrate what the user just did back to them. The transcript is the shared record; trust the reader's memory. Instead, show the Active Speaker's reaction through action, sensation, dialogue, and subtext. Below are character-agnostic examples.

            ❌ BAD (echoing/recapping the user's turn):
            User: *hands you a glass of water*
            Character: "You just handed me a glass of water," she said, taking it. "That was thoughtful of you to bring me water."

            ✅ GOOD (implicit reaction, forward motion):
            User: *hands you a glass of water*
            Character: Her fingers closed around the cool glass. She drank without pausing, deeper than she meant to — thirstier than she'd realized. "You're saving my life," she murmured over the rim, already looking past him toward the kitchen. "Is there food, or did that exhaust the hospitality?"

            ❌ BAD (verbally cataloguing user behavior):
            User: *apologizes again and then catches himself*
            Character: "I noticed you caught yourself that time. That's the third apology tonight. You seem to be getting better at not apologizing."

            ✅ GOOD (showing awareness through subtext):
            User: *apologizes again and then catches himself*
            Character: The corner of her mouth twitched — not a smile, not quite, but the tension in her jaw loosened a fraction. She said nothing about it. "Come on. Let's eat."

            ❌ BAD (restating user's words back):
            User: "i don't drink coffee or tea"
            Character: "You don't drink coffee," she repeated, staring at him. "Or tea. You just told me you don't drink coffee or tea."

            ✅ GOOD (reacting to the information naturally):
            User: "i don't drink coffee or tea"
            Character: Her eyebrows rose a half-inch. She set the kettle down and turned to face him fully, arms folded, reassessing. "Then what exactly are you doing in my kitchen at midnight?"

            ❌ BAD (narrating the user's action as a recap):
            User: *gently wipes a smudge from your cheek*
            Character: She felt his thumb brush the smudge from her cheek. He had wiped the dirt away. She stood there, aware that he had just touched her face and cleaned the small mark from her skin.

            ✅ GOOD (showing the effect, not restating the cause):
            User: *gently wipes a smudge from your cheek*
            Character: She went still. Not frozen — still. The kitchen fan clicked overhead. His hand was warm, and closer than anyone had been in a long time, and she didn't step back.
        """.trimIndent()
        sections.add(formatSection("show_not_tell", showNotTell))

        // Section 8: continuity_and_variation
        val continuity = """
            Every reply must read as a genuinely new beat, never a remix of your own last one. Your recent replies are in the conversation transcript below; treat their structure and content as off-limits to repeat.
            - Do NOT reuse the sentence shapes, rhythm, or opening move of your previous reply. If it opened on an action, open the next on dialogue, interiority, or the environment instead.
            - Do NOT repeat a rhetorical device you just used (lists or enumerations, rhetorical questions, ironic asides, parallel repetition). Use any one device at most once, never two replies running.
            - Do NOT re-play an emotional beat already shown. Once a feeling has landed, it is established — escalate it, complicate it, or move past it; never re-stage the same realization.
            - Do NOT reuse a physical gesture or piece of blocking from a recent beat. Reach for new, specific physicality each time.
            - Do NOT re-ask or circle back to a question or topic already raised or answered. Answered things stay answered; pull a new thread forward instead.
            - Do NOT lean on one mechanical sentence rhythm; in particular, never stack short parallel/staccato sentences into the same cadence more than once in a reply.
            - Build forward from durable_state.narrative_state.last_turn_beat — never restate or re-dramatize it — and never reopen anything listed in resolved_threads.
            Before you finish, check your draft against your previous reply AND the user's latest turn: if any sentence shape, device, gesture, beat, or content echoes either of them, rewrite that part.
        """.trimIndent()
        sections.add(formatSection("continuity_and_variation", continuity))

        return sections.joinToString("\n\n")
    }

    /**
     * Complete accepted Continuity Snapshot for the selected branch lineage. It changes only
     * when a Continuity Update is accepted (or pins change), so placing it after the static
     * system prefix keeps it authoritative and cacheable throughout the next checkpoint interval.
     */
    fun buildContinuityContext(
        snapshot: DurableMemorySnapshot?,
        pins: List<ChatPinRecord>,
        timeline: List<TimelineEventRecord>
    ): String {
        val sections = mutableListOf<String>()

        val stateContent = if (snapshot != null) {
            json.encodeToString(DurableMemorySnapshot.serializer(), snapshot)
        } else {
            "No world state has been materialized yet. This is the beginning of the story."
        }
        sections.add(formatSection("durable_state", stateContent))

        if (pins.isNotEmpty() || timeline.isNotEmpty()) {
            val lines = mutableListOf<String>()
            if (pins.isNotEmpty()) {
                lines.add("Pinned branch facts:")
                lines.addAll(pins.map { "- ${it.body}" })
            }
            if (timeline.isNotEmpty()) {
                if (lines.isNotEmpty()) lines.add("")
                lines.add("Recent high-importance timeline beats:")
                lines.addAll(timeline.map { "- [${it.importance}/5] ${it.title}: ${it.detail}" })
            }
            sections.add(formatSection("pins_timeline", lines.joinToString("\n")))
        }

        return sections.joinToString("\n\n")
    }

    /**
     * Per-attempt control carried exactly once on the latest user message. Historical user
     * messages remain raw transcript prose, preventing old snapshots and speaker controls from
     * accumulating in later Roleplay Generation Requests.
     */
    fun buildReplyControlContext(
        replyLengthTokens: Int = 4096,
        activeSpeaker: CastProfile? = null,
        castRoster: List<CastProfile> = emptyList(),
        speakerMode: String = "single"
    ): String {
        val sections = mutableListOf<String>()

        val activeCast = castRoster.filter { it.status == "active" && it.speaker_eligible && !it.player_controlled }
            .sortedWith(compareBy<CastProfile>({ it.canonical_name.lowercase() }, { it.cast_id }))
        val control = if (speakerMode == "ensemble") {
            """
                Mode: ENSEMBLE
                Multiple present cast members may speak and act. Keep voices distinct, obey each profile and knowledge boundary, and never control the player.
                Eligible cast: ${activeCast.joinToString(", ") { it.canonical_name }.ifBlank { "No eligible cast established" }}
            """.trimIndent()
        } else {
            val speaker = activeSpeaker ?: activeCast.firstOrNull()
            val profile = speaker?.let { formatCastProfile(it) } ?: "No eligible Active Speaker was resolved."
            """
                Mode: SINGLE SPEAKER
                The Active Speaker exclusively owns dialogue, deliberate action, reaction, and interiority in this reply. Other characters remain silent and may not act. Neutral environmental events are allowed. Never control the player.
                Use the authoritative Continuity Snapshot to determine whether the Active Speaker is present. If off-scene, write from their established current perspective without teleporting them.

                Active Speaker profile:
                $profile

                Other eligible cast, silent in this reply: ${activeCast.filterNot { it.cast_id == speaker?.cast_id }.joinToString(", ") { it.canonical_name }.ifBlank { "None established" }}
            """.trimIndent()
        }
        sections.add(formatSection("reply_control", control))

        val styleOverride = """
            STYLE NOTE: Earlier assistant replies in this transcript may echo or recap the user's actions — that pattern is wrong, do not imitate it. React through your character's own fresh actions, dialogue, and emotion; never narrate the user's move back to them, and never verbally catalogue their habits.
        """.trimIndent()
        sections.add(formatSection("style_override", styleOverride))

        val driveThisTurn = """
            DRIVE THIS TURN — change the situation, do not reflect it back:
            - Introduce at least one NEW element the user did not supply: an action your character takes on their own initiative, an event that intrudes on the scene, a decision, a revelation, or a shift to an adjacent place.
            - End on a development or an open door that pulls the user forward — never on a passive question that simply hands control back.
        """.trimIndent()
        sections.add(formatSection("drive_this_turn", driveThisTurn))

        // length_target — turns the Response-length preset into an actual prose instruction.
        val lengthTarget = """
            ${lengthDirective(replyLengthTokens)} This is a target for pacing, not a hard cap; always finish on a complete sentence and a natural stopping point.
        """.trimIndent()
        sections.add(formatSection("length_target", lengthTarget))

        return sections.joinToString("\n\n")
    }

    /**
     * Back-compatible combined block for non-live callers. Live Roleplay Generation Requests use
     * [buildContinuityContext] in the system prompt and [buildReplyControlContext] once on the
     * latest user message.
     */
    fun buildStateContext(
        snapshot: DurableMemorySnapshot?,
        pins: List<ChatPinRecord>,
        timeline: List<TimelineEventRecord>,
        replyLengthTokens: Int = 4096,
        activeSpeaker: CastProfile? = null,
        castRoster: List<CastProfile> = emptyList(),
        speakerMode: String = "single"
    ): String = listOf(
        buildContinuityContext(snapshot, pins, timeline),
        buildReplyControlContext(replyLengthTokens, activeSpeaker, castRoster, speakerMode)
    ).joinToString("\n\n")

    private fun formatCastProfile(profile: CastProfile): String = compactLabeledLines(listOf(
        "ID" to profile.cast_id,
        "Name" to profile.canonical_name,
        "Aliases" to profile.aliases.joinToString(", "),
        "Role/background" to profile.role_background,
        "Personality" to profile.personality,
        "Voice" to profile.voice_style,
        "Appearance" to profile.appearance,
        "Goals" to profile.goals,
        "Boundaries" to profile.boundaries
    ))

    /**
     * Back-compat combined prompt retained for callers/tests that want one string. The live chat
     * path appends [buildContinuityContext] to the system prompt and places only
     * [buildReplyControlContext] on the latest user message.
     */
    fun buildRoleplaySystemPrompt(
        characterBundle: CharacterBundle,
        persona: UserPersonaRecord?,
        snapshot: DurableMemorySnapshot?,
        pins: List<ChatPinRecord>,
        timeline: List<TimelineEventRecord>,
        directorNotes: String? = null,
        supportingCast: List<CastMember> = emptyList()
    ): String {
        val system = buildSystemPrompt(characterBundle, persona, directorNotes)
        val state = buildStateContext(snapshot, pins, timeline)
        return "$system\n\n$state"
    }
}
