package com.example.open_fantasia.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BranchLineageTest {
    private val branches = listOf(
        BranchLineageRef("main", null),
        BranchLineageRef("jealousy", "main")
    )
    private val turns = listOf(
        TurnLineageRef("one", null),
        TurnLineageRef("two", "one"),
        TurnLineageRef("discarded", "two"),
        TurnLineageRef("forked", "two")
    )

    @Test
    fun `selection includes inherited state but excludes discarded prose`() {
        val selection = BranchLineage.select(branches, turns, "jealousy", "forked")

        assertEquals(listOf("main", "jealousy"), selection.branchIdsInOrder)
        assertEquals(setOf("one", "two", "forked"), selection.reachableTurnIds)
        assertTrue(selection.contains("main", "two"))
        assertFalse(selection.contains("main", "discarded"))
    }

    @Test
    fun `child override wins without importing a later parent discovery`() {
        data class Override(val branch: String, val firstSeen: String?, val castId: String, val voice: String)
        val selection = BranchLineage.select(branches, turns, "jealousy", "forked")
        val resolved = BranchLineage.overlay(
            rows = listOf(
                Override("main", "one", "yunxi", "quiet"),
                Override("main", "discarded", "later", "unknown"),
                Override("jealousy", "forked", "yunxi", "sharp")
            ),
            selection = selection,
            branchId = { it.branch },
            firstSeenTurnId = { it.firstSeen },
            key = { it.castId }
        )

        assertEquals(listOf("yunxi"), resolved.map { it.castId })
        assertEquals("sharp", resolved.single().voice)
    }
}
