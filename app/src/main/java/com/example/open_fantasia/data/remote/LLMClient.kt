package com.example.open_fantasia.data.remote

import com.example.open_fantasia.domain.model.ConnectionRecord
import com.example.open_fantasia.domain.model.ModelCatalogEntry
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.JsonObject

interface LLMClient {
    suspend fun discoverModels(connection: ConnectionRecord): List<ModelCatalogEntry>

    suspend fun generateText(
        connection: ConnectionRecord,
        modelId: String,
        systemPrompt: String,
        messages: List<ChatMessage>,
        temperature: Double,
        topP: Double,
        maxTokens: Int,
        jsonMode: Boolean = false,
        // When set (and the provider supports it), sends a json_schema response_format so the
        // model's output is grammar-constrained to this shape. Far more reliable than the loose
        // json_object mode for structured extraction (HCE). Providers that can't do schema-
        // constrained decoding ignore it — callers should retry with plain jsonMode as a fallback.
        jsonSchema: JsonObject? = null,
        // Sent only where the backend is known to accept it (Ollama; OpenRouter models advertising it).
        minP: Double? = null
    ): String

    fun streamGenerateText(
        connection: ConnectionRecord,
        modelId: String,
        systemPrompt: String,
        messages: List<ChatMessage>,
        temperature: Double,
        topP: Double,
        maxTokens: Int,
        jsonMode: Boolean = false,
        jsonSchema: JsonObject? = null,
        minP: Double? = null
    ): Flow<StreamChunk>
}

data class ChatMessage(val role: String, val content: String)
data class StreamChunk(
    val text: String?,
    val finishReason: String? = null,
    val totalTokens: Int? = null,
    val promptTokens: Int? = null,
    val completionTokens: Int? = null,
    val promptCacheHitTokens: Int? = null,
    val promptCacheMissTokens: Int? = null
)
