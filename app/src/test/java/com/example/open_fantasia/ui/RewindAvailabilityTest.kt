package com.example.open_fantasia.ui

import com.example.open_fantasia.ui.chat.canRewind
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A Rewind creates no Continuity Update, so almost nothing may hold it off.
 *
 * The rule it replaces trapped people: a failed Continuity Update locked the lineage, and because Rewind
 * was disabled while any checkpoint existed, the only exits were retrying the thing that had just failed
 * or repairing data from outside the app. Retreating out of a failure is now allowed; only an Update
 * genuinely in flight is not, which is also what keeps a Rewind from stranding a running Mac Host job.
 * See ADR-0013.
 */
class RewindAvailabilityTest {

    @Test
    fun `a branch with no checkpoint can rewind`() {
        assertTrue(canRewind(generationLocked = false, checkpointStatus = null))
    }

    @Test
    fun `a failed Continuity Update no longer traps the lineage`() {
        assertTrue(canRewind(generationLocked = false, checkpointStatus = "failed"))
    }

    @Test
    fun `an Update in flight holds the Rewind off`() {
        for (status in listOf("pending_export", "queued", "generating", "validating", "running")) {
            assertFalse("$status must block a Rewind", canRewind(generationLocked = false, checkpointStatus = status))
        }
    }

    @Test
    fun `generation in progress always blocks, whatever the checkpoint says`() {
        assertFalse(canRewind(generationLocked = true, checkpointStatus = null))
        assertFalse(canRewind(generationLocked = true, checkpointStatus = "failed"))
    }
}
