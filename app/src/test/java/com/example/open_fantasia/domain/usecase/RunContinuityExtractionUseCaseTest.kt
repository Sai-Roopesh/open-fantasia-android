package com.example.open_fantasia.domain.usecase

import com.example.open_fantasia.data.remote.ChatMessage
import com.example.open_fantasia.data.remote.LLMClient
import com.example.open_fantasia.data.remote.StreamChunk
import com.example.open_fantasia.domain.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.serialization.json.JsonObject
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class RunContinuityExtractionUseCaseTest {

    private val connection = ConnectionRecord(
        id = "conn-1", user_id = "user-1", provider = "google", label = "G",
        base_url = null, encrypted_api_key = null, enabled = true, default_model_id = null,
        model_cache = emptyList(), health_status = "healthy", health_message = "",
        last_checked_at = null, last_model_refresh_at = null, last_synced_at = null,
        created_at = "", updated_at = ""
    )

    private val character = CharacterRecord(
        id = "char-1", user_id = "user-1", name = "Mara Vale", created_at = "", updated_at = ""
    )

    private val emptySnapshot = DurableMemorySnapshot(
        metadata = SnapshotMetadata("turn-0", "", "continuation", 1),
        spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
        entity_state = emptyList(),
        relational_state = emptyList(),
        narrative_state = NarrativeState("", "", "", emptyList(), emptyList())
    )

    class MockLLMClient : LLMClient {
        var generateTextHandler: (String, List<ChatMessage>) -> String = { _, _ -> "" }

        override suspend fun discoverModels(connection: ConnectionRecord): List<ModelCatalogEntry> = emptyList()

        override suspend fun generateText(
            connection: ConnectionRecord,
            modelId: String,
            systemPrompt: String,
            messages: List<ChatMessage>,
            temperature: Double,
            topP: Double,
            maxTokens: Int,
            jsonMode: Boolean,
            jsonSchema: JsonObject?
        ): String {
            return generateTextHandler(systemPrompt, messages)
        }

        override fun streamGenerateText(
            connection: ConnectionRecord,
            modelId: String,
            systemPrompt: String,
            messages: List<ChatMessage>,
            temperature: Double,
            topP: Double,
            maxTokens: Int,
            jsonMode: Boolean,
            jsonSchema: JsonObject?
        ): Flow<StreamChunk> = emptyFlow()
    }

    @Test
    fun testCleanExtractionNoErrors() = runBlocking {
        val mockClient = MockLLMClient()
        mockClient.generateTextHandler = { _, _ ->
            // Return clean output
            """
                {
                  "transition_type": "continuation",
                  "story_summary": "Mara escapes.",
                  "scene_summary": "In the woods.",
                  "last_turn_beat": "She walks.",
                  "narrative_timestamp": "Day 1"
                }
            """.trimIndent()
        }

        val useCase = RunContinuityExtractionUseCase(mockClient)
        val result = useCase.execute(connection, "model-1", character, emptySnapshot, emptyList())

        assertEquals("continuation", result.transition_type)
        assertEquals("Mara escapes.", result.story_summary)
        assertTrue(result.entity_mutations.isEmpty())
    }

    @Test
    fun testExtractionWithMinorErrorsStripsInvalid() = runBlocking {
        val mockClient = MockLLMClient()
        mockClient.generateTextHandler = { _, _ ->
            // Return output with 1 valid entity add and 1 invalid entity update (non-existent id)
            """
                {
                  "transition_type": "continuation",
                  "story_summary": "Mara escapes.",
                  "scene_summary": "In the woods.",
                  "last_turn_beat": "She walks.",
                  "narrative_timestamp": "Day 1",
                  "entity_mutations": [
                    {
                      "op": "add",
                      "canonical_name": "Mara Vale",
                      "entity_type": "character"
                    },
                    {
                      "op": "update",
                      "entity_id": "invalid-id",
                      "changes": {
                        "is_present": false
                      }
                    }
                  ]
                }
            """.trimIndent()
        }

        val useCase = RunContinuityExtractionUseCase(mockClient)
        val result = useCase.execute(connection, "model-1", character, emptySnapshot, emptyList())

        // The invalid update mutation is stripped because error rate is 1/2 = 50% (shouldReflect is totalErrors / totalOps > 0.5, i.e., 1/2 > 0.5 is false)
        assertEquals(1, result.entity_mutations.size)
        assertEquals("add", result.entity_mutations[0].op)
        assertEquals("Mara Vale", result.entity_mutations[0].canonical_name)
    }

    @Test
    fun testExtractionWithMajorErrorsTriggersReflectionPass() = runBlocking {
        val mockClient = MockLLMClient()
        var callCount = 0
        mockClient.generateTextHandler = { systemPrompt, _ ->
            callCount++
            if (callCount == 1) {
                // First pass returns major errors: 1 invalid entity update, 1 invalid narrative thread update. Total ops = 2, errors = 2 (100% error rate). Triggers reflection.
                """
                    {
                      "transition_type": "continuation",
                      "story_summary": "Mara escapes.",
                      "scene_summary": "In the woods.",
                      "last_turn_beat": "She walks.",
                      "narrative_timestamp": "Day 1",
                      "entity_mutations": [
                        {
                          "op": "update",
                          "entity_id": "invalid-id",
                          "changes": {
                            "is_present": false
                          }
                        }
                      ],
                      "narrative_thread_mutations": [
                        {
                          "op": "update",
                          "thread_id": "invalid-thread",
                          "changes": {
                            "status": "resolved"
                          }
                        }
                      ]
                    }
                """.trimIndent()
            } else {
                // Second pass (reflection) corrects the output
                assertTrue(systemPrompt.contains("state extractor"))
                """
                    {
                      "transition_type": "continuation",
                      "story_summary": "Mara escapes.",
                      "scene_summary": "In the woods.",
                      "last_turn_beat": "She walks.",
                      "narrative_timestamp": "Day 1",
                      "entity_mutations": [
                        {
                          "op": "add",
                          "canonical_name": "Mara Vale",
                          "entity_type": "character"
                        }
                      ]
                    }
                """.trimIndent()
            }
        }

        val useCase = RunContinuityExtractionUseCase(mockClient)
        val result = useCase.execute(connection, "model-1", character, emptySnapshot, emptyList())

        assertEquals(2, callCount)
        assertEquals(1, result.entity_mutations.size)
        assertEquals("add", result.entity_mutations[0].op)
        assertEquals("Mara Vale", result.entity_mutations[0].canonical_name)
    }
}
