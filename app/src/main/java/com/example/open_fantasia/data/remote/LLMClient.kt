package com.example.open_fantasia.data.remote

import com.example.open_fantasia.domain.model.ConnectionRecord
import com.example.open_fantasia.domain.model.ModelCatalogEntry
import kotlinx.coroutines.flow.Flow

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
        jsonMode: Boolean = false
    ): String

    fun streamGenerateText(
        connection: ConnectionRecord,
        modelId: String,
        systemPrompt: String,
        messages: List<ChatMessage>,
        temperature: Double,
        topP: Double,
        maxTokens: Int,
        jsonMode: Boolean = false
    ): Flow<StreamChunk>
}

data class ChatMessage(val role: String, val content: String)
data class StreamChunk(val text: String?, val finishReason: String? = null, val totalTokens: Int? = null)
