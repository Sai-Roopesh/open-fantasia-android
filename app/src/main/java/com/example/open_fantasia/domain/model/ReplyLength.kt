package com.example.open_fantasia.domain.model

/**
 * How much prose a reply should contain.
 *
 * The glossary has always said this is "an intention about visible story text only" and listed
 * _Avoid: Max tokens, token budget, output cap_. The schema stored it as `max_output_tokens: Int`
 * anyway, and one integer then meant two incompatible things: what a person wants to read, and where a
 * provider cuts the stream off. `ReplyBudget` exists solely to pull those apart again at the last
 * moment, which is the cost of having conflated them at the first.
 *
 * So the authored value is a name. The transport ceiling is derived from it by whichever adapter needs
 * one, and is never stored, never authored, and never part of a Roleplay Context — ADR-0006 already
 * says the ceiling is an adapter capability rather than story context.
 *
 * [words] is what the model is actually told, because paragraphs are elastic and a model sizes them to
 * taste. Measured on one thread, "roughly 3-4 paragraphs" produced 2,536 characters of Claude Sonnet
 * prose, around 430 words, because its paragraphs run 600-800 characters. A word count is a unit the
 * request and the reply agree on.
 */
enum class ReplyLength(
    val id: String,
    val label: String,
    val description: String,
    /** The prose target the model is given, in words. */
    val words: Int,
    /** Headroom over [words] for the transport ceiling, before any reasoning allowance. */
    private val ceilingTokens: Int
) {
    Terse("terse", "Terse", "A beat, not a scene", words = 90, ceilingTokens = 750),
    Measured("measured", "Measured", "Standard roleplay length", words = 180, ceilingTokens = 2048),
    Full("full", "Full", "A developed scene", words = 320, ceilingTokens = 4096),
    Expansive("expansive", "Expansive", "Long-form, when the scene earns it", words = 520, ceilingTokens = 8192),
    Unbounded("unbounded", "Unbounded", "Whatever the scene needs", words = 0, ceilingTokens = 16384);

    val hasTarget: Boolean get() = words > 0

    /**
     * The `max_tokens` an adapter should send. Derived, never stored.
     *
     * Generously above [words] on purpose. A ceiling exists to stop a runaway, not to shape prose: a cap
     * tight enough to enforce length would sever a reply mid-sentence instead of shortening it, and
     * [ReplyBudget] records what that cost the last time it happened.
     */
    fun transportCeiling(provider: String): Int = ReplyBudget.transportCeiling(ceilingTokens, provider)

    companion object {
        val Default = Full
        fun from(id: String?): ReplyLength = entries.firstOrNull { it.id == id } ?: Default

        /**
         * Reads a legacy `max_output_tokens` as the intention it was standing in for.
         *
         * The 12-to-13 migration does this same mapping in SQL, so nothing in Kotlin calls this and
         * only its test does. It is kept as the executable statement of what those old numbers meant,
         * next to the enum they map onto, where the SQL cannot say it.
         */
        fun fromLegacyTokens(tokens: Int): ReplyLength = when {
            tokens <= 750 -> Terse
            tokens <= 2048 -> Measured
            tokens <= 4096 -> Full
            tokens <= 8192 -> Expansive
            else -> Unbounded
        }
    }
}

/**
 * How a [ReplyLength] is stated to a particular model.
 *
 * Models do not respond to a length request identically, and the differences are large enough to matter:
 * measured across 738 committed replies, doubling the old budget moved Gemini from 1,463 to 2,273
 * characters while it moved Claude Sonnet from 1,971 to only 2,536. A single number stated to every
 * model is therefore a number that is wrong for most of them.
 *
 * The correction lives here rather than in [ReplyLength] so the authored intention stays one thing and
 * the delivery stays adjustable. Every factor is 1.0 today, and that is deliberate: the measurements
 * above were taken under a directive phrased in paragraphs, and they cannot be carried over to one
 * phrased in words without measuring again. Fitting a factor from data gathered under a different
 * instruction would be a guess wearing the costume of a measurement.
 *
 * To fit them: for a model with enough committed replies at one length, compare median words written
 * against [ReplyLength.words] and set the factor to the ratio that closes the gap. `roleplay_generation_jobs`
 * already records every request beside the reply it produced.
 */
object ReplyLengthCalibration {

    private val factors: Map<String, Double> = emptyMap()

    fun targetWords(length: ReplyLength, modelId: String): Int {
        if (!length.hasTarget) return 0
        val factor = factors[modelId] ?: 1.0
        return (length.words * factor).toInt()
    }

    /**
     * The sentence the model reads. A range rather than a point, because a single number invites either
     * padding or a truncated thought, and both read worse than prose that landed near the mark. One
     * sentence, inside the whisper, in the register the reply should have: it used to be three, and the
     * second one argued with the first.
     */
    fun directive(length: ReplyLength, modelId: String): String {
        if (!length.hasTarget) {
            return "As long as it needs. Stop when it's done."
        }
        val target = targetWords(length, modelId)
        val low = (target * 0.8).toInt()
        val high = (target * 1.2).toInt()
        return "About $low\u2013$high words. Finish the thought and stop."
    }
}
