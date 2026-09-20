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

    const val REJECTED_TAG = "rejected_reply"

    /**
     * The paragraph a revision renders to, inside the whisper.
     *
     * The conservation rule is the load-bearing part. Without it a direction is an invitation to rewrite
     * everything, and the reply comes back in a different scene with different people doing something
     * else — technically responsive to the note and useless as a replacement. It used to be stated in
     * capitals across four sentences; it is one sentence now, in the register the reply should have.
     */
    fun render(revision: Revision, playerName: String): String = buildString {
        if (revision.isRevisionOfProse) {
            appendLine("The reply below didn't land. It never happened and nobody remembers it:")
            appendLine("<$REJECTED_TAG>")
            appendLine(revision.rejected!!.trim())
            appendLine("</$REJECTED_TAG>")
            if (revision.direction.isNotEmpty()) {
                appendLine(
                    "Write it again \u2014 same scene, same people, same moment, same speaker, about the same length \u2014 " +
                        "and change just this: ${revision.direction.trim().trimEnd('.')}. Everything the note doesn't touch was fine."
                )
            } else {
                appendLine(
                    "Write it again with a different choice about what happens \u2014 same scene, same people, same moment, " +
                        "same speaker, about the same length. Don't open the way that one opened."
                )
            }
        } else {
            appendLine(
                "Fresh attempt; the last one never finished. $playerName asked for this, out of character: " +
                    "${revision.direction.trim().trimEnd('.')}. It shapes the reply; nobody in the story said it."
            )
        }
    }.trimEnd()
}
