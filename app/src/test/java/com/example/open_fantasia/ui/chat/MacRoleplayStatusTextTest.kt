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
            "Claude Sonnet is writing on your Mac…",
            macRoleplayStatusText(
                RoleplayProtocol.CLAUDE_CODE_MODEL_ID,
                ContinuityHostState.Available
            )
        )
        assertEquals(
            "Gemini is writing on your Mac…",
            macRoleplayStatusText(
                RoleplayProtocol.ANTIGRAVITY_MODEL_ID,
                ContinuityHostState.Available
            )
        )
    }

    @Test
    fun directModelsDoNotShowMacHostStatus() {
        assertNull(macRoleplayStatusText("deepseek-v4-pro", ContinuityHostState.Unavailable()))
    }
}
