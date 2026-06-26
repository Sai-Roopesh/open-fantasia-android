package com.example.open_fantasia.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.open_fantasia.data.local.dao.ConnectionDao
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import com.example.open_fantasia.data.remote.LLMClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

class SettingsViewModel(
    private val connectionDao: ConnectionDao,
    private val llmClient: LLMClient
) : ViewModel() {

    private val FIXED_USER_ID = "00000000-0000-0000-0000-000000000000"

    val connections: StateFlow<List<ConnectionEntity>> = connectionDao.getAllConnectionsFlow().stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    fun saveConnection(
        id: String?,
        provider: String,
        label: String,
        baseUrl: String?,
        apiKey: String?,
        enabled: Boolean,
        defaultModelId: String?
    ) {
        viewModelScope.launch {
            val now = Instant.now().toString()
            val connId = id ?: UUID.randomUUID().toString()

            val existing = id?.let { connectionDao.getConnection(it) }

            // Local-first, single-user, on-device app: the key lives in this device's DB
            // anyway, so encrypting it against a sibling-stored key is theatre that only
            // breaks (BAD_DECRYPT) when the key sources drift. Store the API key as-is.
            val encryptedKey = if (!apiKey.isNullOrEmpty()) {
                apiKey.trim()
            } else {
                existing?.encrypted_api_key
            }

            val connection = ConnectionEntity(
                id = connId,
                user_id = FIXED_USER_ID,
                provider = provider,
                label = label,
                base_url = baseUrl,
                encrypted_api_key = encryptedKey,
                enabled = enabled,
                default_model_id = defaultModelId ?: existing?.default_model_id,
                model_cache = existing?.model_cache ?: emptyList(),
                health_status = existing?.health_status ?: "untested",
                health_message = existing?.health_message ?: "",
                last_checked_at = existing?.last_checked_at,
                last_model_refresh_at = existing?.last_model_refresh_at,
                last_synced_at = existing?.last_synced_at,
                created_at = existing?.created_at ?: now,
                updated_at = now
            )

            connectionDao.insertConnection(connection)
            refreshModelCache(connection.id)
        }
    }

    fun deleteConnection(connection: ConnectionEntity) {
        viewModelScope.launch {
            connectionDao.deleteConnection(connection)
        }
    }

    // Non-destructive health probe (web parity: "Test connection"). Runs the same
    // discovery health check as refreshModelCache, but does NOT overwrite model_cache
    // or last_model_refresh_at — it only updates health_status/message/last_checked_at.
    fun testConnection(connectionId: String) {
        viewModelScope.launch {
            val connection = connectionDao.getConnection(connectionId) ?: return@launch
            try {
                val discovered = llmClient.discoverModels(connection.toDomain())
                val now = Instant.now().toString()
                val updated = connection.copy(
                    health_status = "healthy",
                    health_message = "Connection OK (${discovered.size} models reachable).",
                    last_checked_at = now,
                    updated_at = now
                )
                connectionDao.insertConnection(updated)
            } catch (e: Exception) {
                val now = Instant.now().toString()
                val updated = connection.copy(
                    health_status = "failed",
                    health_message = e.message ?: "Connection test failed.",
                    last_checked_at = now,
                    updated_at = now
                )
                connectionDao.insertConnection(updated)
            }
        }
    }

    fun refreshModelCache(connectionId: String) {
        viewModelScope.launch {
            val connection = connectionDao.getConnection(connectionId) ?: return@launch
            try {
                // 1. Discover models via LLM client
                val discovered = llmClient.discoverModels(connection.toDomain())
                val now = Instant.now().toString()
                val updated = connection.copy(
                    model_cache = discovered,
                    health_status = "healthy",
                    health_message = "Discovered ${discovered.size} models.",
                    last_checked_at = now,
                    last_model_refresh_at = now,
                    updated_at = now
                )
                connectionDao.insertConnection(updated)
            } catch (e: Exception) {
                val now = Instant.now().toString()
                val updated = connection.copy(
                    health_status = "failed",
                    health_message = e.message ?: "Model discovery failed.",
                    last_checked_at = now,
                    updated_at = now
                )
                connectionDao.insertConnection(updated)
            }
        }
    }

    companion object {
        fun validateApiKeyFormat(provider: String, apiKey: String): String? {
            val trimmed = apiKey.trim()
            if (trimmed.isEmpty() && provider != "ollama") return null
            return when (provider.lowercase()) {
                "google" -> if (!trimmed.startsWith("AIza")) "Google API key must start with 'AIza'" else null
                "groq" -> if (!trimmed.startsWith("gsk_")) "Groq API key must start with 'gsk_'" else null
                "openrouter" -> if (!trimmed.startsWith("sk-or-")) "OpenRouter API key must start with 'sk-or-'" else null
                "deepseek" -> if (!trimmed.startsWith("sk-")) "DeepSeek API key must start with 'sk-'" else null
                "mistral" -> if (trimmed.length < 20) "Mistral API key must be at least 20 characters long" else null
                else -> null
            }
        }
    }
}
