package com.example.open_fantasia.domain.model

import kotlinx.serialization.Serializable

/**
 * Everything a Roleplay Model is given, named once.
 *
 * Total by construction: no property here or in any type it reaches has a default, so a projection from
 * stored state cannot compile until it supplies every field. That is the whole point. Context used to be
 * assembled across a hundred lines of a ViewModel and rendered by three builders taking scattered
 * parameters, and it leaked three separate ways — a parameter suppressed and forgotten, a resolved list
 * discarded at the call site, and fields dropped by a serializer nobody configured. See ADR-0014.
 *
 * Nullable means genuinely absent, never "not supplied": no Persona is selected, or no Continuity
 * Snapshot exists yet.
 */
data class RoleplayContext(
    val character: PromptCharacter,
    val persona: PromptPersona?,
    val directorNotes: String,
    val world: PromptWorldState?,
    val cast: List<PromptCastMember>,
    val activeSpeaker: PromptCastMember?,
    val speakerMode: String,
    /**
     * What this scene is for. Selects the one turn policy this reply is written under, so it decides
     * whether an interruption is licensed at all rather than adding a request that one be avoided.
     */
    val sceneIntent: SceneIntent,
    val pins: List<ChatPinRecord>,
    val timeline: List<TimelineEventRecord>,
    /** The player's visible prose for this reply. Reply controls are added by rendering, not here. */
    val currentUserMessage: String,
    /**
     * The rejected reply this attempt replaces, and what to change about it. Null on a normal send.
     * It is reply control rather than story, so it renders after the player's prose and never inside it.
     */
    val revision: Revision?,
    /** The authored intention. Never a token count: see [ReplyLength]. */
    val replyLength: ReplyLength,
    /** Which model is writing, so the length target can be stated the way that model answers to. */
    val modelId: String,
    /**
     * When the story last used each record, from the Continuity Snapshot. The one field here that is
     * about the context rather than in it: no part of it is rendered, and its only job is to order the
     * Stage's demotions so a section that runs out of room spends what it has on what the story most
     * recently touched. Empty is valid and means every record is equally current.
     */
    val salience: Map<String, Int> = emptyMap(),
    /**
     * Who the last reply said was in the room, by name. Like [salience] this is about the context rather
     * than in it: none of it is rendered, and its only job is to let the Stage read a scene as it stands
     * now instead of as a Continuity Update up to fifteen exchanges old remembers it. Empty means no
     * reply has reported one, and snapshot presence stands.
     */
    val observedPresence: Set<String> = emptySet()
)

/**
 * What rendering produces: the authoritative system prompt, and the latest user message with its reply
 * controls attached. Selecting the Roleplay Transcript Window stays with RoleplayContextAssembler —
 * lineage is a different problem from prompt content, and both are deep modules over one input.
 */
data class RenderedPrompt(
    val systemPrompt: String,
    val currentUserMessage: String
)

/**
 * A Cast Member as the model receives it.
 *
 * Separate from [CastProfile] for the same reason [PromptWorldState] is separate from
 * [DurableMemorySnapshot], and the reason is worth stating because it was missed the first time:
 * CastProfile declares defaults so decoding stored rows and remote payloads survives missing fields,
 * and it is rendered by hand rather than serialized, so a field added to it would simply never appear
 * in a prompt and nothing would say so.
 *
 * This type declares no defaults. Adding a field here fails to compile until [from] supplies it and
 * until every fixture names it, which is what makes the completeness test able to catch a field that
 * is carried but never rendered.
 */
data class PromptCastMember(
    val castId: String,
    val entityId: String?,
    val canonicalName: String,
    val aliases: List<String>,
    val roleBackground: String,
    val personality: String,
    val voiceStyle: String,
    val appearance: String,
    val goals: String,
    val boundaries: String,
    val origin: String,
    val evidence: List<String>,
    val status: String,
    val speakerEligible: Boolean
) {
    companion object {
        fun from(profile: CastProfile): PromptCastMember = PromptCastMember(
            castId = profile.cast_id,
            entityId = profile.entity_id,
            canonicalName = profile.canonical_name,
            aliases = profile.aliases,
            roleBackground = profile.role_background,
            personality = profile.personality,
            voiceStyle = profile.voice_style,
            appearance = profile.appearance,
            goals = profile.goals,
            boundaries = profile.boundaries,
            origin = when (profile.provenance) {
                "primary" -> "Primary Character"
                "manual_seed" -> "Authored by the player"
                else -> "Established by a Continuity Update"
            },
            evidence = profile.evidence,
            status = profile.status,
            speakerEligible = profile.speaker_eligible
        )
    }
}

/**
 * The Character Sheet as the model receives it.
 *
 * `greeting` and `starters` are deliberately absent: they open a conversation the transcript has already
 * superseded. Recorded as a decision rather than an omission, because an undocumented withheld field
 * looks exactly like the three defects ADR-0014 removes.
 */
data class PromptCharacter(
    val name: String,
    val story: String,
    val corePersona: String,
    val appearance: String,
    val styleRules: String,
    val definition: String,
    val negativeGuidance: String,
    val exampleConversations: List<ExampleConversation>
)

/** The Persona as the model receives it. `private_notes` is deliberately absent — it is private. */
data class PromptPersona(
    val name: String,
    val identity: String,
    val backstory: String,
    val voiceStyle: String,
    val goals: String,
    val boundaries: String
)

/**
 * The Continuity Snapshot as the model receives it: everything except `cast_roster` and `salience`.
 *
 * The Cast Roster is delivered as its own section, complete on every call, because Continuity Updates
 * run every fifteen exchanges and binding cast delivery to the Snapshot left hand-authored Cast Seeds as
 * bare names for a thread's first fifteen exchanges. Carrying it here as well would ship every
 * established member twice in one prompt.
 *
 * `salience` is absent for a different reason than `cast_roster`, and the difference is worth stating:
 * the roster is withheld because it is delivered better elsewhere, while salience is withheld because it
 * is not story content at all. It records when the story last used a record, which is how the Stage
 * decides what to send; handing it to the model would put bookkeeping in the same JSON as a character's
 * secrets and invite it to be read as one.
 *
 * Unlike [DurableMemorySnapshot] this declares no defaults, so serialization cannot drop a field whose
 * value happens to equal one. That separation is deliberate: the stored type stays tolerant so decoding
 * survives older rows and remote payloads, and this one stays total so the prompt is complete.
 */
@Serializable
data class PromptWorldState(
    val metadata: SnapshotMetadata,
    val spatial_state: SpatialState,
    val entity_state: List<EntityState>,
    val relational_state: List<RelationalState>,
    val narrative_state: NarrativeState
) {
    companion object {
        fun from(snapshot: DurableMemorySnapshot): PromptWorldState = PromptWorldState(
            metadata = snapshot.metadata,
            spatial_state = snapshot.spatial_state,
            entity_state = snapshot.entity_state,
            relational_state = snapshot.relational_state,
            narrative_state = snapshot.narrative_state
        )
    }
}

fun CharacterRecord.toPromptCharacter(exampleConversations: List<ExampleConversation>) = PromptCharacter(
    name = name,
    story = story,
    corePersona = core_persona,
    appearance = appearance,
    styleRules = style_rules,
    definition = definition,
    negativeGuidance = negative_guidance,
    exampleConversations = exampleConversations
)

fun UserPersonaRecord.toPromptPersona() = PromptPersona(
    name = name,
    identity = identity,
    backstory = backstory,
    voiceStyle = voice_style,
    goals = goals,
    boundaries = boundaries
)
