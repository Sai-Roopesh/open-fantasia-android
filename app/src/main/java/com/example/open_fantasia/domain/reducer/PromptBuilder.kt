package com.example.open_fantasia.domain.reducer

import com.example.open_fantasia.domain.model.*
import kotlinx.serialization.json.Json

object PromptBuilder {

    private val json = Json { encodeDefaults = true }

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
     * The STATIC, per-thread system prompt: role, setting, personas, directives, examples,
     * and the response/continuity contracts. This is byte-stable across turns (it changes
     * only when the character/persona/director-notes are edited), so it forms the cacheable
     * prefix. The reachable Continuity Snapshot ([buildContinuityContext]) is appended after
     * this stable prefix and remains byte-stable between Continuity Updates. Per-attempt speaker
     * and style controls ([buildReplyControlContext]) live only on the latest user message.
     */
    private fun buildSystemPrompt(
        character: PromptCharacter,
        persona: PromptPersona?,
        directorNotes: String
    ): String {
        val sections = mutableListOf<String>()

        val charName = character.name

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
        val story = character.story.trim()
        if (story.isNotEmpty()) {
            sections.add(formatSection("story_setting", story))
        }

        // Section 3: character_persona
        val charLines = compactLabeledLines(listOf(
            "Personality" to character.corePersona,
            "Appearance" to character.appearance,
            "Writing style" to character.styleRules,
            "Behavior rules" to character.definition,
            "Boundaries" to character.negativeGuidance
        ))
        val charPersonaContent = charLines.ifEmpty { "No character guidance has been filled in yet." }
        sections.add(formatSection("character_persona", charPersonaContent))

        // Section 4: user_persona
        if (persona != null) {
            val userLines = compactLabeledLines(listOf(
                "Name" to persona.name,
                "Identity" to persona.identity,
                "Backstory" to persona.backstory,
                "Voice style" to persona.voiceStyle,
                "Goals" to persona.goals,
                "Boundaries" to persona.boundaries
            ))
            if (userLines.isNotEmpty()) {
                sections.add(formatSection("user_persona", userLines))
            }
        }

        // Section 4b: director_notes (per-thread user instructions)
        val notes = directorNotes.trim()
        if (notes.isNotEmpty()) {
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
        val populatedExamples = character.exampleConversations.filter {
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
            - COMPLETION RULE: Always finish on a complete sentence and a natural stopping point, at the length the latest turn's <length_target> asks for. Reaching that length is where the reply ends, not a limit to write past; a beat that is finished sooner should stop sooner. Never stop mid-sentence, mid-paragraph, or mid-thought.
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

            LENGTH IS NOT PART OF THE LESSON. Every ✅ example above is written at one length because it is
            demonstrating what to do, not how much of it to do. Take the technique and write it at the
            length the latest turn's <length_target> asks for; a shorter reply using the same technique is
            a correct reply, not a worse one.
        """.trimIndent()
        sections.add(formatSection("show_not_tell", showNotTell))

        // Section 8: continuity_and_variation
        // The rules that hold whatever this scene is for. The ones that depend on it — whether a landed
        // feeling may be returned to — are rendered with the turn policy instead, because a rule against
        // dwelling is correct while a scene is moving and wrong while it is meant to stay put.
        val continuity = """
            Every reply must read as a genuinely new beat, never a remix of your own last one. Your recent replies are in the conversation transcript below; treat their structure and content as off-limits to repeat.
            The latest turn's <variation_rules> state which repetitions are forbidden for this reply.
            - Build forward from durable_state.narrative_state.last_turn_beat — never restate or re-dramatize it.
            Before you finish, check your draft against your previous reply AND the user's latest turn: if any sentence shape, device, or gesture echoes either of them, rewrite that part.
        """.trimIndent()
        sections.add(formatSection("continuity_and_variation", continuity))

        return sections.joinToString("\n\n")
    }

    /**
     * Complete accepted Continuity Snapshot for the selected branch lineage. It changes only
     * when a Continuity Update is accepted (or pins change), so placing it after the static
     * system prefix keeps it authoritative and cacheable throughout the next checkpoint interval.
     */
    private fun buildContinuityContext(
        world: PromptWorldState?,
        stage: Stage,
        pins: List<ChatPinRecord>,
        sceneIntent: SceneIntent,
        recalled: List<RecalledExchange>
    ): String {
        val sections = mutableListOf<String>()

        // durable_state carries the scene at full fidelity. Everyone else is reachable below rather than
        // serialized here, which is the whole of the Stage's effect on this section. See [Stage].
        val stateContent = if (world != null) {
            json.encodeToString(
                PromptWorldState.serializer(),
                world.copy(
                    entity_state = stage.entitiesAt(StageTier.OnStage),
                    relational_state = stage.relationships
                )
            )
        } else {
            "No world state has been materialized yet. This is the beginning of the story."
        }
        sections.add(formatSection("durable_state", stateContent))


        // Everyone the story knows who is not in the room. A name is the cheapest thing a prompt can
        // carry and the most expensive thing to be missing: a model that cannot see that someone exists
        // does not leave them out, it invents a second one.
        val wings = stage.entitiesAt(StageTier.Wings)
        val index = stage.entitiesAt(StageTier.Index)
        if (wings.isNotEmpty() || index.isNotEmpty()) {
            val lines = mutableListOf<String>()
            lines.add("Established, not in the current scene. Ask for anyone here by name and they can enter; never invent a second person who already appears below.")
            if (wings.isNotEmpty()) {
                lines.add("")
                lines.add("Reachable now:")
                // An Entity Account is already the bounded statement of who someone is, written for
                // exactly this purpose. Sending it here costs a line and saves the model guessing at a
                // character it can reach but cannot see. See docs/plans/memory-hierarchy.md.
                lines.addAll(wings.sortedBy { it.canonical_name.lowercase() }.map { entity ->
                    val aliases = entity.aliases.filter { it.isNotBlank() }
                    val also = if (aliases.isEmpty()) "" else " (also ${aliases.joinToString(", ")})"
                    val account = entity.account.trim().takeIf { it.isNotEmpty() }?.let { " — $it" }.orEmpty()
                    "- ${entity.canonical_name}$also — ${entity.entity_type}$account"
                })
            }
            if (index.isNotEmpty()) {
                lines.add("")
                lines.add("Also established:")
                lines.add(index.sortedBy { it.canonical_name.lowercase() }.joinToString(", ") { it.canonical_name })
            }
            sections.add(formatSection("off_stage", lines.joinToString("\n")))
        }

        // Membership is complete on every call and profile detail follows the scene. ADR-0014 required
        // the first and was read as requiring the second, which sent twenty full profiles to describe a
        // room holding four people.
        val castContent = if (stage.cast.isEmpty()) {
            "No cast has been established for this thread yet."
        } else {
            val order = compareBy<PromptCastMember>({ it.origin != "Primary Character" }, { it.canonicalName.lowercase() }, { it.castId })
            val present = stage.castAt(StageTier.OnStage).sortedWith(order)
            val absent = stage.castAt(StageTier.Wings).sortedWith(order)
            val blocks = mutableListOf<String>()
            if (present.isNotEmpty()) {
                blocks.add("In this scene:\n\n" + present.joinToString("\n\n") { formatCastProfile(it) })
            }
            if (absent.isNotEmpty()) {
                blocks.add(
                    "Established cast, not in this scene. Every one of them is real and speakable; " +
                        "select any as Active Speaker and their full profile arrives with that reply.\n" +
                        absent.joinToString("\n") { member ->
                            val detail = listOf(member.roleBackground, member.personality)
                                .firstOrNull { it.isNotBlank() }?.let { " — ${it.lineSummary()}" } ?: ""
                            "- ${member.canonicalName}$detail"
                        }
                )
            }
            blocks.joinToString("\n\n")
        }
        sections.add(formatSection("cast_roster", castContent))

        // The Record, reached. Everything older than the Transcript Window otherwise arrives only as
        // extraction, and extraction is lossy by construction. See [ExchangeRecall].
        RecallRendering.render(recalled)?.let {
            sections.add(formatSection(RecallRendering.TAG, it))
        }

        if (pins.isNotEmpty() || stage.timeline.isNotEmpty()) {
            val lines = mutableListOf<String>()
            if (pins.isNotEmpty()) {
                lines.add("Pinned branch facts:")
                lines.addAll(pins.map { "- ${it.body}" })
            }
            if (stage.timeline.isNotEmpty()) {
                if (lines.isNotEmpty()) lines.add("")
                // Not "most recent". The Stage sends the strongest beat of each era of the story
                // followed by the recent tail, so the list spans the whole record and the heading has
                // to say so or the model reads an event from a hundred turns ago as something that
                // just happened.
                lines.add("Beats of this story so far, oldest first:")
                lines.addAll(stage.timeline.map { "- [${it.importance}/5] ${it.title}: ${it.detail}" })
            }
            sections.add(formatSection("pins_timeline", lines.joinToString("\n")))
        }

        return sections.joinToString("\n\n")
    }

    /** One clause of an authored field, for a roster line that names someone without describing them. */
    private fun String.lineSummary(limit: Int = 110): String {
        val flat = trim().replace(Regex("\\s+"), " ")
        if (flat.length <= limit) return flat
        val cut = flat.take(limit)
        val boundary = cut.lastIndexOfAny(charArrayOf('.', ',', ';', ' '))
        return (if (boundary > limit / 2) cut.take(boundary) else cut).trimEnd(',', ';', ' ') + "…"
    }

    /**
     * Per-attempt control carried exactly once on the latest user message. Historical user
     * messages remain raw transcript prose, preventing old snapshots and speaker controls from
     * accumulating in later Roleplay Generation Requests.
     */
    private fun buildReplyControlContext(
        replyLength: ReplyLength,
        modelId: String,
        activeSpeaker: PromptCastMember?,
        castRoster: List<PromptCastMember>,
        speakerMode: String,
        sceneIntent: SceneIntent,
        storyDirection: StoryDirection,
        speakersNeedingProfile: List<PromptCastMember> = emptyList()
    ): String {
        val sections = mutableListOf<String>()

        val activeCast = castRoster.filter { it.status == "active" && it.speakerEligible }
            .sortedWith(compareBy<PromptCastMember>({ it.canonicalName.lowercase() }, { it.castId }))
        val control = if (speakerMode == "ensemble") {
            """
                Mode: ENSEMBLE
                Multiple present cast members may speak and act. Keep voices distinct, obey each profile and knowledge boundary, and never control the player.
                Eligible cast: ${activeCast.joinToString(", ") { it.canonicalName }.ifBlank { "No eligible cast established" }}
            """.trimIndent()
        } else {
            val speaker = activeSpeaker ?: activeCast.firstOrNull()
            // Names only, deliberately: every profile is already in <cast_roster>. This selects, it
            // does not describe.
            """
                Mode: SINGLE SPEAKER
                Active Speaker: ${speaker?.canonicalName ?: "No eligible Active Speaker was resolved."} (${speaker?.castId ?: "none"})
                Their full profile is in <cast_roster>, along with every other member of this thread's cast.
                The Active Speaker exclusively owns dialogue, deliberate action, reaction, and interiority in this reply. Other characters remain silent and may not act. Neutral environmental events are allowed. Never control the player.
                Use the authoritative Continuity Snapshot to determine whether the Active Speaker is present. If off-scene, write from their established current perspective without teleporting them.

                Other eligible cast, silent in this reply: ${activeCast.filterNot { it.castId == speaker?.castId }.joinToString(", ") { it.canonicalName }.ifBlank { "None established" }}
            """.trimIndent()
        }
        sections.add(formatSection("reply_control", control))

        // Whoever is about to speak is always described in full somewhere in this request. The Stage puts
        // the scene's cast in <cast_roster>; anyone speaking from outside it is described here.
        val speaking = if (speakerMode == "ensemble") activeCast else listOfNotNull(activeSpeaker ?: activeCast.firstOrNull())
        val owed = speaking.filter { speaker -> speakersNeedingProfile.any { it.castId == speaker.castId } }
        if (owed.isNotEmpty()) {
            sections.add(formatSection(
                "speaker_profile",
                "Full profile for this reply's speaker, who is established but not in the scene described by <durable_state>.\n\n" +
                    owed.joinToString("\n\n") { formatCastProfile(it) }
            ))
        }

        val styleOverride = """
            STYLE NOTE: Earlier assistant replies in this transcript may echo or recap the user's actions — that pattern is wrong, do not imitate it. React through your character's own fresh actions, dialogue, and emotion; never narrate the user's move back to them, and never verbally catalogue their habits.
        """.trimIndent()
        sections.add(formatSection("style_override", styleOverride))

        // One policy, selected, never appended to another. See [TurnPolicy].
        sections.add(formatSection("this_turn", TurnPolicy.directive(sceneIntent)))

        // The player's own direction, beside the policy that decides whether this reply moves at all.
        StoryDirectionRendering.render(storyDirection)?.let {
            sections.add(formatSection(StoryDirectionRendering.TAG, it))
        }

        sections.add(formatSection("variation_rules", TurnPolicy.variationRules(sceneIntent)))

        return sections.joinToString("\n\n")
    }

    /**
     * The last thing read before generation begins.
     *
     * Length used to be stated before the player's prose, inside a block of controls, in a request of
     * 96,500 tokens — and then withdrawn in its own second clause, which called it "a target for pacing,
     * not a hard cap" while the response contract separately asked the model to finish "rather than
     * cutting the scene short". Two instructions arguing, both losing.
     *
     * It sits after the prose now because that is the position with the most force and it costs nothing:
     * the current user message is never cached, so nothing about prompt reuse changes.
     */
    private fun buildOutputContract(
        replyLength: ReplyLength,
        modelId: String,
        castNames: List<String>
    ): String = listOf(
        formatSection("length_target", ReplyLengthCalibration.directive(replyLength, modelId)),
        formatSection("scene_report", SceneReportCodec.outputContract(castNames))
    ).joinToString("\n\n")

    /**
     * Back-compatible combined block for non-live callers. Live Roleplay Generation Requests use
     * [buildContinuityContext] in the system prompt and [buildReplyControlContext] once on the
     * latest user message.
     */

    /**
     * The one entry point. Takes the complete context and returns exactly what goes on the wire.
     *
     * There are no parameters to forget because there is one parameter, and it is total: every field of
     * [RoleplayContext] and everything it reaches is required, so a projection that drops something does
     * not compile. Three separate leaks — a suppressed parameter, a discarded list, and fields lost to a
     * serializer default — all came from context arriving here as scattered arguments. See ADR-0014.
     */
    /**
     * A Cast Profile as the model reads it. Every authored field, not the nine that used to fit in a
     * reply control: the roster is the only place cast is described now, so nothing may be dropped here.
     * Status and speaker eligibility are stated rather than implied, because they used to vanish
     * whenever they held their default value.
     */
    private fun formatCastProfile(profile: PromptCastMember): String = compactLabeledLines(listOf(
        "ID" to profile.castId,
        "Name" to profile.canonicalName,
        "Aliases" to profile.aliases.joinToString(", "),
        "Role/background" to profile.roleBackground,
        "Personality" to profile.personality,
        "Voice" to profile.voiceStyle,
        "Appearance" to profile.appearance,
        "Goals" to profile.goals,
        "Boundaries" to profile.boundaries,
        "Origin" to profile.origin,
        "Evidence" to profile.evidence.joinToString("; "),
        "Status" to profile.status,
        "Speaks" to if (profile.speakerEligible) "eligible to speak" else "not eligible to speak",
        "World entity" to profile.entityId.orEmpty()
    ))

    fun render(context: RoleplayContext): RenderedPrompt {
        val staticPrompt = buildSystemPrompt(
            character = context.character,
            persona = context.persona,
            directorNotes = context.directorNotes
        )
        // Resolution is decided here, once, by a module with no wording in it. See [StageProjection].
        val stage = StageProjection.project(
            world = context.world,
            cast = context.cast,
            salience = context.salience,
            timeline = context.timeline,
            observedPresence = context.observedPresence
        )
        val continuity = buildContinuityContext(
            world = context.world,
            stage = stage,
            pins = context.pins,
            sceneIntent = context.sceneIntent,
            recalled = context.recalled
        )
        val replyControl = buildReplyControlContext(
            replyLength = context.replyLength,
            modelId = context.modelId,
            activeSpeaker = context.activeSpeaker,
            castRoster = context.cast,
            speakerMode = context.speakerMode,
            sceneIntent = context.sceneIntent,
            storyDirection = context.storyDirection,
            // A speaker the scene does not hold is described here rather than in the cached prefix, so
            // choosing them costs one volatile block instead of the whole prompt cache.
            speakersNeedingProfile = context.cast.filterNot { member ->
                stage.castAt(StageTier.OnStage).any { it.castId == member.castId }
            }
        )
        // After the player's prose and before the output contract: adjacent to generation, and plainly
        // not something the player said. See [RevisionRendering].
        val revision = context.revision
            ?.let { formatSection(RevisionRendering.TAG, RevisionRendering.render(it)) }
            ?.let { "\n\n$it" }
            .orEmpty()
        val outputContract = buildOutputContract(
            context.replyLength, context.modelId,
            castNames = stage.cast.map { it.member.canonicalName }
        )
        return RenderedPrompt(
            systemPrompt = "$staticPrompt\n\n$continuity",
            currentUserMessage = "$replyControl\n\n${context.currentUserMessage}$revision\n\n$outputContract"
        )
    }
}
