package com.example.open_fantasia.data.continuity

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A Continuity Engine identity is protocol, and both ends declare it independently.
 *
 * An engine Android offers but the Mac Host does not know is worse than a missing feature: the
 * choice is frozen into a checkpoint, the lineage locks behind it, and the submission is then
 * refused as an unsupported engine. An engine the host runs but Android never offers is simply
 * invisible. Either way the drift is silent until someone reaches a checkpoint, so it is checked
 * here instead.
 */
class ContinuityEngineParityTest {

    private val hostServer = File("../tools/continuity-worker/host-server.mjs")

    private fun hostEngineIdentities(): Set<String> =
        Regex("""export const \w*CONTINUITY_ENGINE = "([^"]+)"""")
            .findAll(hostServer.readText())
            .map { it.groupValues[1] }
            .toSet()

    @Test
    fun everyOfferedEngineIsOneTheMacHostRuns() {
        assertTrue(
            "Mac Host source not found at ${hostServer.absolutePath}",
            hostServer.isFile
        )
        assertEquals(hostEngineIdentities(), ContinuityHostPreferences.SUPPORTED_CONTINUITY_ENGINES)
    }

    @Test
    fun claudeOpusHighIsOfferedWithItsOwnIdentityAndName() {
        val claude = ContinuityHostPreferences.CONTINUITY_ENGINES
            .single { it.id == ContinuityHostPreferences.CLAUDE_OPUS_HIGH }
        assertEquals("claude-code:opus:high", claude.id)
        assertEquals("Claude Opus High", claude.label)
        assertEquals(
            "Claude Opus High",
            ContinuityHostPreferences.continuityEngineLabel(ContinuityHostPreferences.CLAUDE_OPUS_HIGH)
        )
    }

    @Test
    fun engineIdentitiesAndNamesAreDistinct() {
        val engines = ContinuityHostPreferences.CONTINUITY_ENGINES
        assertEquals(engines.size, engines.map { it.id }.distinct().size)
        assertEquals(engines.size, engines.map { it.label }.distinct().size)
    }

    /** An unknown engine cannot become the stored default; the host would refuse every checkpoint. */
    @Test
    fun anUnknownEngineIsNotSupported() {
        assertTrue("claude-code:haiku:low" !in ContinuityHostPreferences.SUPPORTED_CONTINUITY_ENGINES)
    }
}
