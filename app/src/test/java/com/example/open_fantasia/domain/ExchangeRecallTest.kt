package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Recall reaches past the Transcript Window into the Record. The cases that matter are the ones where
 * it could drag something irrelevant into a scene, or quietly return something the model can already
 * read — both of which are worse than recalling nothing.
 */
class ExchangeRecallTest {

    private fun lineage(n: Int, special: Map<Int, Pair<String, String>> = emptyMap()) =
        (1..n).map { i ->
            val (u, a) = special[i] ?: ("player prose $i" to "assistant prose $i")
            RoleplayLineageEntry(
                id = "turn-$i", parent_id = if (i == 1) null else "turn-${i - 1}",
                user_text = u, assistant_text = a,
                generation_status = "committed", starter_seed = false
            )
        }

    @Test
    fun `an old exchange comes back when this turn is about it`() {
        val l = lineage(60, mapOf(5 to ("we bought the jammer" to "she switched it on")))
        val out = ExchangeRecall.select(l, "where is that jammer now")
        assertEquals(1, out.size)
        assertEquals("turn-5", out.first().turnId)
        assertEquals(55, out.first().exchangesAgo)
        assertTrue(out.first().matched.contains("jammer"))
    }

    @Test
    fun `nothing distinctive recalls nothing`() {
        val l = lineage(60)
        assertTrue("a beat about nothing in particular must not drag the past in",
            ExchangeRecall.select(l, "i look at you and smile").isEmpty())
        assertTrue(ExchangeRecall.select(l, "").isEmpty())
    }

    @Test
    fun `the transcript window is never recalled into itself`() {
        // The match sits inside the last fifteen, which the model already reads verbatim.
        val l = lineage(20, mapOf(18 to ("the cottage key" to "she pocketed it")))
        assertTrue(ExchangeRecall.select(l, "about that cottage").isEmpty())
    }

    @Test
    fun `a short thread recalls nothing because nothing is out of reach`() {
        val l = lineage(10, mapOf(2 to ("the cottage" to "yes")))
        assertTrue(ExchangeRecall.select(l, "the cottage").isEmpty())
    }

    @Test
    fun `more distinct matches beats more recent`() {
        val l = lineage(60, mapOf(
            5 to ("the cottage and the letter" to "both mattered"),
            40 to ("the cottage" to "only that")
        ))
        val out = ExchangeRecall.select(l, "the cottage and the letter", maxRecalled = 1)
        assertEquals("two matched terms should outrank one", "turn-5", out.first().turnId)
    }

    @Test
    fun `a rare term outweighs a common one`() {
        // "cottage" appears once; "player" appears in every filler line. Counting matched terms alone
        // would let the common word decide, which on a real thread put the wrong moment first.
        val l = lineage(60, mapOf(
            5 to ("the cottage" to "she agreed"),
            6 to ("player player player" to "player player")
        )).map { if (it.id !in setOf("turn-5", "turn-6")) it.copy(user_text = "player prose") else it }
        val out = ExchangeRecall.select(l, "player and the cottage", maxRecalled = 1)
        assertEquals("turn-5", out.first().turnId)
    }

    @Test
    fun `recency breaks a tie`() {
        // Two equally distinctive hooks, one per exchange, so the weights tie exactly and only recency
        // can separate them. A single shared word would not clear MIN_WEIGHT at all.
        val l = lineage(60, mapOf(5 to ("cottage" to "a"), 40 to ("jammer" to "b")))
        val out = ExchangeRecall.select(l, "cottage jammer", maxRecalled = 1)
        assertEquals("turn-40", out.first().turnId)
    }

    @Test
    fun `selection is capped, budgeted and ordered oldest first`() {
        // A distinct hook per exchange, all named in the query, so there are far more qualifying
        // candidates than the cap allows and the cap is what does the work.
        val l = lineage(60, (2..40).associateWith { "hook$it here" to "reply $it" })
        val out = ExchangeRecall.select(l, (2..40).joinToString(" ") { "hook$it" })
        assertEquals(ExchangeRecall.MAX_RECALLED, out.size)
        assertEquals(out.map { it.exchangesAgo }.sortedDescending(), out.map { it.exchangesAgo })
        assertTrue(out.sumOf { it.playerProse.length + it.assistantProse.length } <= ExchangeRecall.MAX_CHARS)
    }

    @Test
    fun `an exchange too large for the budget is skipped, not truncated`() {
        val huge = "cottage " + "x".repeat(9_000)
        val l = lineage(60, mapOf(5 to (huge to "big"), 6 to ("jammer small" to "ok")))
        val out = ExchangeRecall.select(l, "cottage jammer")
        assertTrue("a recalled exchange is verbatim or absent", out.none { it.playerProse.length > 9_000 })
        assertTrue(out.any { it.turnId == "turn-6" })
    }

    @Test
    fun `the same input selects the same exchanges twice`() {
        val l = lineage(80, (2..50).associateWith { "hook$it letter" to "r $it" })
        val query = (2..50).joinToString(" ") { "hook$it" }
        val twice = ExchangeRecall.select(l, query).map { it.turnId }
        assertEquals("a frozen request must compile identically twice", twice, ExchangeRecall.select(l, query).map { it.turnId })
        assertTrue("the determinism check must not pass by recalling nothing", twice.isNotEmpty())
    }

    @Test
    fun `uncommitted and seed exchanges are never recalled`() {
        val l = lineage(60).map {
            if (it.id == "turn-5") it.copy(user_text = "the cottage", generation_status = "pending") else it
        } + RoleplayLineageEntry("seed", null, "the cottage", "x", "committed", starter_seed = true)
        assertTrue(ExchangeRecall.select(l, "the cottage").isEmpty())
    }

    @Test
    fun `recalled prose is stamped as past and framed as memory, with the speakers named`() {
        val out = RecallRendering.render(
            listOf(RecalledExchange("t", 55, "we bought the jammer", "she switched it on", listOf("jammer"))),
            playerName = "Dan", speakerName = "Vera"
        )!!
        assertTrue(out.contains("55 exchanges ago"))
        assertTrue(out.contains("They're memory now"))
        assertTrue(out.contains("Dan: we bought the jammer"))
        assertTrue(out.contains("Vera: she switched it on"))
        // The old frame was three prohibitions, and two A/Bs could not show it moving a reply.
        assertFalse(out.contains("do not"))
    }

    @Test
    fun `nothing recalled renders nothing`() {
        org.junit.Assert.assertNull(RecallRendering.render(emptyList(), "Dan", "Vera"))
    }
}
