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
 */
@Serializable
data class StoryWant(
    val id: String,
    val body: String,
    val done: Boolean = false
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

    val isEmpty: Boolean get() = open.isEmpty()

    fun toggled(id: String): StoryDirection =
        copy(wants = wants.map { if (it.id == id) it.copy(done = !it.done) else it })

    fun without(id: String): StoryDirection = copy(wants = wants.filterNot { it.id == id })

    fun plus(body: String, id: String): StoryDirection {
        val text = body.trim()
        if (text.isEmpty()) return this
        return copy(wants = wants + StoryWant(id = id, body = text))
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

object StoryDirectionRendering {

    const val TAG = "story_direction"

    /**
     * What the model is told about the player's wants.
     *
     * Stated as direction rather than as material, which is the opposite of how engine-authored threads
     * were framed, and deliberately: these were chosen. The hedging that kept invented objectives from
     * becoming obligations would here just be the app declining to do what it was asked.
     *
     * It still is not a script. A want says where the story should get to, not when, and the player's
     * own prose in this exchange always outranks it — if they went somewhere else this turn, follow them
     * there. The Scene Intent still decides whether this reply is the one that moves anything at all.
     */
    fun render(direction: StoryDirection): String? {
        val open = direction.open
        if (open.isEmpty()) return null
        return buildString {
            appendLine("What the player wants to happen in this story. They wrote these, so they are direction rather than suggestion:")
            appendLine()
            open.forEach { appendLine("- ${it.body}") }
            appendLine()
            append(
                "Work toward these over the coming scenes. Do not force one into this reply if the moment " +
                    "is wrong, do not name them aloud as goals, and never let one override what the player " +
                    "just did — their prose this turn outranks anything listed here. This turn's " +
                    "<this_turn> policy still decides whether the story moves at all."
            )
        }
    }
}
