package com.example.open_fantasia.domain.model

/**
 * A reply being written to replace one that was rejected.
 *
 * Regeneration was carrying the direction and nothing else, so the model was told to fix something it
 * could not see. "Less aggressive" and "don't have her walk out" have no antecedent in a request that
 * does not contain the reply they are about, and an instruction with no referent is not read as a
 * correction — it is read as the brief. That is why a steering note produced a reply built entirely
 * around the note: the model was doing the only thing the request made possible.
 *
 * Two things fix that, and both are structural rather than a matter of wording. The rejected prose comes
 * along, so the direction has something to point at. And the request states what must not change, because
 * a revision is defined as much by what it preserves as by what it alters.
 *
 * [direction] may be blank. A plain regeneration with no note is still a revision: it asks for a
 * different reply to the same turn, which the model can only honour if it knows what it already wrote.
 * [rejected] may be null when the reply being replaced never arrived — a Mac Host job discarded while
 * still generating — and that is a brief for a fresh attempt rather than a revision of anything.
 */
data class Revision(
    /** The prose being replaced. Null when no reply was ever produced. */
    val rejected: String?,
    /** What the player wants changed. Blank when they asked only for something different. */
    val direction: String
) {
    val isRevisionOfProse: Boolean get() = !rejected.isNullOrBlank()

    companion object {
        /** Null when there is nothing to say, so a normal send carries no block at all. */
        fun of(rejected: String?, direction: String?): Revision? {
            val note = direction?.trim().orEmpty()
            val prose = rejected?.trim()
            if (note.isEmpty() && prose.isNullOrEmpty()) return null
            return Revision(rejected = prose, direction = note)
        }
    }
}

object RevisionRendering {

    const val TAG = "revision"

    /**
     * The block a revision renders to.
     *
     * The conservation rule is the load-bearing part. Without it a direction is an invitation to rewrite
     * everything, and the reply comes back in a different scene with different people doing something
     * else — technically responsive to the note and useless as a replacement.
     */
    fun render(revision: Revision): String = buildString {
        if (revision.isRevisionOfProse) {
            appendLine(
                "You already wrote a reply to the player's turn above. It was rejected and is NOT part of " +
                    "the story: it never happened, no one remembers it, and nothing you write may refer to it."
            )
            appendLine()
            appendLine("<rejected_reply>")
            appendLine(revision.rejected!!.trim())
            appendLine("</rejected_reply>")
            appendLine()
            if (revision.direction.isNotEmpty()) {
                appendLine("Write it again, changing this and only this:")
                appendLine(revision.direction)
                appendLine()
                appendLine(
                    "KEEP EVERYTHING ELSE. Same scene, same place, same people, same moment in time, same " +
                        "speaker, same length. Anything the instruction above does not name was acceptable and " +
                        "should survive largely as it was. This is a revision of that reply, not a new idea for " +
                        "the same turn — if your new reply could not be recognized as a rewrite of the one above, " +
                        "you have changed too much."
                )
            } else {
                appendLine(
                    "Write a genuinely different reply to the same player turn. Same scene, same place, same " +
                        "people, same moment, same speaker, same length — a different choice about what happens " +
                        "inside it. Do not reuse its opening move, its structure, or the beat it landed on."
                )
            }
        } else {
            appendLine(
                "The previous attempt at this reply was discarded before it finished, so there is nothing to " +
                    "revise. Write the reply fresh, following this direction:"
            )
            appendLine(revision.direction)
            appendLine()
            appendLine(
                "The direction is out-of-character and the player never said it. Do not quote it, acknowledge " +
                    "it, or treat it as something a character knows. It shapes how you write this reply; it is " +
                    "not an event in the story."
            )
        }
    }.trimEnd()
}
