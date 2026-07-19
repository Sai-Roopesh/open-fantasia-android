package com.example.open_fantasia.data.remote

import com.example.open_fantasia.domain.model.ConnectionRecord
import com.example.open_fantasia.domain.model.ModelCatalogEntry
import io.ktor.client.*
import io.ktor.client.engine.mock.*
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.http.*
import io.ktor.http.content.OutgoingContent
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.*
import org.junit.Test

class KtorLLMClientTest {

    private fun makeMockConnection(provider: String, key: String? = null, baseUrl: String? = null): ConnectionRecord {
        return ConnectionRecord(
            id = "conn-1",
            user_id = "user-1",
            provider = provider,
            label = "Test Conn",
            base_url = baseUrl,
            encrypted_api_key = key,
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

    @Test
    fun testDiscoverModelsGoogle() = runBlocking {
        val mockEngine = MockEngine { request ->
            respond(
                content = """
                    {
                      "models": [
                        {
                          "name": "models/gemini-1.5-flash",
                          "displayName": "Gemini 1.5 Flash",
                          "supportedGenerationMethods": ["generateContent"]
                        },
                        {
                          "name": "models/gemini-1.5-pro",
                          "displayName": "Gemini 1.5 Pro",
                          "supportedGenerationMethods": ["generateContent"]
                        },
                        {
                          "name": "models/embedding-001",
                          "displayName": "Embedding 001",
                          "supportedGenerationMethods": ["embedContent"]
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }

        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }

        val conn = makeMockConnection("google", key = "")

        val llmClient = KtorLLMClient(client)
        val models = llmClient.discoverModels(conn)

        assertEquals(2, models.size)
        assertEquals("gemini-1.5-flash", models[0].id)
        assertEquals("Gemini 1.5 Flash", models[0].name)
        assertEquals("google", models[0].provider)
        assertEquals("gemini-1.5-pro", models[1].id)
        assertEquals("Gemini 1.5 Pro", models[1].name)
    }

    @Test
    fun testDiscoverModelsOpenRouter() = runBlocking {
        val mockEngine = MockEngine { request ->
            respond(
                content = """
                    {
                      "data": [
                        {
                          "id": "meta-llama/llama-3-70b-instruct",
                          "name": "Llama 3 70B",
                          "context_length": 8192
                        },
                        {
                          "id": "openrouter/free",
                          "name": "Free Llama 3 8B",
                          "context_length": 4096
                        },
                        {
                          "id": "openai/gpt-4-vision",
                          "name": "GPT 4 Vision",
                          "context_length": 128000
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }

        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }

        val conn = makeMockConnection("openrouter", key = "")

        val llmClient = KtorLLMClient(client)
        val models = llmClient.discoverModels(conn)

        assertEquals(2, models.size)
        assertEquals("meta-llama/llama-3-70b-instruct", models[0].id)
        assertEquals("Llama 3 70B", models[0].name)
        assertEquals(8192, models[0].contextWindow)
        assertNull(models[0].hint)

        assertEquals("openrouter/free", models[1].id)
        assertEquals("Free Llama 3 8B", models[1].name)
        assertEquals(4096, models[1].contextWindow)
        assertEquals("free", models[1].hint)
    }

    @Test
    fun testOpenRouterIncludesRefererAndTitleHeaders() = runBlocking {
        var refererHeader: String? = null
        var titleHeader: String? = null

        val mockEngine = MockEngine { request ->
            refererHeader = request.headers["HTTP-Referer"]
            titleHeader = request.headers["X-Title"]
            respond(
                content = """{"data": []}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }

        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }

        val conn = makeMockConnection("openrouter", key = "")
        val llmClient = KtorLLMClient(client)
        llmClient.discoverModels(conn)

        assertEquals("https://open-fantasia.vercel.app", refererHeader)
        assertEquals("Open Fantasia", titleHeader)
    }

    @Test
    fun testNonOpenRouterDoesNotIncludeRefererHeader() = runBlocking {
        var refererHeader: String? = null

        val mockEngine = MockEngine { request ->
            refererHeader = request.headers["HTTP-Referer"]
            respond(
                content = """{"data": []}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }

        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }

        val conn = makeMockConnection("groq", key = "")
        val llmClient = KtorLLMClient(client)
        llmClient.discoverModels(conn)

        assertNull(refererHeader)
    }

    @Test
    fun testDeepSeekStreamingRequestUsesExtendedTimeouts() {
        val timeout = KtorLLMClient.streamingTimeoutOverrideFor("deepseek")

        assertEquals(600_000L, timeout?.requestMillis)
        assertEquals(150_000L, timeout?.connectMillis)
        assertEquals(600_000L, timeout?.socketMillis)
        assertNull(KtorLLMClient.streamingTimeoutOverrideFor("groq"))
    }

    @Test
    fun testDeepSeekStreamingPayloadPreservesDefaultThinkingAndParsesVisibleContent() = runBlocking {
        var requestJson = ""
        val mockEngine = MockEngine { request ->
            requestJson = (request.body as OutgoingContent.ByteArrayContent).bytes().decodeToString()
            respond(
                content = """
                    data: {"choices":[{"delta":{"content":"Yunxi replies."},"finish_reason":null}],"usage":null}

                    data: {"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"completion_tokens":3,"prompt_tokens":10,"total_tokens":13,"prompt_cache_hit_tokens":8,"prompt_cache_miss_tokens":2}}

                    data: [DONE]
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "text/event-stream")
            )
        }
        val http = HttpClient(mockEngine) {
            install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            install(HttpTimeout)
        }
        val chunks = KtorLLMClient(http).streamGenerateText(
            connection = makeMockConnection("deepseek", key = "test-key"),
            modelId = "deepseek-v4-pro",
            systemPrompt = "system",
            messages = listOf(ChatMessage("user", "hello")),
            temperature = 0.9,
            topP = 0.9,
            maxTokens = 1024
        ).toList()

        val payload = Json.parseToJsonElement(requestJson).jsonObject
        assertFalse(payload.containsKey("thinking"))
        assertEquals("Yunxi replies.", chunks.joinToString("") { it.text.orEmpty() })
        assertEquals(8, chunks.last().promptCacheHitTokens)
    }
}
