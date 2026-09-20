package com.example.open_fantasia.domain.reducer

import com.example.open_fantasia.domain.model.*
import kotlin.math.abs

/**
 * Everything a Roleplay Model reads, rendered from one total [RoleplayContext].
 *
 * The shape is decided by three findings about how models read a request, each measured rather than
 * assumed (see docs/plans/human-speech-refactor.md §1):
 *
 * - Naming what to avoid raises its frequency, and adherence falls as instructions multiply. So the
 *   standing instruction text is about 200 words where it was 2,400, and it says what to do.
 * - Register is contagious. A request written like a contract produces a character who talks like one,
 *   and a world state serialized as JSON produces a spreadsheet. So every block here is prose in the
 *   register the reply should have, and the Continuity Snapshot arrives as sentences ([DossierRendering]).
 * - The end of the request carries the most weight, and the voice is what the model is worst at. So the
 *   last thing read is one short [whisper][buildWhisper] — who speaks, what the scene is for, how they
 *   talk, how long — and not a JSON schema.
 *
 * The voice itself is not in the rules at all. It is in the character's own sample lines, which appear
 * three times at rising proximity to generation: in the voice card, in the dossier, and quoted in the
 * whisper. They also arrive as real dialogue turns ahead of the transcript ([RoleplayContextAssembler]),
 * which is where a demonstration does most of its work.
 *
 * The cache split is unchanged (ADR-0007): the system prompt is byte-stable per thread and per
 * checkpoint interval; everything that varies per reply rides on the current user message.
 */
object PromptBuilder {

    const val WHISPER_TAG = "whisper"
    const val SPEAKER_PROFILE_TAG = "speaker_profile"

    private fun formatSection(tag: String, content: String): String = "<$tag>\n$content\n</$tag>"

    private fun formatSection(tag: String, attribute: Pair<String, String>, content: String): String =
        "<$tag ${attribute.first}=\"${attribute.second.replace("\"", "'")}\">\n$content\n</$tag>"

    // ---- the system prompt: who, where, what's true ------------------------------------------------

    /**
     * The STATIC, per-thread prefix. Byte-stable across turns; it changes only when the character,
     * persona, notes or cast are edited, so it forms the cacheable prefix. The Continuity Snapshot follows
     * it and is byte-stable between Continuity Updates.
     */
    private fun buildSystemPrompt(context: RoleplayContext, playerName: String, primary: PromptCastMember?): String {
        val sections = mutableListOf<String>()
        val character = context.character
        val charName = character.name.trim().ifEmpty { "the character" }

        // <you>: three sentences. The whole of what used to be role_objective, core_directives and the
        // anti-echo rule stated six ways. "Pick up from the effect of it" is the anti-echo rule.
        sections.add(formatSection("you", """
            You're writing $charName's side of a story that $playerName is writing the other side of. Whoever the note at the end names is the one you're playing this turn — their words, their choices, what they notice and feel. $playerName writes $playerName. Stop where it's their move.

            What they just did has landed. Pick up from the effect of it, not the description of it.
        """.trimIndent()))

        character.story.trim().takeIf { it.isNotEmpty() }?.let { sections.add(formatSection("setting", it)) }

        sections.add(formatSection("voice_card", "name" to charName, buildVoiceCard(character, primary, charName)))

        context.persona?.let { persona -> buildPlayer(persona)?.let { sections.add(formatSection("player", "name" to persona.name.trim().ifEmpty { "the player" }, it)) } }

        buildNotes(context.directorNotes, character.styleRules, playerName, charName)?.let { sections.add(formatSection("notes", it)) }

        return sections.joinToString("\n\n")
    }

    /**
     * Who this person is and how they sound. The sample lines are the load-bearing part: a description
     * of speech is not speech. The hard limits are stated as facts about the person rather than as rules
     * about writing, because "has never been to the coast" is something a writer can hold while talking
     * and "NEVER reference locations absent from the knowledge boundary" is not.
     */
    private fun buildVoiceCard(character: PromptCharacter, primary: PromptCastMember?, charName: String): String {
        val parts = mutableListOf<String>()
        val persona = listOf(character.corePersona, character.definition).map { it.trim() }.filter { it.isNotEmpty() }
        if (persona.isNotEmpty()) parts.add(persona.joinToString("\n\n"))

        val voice = primary?.voiceStyle?.trim().orEmpty()
        if (voice.isNotEmpty()) parts.add("How $charName sounds:\n$voice")

        val samples = character.voiceSamples.ifEmpty { primary?.voiceSamples.orEmpty() }
        if (samples.isNotEmpty()) {
            parts.add("Things $charName has said, in their own words:\n" + samples.joinToString("\n") { "- ${quote(it)}" })
        }

        val limits = splitLimits(character.negativeGuidance)
        if (limits.isNotEmpty()) {
            parts.add("What's true about $charName that the story can't contradict:\n" + limits.joinToString("\n") { "- $it" })
        }

        character.appearance.trim().takeIf { it.isNotEmpty() }?.let { parts.add(it) }

        return parts.ifEmpty { listOf("Nothing has been written about $charName yet.") }.joinToString("\n\n")
    }

    private fun buildPlayer(persona: PromptPersona): String? {
        val lines = mutableListOf<String>()
        val who = listOf(persona.identity, persona.backstory).map { it.trim().trimEnd('.') }.filter { it.isNotEmpty() }
        if (who.isNotEmpty()) lines.add(who.joinToString(". ") + ".")
        persona.voiceStyle.trim().takeIf { it.isNotEmpty() }?.let { lines.add("Talks like this: $it") }
        if (persona.voiceSamples.isNotEmpty()) lines.add("Has said: " + persona.voiceSamples.take(4).joinToString(" ") { quote(it) })
        persona.goals.trim().takeIf { it.isNotEmpty() }?.let { lines.add("Wants: $it") }
        persona.boundaries.trim().takeIf { it.isNotEmpty() }?.let { lines.add("Won't: $it") }
        return lines.takeIf { it.isNotEmpty() }?.joinToString("\n")
    }

    /**
     * Standing notes, from the two people who have them. `style_rules` on the Character Sheet is the
     * author's brief on how the story is written — plot, pacing, what to steer around — which is why it
     * lives here beside the player's own notes and not in the voice card.
     */
    private fun buildNotes(directorNotes: String, styleRules: String, playerName: String, charName: String): String? {
        val blocks = mutableListOf<String>()
        directorNotes.trim().takeIf { it.isNotEmpty() }?.let { blocks.add("From $playerName, about how they want this story written:\n$it") }
        styleRules.trim().takeIf { it.isNotEmpty() }?.let { blocks.add("From $charName's author, about how this story is written:\n$it") }
        return blocks.takeIf { it.isNotEmpty() }?.joinToString("\n\n")
    }

    /**
     * The Continuity Snapshot as prose, after the static prefix. Changes only when a Continuity Update is
     * accepted or pins change, so it stays cacheable through a checkpoint interval.
     */
    private fun buildContinuityContext(
        world: PromptWorldState?,
        stage: Stage,
        pins: List<ChatPinRecord>,
        describedAbove: Set<String>
    ): String {
        val sections = mutableListOf<String>()
        sections.add(formatSection(DossierRendering.TAG, DossierRendering.render(world, stage, describedAbove)))
        DossierRendering.renderOthers(stage)?.let { sections.add(formatSection(DossierRendering.OTHERS_TAG, it)) }

        if (pins.isNotEmpty() || stage.timeline.isNotEmpty()) {
            val lines = mutableListOf<String>()
            if (pins.isNotEmpty()) {
                lines.add("Pinned:")
                lines.addAll(pins.map { "- ${it.body}" })
            }
            if (stage.timeline.isNotEmpty()) {
                if (lines.isNotEmpty()) lines.add("")
                // The Stage sends the strongest beat of each era followed by the recent tail, so the list
                // spans the whole record and the heading has to say so, or an event from a hundred turns
                // ago reads as something that just happened.
                lines.add("What's happened, oldest first:")
                lines.addAll(stage.timeline.map { "- ${it.title.trim().trimEnd('.')}: ${it.detail.trim()}" })
            }
            sections.add(formatSection("pinned", lines.joinToString("\n")))
        }
        return sections.joinToString("\n\n")
    }

    // ---- the current user message: context, prose, whisper -----------------------------------------

    /**
     * The last thing read before generation begins, and the only per-turn instruction.
     *
     * Roughly a hundred words. It replaces seven blocks — reply_control, style_override, this_turn,
     * story_direction, variation_rules, length_target, scene_report — that together ran to eight hundred
     * and ended on a JSON schema. It sits after the player's prose because that is the position with the
     * most force, and it is written the way someone leans over to a writer, because that is what it is.
     */
    private fun buildWhisper(
        context: RoleplayContext,
        stage: Stage,
        playerName: String,
        speaker: PromptCastMember?,
        speakerName: String,
        eligible: List<PromptCastMember>,
        speakerOffStage: Boolean
    ): String {
        val paragraphs = mutableListOf<String>()
        val ensemble = context.speakerMode == "ensemble"

        // Who.
        paragraphs.add(buildString {
            if (ensemble) {
                val names = eligible.map { it.canonicalName }.ifEmpty { listOf(context.character.name) }
                append("Anyone in the room can speak this time — ${names.joinToNatural()}. Keep them sounding like themselves.")
            } else {
                append("You're $speakerName now.")
                if (speakerOffStage) append(" $speakerName isn't in this scene — write from wherever they are, without bringing them into the room.")
            }
        })

        // What this scene is for, where the player wants it to go, and any revision — one paragraph.
        val steer = mutableListOf<String>()
        steer.add(TurnPolicy.directive(context.sceneIntent, playerName, context.world?.spatial_state?.adjacent_locations?.map { it.name }.orEmpty()))
        StoryDirectionRendering.render(context.storyDirection, playerName)?.let { steer.add(it) }
        paragraphs.add(steer.joinToString("\n"))
        context.revision?.let { paragraphs.add(RevisionRendering.render(it, playerName)) }

        // How they talk. The sample lines again, at the point of maximum attention, rotated so the model
        // does not see the same two every turn. Then three plain facts about speech.
        paragraphs.add(buildString {
            if (ensemble) {
                append("Each of them talks like themselves; their own lines are up in the cast. ")
            } else {
                val samples = samplesFor(speaker, context.character)
                if (samples.isNotEmpty()) {
                    append("Talk like $speakerName talks: ${rotate(samples, context.currentUserMessage).take(3).joinToString(" ") { quote(it) }} ")
                } else {
                    val style = speaker?.voiceStyle?.trim().orEmpty()
                    if (style.isNotEmpty()) append("Talk like $speakerName talks — ${style.lineSummary(140)} ") else append("Talk the way people actually talk. ")
                }
            }
            append("Contractions. Sentences that don't all come out the same length. It's fine to say something plain.")
            if (TurnPolicy.asksForAFreshOpening(context.sceneIntent)) append(" Start somewhere other than where the last reply started.")
        })

        // How long, then the room.
        paragraphs.add(ReplyLengthCalibration.directive(context.replyLength, context.modelId))
        paragraphs.add(SceneReportCodec.outputContract(
            castNames = stage.castAt(StageTier.OnStage).ifEmpty { stage.cast.map { it.member } }.map { it.canonicalName },
            playerName = context.persona?.name?.trim()?.takeIf { it.isNotEmpty() }
        ))

        return paragraphs.joinToString("\n\n")
    }

    /**
     * The one entry point. Takes the complete context and returns exactly what goes on the wire.
     *
     * There are no parameters to forget because there is one parameter, and it is total: every field of
     * [RoleplayContext] and everything it reaches is required, so a projection that drops something does
     * not compile. See ADR-0014.
     */
    fun render(context: RoleplayContext): RenderedPrompt {
        val playerName = context.persona?.name?.trim()?.takeIf { it.isNotEmpty() } ?: "the player"
        val primary = context.cast.firstOrNull { it.origin == "Primary Character" }

        val staticPrompt = buildSystemPrompt(context, playerName, primary)

        // Resolution is decided here, once, by a module with no wording in it. See [StageProjection].
        val stage = StageProjection.project(
            world = context.world,
            cast = context.cast,
            salience = context.salience,
            timeline = context.timeline,
            observedPresence = context.observedPresence
        )
        // The Primary Character is described in the voice card; the dossier names them and says what
        // they want, and does not print the same three paragraphs a second time.
        val continuity = buildContinuityContext(
            world = context.world, stage = stage, pins = context.pins,
            describedAbove = setOfNotNull(primary?.castId)
        )

        val eligible = context.cast.filter { it.status == "active" && it.speakerEligible }
            .sortedWith(compareBy<PromptCastMember>({ it.canonicalName.lowercase() }, { it.castId }))
        val speaker = if (context.speakerMode == "ensemble") null else (context.activeSpeaker ?: eligible.firstOrNull())
        val speakerName = speaker?.canonicalName ?: context.character.name.trim().ifEmpty { "the character" }
        val onStageIds = stage.castAt(StageTier.OnStage).map { it.castId }.toSet()
        val speakerOffStage = speaker != null && speaker.castId !in onStageIds

        val userParts = mutableListOf<String>()
        // Whoever is about to speak is always described in full somewhere in this request. The Stage puts
        // the scene's cast in the dossier; a speaker from outside it is described here, in the volatile
        // message, so choosing them costs one block instead of the whole prompt cache.
        if (speakerOffStage) {
            userParts.add(formatSection(SPEAKER_PROFILE_TAG, DossierRendering.renderCastMember(speaker!!)))
        }
        // Recall depends on the player's prose, so it is per-turn and rides here rather than in the prefix.
        RecallRendering.render(context.recalled, playerName, context.character.name.trim().ifEmpty { "Reply" })
            ?.let { userParts.add(formatSection(RecallRendering.TAG, it)) }
        userParts.add(context.currentUserMessage)
        userParts.add(formatSection(WHISPER_TAG, buildWhisper(context, stage, playerName, speaker, speakerName, eligible, speakerOffStage)))

        return RenderedPrompt(
            systemPrompt = "$staticPrompt\n\n$continuity",
            currentUserMessage = userParts.joinToString("\n\n")
        )
    }

    // ---- helpers -------------------------------------------------------------------------------------

    /** Which lines to quote for a speaker: their own, or the Character Sheet's when they are the primary. */
    private fun samplesFor(speaker: PromptCastMember?, character: PromptCharacter): List<String> = when {
        speaker == null -> character.voiceSamples
        speaker.voiceSamples.isNotEmpty() -> speaker.voiceSamples
        speaker.origin == "Primary Character" -> character.voiceSamples
        else -> emptyList()
    }

    /**
     * Deterministic rotation keyed on the player's prose, so the same context compiles to the same bytes
     * (a frozen request must) while consecutive turns quote different lines.
     */
    private fun rotate(samples: List<String>, key: String): List<String> {
        if (samples.size <= 1) return samples
        val offset = abs(key.hashCode()) % samples.size
        return samples.drop(offset) + samples.take(offset)
    }

    private fun quote(line: String): String = "\u201C${line.trim().trim('"', '\u201C', '\u201D')}\u201D"

    /** Hard limits, one per line or clause, as the author typed them. Nothing is dropped. */
    internal fun splitLimits(raw: String): List<String> =
        raw.split('\n', ';').map { it.trim().trimStart('-', '*', '\u2022', ' ').trim() }.filter { it.isNotEmpty() }

    private fun List<String>.joinToNatural(): String = when (size) {
        0 -> ""
        1 -> this[0]
        2 -> "${this[0]} and ${this[1]}"
        else -> dropLast(1).joinToString(", ") + ", and " + last()
    }

    private fun String.lineSummary(limit: Int): String {
        val flat = trim().replace(Regex("\\s+"), " ")
        if (flat.length <= limit) return flat
        val cut = flat.take(limit)
        val boundary = cut.lastIndexOfAny(charArrayOf('.', ',', ';', ' '))
        return (if (boundary > limit / 2) cut.take(boundary) else cut).trimEnd(',', ';', ' ') + "\u2026"
    }
}
