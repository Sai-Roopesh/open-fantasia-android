package com.example.open_fantasia.data.remote

import android.util.Log
import com.example.open_fantasia.domain.model.ConnectionRecord
import com.example.open_fantasia.domain.model.ModelCatalogEntry
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.utils.io.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.json.*

class KtorLLMClient(
    private val client: HttpClient = createDefaultClient()
) : LLMClient {

    companion object {
        private const val TAG = "KtorLLMClient"

        fun createDefaultClient(): HttpClient {
            return HttpClient(CIO) {
                install(ContentNegotiation) {
                    json(Json {
                        ignoreUnknownKeys = true
                        prettyPrint = false
                        coerceInputValues = true
                    })
                }
                install(HttpTimeout) {
                    requestTimeoutMillis = 60_000
                    connectTimeoutMillis = 15_000
                    socketTimeoutMillis = 60_000
                }
            }
        }
    }

    private val json = Json { ignoreUnknownKeys = true }

    private fun decryptKey(connection: ConnectionRecord): String {
        // Keys are stored in plaintext (see SettingsViewModel). A legacy "iv.tag.cipher"
        // value left over from the removed encryption can't be recovered — treat it as
        // empty so the user is prompted to re-enter the key rather than sending garbage.
        val stored = connection.encrypted_api_key?.trim().orEmpty()
        val looksLegacyEncrypted = stored.count { it == '.' } == 2 && stored.none { it == ' ' } && stored.length > 40
        return if (looksLegacyEncrypted) "" else stored
    }

    private fun normalizeOllamaUrl(url: String?): String {
        val fallback = "https://ollama.com/api"
        val raw = url?.trim() ?: ""
        if (raw.isEmpty()) return fallback
        if (raw.endsWith("/api")) return raw
        return raw.trimEnd('/') + "/api"
    }

    override suspend fun discoverModels(connection: ConnectionRecord): List<ModelCatalogEntry> {
        val apiKey = decryptKey(connection)
        val result = mutableListOf<ModelCatalogEntry>()

        try {
            when (connection.provider) {
                "google" -> {
                    val response = client.get("https://generativelanguage.googleapis.com/v1beta/models") {
                        parameter("key", apiKey)
                    }
                    val text = response.bodyAsText()
                    if (response.status != HttpStatusCode.OK) {
                        throw Exception("${response.status}: ${text.take(180)}")
                    }
                    val jsonObject = json.parseToJsonElement(text).jsonObject
                    val modelsArray = jsonObject["models"]?.jsonArray ?: emptyJsonArray()
                    for (m in modelsArray) {
                        val obj = m.jsonObject
                        val name = obj["name"]?.jsonPrimitive?.content ?: ""
                        val displayName = obj["displayName"]?.jsonPrimitive?.content ?: name
                        val methods = obj["supportedGenerationMethods"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()
                        if (name.contains("gemini") && !name.contains("embedding") && methods.contains("generateContent")) {
                            val cleanId = name.substringAfter("models/")
                            // generateContent ⇒ supports responseMimeType: application/json
                            result.add(ModelCatalogEntry(id = cleanId, name = displayName, provider = "google", supportsJson = true))
                        }
                    }
                }
                "groq", "mistral", "deepseek" -> {
                    val url = when (connection.provider) {
                        "groq" -> "https://api.groq.com/openai/v1/models"
                        "mistral" -> "https://api.mistral.ai/v1/models"
                        "deepseek" -> "https://api.deepseek.com/models"
                        else -> throw IllegalArgumentException()
                    }
                    val response = client.get(url) {
                        headers {
                            append(HttpHeaders.Authorization, "Bearer $apiKey")
                        }
                    }
                    val text = response.bodyAsText()
                    Log.d(TAG, "discoverModels ${connection.provider}: status=${response.status}, body=${text.take(800)}")
                    if (response.status != HttpStatusCode.OK) {
                        throw Exception("${response.status}: ${text.take(180)}")
                    }
                    val jsonObject = json.parseToJsonElement(text).jsonObject
                    val dataArray = jsonObject["data"]?.jsonArray ?: emptyJsonArray()
                    val filterRegex = Regex("embed|vision|audio|image|moderation", RegexOption.IGNORE_CASE)
                    for (m in dataArray) {
                        val obj = m.jsonObject
                        val id = obj["id"]?.jsonPrimitive?.content ?: ""
                        // Mistral advertises per-model capabilities; chat-completion models support response_format json_object.
                        val jsonCapable = connection.provider == "mistral" &&
                            obj["capabilities"]?.jsonObject?.get("completion_chat")?.jsonPrimitive?.booleanOrNull == true
                        if (id.isNotEmpty() && !filterRegex.containsMatchIn(id)) {
                            result.add(ModelCatalogEntry(id = id, name = id, provider = connection.provider, supportsJson = jsonCapable))
                        }
                    }
                }
                "openrouter" -> {
                    val response = client.get("https://openrouter.ai/api/v1/models") {
                        headers {
                            append(HttpHeaders.Authorization, "Bearer $apiKey")
                            append("HTTP-Referer", "https://open-fantasia.vercel.app")
                            append("X-Title", "Open Fantasia")
                        }
                    }
                    val text = response.bodyAsText()
                    if (response.status != HttpStatusCode.OK) {
                        throw Exception("${response.status}: ${text.take(180)}")
                    }
                    val jsonObject = json.parseToJsonElement(text).jsonObject
                    val dataArray = jsonObject["data"]?.jsonArray ?: emptyJsonArray()
                    val filterRegex = Regex("vision|audio|image", RegexOption.IGNORE_CASE)
                    for (m in dataArray) {
                        val obj = m.jsonObject
                        val id = obj["id"]?.jsonPrimitive?.content ?: ""
                        val name = obj["name"]?.jsonPrimitive?.content ?: id
                        val contextLength = obj["context_length"]?.jsonPrimitive?.intOrNull
                        val supportedParams = obj["supported_parameters"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull } ?: emptyList()
                        val jsonCapable = supportedParams.contains("response_format") || supportedParams.contains("structured_outputs")
                        if (id.isNotEmpty() && !filterRegex.containsMatchIn(id)) {
                            val hint = if (id.contains(":free") || id == "openrouter/free") "free" else null
                            result.add(ModelCatalogEntry(id = id, name = name, provider = "openrouter", contextWindow = contextLength, hint = hint, supportsJson = jsonCapable))
                        }
                    }
                    return result.take(80)
                }
                "ollama" -> {
                    val baseUrl = normalizeOllamaUrl(connection.base_url)
                    val response = client.get("$baseUrl/tags") {
                        if (apiKey.isNotEmpty()) {
                            headers {
                                append(HttpHeaders.Authorization, "Bearer $apiKey")
                            }
                        }
                    }
                    val text = response.bodyAsText()
                    if (response.status != HttpStatusCode.OK) {
                        throw Exception("${response.status}: ${text.take(180)}")
                    }
                    val jsonObject = json.parseToJsonElement(text).jsonObject
                    val modelsArray = jsonObject["models"]?.jsonArray ?: emptyJsonArray()
                    for (m in modelsArray) {
                        val obj = m.jsonObject
                        val modelName = obj["model"]?.jsonPrimitive?.content ?: obj["name"]?.jsonPrimitive?.content ?: ""
                        if (modelName.isNotEmpty()) {
                            result.add(ModelCatalogEntry(id = modelName, name = modelName, provider = "ollama"))
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed model discovery for ${connection.provider}", e)
            throw e
        }

        return result
    }

    override suspend fun generateText(
        connection: ConnectionRecord,
        modelId: String,
        systemPrompt: String,
        messages: List<ChatMessage>,
        temperature: Double,
        topP: Double,
        maxTokens: Int,
        jsonMode: Boolean
    ): String {
        var fullText = ""
        streamGenerateText(connection, modelId, systemPrompt, messages, temperature, topP, maxTokens, jsonMode)
            .collect { chunk ->
                chunk.text?.let { fullText += it }
            }
        return fullText
    }

    override fun streamGenerateText(
        connection: ConnectionRecord,
        modelId: String,
        systemPrompt: String,
        messages: List<ChatMessage>,
        temperature: Double,
        topP: Double,
        maxTokens: Int,
        jsonMode: Boolean
    ): Flow<StreamChunk> = flow {
        val apiKey = decryptKey(connection)

        val url: String
        val payload: JsonObject
        val headersMap = mutableMapOf<String, String>()

        when (connection.provider) {
            "google" -> {
                url = "https://generativelanguage.googleapis.com/v1beta/models/$modelId:streamGenerateContent"
                val contents = messages.map { msg ->
                    buildJsonObject {
                        put("role", if (msg.role == "assistant") "model" else "user")
                        put("parts", buildJsonArray {
                            add(buildJsonObject { put("text", msg.content) })
                        })
                    }
                }
                payload = buildJsonObject {
                    put("systemInstruction", buildJsonObject {
                        put("parts", buildJsonArray {
                            add(buildJsonObject { put("text", systemPrompt) })
                        })
                    })
                    put("contents", buildJsonArray { contents.forEach { add(it) } })
                    put("generationConfig", buildJsonObject {
                        put("temperature", temperature)
                        put("topP", topP)
                        put("maxOutputTokens", maxTokens)
                        if (jsonMode) put("responseMimeType", "application/json")
                    })
                }
            }
            "groq", "mistral", "deepseek", "openrouter" -> {
                url = when (connection.provider) {
                    "groq" -> "https://api.groq.com/openai/v1/chat/completions"
                    "mistral" -> "https://api.mistral.ai/v1/chat/completions"
                    "deepseek" -> "https://api.deepseek.com/chat/completions"
                    "openrouter" -> "https://openrouter.ai/api/v1/chat/completions"
                    else -> throw IllegalArgumentException()
                }
                headersMap[HttpHeaders.Authorization] = "Bearer $apiKey"
                if (connection.provider == "openrouter") {
                    headersMap["HTTP-Referer"] = "https://open-fantasia.vercel.app"
                    headersMap["X-Title"] = "Open Fantasia"
                }
                val msgs = mutableListOf<JsonObject>()
                if (systemPrompt.isNotEmpty()) {
                    msgs.add(buildJsonObject {
                        put("role", "system")
                        put("content", systemPrompt)
                    })
                }
                messages.forEach { msg ->
                    msgs.add(buildJsonObject {
                        put("role", msg.role)
                        put("content", msg.content)
                    })
                }
                payload = buildJsonObject {
                    put("model", modelId)
                    put("messages", buildJsonArray { msgs.forEach { add(it) } })
                    put("temperature", temperature)
                    put("top_p", topP)
                    put("max_tokens", maxTokens)
                    put("stream", true)
                    if (jsonMode) {
                        put("response_format", buildJsonObject { put("type", "json_object") })
                    } else {
                        // Creative roleplay generation only — discourage echoing/repetition.
                        // Never applied to jsonMode (HCE continuity extraction), where penalties
                        // would distort the structured JSON output.
                        put("presence_penalty", 0.4)
                        put("frequency_penalty", 0.4)
                    }
                }
            }
            "ollama" -> {
                val base = normalizeOllamaUrl(connection.base_url)
                url = "$base/chat"
                if (apiKey.isNotEmpty()) {
                    headersMap[HttpHeaders.Authorization] = "Bearer $apiKey"
                }
                val msgs = mutableListOf<JsonObject>()
                if (systemPrompt.isNotEmpty()) {
                    msgs.add(buildJsonObject {
                        put("role", "system")
                        put("content", systemPrompt)
                    })
                }
                messages.forEach { msg ->
                    msgs.add(buildJsonObject {
                        put("role", msg.role)
                        put("content", msg.content)
                    })
                }
                payload = buildJsonObject {
                    put("model", modelId)
                    put("messages", buildJsonArray { msgs.forEach { add(it) } })
                    put("options", buildJsonObject {
                        put("temperature", temperature)
                        put("top_p", topP)
                        put("num_predict", maxTokens)
                    })
                    if (jsonMode) put("format", "json")
                    put("stream", true)
                }
            }
            else -> throw IllegalArgumentException("Unsupported provider: ${connection.provider}")
        }

        try {
            client.preparePost(url) {
                contentType(ContentType.Application.Json)
                if (connection.provider == "google") {
                    parameter("key", apiKey)
                } else {
                    headersMap.forEach { (k, v) -> headers { append(k, v) } }
                }
                setBody(payload)
            }.execute { response ->
                if (response.status != HttpStatusCode.OK) {
                    val errorText = response.bodyAsText()
                    throw Exception("API call failed (${response.status}): $errorText")
                }

                val channel = response.bodyAsChannel()
                while (!channel.isClosedForRead) {
                    val line = channel.readUTF8Line() ?: break
                    if (line.isBlank()) continue

                    // SSE end-of-stream sentinel: stop reading instead of blocking on
                    // readUTF8Line until the socket times out.
                    val trimmed = line.trim()
                    if (trimmed == "data: [DONE]" || trimmed == "data:[DONE]") break

                    val chunk = parseStreamLine(line, connection.provider) ?: continue
                    emit(chunk)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Streaming request failed", e)
            throw e
        }
    }.flowOn(Dispatchers.IO)

    private fun parseStreamLine(line: String, provider: String): StreamChunk? {
        return try {
            when (provider) {
                "google" -> {
                    // Google chunks can sometimes be wrapped in array braces or start with comma
                    val cleanLine = line.trim().trimStart(',', '[').trimEnd(']')
                    if (cleanLine.isEmpty()) return null
                    val jsonObject = json.parseToJsonElement(cleanLine).jsonObject
                    val candidates = jsonObject["candidates"]?.jsonArray
                    val parts = candidates?.firstOrNull()?.jsonObject?.get("content")?.jsonObject?.get("parts")?.jsonArray
                    val text = parts?.firstOrNull()?.jsonObject?.get("text")?.jsonPrimitive?.content
                    val finishReason = candidates?.firstOrNull()?.jsonObject?.get("finishReason")?.jsonPrimitive?.contentOrNull
                    StreamChunk(text = text, finishReason = finishReason)
                }
                "ollama" -> {
                    val jsonObject = json.parseToJsonElement(line).jsonObject
                    val text = jsonObject["message"]?.jsonObject?.get("content")?.jsonPrimitive?.content
                    val done = jsonObject["done"]?.jsonPrimitive?.booleanOrNull ?: false
                    StreamChunk(text = text, finishReason = if (done) "stop" else null)
                }
                else -> { // OpenAI shape: groq, mistral, deepseek, openrouter
                    // Some gateways emit "data:{...}" with no space after the colon.
                    if (!line.startsWith("data:")) return null
                    val data = line.substringAfter("data:").trim()
                    if (data == "[DONE]") return null
                    val jsonObject = json.parseToJsonElement(data).jsonObject
                    val choices = jsonObject["choices"]?.jsonArray
                    val text = choices?.firstOrNull()?.jsonObject?.get("delta")?.jsonObject?.get("content")?.jsonPrimitive?.contentOrNull
                    val finishReason = choices?.firstOrNull()?.jsonObject?.get("finish_reason")?.jsonPrimitive?.contentOrNull
                    StreamChunk(text = text, finishReason = finishReason)
                }
            }
        } catch (e: Exception) {
            null // ignore malformed stream lines silently
        }
    }

    private fun emptyJsonArray() = JsonArray(emptyList())
}
