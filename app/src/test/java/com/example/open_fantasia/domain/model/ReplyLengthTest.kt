package com.example.open_fantasia.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Reply Length is an intention, and the tests that matter are the ones keeping it from turning back into
 * a token count — which is what it was for long enough to need [ReplyBudget] to undo.
 */
class ReplyLengthTest {

    @Test
    fun `the target is stated in words, never in paragraphs`() {
        val directive = ReplyLengthCalibration.directive(ReplyLength.Full, "any-model")
        assertTrue(directive.contains("About 256\u2013384 words."))
        assertFalse("paragraphs are elastic; the model sizes them to taste", directive.contains("paragraph"))
    }

    @Test
    fun `the target does not withdraw its own authority`() {
        for (length in ReplyLength.entries) {
            val directive = ReplyLengthCalibration.directive(length, "any-model")
            assertFalse("$length reintroduced the clause that defused the target",
                directive.contains("not a hard cap"))
        }
    }

    @Test
    fun `each length asks for more prose than the one below it`() {
        val targets = ReplyLength.entries.filter { it.hasTarget }.map { it.words }
        assertEquals("lengths must be strictly increasing", targets.sorted(), targets)
        assertEquals(targets.distinct(), targets)
    }

    @Test
    fun `the ceiling is derived from the intention and sits well above it`() {
        for (length in ReplyLength.entries) {
            val ceiling = length.transportCeiling("openai")
            // A ceiling stops a runaway. Shaping prose with it severs a reply mid-sentence instead of
            // shortening it, which is the failure ReplyBudget was written to record.
            assertTrue("$length has no headroom over its own target", ceiling > length.words * 2)
        }
    }

    @Test
    fun `a reasoning provider still gets its hidden-thought headroom`() {
        assertEquals(
            ReplyLength.Full.transportCeiling("openai") + ReplyBudget.REASONING_HEADROOM_TOKENS,
            ReplyLength.Full.transportCeiling("deepseek")
        )
    }

    @Test
    fun `an unbounded reply asks for no number at all`() {
        val directive = ReplyLengthCalibration.directive(ReplyLength.Unbounded, "any-model")
        assertFalse(directive.contains("words"))
        assertTrue(directive.contains("As long as it needs."))
    }

    @Test
    fun `a legacy token budget reads as the intention it stood in for`() {
        assertEquals(ReplyLength.Terse, ReplyLength.fromLegacyTokens(750))
        assertEquals(ReplyLength.Measured, ReplyLength.fromLegacyTokens(2048))
        assertEquals(ReplyLength.Full, ReplyLength.fromLegacyTokens(4096))
        assertEquals(ReplyLength.Expansive, ReplyLength.fromLegacyTokens(8192))
        assertEquals(ReplyLength.Unbounded, ReplyLength.fromLegacyTokens(16384))
    }

    @Test
    fun `an unknown identifier falls back rather than failing a reply`() {
        assertEquals(ReplyLength.Default, ReplyLength.from("nonsense"))
        assertEquals(ReplyLength.Default, ReplyLength.from(null))
    }
}
