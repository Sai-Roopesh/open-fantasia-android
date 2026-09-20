package com.example.open_fantasia.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class RoleplayContextAssemblerTest {

    private fun linear(count: Int): List<RoleplayLineageEntry> = (1..count).map { index ->
        RoleplayLineageEntry(
            id = "turn-$index",
            parent_id = if (index == 1) null else "turn-${index - 1}",
            user_text = "raw-user-$index",
            assistant_text = "assistant-$index",
            generation_status = "committed",
            starter_seed = false
        )
    }

    @Test
    fun `latest fifteen complete exchanges are sent in chronological role order`() {
        val result = RoleplayContextAssembler.assemble(
            lineage = linear(20),
            head_exchange_id = "turn-20",
            continuity_baseline_exchange_id = "turn-15",
            current_user_message = "<reply_control>Yunxi</reply_control>\ncurrent-user"
        )

        assertEquals((6..20).map { "turn-$it" }, result.transcript_exchange_ids)
        assertEquals(31, result.messages.size)
        assertEquals(RoleplayMessage("user", "raw-user-6"), result.messages.first())
        assertEquals(RoleplayMessage("assistant", "assistant-20"), result.messages[29])
        assertEquals("user", result.messages.last().role)
        assertTrue(result.messages.last().content.endsWith("current-user"))
    }

    @Test
    fun `selected branch excludes sibling continuation`() {
        val shared = linear(4)
        val branchA = RoleplayLineageEntry(
            "branch-a", "turn-4", "raw-a", "assistant-a", "committed", false
        )
        val branchB = RoleplayLineageEntry(
            "branch-b", "turn-4", "raw-b", "assistant-b", "committed", false
        )

        val result = RoleplayContextAssembler.assemble(
            lineage = shared + branchA + branchB,
            head_exchange_id = "branch-b",
            continuity_baseline_exchange_id = "turn-4",
            current_user_message = "current"
        )

        assertEquals(listOf("turn-1", "turn-2", "turn-3", "turn-4", "branch-b"), result.transcript_exchange_ids)
        assertFalse(result.messages.any { it.content.contains("raw-a") || it.content.contains("assistant-a") })
    }

    @Test
    fun `edit or regenerate parent selects only ancestry before replaced exchange`() {
        val result = RoleplayContextAssembler.assemble(
            lineage = linear(10),
            head_exchange_id = "turn-6",
            continuity_baseline_exchange_id = "turn-5",
            current_user_message = "<reply_control>Ananya</reply_control>\nedited user prose"
        )

        assertEquals((1..6).map { "turn-$it" }, result.transcript_exchange_ids)
        assertFalse(result.messages.any { it.content.contains("raw-user-7") })
        assertEquals(1, result.messages.count { it.content.contains("<reply_control>") })
        // A revision direction is prompt content, not lineage, and this module now owns only lineage.
        // What it must still guarantee is the ancestry: everything from the replaced exchange onward is
        // absent, whoever asked for the reply. See [Revision].
        assertTrue(result.messages.last().content.contains("edited user prose"))
    }

    @Test
    fun `historical rendered state cannot enter the transcript`() {
        val lineage = linear(2)
        val result = RoleplayContextAssembler.assemble(
            lineage = lineage,
            head_exchange_id = "turn-2",
            continuity_baseline_exchange_id = null,
            current_user_message = "<reply_control>Yunxi</reply_control>\nlatest"
        )

        assertEquals(listOf("raw-user-1", "raw-user-2"), result.messages.filter { it.role == "user" }.dropLast(1).map { it.content })
        assertEquals(1, result.messages.count { it.content.contains("<reply_control>") })
        assertEquals(0, result.messages.count { it.content.contains("<durable_state>") })
    }

    @Test
    fun `starter seed is not a Roleplay Exchange`() {
        val starter = RoleplayLineageEntry(
            "starter", null, "hidden seed", "opening", "committed", true
        )
        val first = RoleplayLineageEntry(
            "turn-1", "starter", "hello", "hi", "committed", false
        )

        val result = RoleplayContextAssembler.assemble(
            lineage = listOf(starter, first),
            head_exchange_id = "turn-1",
            continuity_baseline_exchange_id = null,
            current_user_message = "current"
        )

        assertEquals(listOf("turn-1"), result.transcript_exchange_ids)
        assertFalse(result.messages.any { it.content.contains("hidden seed") })
    }

    @Test
    fun `broken ancestry and unrelated Continuity Baseline fail closed`() {
        val missingParent = RoleplayLineageEntry(
            "turn-2", "missing", "u", "a", "committed", false
        )
        assertThrows(IllegalArgumentException::class.java) {
            RoleplayContextAssembler.assemble(
                lineage = listOf(missingParent),
                head_exchange_id = "turn-2",
                continuity_baseline_exchange_id = null,
                current_user_message = "current"
            )
        }

        assertThrows(IllegalArgumentException::class.java) {
            RoleplayContextAssembler.assemble(
                lineage = linear(2) + RoleplayLineageEntry(
                    "other", null, "other", "other", "committed", false
                ),
                head_exchange_id = "turn-2",
                continuity_baseline_exchange_id = "other",
                current_user_message = "current"
            )
        }
    }

    // ---- Voice Anchor -------------------------------------------------------------------------------

    private val examples = listOf(
        ExampleConversation("Where were you?", "Out. Walking. I don't — it doesn't matter where."),
        ExampleConversation("You okay?", "Mm."),
        ExampleConversation("", "orphan line with no player side"),
        ExampleConversation("Tea?", "God, yes. Yes. Two sugars, don't judge me.")
    )

    @Test
    fun `the voice anchor is whole exchanges, as real turns, skipping half-written ones`() {
        val anchor = RoleplayContextAssembler.voiceAnchor(examples)
        assertEquals(6, anchor.size)
        assertEquals(RoleplayMessage("user", "Where were you?"), anchor[0])
        assertEquals("assistant", anchor[1].role)
        assertFalse(anchor.any { it.content.contains("orphan") })
    }

    @Test
    fun `the anchor is capped in exchanges and in characters`() {
        val many = (1..10).map { ExampleConversation("u$it", "a$it") }
        assertEquals(RoleplayContextAssembler.MAX_ANCHOR_EXCHANGES * 2, RoleplayContextAssembler.voiceAnchor(many).size)
        val huge = listOf(ExampleConversation("u", "x".repeat(RoleplayContextAssembler.MAX_ANCHOR_CHARS + 1)), ExampleConversation("u2", "short"))
        val anchor = RoleplayContextAssembler.voiceAnchor(huge)
        assertEquals(listOf("u2", "short"), anchor.map { it.content })
    }

    @Test
    fun `the anchor precedes the transcript and is not counted as story`() {
        val anchor = RoleplayContextAssembler.voiceAnchor(examples)
        val result = RoleplayContextAssembler.assemble(
            lineage = linear(20),
            head_exchange_id = "turn-20",
            continuity_baseline_exchange_id = "turn-15",
            current_user_message = "current-user",
            voice_anchor = anchor
        )
        assertEquals(anchor.size + 31, result.messages.size)
        assertEquals(anchor, result.messages.take(anchor.size))
        assertEquals(RoleplayMessage("user", "raw-user-6"), result.messages[anchor.size])
        assertEquals("the anchor is not story", (6..20).map { "turn-$it" }, result.transcript_exchange_ids)
        assertFalse(result.retained_lineage_exchange_ids.any { it.startsWith("anchor") })
    }

    @Test
    fun `a broken anchor is refused rather than misattributed`() {
        assertThrows(IllegalArgumentException::class.java) {
            RoleplayContextAssembler.assemble(
                lineage = linear(3), head_exchange_id = "turn-3", continuity_baseline_exchange_id = null,
                current_user_message = "now",
                voice_anchor = listOf(RoleplayMessage("assistant", "who said this?"))
            )
        }
    }
}
