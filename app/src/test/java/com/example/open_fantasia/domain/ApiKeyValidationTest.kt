package com.example.open_fantasia.domain

import com.example.open_fantasia.ui.settings.SettingsViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ApiKeyValidationTest {

    @Test
    fun google_validPrefix_passes() {
        assertNull(SettingsViewModel.validateApiKeyFormat("google", "AIzaSyD-12345"))
    }

    @Test
    fun google_invalidPrefix_returnsError() {
        assertEquals("Google API key must start with 'AIza'", SettingsViewModel.validateApiKeyFormat("google", "sk-123"))
    }

    @Test
    fun groq_validPrefix_passes() {
        assertNull(SettingsViewModel.validateApiKeyFormat("groq", "gsk_y7u8i9o0p"))
    }

    @Test
    fun groq_invalidPrefix_returnsError() {
        assertEquals("Groq API key must start with 'gsk_'", SettingsViewModel.validateApiKeyFormat("groq", "AIzaSyD"))
    }

    @Test
    fun openRouter_validPrefix_passes() {
        assertNull(SettingsViewModel.validateApiKeyFormat("openrouter", "sk-or-v1-abcdef"))
    }

    @Test
    fun openRouter_invalidPrefix_returnsError() {
        assertEquals("OpenRouter API key must start with 'sk-or-'", SettingsViewModel.validateApiKeyFormat("openrouter", "sk-abcdef"))
    }

    @Test
    fun deepSeek_validPrefix_passes() {
        assertNull(SettingsViewModel.validateApiKeyFormat("deepseek", "sk-123456789"))
    }

    @Test
    fun deepSeek_invalidPrefix_returnsError() {
        assertEquals("DeepSeek API key must start with 'sk-'", SettingsViewModel.validateApiKeyFormat("deepseek", "AIzaKey"))
    }

    @Test
    fun mistral_validLength_passes() {
        assertNull(SettingsViewModel.validateApiKeyFormat("mistral", "12345678901234567890")) // 20 chars
    }

    @Test
    fun mistral_shortKey_returnsError() {
        assertEquals("Mistral API key must be at least 20 characters long", SettingsViewModel.validateApiKeyFormat("mistral", "1234567890"))
    }

    @Test
    fun ollama_anyKey_passes() {
        assertNull(SettingsViewModel.validateApiKeyFormat("ollama", ""))
        assertNull(SettingsViewModel.validateApiKeyFormat("ollama", "anything"))
    }
}
