package com.example.open_fantasia.domain.model

/**
 * The tells of machine prose, found rather than forbidden.
 *
 * Nothing here is sent to a model. Telling a model which phrases to avoid names them, and naming them
 * raises their frequency (Castricato et al., 2024). This runs on the reply after it exists, records
 * what it found beside the job for [VoiceMetrics], and — when the Voice Pass is on — tells that pass
 * which lines to rewrite. It never rejects a reply: a false positive that cost a person a good reply
 * would be worse than a slop line getting through.
 *
 * The antithesis family — "not X, but Y", "it's not X, it's Y", "no X, no Y, just Z" — is weighted
 * highest because it is the construction most consistently over-represented in model output relative
 * to human text (Wikipedia's *Signs of AI writing* lists it first among structural tells; EQ-Bench
 * weights it at 25% of its slop score). The phrase list is a starting set drawn from the same
 * sources and is meant to be extended from measurement, not from taste.
 */
object VoiceLint {

    enum class Kind { Antithesis, Slop, DashDensity }

    data class Finding(val kind: Kind, val excerpt: String, val start: Int)

    private val ANTITHESIS = listOf(
        // "not just X, but Y" / "not only X but Y" / "not merely X — Y"
        Regex("\\bnot\\s+(?:just|only|merely|simply)\\s+[^.;!?\n]{2,60}?[,\u2014\u2013-]\\s*(?:but|rather|it[\u2019']s|it was)\\b", RegexOption.IGNORE_CASE),
        // "it's not X, it's Y" / "it wasn't X. It was Y" / "this isn't X; it's Y"
        Regex("\\b(?:it|this|that)(?:[\u2019']s| is| was)\\s+not\\s+[^.;!?\n]{2,60}?[.;,\u2014\u2013-]\\s*(?:it|this|that)(?:[\u2019']s| is| was)\\b", RegexOption.IGNORE_CASE),
        Regex("\\b(?:isn|wasn)[\u2019']t\\s+[^.;!?\n]{2,60}?[.;,\u2014\u2013-]\\s*(?:it|this|that)(?:[\u2019']s| is| was)\\b", RegexOption.IGNORE_CASE),
        // "no X, no Y, just Z" / "no X, no Y, only Z"
        Regex("\\bno\\s+\\w+,\\s+no\\s+\\w+(?:,\\s+no\\s+\\w+)?[,.;\u2014\u2013-]?\\s+(?:just|only)\\b", RegexOption.IGNORE_CASE),
        // "not X — Y" where the dash carries the reversal and Y is short
        Regex("\\bnot\\s+\\w+(?:\\s+\\w+)?\\s*[\u2014\u2013]\\s*\\w+(?:\\s+\\w+)?[.!]", RegexOption.IGNORE_CASE)
    )

    private val SLOP = listOf(
        "\\ba testament to\\b", "\\bshivers? (?:ran |run |running )?(?:down|up|through)\\b", "\\bthe weight of (?:it|that|the|her|his)\\b",
        "\\bsomething (?:shifted|flickered|unspoken|unreadable)\\b", "\\ba beat\\.", "\\blet out a breath (?:s?he |they )?(?:didn[\u2019']t|hadn[\u2019']t) (?:know|realize|realise)\\b",
        "\\bbarely above a whisper\\b", "\\bthe silence stretched\\b", "\\beyes (?:searching|scanning|raking) (?:his|her|their) face\\b",
        "\\bcouldn[\u2019']t help but\\b", "\\bfound (?:him|her|them)sel(?:f|ves)\\b", "\\bin that moment\\b", "\\ba (?:mix|mixture) of \\w+ and \\w+\\b",
        "\\ba (?:flicker|ghost|hint) of (?:a )?(?:smile|something)\\b", "\\bvoice (?:low|thick|rough) with\\b", "\\bthe air (?:between them )?(?:thick|heavy|charged)\\b",
        "\\bfor a long moment\\b", "\\b(?:un)?spoken (?:words?|question) (?:hung|hanging)\\b", "\\bthe corner of (?:his|her) mouth\\b", "\\bswallowed (?:hard|thickly)\\b",
        "\\bjaw (?:tightened|clenched)\\b", "\\bknuckles whitened\\b", "\\ba muscle (?:in|along) (?:his|her) jaw\\b", "\\ba (?:quiet|small|soft) (?:laugh|sound) escaped\\b",
        "\\bthe ghost of a\\b", "\\bpalpable\\b", "\\bkaleidoscope\\b", "\\bsymphony of\\b", "\\btapestry of\\b"
    ).map { Regex(it, RegexOption.IGNORE_CASE) }

    private val DASH = Regex("[\u2014\u2013]|--")
    private val WORD = Regex("[\\p{L}\\p{N}'\u2019]+")

    /** Em/en dashes per 100 words above which density itself is reported as a finding. */
    const val DASH_PER_100_THRESHOLD = 3.0

    fun scan(reply: String): List<Finding> {
        val findings = mutableListOf<Finding>()
        ANTITHESIS.forEach { rx ->
            rx.findAll(reply).forEach { findings += Finding(Kind.Antithesis, it.value, it.range.first) }
        }
        SLOP.forEach { rx ->
            rx.findAll(reply).forEach { findings += Finding(Kind.Slop, it.value, it.range.first) }
        }
        val words = WORD.findAll(reply).count()
        if (words >= 50) {
            val dashes = DASH.findAll(reply).count()
            val per100 = dashes * 100.0 / words
            if (per100 > DASH_PER_100_THRESHOLD) {
                findings += Finding(Kind.DashDensity, "%.1f dashes per 100 words".format(per100), 0)
            }
        }
        return findings.sortedBy { it.start }
    }

    /**
     * The findings as a Voice Pass reads them: one line each, quoting what was found. Empty input
     * renders as a statement that nothing was flagged, so the pass has something to read either way.
     */
    fun describe(findings: List<Finding>): String {
        if (findings.isEmpty()) return "Nothing flagged."
        return findings.joinToString("\n") { finding ->
            when (finding.kind) {
                Kind.Antithesis -> "Reversal shape: \u201C${finding.excerpt.trim()}\u201D"
                Kind.Slop -> "Stock phrase: \u201C${finding.excerpt.trim()}\u201D"
                Kind.DashDensity -> "Dashes: ${finding.excerpt}"
            }
        }
    }
}
