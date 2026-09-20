package com.example.open_fantasia.domain.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * What the reply just wrote says about where the story now stands.
 *
 * A Continuity Update rewrites the world every fifteen exchanges, which is the right cadence for truth
 * and far too slow for a room. `is_present` could be fourteen exchanges stale, so a Stage resolving by
 * presence would be reading the wrong scene for most of one — the projection would be looking at people
 * who left and missing people who arrived.
 *
 * So the Roleplay Model reports the room alongside the prose. This is the same algebra as a Continuity
 * Draft at a fraction of the size, and the objection ADR-0010 raised does not apply: that decision was
 * about *bulk* transcription, where a model asked to re-emit sixty kilobytes of roster reliably dropped
 * a member. Naming who is in a scene it just wrote is the thing a model is good at.
 *
 * Names, never identifiers. ADR-0008 removed identifier transcription from the Continuity Engine for
 * reasons that hold just as well here, and a Roleplay Model never sees an `entity_id` anyway — it sees
 * names, in the Cast Roster and in the Stage's off-stage index.
 */
@Serializable
data class SceneReport(
    /** Everyone in the scene at the end of this reply, by name. */
    val present: List<String> = emptyList(),
    /** Whether this reply ended the scene. */
    val scene_ended: Boolean = false
) {
    val isEmpty: Boolean get() = present.isEmpty() && !scene_ended
}

/** Committed prose, and what the model reported about the scene it leaves behind. */
data class RoleplayReply(val prose: String, val report: SceneReport?)

/**
 * Splits a model's output into the prose that becomes story and the report that does not.
 *
 * Every branch here ends with prose. A missing tail, a malformed one, unparseable JSON, a model that
 * ignored the instruction entirely — all of them yield the reply and a null report, and the Stage falls
 * back to snapshot presence. That is the whole reason the tail is optional: absence means unchanged,
 * exactly as omission does in a Continuity Draft, so nothing the model gets wrong here can stand between
 * a person and the reply they waited for.
 *
 * The tail is stripped whether or not it parsed. A report that could not be read is still not story, and
 * leaving it in the transcript would put markup in the next fifteen prompts.
 */
object SceneReportCodec {

    const val TAG = "scene_state"

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val block = Regex("<$TAG>\\s*([\\s\\S]*?)\\s*</$TAG>", RegexOption.IGNORE_CASE)
    /** An unterminated tail, which is what a stream in flight and a truncated reply both look like. */
    private val danglingOpen = Regex("<$TAG>[\\s\\S]*$", RegexOption.IGNORE_CASE)

    fun split(raw: String): RoleplayReply {
        val match = block.find(raw)
        if (match == null) {
            val dangling = danglingOpen.find(raw)
            return RoleplayReply(prose = (dangling?.let { raw.removeRange(it.range) } ?: raw).trimEnd(), report = null)
        }
        val prose = raw.removeRange(match.range).trimEnd()
        val report = runCatching { json.decodeFromString(SceneReport.serializer(), match.groupValues[1]) }
            .getOrNull()
            ?.takeIf { !it.isEmpty }
        return RoleplayReply(prose = prose, report = report)
    }

    /**
     * The prose to show while a reply is still arriving.
     *
     * A stream reaches the screen a token at a time, so the tail would appear as markup at the end of the
     * scene the person is reading. Hiding it from the moment its opening tag arrives costs one regex per
     * frame and keeps bookkeeping out of the story.
     */
    fun visiblePrefix(streamed: String): String =
        // Trimmed only when a block was actually removed. Trimming unconditionally would eat the space
        // between two words for as long as the second one is still arriving.
        danglingOpen.find(streamed)?.let { streamed.removeRange(it.range).trimEnd() } ?: streamed

    fun encode(report: SceneReport): String = json.encodeToString(SceneReport.serializer(), report)

    fun decode(stored: String?): SceneReport? {
        if (stored.isNullOrBlank()) return null
        return runCatching { json.decodeFromString(SceneReport.serializer(), stored) }.getOrNull()
    }

    /**
     * The instruction the model is given, at the end of the whisper. Two lines. The shape is shown once
     * with real names from the roster so the model has nothing to work out; the codec forgives anything
     * it gets wrong, so nothing here needs to say so.
     */
    fun outputContract(castNames: List<String>, playerName: String?): String {
        val names = (castNames.take(2) + listOfNotNull(playerName)).distinct().take(3)
        val examples = names.joinToString("\", \"", prefix = "\"", postfix = "\"")
            .ifBlank { "\"A Name\", \"Another Name\"" }
        return "Then, on its own last line, who's in the room when you stop and whether the scene ended:\n" +
            "<$TAG>{\"present\": [$examples], \"scene_ended\": false}</$TAG>"
    }
}
