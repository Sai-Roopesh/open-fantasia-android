package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.CastSeedHealAction
import com.example.open_fantasia.domain.model.CastSeedRow
import com.example.open_fantasia.domain.model.castSeedNameKey
import com.example.open_fantasia.domain.model.planCastSeedDeduplication
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Cast Seed names must be unique within a thread, because two seeds sharing a name make the Continuity
 * Snapshot rules unsatisfiable and the thread can never produce a Continuity Update again. Healing runs
 * once, during migration, over data a person authored — so it is tested here rather than trusted.
 */
class CastSeedDeduplicationTest {

    private fun row(
        castId: String,
        name: String,
        createdAt: String = "2026-01-01T00:00:00Z",
        threadId: String = "thread-1",
        content: List<String?> = listOf("role", "personality")
    ) = CastSeedRow(castId, threadId, name, createdAt, content)

    @Test
    fun `a thread without duplicates is left alone`() {
        val actions = planCastSeedDeduplication(
            listOf(row("a", "Dr. Ayushi Mehra"), row("b", "Dr. Aditya Sen"))
        )
        assertTrue(actions.isEmpty())
    }

    @Test
    fun `an identical re-paste is removed and the oldest keeps the name`() {
        val actions = planCastSeedDeduplication(
            listOf(
                row("newer", "Dr. Arjun Malhotra", createdAt = "2026-02-01T00:00:00Z"),
                row("older", "Dr. Arjun Malhotra", createdAt = "2026-01-01T00:00:00Z")
            )
        )
        assertEquals(listOf(CastSeedHealAction.Remove("newer")), actions)
    }

    @Test
    fun `a genuinely different character keeps everything and gains a number`() {
        val actions = planCastSeedDeduplication(
            listOf(
                row("older", "Dr. Arjun Malhotra", createdAt = "2026-01-01T00:00:00Z"),
                row("newer", "Dr. Arjun Malhotra", createdAt = "2026-02-01T00:00:00Z", content = listOf("cardiologist", "brisk"))
            )
        )
        assertEquals(
            listOf(CastSeedHealAction.Rename("newer", "Dr. Arjun Malhotra (2)", "dr. arjun malhotra (2)")),
            actions
        )
    }

    @Test
    fun `renaming never collides with a name the thread already uses`() {
        val actions = planCastSeedDeduplication(
            listOf(
                row("a", "Vera", createdAt = "2026-01-01T00:00:00Z"),
                row("b", "Vera (2)", createdAt = "2026-01-02T00:00:00Z"),
                row("c", "Vera", createdAt = "2026-01-03T00:00:00Z", content = listOf("other", "other"))
            )
        )
        assertEquals(listOf(CastSeedHealAction.Rename("c", "Vera (3)", "vera (3)")), actions)
    }

    @Test
    fun `names differing only by case or padding are the same name`() {
        val actions = planCastSeedDeduplication(
            listOf(
                row("a", "Dr. Zoya Khan", createdAt = "2026-01-01T00:00:00Z"),
                row("b", "  dr. zoya khan ", createdAt = "2026-01-02T00:00:00Z")
            )
        )
        assertEquals(listOf(CastSeedHealAction.Remove("b")), actions)
    }

    @Test
    fun `duplicates are scoped to their own thread`() {
        val actions = planCastSeedDeduplication(
            listOf(row("a", "Vera", threadId = "thread-1"), row("b", "Vera", threadId = "thread-2"))
        )
        assertTrue(actions.isEmpty())
    }

    @Test
    fun `three identical pastes leave exactly one seed`() {
        val actions = planCastSeedDeduplication(
            listOf(
                row("a", "Vera", createdAt = "2026-01-01T00:00:00Z"),
                row("b", "Vera", createdAt = "2026-01-02T00:00:00Z"),
                row("c", "Vera", createdAt = "2026-01-03T00:00:00Z")
            )
        )
        assertEquals(listOf(CastSeedHealAction.Remove("b"), CastSeedHealAction.Remove("c")), actions)
    }

    @Test
    fun `the name key matches what the Mac Host compares`() {
        assertEquals("dr. arjun malhotra", castSeedNameKey("  Dr. Arjun Malhotra  "))
    }
}
