package com.example.open_fantasia.domain.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.math.sqrt

/**
 * How a reply's dialogue measures against the way people talk.
 *
 * This is the measurement commit `66d4add` made once by hand — 11% of spoken lines carried a
 * contraction, 0.4% a hedge, none a self-correction, median line six words — made permanent. It is
 * computed on every committed reply and stored beside the request that produced it, so a prompt
 * change is judged by what it did to these numbers rather than by how it reads.
 *
 * Every rate is over spoken lines: the text inside quotation marks. Narration is deliberately
 * excluded, because the defect being measured is in speech, and a reply can be full of contractions
 * in its prose while every line of dialogue is a polished epigram.
 *
 * Pure. No model, no I/O, deterministic.
 */
@Serializable
data class VoiceMetrics(
    /** Spoken segments found: runs of text inside straight or curly double quotes. */
    val spokenLines: Int,
    /** Words across all spoken lines. */
    val spokenWords: Int,
    /** Lines containing at least one contraction (don't, I'm, it's, you're, we've, she'd, they'll). */
    val contractionRate: Double,
    /** Lines containing a hedge or filler (I mean, I guess, sort of, kind of, maybe, well, um, uh, like,). */
    val hedgeRate: Double,
    /** Lines with a visible restart or trail-off: a mid-line dash or ellipsis, or an immediately repeated word. */
    val restartRate: Double,
    /** Median words per spoken line. */
    val medianLineWords: Double,
    /** Coefficient of variation of words per line. Human talk is lumpy; a low value means every line is the same size. */
    val lineWordsCV: Double,
    /** Lines ending in a question mark. */
    val questionRate: Double,
    /** Spoken lines whose final sentence is a short declarative capping a long one — the epigram shape. */
    val epigramEndRate: Double,
    /** "Not X, but Y" and its relatives, per 1,000 words of the whole reply. */
    val antithesisPer1k: Double,
    /** Matches against the slop phrase list, per 1,000 words of the whole reply. */
    val slopPer1k: Double,
    /** Em and en dashes per 100 words of the whole reply. */
    val dashPer100: Double
) {
    companion object {
        private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

        fun encode(metrics: VoiceMetrics): String = json.encodeToString(serializer(), metrics)

        fun decode(stored: String?): VoiceMetrics? {
            if (stored.isNullOrBlank()) return null
            return runCatching { json.decodeFromString(serializer(), stored) }.getOrNull()
        }

        /** The measured baseline from commit `66d4add`, for comparison in the Inspector. */
        val Baseline = VoiceMetrics(
            spokenLines = 919, spokenWords = 0, contractionRate = 0.11, hedgeRate = 0.004,
            restartRate = 0.0, medianLineWords = 6.0, lineWordsCV = 0.0, questionRate = 0.0,
            epigramEndRate = 0.0, antithesisPer1k = 0.0, slopPer1k = 0.0, dashPer100 = 0.0
        )
    }
}

object VoiceMeter {

    /** Text inside straight or curly double quotes. Single quotes are not matched: they are apostrophes. */
    private val SPOKEN = Regex("[\"\u201C]([^\"\u201C\u201D]{2,}?)[\"\u201D]")

    private val WORD = Regex("[\\p{L}\\p{N}'\u2019]+")

    private val CONTRACTION = Regex(
        "\\b(?:\\w+n[\u2019']t|i[\u2019']m|(?:you|we|they)[\u2019']re|(?:he|she|it|that|there|what|who|where|how)[\u2019']s|" +
            "\\w+[\u2019']ll|\\w+[\u2019']ve|\\w+[\u2019']d|let[\u2019']s|y[\u2019']all|gonna|wanna|gotta|dunno|kinda|sorta)\\b",
        RegexOption.IGNORE_CASE
    )

    // A lookahead rather than a trailing \b, because several of these end in a comma and \b cannot sit
    // between a comma and a space.
    private val HEDGE = Regex(
        "\\b(?:i mean|i guess|i think|i suppose|i don[\u2019']t (?:know|think)|sort of|kind of|kinda|sorta|maybe|probably|honestly|actually|basically|anyway|" +
            "well,|um+|uh+|er+|erm|hm+|mm+|like,|right,|look,|you know|yeah|yep|nah|or something|or whatever)" +
            "(?=[\\s,.!?;:\u2014\u2013\u2026\"\u201D]|$)",
        RegexOption.IGNORE_CASE
    )

    /** A dash or ellipsis with words on both sides, or a word said twice running ("okay, okay", "no no"). */
    private val MID_LINE_BREAK = Regex("\\S\\s*(?:\u2014|\u2013|--|\\.\\.\\.|\u2026)\\s*\\S")
    private val REPEATED_WORD = Regex("\\b(\\w{2,})\\b[,.]?\\s+\\b\\1\\b", RegexOption.IGNORE_CASE)

    private val DASH = Regex("[\u2014\u2013]|--")

    private val SENTENCE_SPLIT = Regex("(?<=[.!?])\\s+")

    fun measure(reply: String): VoiceMetrics {
        val lines = SPOKEN.findAll(reply).map { it.groupValues[1].trim() }.filter { it.isNotEmpty() }.toList()
        val lineWords = lines.map { WORD.findAll(it).count() }
        val totalWords = WORD.findAll(reply).count().coerceAtLeast(1)
        val n = lines.size

        fun rate(predicate: (String) -> Boolean): Double =
            if (n == 0) 0.0 else lines.count(predicate).toDouble() / n

        val median = if (n == 0) 0.0 else lineWords.sorted().let { s ->
            if (s.size % 2 == 1) s[s.size / 2].toDouble() else (s[s.size / 2 - 1] + s[s.size / 2]) / 2.0
        }
        val mean = if (n == 0) 0.0 else lineWords.average()
        val cv = if (n < 2 || mean == 0.0) 0.0 else {
            val variance = lineWords.sumOf { (it - mean) * (it - mean) } / (n - 1)
            sqrt(variance) / mean
        }

        val lint = VoiceLint.scan(reply)

        return VoiceMetrics(
            spokenLines = n,
            spokenWords = lineWords.sum(),
            contractionRate = rate { CONTRACTION.containsMatchIn(it) },
            hedgeRate = rate { HEDGE.containsMatchIn(it) },
            restartRate = rate { MID_LINE_BREAK.containsMatchIn(it) || REPEATED_WORD.containsMatchIn(it) },
            medianLineWords = median,
            lineWordsCV = cv,
            questionRate = rate { it.trimEnd().endsWith("?") },
            epigramEndRate = rate(::endsOnEpigram),
            antithesisPer1k = lint.count { it.kind == VoiceLint.Kind.Antithesis } * 1000.0 / totalWords,
            slopPer1k = lint.count { it.kind == VoiceLint.Kind.Slop } * 1000.0 / totalWords,
            dashPer100 = DASH.findAll(reply).count() * 100.0 / totalWords
        )
    }

    /**
     * The shape commit `66d4add` called "the single clearest sign of a machine writing dialogue": a
     * line whose last sentence is a short, contraction-free declarative capping a longer one.
     */
    internal fun endsOnEpigram(line: String): Boolean {
        val sentences = SENTENCE_SPLIT.split(line.trim()).filter { it.isNotBlank() }
        if (sentences.size < 2) return false
        val last = sentences.last()
        val previous = sentences[sentences.size - 2]
        val lastWords = WORD.findAll(last).count()
        val previousWords = WORD.findAll(previous).count()
        return lastWords in 1..8 && previousWords >= 12 && !last.trimEnd().endsWith("?") &&
            !CONTRACTION.containsMatchIn(last)
    }
}
