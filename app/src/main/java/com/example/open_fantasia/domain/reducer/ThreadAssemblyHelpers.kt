package com.example.open_fantasia.domain.reducer

import com.example.open_fantasia.domain.model.*

object ThreadAssemblyHelpers {

    /**
     * Walks backward from headTurnId via parent_turn_id pointers.
     * Throws IllegalStateException on cycles or history depth limit (5000).
     */
    fun buildTurnPath(turns: List<ChatTurnRecord>, headTurnId: String?): List<ChatTurnRecord> {
        if (headTurnId == null) return emptyList()

        val turnsById = turns.associateBy { it.id }
        val path = mutableListOf<ChatTurnRecord>()
        val seen = mutableSetOf<String>()
        
        var currentId = headTurnId
        while (currentId != null) {
            if (seen.contains(currentId)) {
                throw IllegalStateException("Detected a turn cycle while building the branch path.")
            }
            seen.add(currentId)

            if (path.size >= 5000) {
                throw IllegalStateException("Branch history exceeded the supported depth limit.")
            }

            val turn = turnsById[currentId] ?: break // Graceful stop for missing ancestors
            path.add(turn)
            currentId = turn.parent_turn_id
        }

        return path.reversed()
    }

    /**
     * Replicates buildThreadAssembly(): filters timeline events and pins to only
     * those belonging to the active branch's reachable turn path.
     */
    fun buildThreadAssembly(
        thread: ThreadRecord,
        branches: List<ChatBranchRecord>,
        turns: List<ChatTurnRecord>,
        characterBundle: CharacterBundle?,
        timelineRows: List<TimelineEventRecord>,
        pinRows: List<ChatPinRecord>
    ): ThreadAssembly {
        val activeBranch = branches.find { it.is_active }
            ?: branches.firstOrNull()
            ?: throw IllegalStateException("Thread has no active branch.")

        val reachableTurns = buildTurnPath(turns, activeBranch.head_turn_id)
        val reachableTurnIds = reachableTurns.map { it.id }.toSet()

        val filteredTimeline = timelineRows.filter { row ->
            row.turn_id == null || reachableTurnIds.contains(row.turn_id)
        }

        val filteredPins = pinRows.filter { row ->
            row.turn_id == null || reachableTurnIds.contains(row.turn_id)
        }

        return ThreadAssembly(
            thread = thread,
            branches = branches,
            activeBranch = activeBranch,
            turns = reachableTurns,
            latestTurn = reachableTurns.lastOrNull(),
            characterBundle = characterBundle,
            timeline = filteredTimeline,
            pins = filteredPins
        )
    }
}
