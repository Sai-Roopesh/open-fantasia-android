package com.example.open_fantasia.domain.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * One thing the player wants to happen.
 *
 * Written by them, never by a model. That is the whole distinction, and it decides how the prompt is
 * allowed to treat it: an intention the player authored is direction the story should serve, while one
 * a Continuity Engine invented was noise that had to be hedged into "available material" precisely
 * because nobody chose it.
 *
 * [askedAtTurnId] and [reachedAtTurnId] are the branch head at the moment the player wrote this and at
 * the moment they ticked it off. They exist because a want with no place in time is unusable: a model
 * cannot tell one asked for two hundred exchanges ago from one asked for on the last turn, and it was
 * never told at all about the ones that had already landed. Both are nullable, so a want stored before
 * they existed decodes as a want whose distance is simply unknown.
 */
@Serializable
data class StoryWant(
    val id: String,
    val body: String,
    val done: Boolean = false,
    val askedAtTurnId: String? = null,
    val reachedAtTurnId: String? = null
)

/**
 * Where the player wants the story to go next.
 *
 * The architecture already lets a person direct at every horizon except this one. Scene Intent decides
 * what a single reply is for, a Revision corrects one that missed, and Director Notes hold the standing
 * tone. Nothing carried the middle distance — what should happen across the next few scenes — so the
 * only thing spanning replies was a Continuity Snapshot, which records what is true and has no opinion
 * about what should follow.
 *
 * The engine used to fill that gap with `open_thread`, and it went badly in a way worth recording. Asked
 * for objectives, a model that is good at "what is true" and bad at "what matters" marks everything: one
 * thread reached thirty-six of them, all flagged equally live, and five of any six sampled were not
 * objectives at all but restated plot. The prompt then handed that recap back as work to advance, so the
 * model spent turns re-litigating beats that had already happened.
 *
 * So direction is not something the story engine produces. It is something a person supplies, and this
 * is where they supply it.
 */
@Serializable
data class StoryDirection(val wants: List<StoryWant> = emptyList()) {

    val open: List<StoryWant> get() = wants.filterNot { it.done }

    val reached: List<StoryWant> get() = wants.filter { it.done }

    val isEmpty: Boolean get() = open.isEmpty()

    /**
     * Marks a want reached, or puts it back.
     *
     * Un-ticking clears the stamp rather than keeping it, because a want that is open again has not
     * been reached, and a model told both at once would have to guess which it meant.
     */
    fun toggled(id: String, atTurnId: String? = null): StoryDirection =
        copy(wants = wants.map { want ->
            when {
                want.id != id -> want
                want.done -> want.copy(done = false, reachedAtTurnId = null)
                else -> want.copy(done = true, reachedAtTurnId = atTurnId)
            }
        })

    fun without(id: String): StoryDirection = copy(wants = wants.filterNot { it.id == id })

    fun plus(body: String, id: String, atTurnId: String? = null): StoryDirection {
        val text = body.trim()
        if (text.isEmpty()) return this
        return copy(wants = wants + StoryWant(id = id, body = text, askedAtTurnId = atTurnId))
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true }
        val Empty = StoryDirection()

        fun decode(stored: String?): StoryDirection {
            if (stored.isNullOrBlank()) return Empty
            return runCatching { json.decodeFromString(serializer(), stored) }.getOrDefault(Empty)
        }

        fun encode(direction: StoryDirection): String =
            json.encodeToString(serializer(), direction)
    }
}

/**
 * A want with its place in this branch's history resolved.
 *
 * Distances are in exchanges rather than time, which is the unit the rest of a Roleplay Generation
 * Request already speaks: a recalled exchange is stamped the same way, and a model has no access to
 * a clock. Null means the turn a stamp names is not on this branch — a want written before a Rewind,
 * or before stamps existed — and an unknown distance is stated as nothing rather than as a guess.
 */
data class PlacedWant(
    val body: String,
    val reached: Boolean,
    val askedAgo: Int?,
    val reachedAgo: Int?
)

object StoryDirectionRendering {

    const val TAG = "story_direction"

    /**
     * How many reached wants are carried. Past wants are bounded for the same reason every other
     * section is: a story that runs long enough accumulates them, and the ones from two hundred
     * exchanges ago are in the Continuity Snapshot by now. The most recently reached are the ones a
     * reply could still contradict.
     */
    const val MAX_REACHED = 6

    /**
     * Puts each want where it happened.
     *
     * @param lineage the branch-valid exchanges, oldest first, as the Transcript Window resolves them.
     */
    fun place(direction: StoryDirection, lineage: List<RoleplayLineageEntry>): List<PlacedWant> {
        if (direction.wants.isEmpty()) return emptyList()
        val committed = lineage.filter { it.generation_status == "committed" && !it.starter_seed }
        val agoByTurnId = committed.withIndex()
            .associate { (index, entry) -> entry.id to (committed.size - index - 1) }

        val reached = direction.reached
            .sortedByDescending { agoByTurnId[it.reachedAtTurnId] ?: Int.MAX_VALUE }
            .takeLast(MAX_REACHED)
            .toSet()

        return direction.wants
            .filter { !it.done || it in reached }
            .map { want ->
                PlacedWant(
                    body = want.body,
                    reached = want.done,
                    askedAgo = agoByTurnId[want.askedAtTurnId],
                    reachedAgo = if (want.done) agoByTurnId[want.reachedAtTurnId] else null
                )
            }
    }

    /**
     * What the model is told about the player's wants.
     *
     * Stated as direction rather than as material, which is the opposite of how engine-authored threads
     * were framed, and deliberately: these were chosen. The hedging that kept invented objectives from
     * becoming obligations would here just be the app declining to do what it was asked.
     *
     * It is split into what is still ahead and what has already been reached, because sending only the
     * open ones was a hole. A want ticked off vanished from the prompt entirely, so a model could not
     * tell a wedding that had happened from one that was never wanted, and nothing stopped it building
     * toward the wedding again. Past and future are both direction; only one of them is a destination.
     *
     * It still is not a script. A want says where the story should get to, not when, and the player's
     * own prose in this exchange always outranks it — if they went somewhere else this turn, follow them
     * there. The Scene Intent still decides whether this reply moves anything at all.
     */
    fun render(placed: List<PlacedWant>): String? {
        if (placed.isEmpty()) return null
        val ahead = placed.filterNot { it.reached }
        val reached = placed.filter { it.reached }

        return buildString {
            appendLine(
                "Where the player wants this story to go. They wrote these themselves, so they are " +
                    "direction rather than suggestion."
            )
            if (ahead.isNotEmpty()) {
                appendLine()
                appendLine("Still ahead — none of these has happened yet:")
                ahead.forEach { want ->
                    appendLine("- ${want.body}${want.askedAgo?.let { " (asked for $it exchanges ago)" }.orEmpty()}")
                }
            }
            if (reached.isNotEmpty()) {
                appendLine()
                appendLine("Already reached — these happened and are part of the past:")
                reached.forEach { want ->
                    appendLine("- ${want.body}${want.reachedAgo?.let { " (reached $it exchanges ago)" }.orEmpty()}")
                }
            }
            if (ahead.isNotEmpty()) {
                appendLine()
                appendLine(
                    "Work toward what is still ahead across the coming scenes. Do not force one into " +
                        "this reply if the moment is wrong, do not name them aloud as goals, and never " +
                        "let one override what the player just did — their prose this turn outranks " +
                        "anything here. The <this_turn> policy still decides whether this reply moves " +
                        "the story at all."
                )
                appendLine()
                appendLine(
                    "One asked for a long time ago is a direction the story has not served yet, not one " +
                        "to resolve in a single reply. If the story has already arrived at something " +
                        "listed as still ahead, continue from there rather than staging it again."
                )
            }
            if (reached.isNotEmpty()) {
                appendLine()
                append(
                    "Anything under \"already reached\" has happened. Do not stage it a second time, do " +
                        "not build toward it again, and do not treat it as unresolved."
                )
            }
        }.trimEnd()
    }
}
