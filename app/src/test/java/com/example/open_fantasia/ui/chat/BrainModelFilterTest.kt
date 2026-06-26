package com.example.open_fantasia.ui.chat

import com.example.open_fantasia.data.local.entity.ConnectionEntity
import com.example.open_fantasia.domain.selector.filterBrainConnections
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BrainModelFilterTest {

    @Test
    fun deepSeekConnections_filteredFromBrainList() {
        val connections = listOf(
            createMockConnection(id = "1", provider = "deepseek", label = "DeepSeek Provider"),
            createMockConnection(id = "2", provider = "google", label = "Google Provider"),
            createMockConnection(id = "3", provider = "DEEPSEEK", label = "DeepSeek Upper Provider")
        )

        val filtered = connections.filterBrainConnections()

        assertEquals(1, filtered.size)
        assertEquals("google", filtered[0].provider)
    }

    @Test
    fun nonDeepSeekConnections_includedInBrainList() {
        val connections = listOf(
            createMockConnection(id = "1", provider = "google", label = "Google Provider"),
            createMockConnection(id = "2", provider = "groq", label = "Groq Provider"),
            createMockConnection(id = "3", provider = "openrouter", label = "OpenRouter Provider")
        )

        val filtered = connections.filterBrainConnections()

        assertEquals(3, filtered.size)
        assertTrue(filtered.any { it.provider == "google" })
        assertTrue(filtered.any { it.provider == "groq" })
        assertTrue(filtered.any { it.provider == "openrouter" })
    }

    private fun createMockConnection(id: String, provider: String, label: String): ConnectionEntity {
        return ConnectionEntity(
            id = id,
            user_id = "user_1",
            provider = provider,
            label = label,
            base_url = null,
            encrypted_api_key = null,
            enabled = true,
            default_model_id = null,
            model_cache = emptyList(),
            health_status = "healthy",
            health_message = "",
            last_checked_at = null,
            last_model_refresh_at = null,
            last_synced_at = null,
            created_at = "",
            updated_at = ""
        )
    }
}
