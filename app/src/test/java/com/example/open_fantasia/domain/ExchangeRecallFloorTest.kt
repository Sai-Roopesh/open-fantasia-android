package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.ExchangeRecall
import com.example.open_fantasia.domain.model.RoleplayLineageEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Recall is for the rare turn reaching for one specific moment, not for most of them.
 *
 * Replayed across 2,040 real player turns, recall fired on 96% — a quarter of those resting on a single
 * shared word — while the Continuity Snapshot already carried what happened. An exchange pulled back on
 * that evidence supplies no fact the Snapshot lacks and risks handing the model the wrong memory. The
 * floor is what makes recall an exception again.
 */
class ExchangeRecallFloorTest {

    private fun line(id: String, user: String, assistant: String) = RoleplayLineageEntry(
        id = id, parent_id = null, user_text = user, assistant_text = assistant,
        generation_status = "committed", starter_seed = false
    )

    /** Filler far enough back to sit outside the Transcript Window. */
    private fun filler(n: Int) = (1..n).map { line("f$it", "ordinary talk $it", "ordinary answer $it") }

    @Test
    fun `a word shared with half the story is not a callback`() {
        // "ordinary" appears in every filler exchange, so its inverse frequency is tiny.
        val lineage = filler(40)
        assertTrue(
            "ordinary vocabulary must not drag an exchange back",
            ExchangeRecall.select(lineage, "ordinary talk").isEmpty()
        )
    }

    @Test
    fun `a word that appears nowhere else still reaches its moment`() {
        val lineage = listOf(line("hook", "about the jammer", "She admits the jammer was hers.")) + filler(40)
        val recalled = ExchangeRecall.select(lineage, "tell me about the jammer again")
        assertEquals(1, recalled.size)
        assertEquals("hook", recalled.single().turnId)
    }

    @Test
    fun `the floor is stated as a rarity, not a count of words`() {
        // Two words each appearing in two earlier exchanges clear the same bar as one unique word.
        assertEquals(1.0, ExchangeRecall.MIN_WEIGHT, 0.0001)
    }
}
