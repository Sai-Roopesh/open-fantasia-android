package com.example.open_fantasia.domain.model

/**
 * A retained Roleplay Exchange from outside the Transcript Window, brought back because this beat is
 * about it.
 *
 * Everything older than fifteen exchanges reaches a Roleplay Model only as extraction: a fact row, a
 * clause of a Story Summary, and now an Entity Account. Extraction is lossy by construction, and
 * measured comparisons of memory representations find verbatim passages beat extracted artifacts on
 * recall. The Record — every exchange, verbatim, branch-valid — has been in `chat_turns` the whole time
 * and has simply been unreachable past a fixed recency slice.
 *
 * This is the reach. It is retrieval, not memory: nothing is stored, nothing is summarized, and the
 * exchange comes back exactly as it was written.
 */
data class RecalledExchange(
    val turnId: String,
    /** How many exchanges back this sits from the current head, for the model to place it in time. */
    val exchangesAgo: Int,
    val playerProse: String,
    val assistantProse: String,
    /** The words in the player's current message that brought this back. */
    val matched: List<String>
)

/**
 * Chooses which older exchanges this beat is asking for.
 *
 * Deterministic, because a Roleplay Generation Request is frozen and must compile the same way twice.
 * No embeddings and no index: the signal is the player's own prose, which is the only statement of what
 * this turn is about that exists before the reply is written.
 *
 * The bar is deliberately high. A beat that matches nothing distinctive recalls nothing, because an
 * irrelevant exchange dragged back into a scene is worse than the absence of one — it invites the model
 * to answer a question nobody asked, which is the failure the Scene Intent work spent a day removing.
 */
object ExchangeRecall {

    private data class Scored(
        val entry: RoleplayLineageEntry,
        val hits: Set<String>,
        val weight: Double,
        val exchangesAgo: Int
    )

    /**
     * How strong a match has to be before an exchange is worth interrupting a scene for.
     *
     * A weight is the sum of each matched term's inverse frequency, so 1.0 is the strength of one word
     * appearing nowhere else in the story, or two that very nearly do — a word the player did not reuse
     * by accident. Below that the overlap is ordinary vocabulary, and the cost of being wrong is high:
     * an irrelevant exchange presented as the moment this turn is reaching for invites the model to
     * answer a question nobody asked.
     */
    const val MIN_WEIGHT = 1.0

    /** How many exchanges the Transcript Window already carries. Anything inside it is not recalled. */
    const val WINDOW = RoleplayContextAssembler.MAX_TRANSCRIPT_EXCHANGES

    const val MAX_RECALLED = 3
    const val MAX_CHARS = 6_000

    /** A term must clear this to count as distinctive; shorter words match everything. */
    private const val MIN_TERM_LENGTH = 5

    /**
     * Words too common in roleplay prose to locate anything.
     *
     * Deliberately short and hand-picked rather than a general English stoplist: this runs against
     * fiction, where "remember", "little" and "night" are ordinary but "cottage", "jammer" and
     * "pregnancy" are exactly the hooks a person is reaching for.
     */
    private val COMMON = setOf(
        "about", "after", "again", "against", "almost", "already", "always", "another", "around",
        "because", "before", "being", "between", "could", "every", "first", "going", "here", "into",
        "just", "know", "like", "little", "look", "looking", "made", "make", "might", "more", "much",
        "never", "night", "nothing", "really", "right", "said", "same", "should", "since", "some",
        "something", "still", "such", "than", "that", "their", "them", "then", "there", "these",
        "they", "thing", "think", "this", "those", "through", "time", "toward", "under", "until",
        "very", "want", "wanted", "were", "what", "when", "where", "which", "while", "with", "without",
        "would", "your", "yours", "remember", "happened", "happening", "asks", "says", "tells", "turns", "looks", "hand",
        "hands", "eyes", "face", "voice", "back", "away", "down", "over", "into", "onto"
    )

    private val WORD = Regex("[\\p{L}\\p{N}']+")

    private fun terms(text: String): Set<String> =
        WORD.findAll(text.lowercase())
            .map { it.value.trim('\'') }
            .filter { it.length >= MIN_TERM_LENGTH && it !in COMMON }
            .toSet()

    /**
     * @param lineage the branch-valid exchanges, oldest first, as the Transcript Window resolves them.
     * @param currentMessage the player's prose for this turn — the only statement of what it is about.
     */
    fun select(
        lineage: List<RoleplayLineageEntry>,
        currentMessage: String,
        maxRecalled: Int = MAX_RECALLED,
        maxChars: Int = MAX_CHARS
    ): List<RecalledExchange> {
        val wanted = terms(currentMessage)
        if (wanted.isEmpty()) return emptyList()

        val committed = lineage.filter { it.generation_status == "committed" && !it.starter_seed }
        // Everything the Transcript Window already carries verbatim. Recalling one of those would spend
        // the budget saying something the model can already read.
        val older = committed.dropLast(WINDOW)
        if (older.isEmpty()) return emptyList()

        val bodies = older.map { terms(it.user_text + "\n" + it.assistant_text.orEmpty()) }

        // How rare each wanted term is in this story. Counting matched terms alone treats a word that
        // appears in seventy exchanges as worth the same as one that appears in three, which on a real
        // thread let a generic verb decide which moment came back. Rarity is what makes a term a hook.
        val rarity = wanted.associateWith { term ->
            val appearances = bodies.count { term in it }
            if (appearances == 0) 0.0 else 1.0 / appearances
        }

        val scored = older.indices.mapNotNull { index ->
            val hits = bodies[index].intersect(wanted)
            if (hits.isEmpty()) return@mapNotNull null
            val weight = hits.sumOf { rarity[it] ?: 0.0 }
            // Below the floor is a coincidence, not a callback. Measured across 1,883 real turns this
            // fired on 96% of them, a quarter resting on one shared word — and a Continuity Snapshot
            // already carries what happened, so an exchange recalled on thin evidence adds no fact and
            // costs the reply a wrong memory. Recall is for the rare turn reaching for one moment.
            if (weight < MIN_WEIGHT) return@mapNotNull null
            Scored(
                entry = older[index],
                hits = hits,
                weight = weight,
                exchangesAgo = committed.size - index - 1
            )
        }

        // Rarest match wins. A tie goes to the more recent, which is the better guess at which of two
        // equally relevant moments a person means, and turn id breaks a remaining tie so the frozen
        // request compiles identically twice.
        //
        // Preferring the exchange carrying the most dialogue was tried here and removed: weights are
        // continuous, so exact ties essentially never occur and the comparison never ran. Measured, it
        // moved the speech share of recalled text by nothing at all — 33% before and after.
        val ordered = scored.sortedWith(
            compareByDescending<Scored> { it.weight }
                .thenBy { it.exchangesAgo }
                .thenBy { it.entry.id }
        )

        val out = mutableListOf<RecalledExchange>()
        var budget = maxChars
        for (candidate in ordered) {
            if (out.size >= maxRecalled) break
            val entry = candidate.entry
            val cost = entry.user_text.length + (entry.assistant_text?.length ?: 0)
            if (cost > budget) continue
            budget -= cost
            out += RecalledExchange(
                turnId = entry.id,
                exchangesAgo = candidate.exchangesAgo,
                playerProse = entry.user_text,
                assistantProse = entry.assistant_text.orEmpty(),
                matched = candidate.hits.sorted()
            )
        }
        // Oldest first, so a reader meets them in the order the story did.
        return out.sortedByDescending { it.exchangesAgo }
    }
}

object RecallRendering {

    const val TAG = "recalled_exchanges"

    /**
     * How recalled prose is presented.
     *
     * The one thing that must not happen is a model mistaking an exchange from two hundred turns ago for
     * something that just happened. Each is stamped with its distance and stated to be finished, and the
     * whole block says plainly that the recent transcript is still where the scene lives.
     */
    fun render(recalled: List<RecalledExchange>): String? {
        if (recalled.isEmpty()) return null
        return buildString {
            appendLine(
                "Earlier moments this turn seems to be reaching for, quoted exactly. They already happened " +
                    "and are long past — do not treat them as recent, do not continue from them, and do not " +
                    "repeat them back. The conversation below is still where the scene is."
            )
            recalled.forEach { item ->
                appendLine()
                appendLine("— ${item.exchangesAgo} exchanges ago —")
                appendLine("Player: ${item.playerProse.trim()}")
                appendLine("Reply: ${item.assistantProse.trim()}")
            }
        }.trimEnd()
    }
}
