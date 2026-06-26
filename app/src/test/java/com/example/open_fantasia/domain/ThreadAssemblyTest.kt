package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.ThreadAssemblyHelpers
import org.junit.Assert.*
import org.junit.Test

class ThreadAssemblyTest {

    private fun makeTurn(id: String, parentId: String?): ChatTurnRecord {
        return ChatTurnRecord(
            id = id,
            thread_id = "thread-1",
            branch_origin_id = "branch-1",
            parent_turn_id = parentId,
            user_input_text = "Input $id",
            user_input_payload = "[]",
            assistant_output_text = "Output $id",
            assistant_output_payload = "[]",
            generation_status = "committed",
            reserved_by_user_id = "user-1",
            generation_started_at = "",
            created_at = "",
            updated_at = ""
        )
    }

    @Test
    fun testBuildTurnPathChronological() {
        // Path: turn-1 -> turn-2 -> turn-3 (head)
        val turns = listOf(
            makeTurn("turn-2", "turn-1"),
            makeTurn("turn-3", "turn-2"),
            makeTurn("turn-1", null)
        )

        val path = ThreadAssemblyHelpers.buildTurnPath(turns, "turn-3")

        assertEquals(3, path.size)
        assertEquals("turn-1", path[0].id)
        assertEquals("turn-2", path[1].id)
        assertEquals("turn-3", path[2].id)
    }

    @Test
    fun testBuildTurnPathDetectsCycles() {
        // Path cycle: turn-1 -> turn-2 -> turn-1
        val turns = listOf(
            makeTurn("turn-1", "turn-2"),
            makeTurn("turn-2", "turn-1")
        )

        try {
            ThreadAssemblyHelpers.buildTurnPath(turns, "turn-2")
            fail("Should have thrown IllegalStateException due to cycle")
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.contains("cycle"))
        }
    }

    @Test
    fun testBuildThreadAssemblyFiltering() {
        val turns = listOf(
            makeTurn("turn-1", null),
            makeTurn("turn-2", "turn-1"),
            makeTurn("turn-unreachable", "turn-1")
        )

        val branch = ChatBranchRecord(
            id = "branch-1",
            thread_id = "thread-1",
            name = "Active Branch",
            parent_branch_id = null,
            fork_turn_id = null,
            head_turn_id = "turn-2",
            is_active = true,
            created_by = "user-1",
            created_at = "",
            updated_at = ""
        )

        val pins = listOf(
            ChatPinRecord("pin-reachable", "thread-1", "branch-1", "turn-2", "Pin body", "active", "", ""),
            ChatPinRecord("pin-unreachable", "thread-1", "branch-1", "turn-unreachable", "Pin body", "active", "", ""),
            ChatPinRecord("pin-manual", "thread-1", "branch-1", null, "Manual pin", "active", "", "")
        )

        val timeline = listOf(
            TimelineEventRecord("time-reachable", "thread-1", "branch-1", "turn-1", "Title", "Reachable", 2, "beat", emptyList(), emptyList(), ""),
            TimelineEventRecord("time-unreachable", "thread-1", "branch-1", "turn-unreachable", "Title", "Unreachable", 2, "beat", emptyList(), emptyList(), "")
        )

        val thread = ThreadRecord(
            id = "thread-1",
            user_id = "user-1",
            character_id = "char-1",
            connection_id = "conn-1",
            model_id = "model-1",
            persona_id = null,
            brain_connection_id = null,
            brain_model_id = null,
            title = "Title",
            created_at = "",
            updated_at = ""
        )

        // Execution
        val assembly = ThreadAssemblyHelpers.buildThreadAssembly(
            thread = thread,
            branches = listOf(branch),
            turns = turns,
            characterBundle = null,
            timelineRows = timeline,
            pinRows = pins
        )

        // Verification
        assertEquals(2, assembly.turns.size)
        assertEquals("turn-2", assembly.latestTurn?.id)

        // Pins: reachable and manual should be kept, unreachable filtered out
        assertEquals(2, assembly.pins.size)
        assertTrue(assembly.pins.any { it.id == "pin-reachable" })
        assertTrue(assembly.pins.any { it.id == "pin-manual" })
        assertFalse(assembly.pins.any { it.id == "pin-unreachable" })

        // Timeline: reachable kept, unreachable filtered out
        assertEquals(1, assembly.timeline.size)
        assertEquals("time-reachable", assembly.timeline.first().id)
    }
}
