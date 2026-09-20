package com.example.open_fantasia.domain.model

/**
 * How much of a record reaches a Roleplay Model for one reply.
 *
 * Not an importance ranking. A character in [Index] is exactly as true as one [OnStage]; the story
 * simply has nothing to do with them this beat, so their secrets and knowledge boundaries are weight
 * the model would carry without using. Their name still arrives, because a model that cannot see a name
 * cannot call that person into the scene and will happily invent a second one instead.
 */
enum class StageTier { OnStage, Wings, Index }

data class StagedEntity(val tier: StageTier, val entity: EntityState)

data class StagedCastMember(val tier: StageTier, val member: PromptCastMember)

/**
 * What the Continuity Snapshot looks like from where this reply is being written.
 *
 * The Snapshot is an archive: independently valid, complete, and permanent. That is the right shape for
 * truth and the wrong shape for a prompt, and until now they were the same object rendered whole. One
 * thread reached 96,500 tokens per reply, of which 88% was accumulated state and 2.3% described how to
 * write; four of its 304 entities were in the room.
 *
 * A Stage is that Snapshot read from one moment. Nothing is omitted and nothing is summarized: every
 * entity and every Cast Member is present at some tier, so the archive stays reachable while the prose
 * detail goes to the people actually in the scene. Selection is deterministic and carries no model, for
 * the same reason the Continuity Compiler carries none — a lossy judgment in this position would be a new
 * way to lose continuity.
 */
data class Stage(
    val entities: List<StagedEntity>,
    val cast: List<StagedCastMember>,
    val relationships: List<RelationalState>,
    val timeline: List<TimelineEventRecord>,
    /** What a budget forced out, reported rather than dropped quietly. Empty when nothing was cut. */
    val omissions: List<String>
) {
    fun entitiesAt(tier: StageTier): List<EntityState> =
        entities.filter { it.tier == tier }.map { it.entity }

    fun castAt(tier: StageTier): List<PromptCastMember> =
        cast.filter { it.tier == tier }.map { it.member }
}

/**
 * Section ceilings, in characters of rendered JSON or prose.
 *
 * ADR-0007 already holds that a request too large to deliver fails visibly and no adapter may quietly
 * truncate it. That protected the whole request and nothing inside it, so the share of the prompt
 * describing how to write slid from meaningful to 2.3% across twelve days with nothing to notice. These
 * give each section an owner. Exceeding one demotes the least salient records a tier and says so, which
 * is a bounded loss of detail rather than an unbounded loss of instruction.
 */
data class StageBudget(
    val onStageChars: Int = 30_000,
    val wingsChars: Int = 8_000,
    /** How many timeline beats reach one reply, across the whole record. */
    val timelineEvents: Int = 32,
    /** How many of those are reserved for the beats immediately behind this scene. */
    val recentTimelineEvents: Int = 12,
    /** Below this, the whole Cast Roster is sent at full detail. Tiering a small cast buys nothing. */
    val fullRosterChars: Int = 6_000
) {
    companion object { val Default = StageBudget() }
}

object StageProjection {

    /**
     * Reads a Snapshot from the moment this reply is written.
     *
     * Presence drives everything. An entity is [StageTier.OnStage] when the Snapshot says it is present or
     * places it in the current location. [StageTier.Wings] holds everyone the scene can reach without a
     * summary: the rest of the Cast Roster, anyone in a relationship with someone present, and anyone an
     * open thread names. Everything else keeps its name.
     *
     * The Active Speaker is deliberately not an input. Selecting a different speaker must leave the
     * system prompt byte-identical or the provider prompt cache is lost on every speaker change, which
     * ADR-0007 depends on; a speaker who is off-stage is described in the per-turn reply control instead,
     * where volatile things belong.
     *
     * [salience] only ever decides order. It is never a cutoff, so a character cannot fall out of the
     * prompt for having been away a while — only for being the least recently used record in a section
     * that has run out of room, and Cast Members are exempt even from that.
     */
    fun project(
        world: PromptWorldState?,
        cast: List<PromptCastMember>,
        salience: Map<String, Int>,
        timeline: List<TimelineEventRecord>,
        observedPresence: Set<String> = emptySet(),
        budget: StageBudget = StageBudget.Default
    ): Stage {
        val omissions = mutableListOf<String>()
        val entities = world?.entity_state.orEmpty()
        val relationships = world?.relational_state.orEmpty()
        val currentLocationId = world?.spatial_state?.current_location?.id
        val placedHere = world?.spatial_state?.entity_placements.orEmpty()
            .filter { it.location_id == currentLocationId }
            .map { it.entity_id }
            .toSet()

        val castEntityIds = cast.mapNotNull { it.entityId }.toSet()

        // A reply that reported its own room outranks a snapshot, because it is newer. The Continuity
        // Update is the authority on what is true; it is fifteen exchanges behind on who is standing
        // here. When no reply has reported one, the snapshot is all there is and stands unchallenged.
        val observed = observedPresence.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
        val onStage = LinkedHashSet<String>()
        if (observed.isEmpty()) {
            entities.forEach { if (it.is_present || it.entity_id in placedHere) onStage.add(it.entity_id) }
        } else {
            entities.forEach { entity ->
                val names = (listOf(entity.canonical_name) + entity.aliases).map { it.trim().lowercase() }
                if (names.any { it in observed }) onStage.add(entity.entity_id)
            }
        }

        // No scene, no tiering. A thread before its first Continuity Update has no presence to read, and
        // a snapshot can say nobody is anywhere. Resolving by a stage that does not exist would send a
        // roster of bare names, which is the exact defect ADR-0014 was written to remove — so when
        // nothing is on stage, everything is.
        if (onStage.isEmpty()) {
            return Stage(
                entities = entities.map { StagedEntity(StageTier.OnStage, it) },
                cast = cast.map { StagedCastMember(StageTier.OnStage, it) },
                relationships = relationships,
                timeline = selectTimeline(timeline, emptySet(), budget),
                omissions = if (timeline.size > budget.timelineEvents)
                    listOf("${timeline.size - budget.timelineEvents} timeline beats between the ones shown")
                else emptyList()
            )
        }

        val wings = LinkedHashSet<String>()
        wings += castEntityIds
        relationships.forEach { relation ->
            if (relation.source_entity_id in onStage) wings += relation.target_entity_id
            if (relation.target_entity_id in onStage) wings += relation.source_entity_id
        }
        wings -= onStage

        // Least salient first, so a budget spends its room on what the story most recently used. Ties
        // break on identifier, because a projection that reorders itself between two identical calls is
        // not one the frozen Roleplay Generation Request can be built from.
        val leastSalientFirst = compareBy<EntityState>({ salience[it.entity_id] ?: 0 }, { it.entity_id })
        val protectedIds = castEntityIds + onStage

        var staged = entities.map {
            StagedEntity(
                tier = when {
                    it.entity_id in onStage -> StageTier.OnStage
                    it.entity_id in wings -> StageTier.Wings
                    else -> StageTier.Index
                },
                entity = it
            )
        }

        staged = demoteUntilWithin(
            staged, StageTier.OnStage, StageTier.Wings, budget.onStageChars,
            weigh = { approximateSize(it) }, order = leastSalientFirst,
            keep = { it.entity_id in onStage }, omissions = omissions, label = "on stage"
        )
        staged = demoteUntilWithin(
            staged, StageTier.Wings, StageTier.Index, budget.wingsChars,
            weigh = { it.canonical_name.length + 48 }, order = leastSalientFirst,
            keep = { it.entity_id in protectedIds }, omissions = omissions, label = "in the wings"
        )

        // Membership is never resolved away. ADR-0014 exists because a hand-authored Cast Seed reached the
        // model as a bare name; a member losing their profile here is a smaller detail, a member losing
        // their line would be that defect again.
        //
        // And a roster small enough to send whole is sent whole. Tiering twenty profiles saved 15,829
        // tokens; tiering four saves nothing and costs the model the ensemble it is about to write. The
        // floor is a size, not a count, so a cast of few long profiles is treated like the many it costs
        // the same as.
        val rosterWeight = cast.sumOf { approximateProfileSize(it) }
        val stagedCast = if (rosterWeight <= budget.fullRosterChars) {
            cast.map { StagedCastMember(StageTier.OnStage, it) }
        } else {
            cast.map { member ->
                val tier = if (member.entityId != null && member.entityId in onStage) StageTier.OnStage
                else StageTier.Wings
                StagedCastMember(tier, member)
            }
        }

        // A relationship belongs to the scene when either end is in it. Requiring both would drop how
        // someone present stands toward someone absent, which is most of what a relationship is for, and
        // the far end is always at least a name in <off_stage>.
        val stagedRelationships = relationships.filter {
            it.source_entity_id in onStage || it.target_entity_id in onStage
        }
        if (stagedRelationships.size < relationships.size) {
            omissions += "${relationships.size - stagedRelationships.size} relationships between two off-stage entities"
        }

        val stagedTimeline = selectTimeline(timeline, onStage, budget)
        if (stagedTimeline.size < timeline.size) {
            omissions += "${timeline.size - stagedTimeline.size} timeline beats between the ones shown"
        }

        return Stage(
            entities = staged,
            cast = stagedCast,
            relationships = stagedRelationships,
            timeline = stagedTimeline,
            omissions = omissions
        )
    }

    /**
     * Which beats of the record a reply is written against.
     *
     * A cap taken by recency alone sends the end of the story and nothing else. Measured on one thread
     * that is 24 beats of 229, all from the last tenth: the marriage, the betrayal that followed it, and
     * a hundred beats of consequence sat outside the prompt, so the model wrote around a hole it could
     * not see. Ranking by importance instead does not fix it either. Importance is inflated — the engine
     * rated 120 of those 229 beats 5/5 — and a tie between equals broken by recency is recency again.
     *
     * So the budget is split. A reserved tail holds the beats immediately behind this scene, because
     * without them a reply cannot tell what just happened. The rest is a spine: the record is cut into
     * as many equal eras as there are slots left, and each era sends its strongest beat. That bounds the
     * loss by era rather than by age, which is the only arrangement in which something from a third of
     * the way in still arrives.
     *
     * Within an era, importance leads, then how many entities in this scene the beat names, then
     * recency. Every tie ends at the identifier, because a frozen Roleplay Generation Request has to
     * compile twice to the same bytes.
     */
    internal fun selectTimeline(
        timeline: List<TimelineEventRecord>,
        onStage: Set<String>,
        budget: StageBudget
    ): List<TimelineEventRecord> {
        val chronological = timeline.sortedWith(compareBy({ it.created_at }, { it.id }))
        if (chronological.size <= budget.timelineEvents) return chronological

        val tail = chronological.takeLast(minOf(budget.recentTimelineEvents, budget.timelineEvents))
        val older = chronological.dropLast(tail.size)
        val eras = minOf(budget.timelineEvents - tail.size, older.size)
        if (eras <= 0) return tail

        val strongest = compareBy<TimelineEventRecord>(
            { it.importance },
            { it.affected_entity_ids.count { id -> id in onStage } },
            { it.created_at },
            { it.id }
        )
        val spine = (0 until eras).map { era ->
            older.subList(era * older.size / eras, (era + 1) * older.size / eras).maxWith(strongest)
        }
        return spine + tail
    }

    private fun approximateProfileSize(member: PromptCastMember): Int =
        member.canonicalName.length + member.aliases.sumOf { it.length } + member.roleBackground.length +
            member.personality.length + member.voiceStyle.length + member.appearance.length +
            member.goals.length + member.boundaries.length + member.evidence.sumOf { it.length } + 160

    /** Rough rendered weight of an entity. Cheap on purpose: this orders demotions, it does not report. */
    private fun approximateSize(entity: EntityState): Int =
        entity.canonical_name.length + entity.aliases.sumOf { it.length } +
            entity.primary_emotion.length + entity.emotion_catalyst.length + entity.entity_type.length +
            listOf(
                entity.knowledge_boundary, entity.traits, entity.goals,
                entity.secrets, entity.abilities, entity.possessions
            ).sumOf { bucket -> bucket.sumOf { it.body.length + it.id.length + 16 } } + 120

    private fun demoteUntilWithin(
        staged: List<StagedEntity>,
        from: StageTier,
        to: StageTier,
        ceiling: Int,
        weigh: (EntityState) -> Int,
        order: Comparator<EntityState>,
        keep: (EntityState) -> Boolean,
        omissions: MutableList<String>,
        label: String
    ): List<StagedEntity> {
        val tier = staged.filter { it.tier == from }.map { it.entity }
        if (tier.sumOf(weigh) <= ceiling) return staged

        val demoted = LinkedHashSet<String>()
        var total = tier.sumOf(weigh)
        for (entity in tier.sortedWith(order)) {
            if (total <= ceiling) break
            if (keep(entity)) continue
            demoted += entity.entity_id
            total -= weigh(entity)
        }
        if (demoted.isEmpty()) return staged
        omissions += "${demoted.size} least recently used records moved out of $label to stay within budget"
        return staged.map { if (it.entity.entity_id in demoted) it.copy(tier = to) else it }
    }
}
