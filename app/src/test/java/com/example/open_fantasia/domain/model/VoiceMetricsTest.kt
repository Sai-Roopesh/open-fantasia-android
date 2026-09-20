package com.example.open_fantasia.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The measurement the prompt is judged by.
 *
 * The two fixtures below are the shape commit `66d4add` measured and the shape it asked for. The
 * meter has to tell them apart on every axis it reports, or it is not measuring the defect.
 */
class VoiceMetricsTest {

    private val machine = """
        She set the glass down. "You came back." A pause. "Most people do not."
        He said nothing. "That was not a question. It was an observation."
        "Sit. We are not finished."
    """.trimIndent()

    private val person = """
        She set the glass down. "Okay. Okay, you're— right, you came back. I didn't think you would, honestly, after last time, I sort of figured that was it."
        He said nothing. "Mm."
        "That wasn't a question, I'm just... yeah. Sit down? Sit down. We're not done, I don't think."
        "Fine."
    """.trimIndent()

    @Test
    fun countsOnlySpokenLines() {
        assertEquals(4, VoiceMeter.measure(machine).spokenLines)
        assertEquals(4, VoiceMeter.measure(person).spokenLines)
    }

    @Test
    fun contractionRateSeparatesTheTwoRegisters() {
        assertEquals(0.0, VoiceMeter.measure(machine).contractionRate, 0.001)
        assertTrue(VoiceMeter.measure(person).contractionRate >= 0.4)
    }

    @Test
    fun hedgeAndRestartRatesRiseWithHumanTexture() {
        val m = VoiceMeter.measure(machine)
        val p = VoiceMeter.measure(person)
        assertEquals(0.0, m.hedgeRate, 0.001)
        assertEquals(0.0, m.restartRate, 0.001)
        assertTrue(p.hedgeRate > 0.0)
        assertTrue(p.restartRate > 0.0)
    }

    @Test
    fun lineLengthVarianceIsLumpierForPeople() {
        val m = VoiceMeter.measure(machine)
        val p = VoiceMeter.measure(person)
        assertTrue(p.medianLineWords > m.medianLineWords)
        assertTrue(p.lineWordsCV > m.lineWordsCV)
    }

    @Test
    fun epigramEndingIsRecognised() {
        assertTrue(VoiceMeter.endsOnEpigram("I have been standing here for the better part of an hour waiting for you to say something honest. You never do."))
        assertFalse(VoiceMeter.endsOnEpigram("You never do."))
        assertFalse("a question is not an epigram", VoiceMeter.endsOnEpigram("I have been standing here for the better part of an hour waiting for you. Do you know that?"))
        assertFalse("a contraction breaks the shape", VoiceMeter.endsOnEpigram("I have been standing here for the better part of an hour waiting for you to say something honest. You don't."))
    }

    @Test
    fun emptyReplyMeasuresToZeroWithoutThrowing() {
        val metrics = VoiceMeter.measure("")
        assertEquals(0, metrics.spokenLines)
        assertEquals(0.0, metrics.contractionRate, 0.0)
        assertEquals(0.0, metrics.lineWordsCV, 0.0)
    }

    @Test
    fun curlyQuotesCountAsSpeech() {
        val metrics = VoiceMeter.measure("\u201CI\u2019m fine,\u201D she said. \u201CReally.\u201D")
        assertEquals(2, metrics.spokenLines)
        assertEquals(0.5, metrics.contractionRate, 0.001)
    }

    @Test
    fun roundTripsThroughJson() {
        val metrics = VoiceMeter.measure(person)
        assertEquals(metrics, VoiceMetrics.decode(VoiceMetrics.encode(metrics)))
        assertEquals(null, VoiceMetrics.decode(""))
        assertEquals(null, VoiceMetrics.decode("not json"))
    }
}

class VoiceLintTest {

    private fun kinds(text: String) = VoiceLint.scan(text).map { it.kind }

    @Test
    fun findsTheAntithesisFamily() {
        assertTrue(VoiceLint.Kind.Antithesis in kinds("It's not anger, it's grief."))
        assertTrue(VoiceLint.Kind.Antithesis in kinds("This wasn't a threat. It was a promise."))
        assertTrue(VoiceLint.Kind.Antithesis in kinds("Not just a door, but a way out."))
        assertTrue(VoiceLint.Kind.Antithesis in kinds("No warning, no apology, just the sound of the latch."))
    }

    @Test
    fun leavesOrdinaryNegationAlone() {
        assertTrue(VoiceLint.Kind.Antithesis !in kinds("I'm not going. I don't want to, and that's the end of it."))
        assertTrue(VoiceLint.scan("She did not answer.").isEmpty())
    }

    @Test
    fun findsStockPhrases() {
        val findings = VoiceLint.scan("A shiver ran down her spine. It was a testament to something unspoken.")
        assertTrue(findings.any { it.kind == VoiceLint.Kind.Slop && it.excerpt.contains("shiver", ignoreCase = true) })
        assertTrue(findings.any { it.kind == VoiceLint.Kind.Slop && it.excerpt.contains("testament", ignoreCase = true) })
    }

    @Test
    fun reportsDashDensityOnlyOnLongEnoughText() {
        val dashy = "word \u2014 ".repeat(30) + "and then some more words to pass fifty " + "filler ".repeat(20)
        assertTrue(VoiceLint.Kind.DashDensity in kinds(dashy))
        assertTrue(VoiceLint.Kind.DashDensity !in kinds("short \u2014 line \u2014 here"))
    }

    @Test
    fun describeReadsAsLinesAVoicePassCanActOn() {
        assertEquals("Nothing flagged.", VoiceLint.describe(emptyList()))
        val described = VoiceLint.describe(VoiceLint.scan("It's not anger, it's grief. A shiver ran down her spine."))
        assertTrue(described.contains("Reversal shape:"))
        assertTrue(described.contains("Stock phrase:"))
    }
}
