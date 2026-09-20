package com.example.open_fantasia.ui.chat

import com.example.open_fantasia.data.continuity.ContinuityHostState
import com.example.open_fantasia.data.continuity.RoleplayProtocol
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MacRoleplayStatusTextTest {
    @Test
    fun unavailableMacHostExplainsThatTailscaleAndTheHostAreRequired() {
        assertEquals(
            "Waiting for Mac Host — turn on Tailscale on this phone and the Mac.",
            macRoleplayStatusText(
                RoleplayProtocol.CLAUDE_CODE_MODEL_ID,
                ContinuityHostState.Unavailable("timeout")
            )
        )
    }

    @Test
    fun availableHostNamesTheFrozenMacModel() {
        assertEquals(
            "Claude Sonnet High is writing on your Mac…",
            macRoleplayStatusText(
                RoleplayProtocol.CLAUDE_CODE_MODEL_ID,
                ContinuityHostState.Available
            )
        )
        assertEquals(
            "Gemini 3.6 Flash High is writing on your Mac…",
            macRoleplayStatusText(
                RoleplayProtocol.ANTIGRAVITY_MODEL_ID,
                ContinuityHostState.Available
            )
        )
    }

    @Test
    fun everyMacModelInTheCatalogueIsAnnouncedByName() {
        // The status line used to branch on one id and call everything else Gemini, so a model added
        // to the catalogue would have been announced as the wrong one while it wrote.
        RoleplayProtocol.models.forEach { entry ->
            assertEquals(
                "${entry.name} is writing on your Mac…",
                macRoleplayStatusText(entry.id, ContinuityHostState.Available)
            )
        }
    }

    @Test
    fun bothOpusModelsAreOfferedAndPinnedToAVersion() {
        val ids = RoleplayProtocol.models.map { it.id }
        assertEquals(true, ids.contains(RoleplayProtocol.CLAUDE_OPUS_48_MODEL_ID))
        assertEquals(true, ids.contains(RoleplayProtocol.CLAUDE_OPUS_5_MODEL_ID))
        // An alias follows whatever shipped last. A thread would change voice without being told.
        assertEquals(false, ids.contains("claude-code:opus:high"))
    }

    @Test
    fun directModelsDoNotShowMacHostStatus() {
        assertNull(macRoleplayStatusText("deepseek-v4-pro", ContinuityHostState.Unavailable()))
    }
}
