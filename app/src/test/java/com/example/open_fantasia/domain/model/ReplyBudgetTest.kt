package com.example.open_fantasia.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReplyBudgetTest {

    @Test
    fun reasoningProviderGetsHeadroomOnTopOfTheRequestedProse() {
        // Measured on deepseek-v4-pro: a 2048 cap left 379 tokens of prose after reasoning.
        assertEquals(2048 + 8192, ReplyBudget.transportCeiling(2048, "deepseek"))
        assertEquals(4096 + 8192, ReplyBudget.transportCeiling(4096, "deepseek"))
    }

    @Test
    fun headroomCoversTheLargestObservedReasoningBurst() {
        // The worst case seen was 4,025 hidden tokens against a 4096 cap, which left 71 visible.
        val ceiling = ReplyBudget.transportCeiling(750, "deepseek")
        assertTrue("headroom must exceed observed reasoning bursts", ceiling - 750 > 4_025)
    }

    @Test
    fun nonReasoningProvidersAreUnchanged() {
        listOf("openai", "google", "anthropic", "openrouter", "mistral", "groq", "ollama").forEach {
            assertEquals("$it must not change", 2048, ReplyBudget.transportCeiling(2048, it))
        }
    }

    @Test
    fun providerMatchIsCaseAndWhitespaceInsensitive() {
        assertTrue(ReplyBudget.emitsHiddenReasoning("DeepSeek"))
        assertTrue(ReplyBudget.emitsHiddenReasoning("  deepseek  "))
        assertTrue(ReplyBudget.emitsHiddenReasoning("DEEPSEEK"))
        assertFalse(ReplyBudget.emitsHiddenReasoning("deepseek-clone"))
        assertFalse(ReplyBudget.emitsHiddenReasoning(""))
    }

    @Test
    fun everyPresetSurvivesTheWorstObservedReasoningBurst() {
        // The presets a user can pick in Thread Settings.
        listOf(750, 2048, 4096, 8192, 16384).forEach { preset ->
            val prose = ReplyBudget.transportCeiling(preset, "deepseek") - 4_025
            assertTrue("preset $preset must still leave room for prose", prose >= preset)
        }
    }
}
