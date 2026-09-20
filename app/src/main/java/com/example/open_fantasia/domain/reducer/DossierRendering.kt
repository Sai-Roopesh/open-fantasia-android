package com.example.open_fantasia.domain.reducer

import com.example.open_fantasia.domain.model.*

/**
 * The Continuity Snapshot as sentences.
 *
 * `<durable_state>` used to be `Json.encodeToString(PromptWorldState)`: snake_case keys, integer
 * emotions, identifiers on every record, `"is_bidirectional": true`. A model asked to write a person
 * from `{"primary_emotion": "guarded", "emotion_intensity": 7}` writes like the spreadsheet it was
 * handed, and register is contagious (commit `66d4add`, and Anthropic's own guidance: the formatting
 * style of the prompt influences the response style). The Stanford Generative Agents paper records
 * the same outcome from a similar architecture — agents "inherited overly formal speech from the
 * language model" — and their memory was already natural language. Ours was JSON.
 *
 * This is the same data as prose. Deterministic, no model, nothing summarized, nothing omitted that
 * the Stage sent: every entity the Stage put on stage is described in full, every relationship among
 * them is stated, every narrative field is printed whole. What is dropped is bookkeeping the model
 * never needed and ADR-0008 already said it should never see — identifiers, version numbers,
 * edge directionality flags — and the integer behind an emotion, which becomes an adverb.
 *
 * The completeness test that used to reflect over `PromptWorldState` field *names* now asserts field
 * *values* through this renderer, which is the stronger property: a field can be named in a prompt
 * without its content ever arriving, and cannot be valued there without it.
 */
object DossierRendering {

    const val TAG = "where_things_stand"
    const val OTHERS_TAG = "who_else"

    /**
     * @param describedAbove cast ids whose full profile is already in the system prompt (the Primary
     *   Character's voice card). They are named here and their wants stated; the three paragraphs about
     *   who they are do not arrive twice.
     */
    fun render(world: PromptWorldState?, stage: Stage, describedAbove: Set<String> = emptySet()): String {
        val out = StringBuilder()

        if (world == null) {
            out.append("This is the beginning of the story. Nothing has happened yet beyond what's above.\n\n")
        } else {
            val meta = world.metadata
            val timestamp = meta.narrative_timestamp.trim()
            val transition = when (meta.transition_type) {
                "scene_transition" -> "The scene has changed since the last exchange."
                "time_skip" -> "Time has passed since the last exchange."
                else -> "This continues straight on from the last exchange."
            }
            out.append(if (timestamp.isNotEmpty()) "It's $timestamp. $transition" else transition).append("\n\n")
            renderWhere(world.spatial_state, out)
        }

        renderPeople(world, stage, out, describedAbove)
        renderBetweenThem(stage, out)

        world?.narrative_state?.let { narrative ->
            section(out, "THE STORY SO FAR", narrative.story_summary)
            section(out, "THE SCENE", narrative.scene_summary)
            section(out, "WHAT JUST CHANGED", narrative.last_turn_beat)
        }

        return out.toString().trimEnd()
    }

    /**
     * Everyone the story knows who is not in the room. A name is the cheapest thing a prompt can carry
     * and the most expensive thing to be missing: a model that cannot see that someone exists does
     * not leave them out, it invents a second one. Returns null when there is nobody to list.
     */
    fun renderOthers(stage: Stage): String? {
        val wings = stage.entitiesAt(StageTier.Wings)
        val index = stage.entitiesAt(StageTier.Index)
        val absentCast = stage.castAt(StageTier.Wings)
        if (wings.isEmpty() && index.isEmpty() && absentCast.isEmpty()) return null

        val out = StringBuilder()
        val reachable = mutableListOf<String>()
        val seen = mutableSetOf<String>()
        absentCast.sortedBy { it.canonicalName.lowercase() }.forEach { member ->
            seen += member.canonicalName.lowercase()
            member.entityId?.let { seen += it }
            val also = member.aliases.filter { it.isNotBlank() }.takeIf { it.isNotEmpty() }?.let { " (also ${it.joinToString(", ")})" }.orEmpty()
            val about = listOf(member.roleBackground, member.personality).firstOrNull { it.isNotBlank() }?.let { " \u2014 ${it.lineSummary()}" }.orEmpty()
            val voice = member.voiceStyle.takeIf { it.isNotBlank() }?.let { " Sounds like: ${it.lineSummary(90)}" }.orEmpty()
            reachable += "${member.canonicalName}$also$about.$voice"
        }
        wings.sortedBy { it.canonical_name.lowercase() }.forEach { entity ->
            if (entity.entity_id in seen || entity.canonical_name.lowercase() in seen) return@forEach
            val also = entity.aliases.filter { it.isNotBlank() }.takeIf { it.isNotEmpty() }?.let { " (also ${it.joinToString(", ")})" }.orEmpty()
            val kind = if (entity.entity_type == "character") "" else " \u2014 ${entity.entity_type}"
            val account = entity.account.trim().takeIf { it.isNotEmpty() }?.let { " $it" }.orEmpty()
            reachable += "${entity.canonical_name}$also$kind.$account"
        }
        if (reachable.isNotEmpty()) {
            out.append("Not here right now, but could be:\n")
            reachable.forEach { out.append("- ").append(it).append('\n') }
        }
        if (index.isNotEmpty()) {
            if (out.isNotEmpty()) out.append('\n')
            out.append("Also in this story: ")
            out.append(index.sortedBy { it.canonical_name.lowercase() }.joinToString(", ") { it.canonical_name })
            out.append('.')
        }
        return out.toString().trimEnd()
    }

    private fun renderWhere(spatial: SpatialState, out: StringBuilder) {
        val here = spatial.current_location
        val lines = mutableListOf<String>()
        if (here != null) {
            val modifiers = here.environmental_modifiers.filter { it.isNotBlank() }
            val description = here.description.trim().let { if (it.isEmpty()) "" else " $it" }
            val mods = if (modifiers.isEmpty()) "" else " ${modifiers.joinToString("; ").sentence()}"
            lines += "${here.name}:$description$mods".trimEnd()
            val adjacent = spatial.adjacent_locations.map { it.name }.filter { it.isNotBlank() }
            if (adjacent.isNotEmpty()) lines += "From here you can get to ${adjacent.joinToNatural()}."
        }
        val others = spatial.known_locations.filter { it.id != here?.id }
        others.forEach { place ->
            val description = place.description.trim()
            lines += if (description.isEmpty()) "\u2014 ${place.name}" else "\u2014 ${place.name}: $description"
        }
        if (lines.isNotEmpty()) section(out, "WHERE", lines.joinToString("\n"))
    }

    /**
     * Everyone the Stage sent at full detail, as people.
     *
     * An entity and the Cast Member who is that entity are one person here, merged by entity id or,
     * failing that, by name. A Cast Member with no entity yet — every seed before the first Continuity
     * Update — is still a person and is still described in full; ADR-0014 exists because one once
     * reached the model as a bare name.
     *
     * The heading is honest about what is known. When presence was actually read, the people on stage
     * are "here" and the rest of the roster the Stage kept at full detail is "not in the room". When it
     * was not, nobody is claimed to be anywhere.
     */
    private fun renderPeople(world: PromptWorldState?, stage: Stage, out: StringBuilder, describedAbove: Set<String>) {
        val entities = stage.entitiesAt(StageTier.OnStage)
        val cast = stage.castAt(StageTier.OnStage)
        val placement = world?.spatial_state?.entity_placements.orEmpty().associateBy { it.entity_id }

        val castByEntity = cast.filter { it.entityId != null }.associateBy { it.entityId!! }
        val castByName = cast.associateBy { it.canonicalName.lowercase() }
        val merged = mutableSetOf<String>()

        val people = entities.sortedWith(
            compareBy<EntityState>(
                { (castByEntity[it.entity_id] ?: castByName[it.canonical_name.lowercase()])?.origin != "Primary Character" },
                { (castByEntity[it.entity_id] ?: castByName[it.canonical_name.lowercase()]) == null },
                { it.canonical_name.lowercase() }
            )
        ).map { entity ->
            val member = castByEntity[entity.entity_id] ?: castByName[entity.canonical_name.lowercase()]
            member?.let { merged += it.castId }
            renderPerson(entity, member, placement[entity.entity_id], describedAbove)
        }

        val castOnly = cast.filterNot { it.castId in merged }
            .sortedWith(compareBy({ it.origin != "Primary Character" }, { it.canonicalName.lowercase() }))
            .map { renderCastMember(it, describedAbove) }

        if (stage.sceneResolved) {
            section(out, "WHO'S HERE", people.joinToString("\n\n"))
            section(out, "THE REST OF THE CAST, not in the room right now", castOnly.joinToString("\n\n"))
        } else {
            section(out, "THE CAST", castOnly.joinToString("\n\n"))
            section(out, "PEOPLE AND THINGS IN THIS STORY", people.joinToString("\n\n"))
        }
    }

    /** A Cast Member as a person, with no entity record to merge with. Also the off-stage speaker's profile. */
    fun renderCastMember(member: PromptCastMember, describedAbove: Set<String> = emptySet()): String {
        val b = StringBuilder()
        val aliases = member.aliases.filter { it.isNotBlank() }
        b.append(member.canonicalName)
        if (aliases.isNotEmpty()) b.append(" (also ${aliases.joinToString(", ")})")
        b.append('.')
        appendProfile(b, member, describedAbove)
        return b.toString()
    }

    private fun appendProfile(b: StringBuilder, m: PromptCastMember, describedAbove: Set<String>) {
        if (m.castId in describedAbove) {
            line(b, "", "Described above.")
            line(b, "Wants:", m.goals)
            return
        }
        line(b, "", m.roleBackground)
        line(b, "", m.personality)
        line(b, "Sounds like:", m.voiceStyle)
        if (m.voiceSamples.isNotEmpty()) {
            line(b, "Has said:", m.voiceSamples.take(3).joinToString(" ") { "\u201C${it.trim().trim('"', '\u201C', '\u201D')}\u201D" })
        }
        line(b, "", m.appearance)
        line(b, "Wants:", m.goals)
        line(b, "Won't:", m.boundaries)
    }

    private fun renderPerson(entity: EntityState, member: PromptCastMember?, placement: EntityPlacement?, describedAbove: Set<String>): String {
        val b = StringBuilder()
        val aliases = (entity.aliases + (member?.aliases ?: emptyList())).filter { it.isNotBlank() }.distinct()
        val also = if (aliases.isEmpty()) "" else " (also ${aliases.joinToString(", ")})"
        val kind = if (entity.entity_type == "character" || member != null) "" else " \u2014 ${entity.entity_type}"
        b.append(entity.canonical_name).append(also).append(kind).append('.')

        member?.let { appendProfile(b, it, describedAbove) }
        line(b, "", entity.account)

        val emotion = entity.primary_emotion.trim()
        if (emotion.isNotEmpty()) {
            val adverb = intensityAdverb(entity.emotion_intensity)
            val since = entity.emotion_catalyst.trim().takeIf { it.isNotEmpty() }?.let { ", since ${it.lowerFirst().trimEnd('.')}" }.orEmpty()
            b.append("\n  Right now: ").append(adverb).append(emotion.lowerFirst()).append(since).append('.')
        }
        placement?.micro_position?.trim()?.takeIf { it.isNotEmpty() }?.let { b.append("\n  ").append(it.capitalFirst().trimEnd('.')).append('.') }

        bucket(b, "Knows:", entity.knowledge_boundary)
        bucket(b, "", entity.traits)
        bucket(b, "Wants:", entity.goals)
        bucket(b, "Keeping to themself:", entity.secrets)
        bucket(b, "Can:", entity.abilities)
        bucket(b, "Has:", entity.possessions)
        return b.toString()
    }

    private fun renderBetweenThem(stage: Stage, out: StringBuilder) {
        val presentIds = stage.entitiesAt(StageTier.OnStage).map { it.entity_id }.toSet()
        val lines = stage.relationships
            .filter { it.source_entity_id in presentIds || it.target_entity_id in presentIds }
            .sortedWith(compareBy({ it.source_entity_name.lowercase() }, { it.target_entity_name.lowercase() }))
            .map { r ->
                val type = r.relationship_type.trim().lowercase().takeIf { it.isNotEmpty() && it != "other" }?.let { " \u2014 $it" }.orEmpty()
                val status = r.dynamic_status.trim().takeIf { it.isNotEmpty() }?.let { ": $it" }.orEmpty()
                "${r.source_entity_name} and ${r.target_entity_name}$type$status".trimEnd('.') + "."
            }
        if (lines.isNotEmpty()) section(out, "BETWEEN THEM", lines.joinToString("\n"))
    }

    // ---- small helpers -------------------------------------------------------------------------

    private fun section(out: StringBuilder, heading: String, body: String) {
        val text = body.trim()
        if (text.isEmpty()) return
        out.append(heading).append('\n').append(text).append("\n\n")
    }

    private fun line(b: StringBuilder, label: String, value: String) {
        val text = value.trim()
        if (text.isEmpty()) return
        b.append("\n  ")
        if (label.isNotEmpty()) b.append(label).append(' ')
        b.append(text)
    }

    private fun bucket(b: StringBuilder, label: String, facts: List<FactRef>) {
        val bodies = facts.map { it.body.trim() }.filter { it.isNotEmpty() }
        if (bodies.isEmpty()) return
        b.append("\n  ")
        if (label.isNotEmpty()) b.append(label).append(' ')
        b.append(bodies.joinToString("; ") { it.trimEnd('.') }).append('.')
    }

    /**
     * The draft schema states intensity on 0–100. The number never reaches the model; the adverb does.
     */
    internal fun intensityAdverb(intensity: Int): String = when {
        intensity <= 0 -> ""
        intensity <= 25 -> "a little "
        intensity <= 60 -> ""
        intensity <= 85 -> "very "
        else -> "overwhelmingly "
    }

    private fun String.lowerFirst(): String = if (isEmpty()) this else this[0].lowercaseChar() + substring(1)
    private fun String.capitalFirst(): String = if (isEmpty()) this else this[0].uppercaseChar() + substring(1)
    private fun String.sentence(): String = trim().trimEnd('.').capitalFirst() + "."

    private fun List<String>.joinToNatural(): String = when (size) {
        0 -> ""
        1 -> this[0]
        2 -> "${this[0]} and ${this[1]}"
        else -> dropLast(1).joinToString(", ") + ", and " + last()
    }

    internal fun String.lineSummary(limit: Int = 110): String {
        val flat = trim().replace(Regex("\\s+"), " ")
        if (flat.length <= limit) return flat
        val cut = flat.take(limit)
        val boundary = cut.lastIndexOfAny(charArrayOf('.', ',', ';', ' '))
        return (if (boundary > limit / 2) cut.take(boundary) else cut).trimEnd(',', ';', ' ') + "\u2026"
    }
}
