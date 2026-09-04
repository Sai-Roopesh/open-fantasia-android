package com.example.open_fantasia.data.continuity

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ContinuityEngineAvailabilityTest {

    private val claude = ContinuityHostPreferences.CLAUDE_OPUS_HIGH
    private val codex = ContinuityHostPreferences.CODEX_TERRA_HIGH

    /** Before any health check the phone knows nothing, and nothing is what it must claim. */
    @Test
    fun anUnaskedHostBlocksNothing() {
        val nothingKnown = ContinuityEngineAvailability()
        assertNull(nothingKnown.unavailableReason(claude))
        assertTrue(nothingKnown.isSelectable(claude))
    }

    @Test
    fun anEngineTheHostCannotRunSaysWhy() {
        val availability = ContinuityEngineAvailability(
            runnable = setOf(codex),
            unavailable = mapOf(claude to "Claude Code is not installed or not available to the Mac Host")
        )
        assertEquals(
            "Claude Code is not installed or not available to the Mac Host",
            availability.unavailableReason(claude)
        )
        assertFalse(availability.isSelectable(claude))
        assertNull(availability.unavailableReason(codex))
        assertTrue(availability.isSelectable(codex))
    }

    /** An engine the host simply never mentions is still out of reach, with a plain reason. */
    @Test
    fun anEngineTheHostNeverMentionsIsStillOutOfReach() {
        val availability = ContinuityEngineAvailability(runnable = setOf(codex))
        assertEquals("This Mac Host does not offer this engine", availability.unavailableReason(claude))
        assertFalse(availability.isSelectable(claude))
    }

    /**
     * A Mac that can run none of them leaves every choice open. Greying out the whole dialog would
     * strand a person mid-thread with nothing to press, and a refused checkpoint now explains itself.
     */
    @Test
    fun aHostThatRunsNoEngineLeavesEveryChoiceOpen() {
        val availability = ContinuityEngineAvailability(
            unavailable = mapOf(claude to "not signed in", codex to "not signed in")
        )
        assertEquals("not signed in", availability.unavailableReason(claude))
        assertTrue(availability.isSelectable(claude))
    }

    @Test
    fun forgettingTheHostForgetsWhatItCouldRun() {
        assertEquals(ContinuityEngineAvailability(), ContinuityEngineAvailability(emptySet(), emptyMap()))
    }

    /**
     * A refusal of the request cannot become an acceptance, so it fails the checkpoint and reaches
     * the person with the host's own reason. Anything else is still worth waiting for.
     */
    @Test
    fun aRefusedRequestFailsWithTheHostsReason() {
        assertEquals(
            "Continuity Engine is unavailable: Claude Code is not installed or not available to the Mac Host",
            refusalDetail(
                ContinuityHostHttpException(
                    400,
                    "Continuity Engine is unavailable: Claude Code is not installed or not available to the Mac Host"
                )
            )
        )
        assertEquals(
            IMMUTABLE_CONFLICT_DETAIL,
            refusalDetail(ContinuityHostHttpException(409, "conflict"))
        )
        assertEquals(
            "The Mac Host refused this Continuity Update",
            refusalDetail(ContinuityHostHttpException(413, "  "))
        )
    }

    @Test
    fun anUnreachableOrUnauthenticatedHostKeepsWaiting() {
        assertNull(refusalDetail(ContinuityHostHttpException(401, "Pairing credential is missing or invalid")))
        assertNull(refusalDetail(ContinuityHostHttpException(426, "protocol is incompatible")))
        assertNull(refusalDetail(ContinuityHostHttpException(503, "draining")))
        assertNull(refusalDetail(java.io.IOException("network is unreachable")))
    }
}
