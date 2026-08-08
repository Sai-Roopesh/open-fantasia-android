package com.example.open_fantasia.domain.model

data class BranchLineageRef(
    val id: String,
    val parentBranchId: String?
)

data class TurnLineageRef(
    val id: String,
    val parentTurnId: String?
)

data class BranchLineageSelection(
    val branchIdsInOrder: List<String>,
    val reachableTurnIds: Set<String>
) {
    val branchIds: Set<String> = branchIdsInOrder.toSet()

    fun contains(branchId: String, turnId: String?): Boolean =
        branchId in branchIds && (turnId == null || turnId in reachableTurnIds)
}

/**
 * Owns the definition of branch-valid state. Side state belongs to a branch ancestry and, when
 * tied to an exchange, is visible only while that exchange remains reachable from the head.
 */
object BranchLineage {
    fun select(
        branches: List<BranchLineageRef>,
        turns: List<TurnLineageRef>,
        branchId: String,
        headTurnId: String?
    ): BranchLineageSelection {
        val branchById = branches.associateBy { it.id }
        val branchPath = mutableListOf<String>()
        val seenBranches = mutableSetOf<String>()
        var branchCursor: String? = branchId
        while (branchCursor != null) {
            check(seenBranches.add(branchCursor)) { "Detected a branch ancestry cycle." }
            val branch = branchById[branchCursor]
                ?: error("Branch ancestry is incomplete at $branchCursor.")
            branchPath += branch.id
            branchCursor = branch.parentBranchId
        }
        branchPath.reverse()

        val turnById = turns.associateBy { it.id }
        val turnIds = linkedSetOf<String>()
        var turnCursor = headTurnId
        while (turnCursor != null) {
            check(turnIds.add(turnCursor)) { "Detected a Roleplay Exchange ancestry cycle." }
            val turn = turnById[turnCursor]
                ?: error("Roleplay Exchange ancestry is incomplete at $turnCursor.")
            turnCursor = turn.parentTurnId
        }

        return BranchLineageSelection(branchPath, turnIds)
    }

    fun <T> reachable(
        rows: List<T>,
        selection: BranchLineageSelection,
        branchId: (T) -> String,
        turnId: (T) -> String?
    ): List<T> = rows.filter { selection.contains(branchId(it), turnId(it)) }

    fun <T, K> overlay(
        rows: List<T>,
        selection: BranchLineageSelection,
        branchId: (T) -> String,
        firstSeenTurnId: (T) -> String?,
        key: (T) -> K
    ): List<T> {
        val branchOrder = selection.branchIdsInOrder.withIndex().associate { it.value to it.index }
        return rows
            .filter {
                branchId(it) in selection.branchIds &&
                    (firstSeenTurnId(it) == null || firstSeenTurnId(it) in selection.reachableTurnIds)
            }
            .sortedBy { branchOrder.getValue(branchId(it)) }
            .associateBy(key)
            .values
            .toList()
    }
}
