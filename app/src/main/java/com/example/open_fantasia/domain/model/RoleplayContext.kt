package com.example.open_fantasia.domain.model

/**
 * Provider-neutral lineage input used to assemble one Roleplay Generation Request.
 *
 * The rendered user message is intentionally absent. Historical exchanges contribute only
 * their visible transcript prose; current Continuity Snapshot and reply controls are supplied
 * once, separately, for the reply being generated.
 */
data class RoleplayLineageEntry(
    val id: String,
    val parent_id: String?,
    val user_text: String,
    val assistant_text: String?,
    val generation_status: String,
    val starter_seed: Boolean
)

data class AssembledRoleplayContext(
    val messages: List<RoleplayMessage>,
    val transcript_exchange_ids: List<String>,
    val retained_lineage_exchange_ids: Set<String>
)

/**
 * Deep module that owns branch selection and the checkpoint-bounded Roleplay Transcript.
 *
 * Its interface guarantees that every Roleplay Model receives the same retained lineage:
 * the character's Voice Anchor, then the latest fifteen retained exchanges on the selected lineage
 * together with its reachable Continuity Baseline, followed by exactly one current user message
 * carrying volatile reply controls. Missing ancestry, cycles, and snapshot-lineage mismatch fail
 * loudly instead of silently dropping context.
 */
object RoleplayContextAssembler {
    const val MAX_TRANSCRIPT_EXCHANGES = 15

    /**
     * How much of a character's sample dialogue rides ahead of the transcript.
     *
     * Four exchanges is enough to set a voice and few enough that a thread's own first exchanges are
     * not crowded out of the model's attention by demonstrations. The character cap is a guard against a
     * sheet whose "example" is a page of prose.
     */
    const val MAX_ANCHOR_EXCHANGES = 4
    const val MAX_ANCHOR_CHARS = 1_200

    /**
     * The character's sample exchanges as real dialogue turns, ahead of the story so far.
     *
     * A demonstration in the assistant's own turn slot is worth more than the same words quoted in a
     * system prompt: RoleLLM measured dialogue placed as turns winning 63% of judgements against 30% for
     * the same examples as few-shot text (Table 7). And fifteen exchanges of a thread's own history are
     * the strongest style signal in any request — when they are the defect being fixed, these turns are
     * the only demonstration of the wanted voice that arrives as dialogue at all.
     *
     * Static per thread, so it sits inside any provider prefix cache. Excluded from
     * [AssembledRoleplayContext.transcript_exchange_ids], because it is not story.
     */
    fun voiceAnchor(examples: List<ExampleConversation>): List<RoleplayMessage> {
        val usable = examples.filter { it.user_line.isNotBlank() && it.character_line.isNotBlank() }
        val out = mutableListOf<RoleplayMessage>()
        var budget = MAX_ANCHOR_CHARS
        for (example in usable) {
            if (out.size / 2 >= MAX_ANCHOR_EXCHANGES) break
            val reply = example.character_line.trim()
            if (reply.length > budget) continue
            budget -= reply.length
            out += RoleplayMessage("user", example.user_line.trim())
            out += RoleplayMessage("assistant", reply)
        }
        return out
    }

    fun assemble(
        lineage: List<RoleplayLineageEntry>,
        head_exchange_id: String?,
        continuity_baseline_exchange_id: String?,
        current_user_message: String,
        voice_anchor: List<RoleplayMessage> = emptyList()
    ): AssembledRoleplayContext {
        require(current_user_message.isNotBlank()) { "Current roleplay user message is missing" }
        require(voice_anchor.size % 2 == 0 && voice_anchor.withIndex().all { (i, m) -> m.role == if (i % 2 == 0) "user" else "assistant" }) {
            "Voice anchor must be whole user/assistant exchanges"
        }

        val byId = lineage.associateBy { it.id }
        require(byId.size == lineage.size) { "Roleplay lineage contains duplicate exchange IDs" }

        val reversePath = mutableListOf<RoleplayLineageEntry>()
        val visited = mutableSetOf<String>()
        var cursor = head_exchange_id
        while (cursor != null) {
            require(visited.add(cursor)) { "Roleplay lineage contains a cycle at $cursor" }
            val entry = requireNotNull(byId[cursor]) {
                "Roleplay lineage is missing retained exchange $cursor"
            }
            reversePath += entry
            cursor = entry.parent_id
        }
        val path = reversePath.asReversed()

        if (continuity_baseline_exchange_id != null) {
            require(path.any { it.id == continuity_baseline_exchange_id }) {
                "Continuity Baseline is not reachable from the selected branch head"
            }
        }

        require(path.all { it.generation_status == "committed" }) {
            "Roleplay Transcript contains an exchange that is not committed"
        }
        val transcript = path
            .filter { !it.starter_seed }
            .takeLast(MAX_TRANSCRIPT_EXCHANGES)

        val messages = buildList {
            // The Voice Anchor first: demonstrations, then the story. Nothing separates them, because a
            // separator would be one more thing in the request that is not story.
            addAll(voice_anchor)
            transcript.forEach { exchange ->
                val assistantText = requireNotNull(exchange.assistant_text) {
                    "Committed Roleplay Exchange ${exchange.id} has no assistant reply"
                }
                require(assistantText.isNotBlank()) {
                    "Committed Roleplay Exchange ${exchange.id} has an empty assistant reply"
                }
                add(RoleplayMessage("user", exchange.user_text))
                add(RoleplayMessage("assistant", assistantText))
            }

            // A revision direction used to be appended here, which put out-of-character instruction in
            // the player's own voice and left this module deciding prompt content. Both belong to
            // rendering: lineage is a different problem, and this one owns lineage. See [Revision].
            add(RoleplayMessage("user", current_user_message))
        }

        return AssembledRoleplayContext(
            messages = messages,
            transcript_exchange_ids = transcript.map { it.id },
            retained_lineage_exchange_ids = path.mapTo(linkedSetOf()) { it.id }
        )
    }
}
