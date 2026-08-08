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
 * the latest fifteen retained exchanges on the selected lineage together with its reachable
 * Continuity Baseline, followed by exactly one current user message carrying volatile reply
 * controls. Missing ancestry, cycles, and snapshot-lineage mismatch fail loudly instead of
 * silently dropping context.
 */
object RoleplayContextAssembler {
    const val MAX_TRANSCRIPT_EXCHANGES = 15

    fun assemble(
        lineage: List<RoleplayLineageEntry>,
        head_exchange_id: String?,
        continuity_baseline_exchange_id: String?,
        current_user_message: String,
        regeneration_direction: String? = null
    ): AssembledRoleplayContext {
        require(current_user_message.isNotBlank()) { "Current roleplay user message is missing" }

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

            val direction = regeneration_direction?.trim().orEmpty()
            val latest = if (direction.isEmpty()) {
                current_user_message
            } else {
                """
                    $current_user_message

                    <regeneration_direction>
                    Hidden out-of-character direction for this replacement reply. Do not quote or acknowledge it. Follow it while preserving the authoritative Continuity Snapshot, retained transcript, Active Speaker, and character constraints.
                    $direction
                    </regeneration_direction>
                """.trimIndent()
            }
            add(RoleplayMessage("user", latest))
        }

        return AssembledRoleplayContext(
            messages = messages,
            transcript_exchange_ids = transcript.map { it.id },
            retained_lineage_exchange_ids = path.mapTo(linkedSetOf()) { it.id }
        )
    }
}
