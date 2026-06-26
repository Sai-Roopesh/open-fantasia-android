package com.example.open_fantasia.domain.usecase

import android.util.Log
import com.example.open_fantasia.data.remote.ChatMessage
import com.example.open_fantasia.data.remote.LLMClient
import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.FullValidationResult
import com.example.open_fantasia.domain.reducer.StateValidator
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

class RunContinuityExtractionUseCase(
    private val llmClient: LLMClient
) {
    companion object {
        private const val TAG = "RunContinuityExtraction"
    }

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    suspend fun execute(
        connection: ConnectionRecord,
        modelId: String,
        character: CharacterRecord,
        currentSnapshot: DurableMemorySnapshot,
        recentMessages: List<ChatMessage>,
        isFullMaterialization: Boolean = false,
        forceJson: Boolean = false
    ): ExtractionOutput {
        val transcript = formatTranscript(recentMessages)
        var systemPrompt = buildExtractionSystemPrompt(character.name)

        if (isFullMaterialization) {
            systemPrompt += "\n\n" + """
                # Full re-materialization mode
                This is a PERIODIC FULL RE-DERIVATION (defragmentation) of the world state.
                You must verify every entity, fact, relationship, location, and narrative thread in Current_State against the Latest_Transcript.

                CRITICAL ANTI-DRIFT RULES:
                - PRESERVATION IS THE DEFAULT. Only change what is clearly wrong, missing, or contradicted by the transcript.
                - Do NOT rewrite entities, facts, or relationships that are accurately captured in Current_State.
                - Do NOT remove plot threads or facts just because they weren't mentioned recently — they may still be relevant.
                - If Current_State accurately reflects the transcript, emit minimal or zero mutations.
                - Invalidate state ONLY if the transcript provides clear evidence that it is no longer true.
                - Add missing state that was dropped by previous incremental extractions.
                - Ensure the story_summary is comprehensive and up-to-date.
                - Think of this as an AUDIT, not a rewrite.
            """.trimIndent()
        }

        val userMessage = buildExtractionUserMessage(currentSnapshot, transcript)

        // 1. LLM Extraction Pass 1 (T=0.15)
        Log.d(TAG, "Running HCE extraction pass 1 on $modelId")
        val rawResult = llmClient.generateText(
            connection = connection,
            modelId = modelId,
            systemPrompt = systemPrompt,
            messages = listOf(ChatMessage(role = "user", content = userMessage)),
            temperature = 0.15,
            topP = 0.9,
            maxTokens = 8000,
            jsonMode = forceJson
        )

        var extraction = try {
            val jsonBody = normalizeExtractionJson(extractJsonFromText(rawResult))
            json.decodeFromString(ExtractionOutput.serializer(), jsonBody)
        } catch (e: Exception) {
            Log.e(TAG, "Pass 1 failed to parse: $rawResult", e)
            throw Exception("Failed to parse initial HCE state extraction response: ${e.message}", e)
        }

        // 2. Validate mutations
        var validation = StateValidator.validateAllMutations(extraction, currentSnapshot)
        if (validation.totalErrors == 0) {
            Log.d(TAG, "Pass 1 extraction succeeded with zero validation errors.")
            // Still clamp timeline_events importance into 1..5; the mutation validation
            // above does not touch timeline_events, and this happy path skips stripInvalidMutations.
            return extraction.copy(
                timeline_events = StateValidator.validateTimelineEvents(extraction.timeline_events)
            )
        }

        Log.w(TAG, "Pass 1 completed with ${validation.totalErrors} errors (rate: ${validation.totalErrors.toDouble() / validation.totalOps.toDouble()})")

        // 3. Optional Corrective Reflection Pass 2 (T=0.1)
        if (validation.shouldReflect) {
            Log.d(TAG, "Error rate > 50%, running corrective reflection pass.")
            val reflected = reflectOnFailedExtraction(
                connection = connection,
                modelId = modelId,
                character = character,
                currentSnapshot = currentSnapshot,
                recentTranscript = transcript,
                previousOutput = extraction,
                validationResult = validation,
                forceJson = forceJson
            )
            if (reflected != null) {
                val reflectedValidation = StateValidator.validateAllMutations(reflected, currentSnapshot)
                if (reflectedValidation.totalErrors == 0) {
                    Log.d(TAG, "Corrective reflection pass succeeded with zero errors.")
                    return reflected.copy(
                        timeline_events = StateValidator.validateTimelineEvents(reflected.timeline_events)
                    )
                }
                Log.w(TAG, "Corrective reflection pass still has ${reflectedValidation.totalErrors} errors, stripping remaining.")
                extraction = reflected
                validation = reflectedValidation
            } else {
                Log.w(TAG, "Corrective reflection pass failed, falling back to stripping original extraction.")
            }
        }

        // 4. Strip any remaining invalid mutations
        return stripInvalidMutations(extraction, currentSnapshot)
    }

    private suspend fun reflectOnFailedExtraction(
        connection: ConnectionRecord,
        modelId: String,
        character: CharacterRecord,
        currentSnapshot: DurableMemorySnapshot,
        recentTranscript: String,
        previousOutput: ExtractionOutput,
        validationResult: FullValidationResult,
        forceJson: Boolean
    ): ExtractionOutput? {
        val allErrors = mutableListOf<String>()
        allErrors.addAll(validationResult.entityErrors)
        allErrors.addAll(validationResult.factErrors)
        allErrors.addAll(validationResult.relationshipErrors)
        allErrors.addAll(validationResult.spatialErrors)
        allErrors.addAll(validationResult.locationErrors)
        allErrors.addAll(validationResult.locationEdgeErrors)
        allErrors.addAll(validationResult.narrativeThreadErrors)

        val reflectionPrompt = """
            You are the Cognitive State Tracker performing a CORRECTION PASS.

            Your previous extraction contained ${validationResult.totalErrors} validation errors.
            You must fix these errors and return a corrected extraction.

            <Validation_Errors>
            ${allErrors.mapIndexed { idx, e -> "${idx + 1}. $e" }.joinToString("\n")}
            </Validation_Errors>

            <Previous_Output>
            ${json.encodeToString(ExtractionOutput.serializer(), previousOutput)}
            </Previous_Output>

            <Current_State>
            ${json.encodeToString(DurableMemorySnapshot.serializer(), currentSnapshot)}
            </Current_State>

            <Recent_Transcript>
            $recentTranscript
            </Recent_Transcript>

            RULES FOR CORRECTION:
            1. Remove any mutations that reference non-existent IDs.
            2. If you referenced an entity that doesn't exist in Current_State, either:
               a. Change it to an 'add' operation if it's genuinely a new entity, or
               b. Find the correct existing entity_id from Current_State.
            3. If you referenced a relationship that doesn't exist, either add it first or remove the mutation.
            4. Keep all valid mutations from your previous output unchanged.
            5. The story_summary, scene_summary, last_turn_beat, and narrative_timestamp should remain the same unless they were also incorrect.
            6. Return the complete corrected extraction in the same schema format.
            7. OUTPUT COMPACTNESS: Respond ONLY with the JSON object. Do NOT repeat Current_State. Keep strings concise.
            8. Your response MUST be valid, complete JSON.
        """.trimIndent()

        return try {
            val rawReflected = llmClient.generateText(
                connection = connection,
                modelId = modelId,
                systemPrompt = buildExtractionSystemPrompt(character.name),
                messages = listOf(ChatMessage(role = "user", content = reflectionPrompt)),
                temperature = 0.1,
                topP = 0.9,
                maxTokens = 8000,
                jsonMode = forceJson
            )
            val jsonBody = normalizeExtractionJson(extractJsonFromText(rawReflected))
            json.decodeFromString(ExtractionOutput.serializer(), jsonBody)
        } catch (e: Exception) {
            Log.e(TAG, "Reflection pass failed to execute or parse", e)
            null
        }
    }

    private fun stripInvalidMutations(
        extraction: ExtractionOutput,
        snapshot: DurableMemorySnapshot
    ): ExtractionOutput {
        val newEntityNames = extraction.entity_mutations
            .filter { it.op == "add" && !it.canonical_name.isNullOrBlank() }
            .map { it.canonical_name!! }
            .toSet()

        val newLocationNames = extraction.location_mutations
            .filter { it.op == "add" && !it.canonical_name.isNullOrBlank() }
            .map { it.canonical_name!! }
            .toSet()

        val entityPart = StateValidator.validateEntityMutations(extraction.entity_mutations, snapshot)
        val factPart = StateValidator.validateFactMutations(extraction.fact_mutations, snapshot, newEntityNames)
        val relPart = StateValidator.validateRelationshipMutations(extraction.relationship_mutations, snapshot, newEntityNames)
        val edgePart = StateValidator.validateLocationEdgeMutations(extraction.location_edge_mutations, snapshot, newLocationNames)
        val spatialPart = StateValidator.validateSpatialMutations(extraction.placement_mutations, extraction.location_mutations, snapshot, newEntityNames)
        val locationPart = StateValidator.validateLocationMutations(extraction.location_mutations, snapshot)
        val threadPart = StateValidator.validateNarrativeThreadMutations(extraction.narrative_thread_mutations, snapshot)
        val validatedTimelineEvents = StateValidator.validateTimelineEvents(extraction.timeline_events)

        return extraction.copy(
            entity_mutations = entityPart.valid,
            fact_mutations = factPart.valid,
            relationship_mutations = relPart.valid,
            location_mutations = locationPart.valid,
            location_edge_mutations = edgePart.valid,
            placement_mutations = spatialPart.valid,
            narrative_thread_mutations = threadPart.valid,
            timeline_events = validatedTimelineEvents
        )
    }

    private fun formatTranscript(messages: List<ChatMessage>): String {
        return messages.joinToString("\n\n") { "${it.role.uppercase()}: ${it.content}" }
    }

    private fun buildExtractionSystemPrompt(characterName: String): String {
        return """
            You are the Hybrid Continuity Engine (HCE) state extractor for a private roleplay branch.
            The roleplay character is "$characterName".
            Return ONLY valid JSON matching the requested schema. No prose, no markdown fences.

            # Exact output shape
            All keys are top-level. Every *_mutations field is a FLAT array whose items each carry an "op". Do NOT nest summaries under a "summaries" object. Do NOT group mutations by operation (never {"add":[...],"update":[...]}). emotion_intensity is an integer 0-100.
            {
              "transition_type": "continuation",
              "story_summary": "...",
              "scene_summary": "...",
              "last_turn_beat": "...",
              "narrative_timestamp": "...",
              "entity_mutations": [ { "op": "add", "entity_id": "e1", "canonical_name": "Name", "entity_type": "character", "primary_emotion": "wary", "emotion_intensity": 55 } ],
              "fact_mutations": [],
              "relationship_mutations": [],
              "location_mutations": [],
              "location_edge_mutations": [],
              "placement_mutations": [],
              "narrative_thread_mutations": [],
              "timeline_events": []
            }

            # Task
            Analyze the <Latest_Transcript> against the <Current_State> and produce a minimal set of state mutation operations that capture EXACTLY what changed in the latest narrative turn.

            # Output fields

            ## Summaries (regenerate every turn)
            - transition_type: 'continuation' if the scene continues in the same place and time, 'scene_transition' if location or context shifts, 'time_skip' if significant in-world time passes.
            - story_summary: 8-12 sentences summarizing the entire story so far including the latest turn.
            - scene_summary: 3-5 sentences describing the current scene and immediate situation after this turn.
            - last_turn_beat: 1-2 sentences on how the newest exchange changed the scene.
            - narrative_timestamp: best estimate of in-world time (e.g. 'Late evening, Day 3' or 'Morning, unknown date'). Keep the format consistent with prior timestamps in Current_State.

            ## Entity mutations
            - 'add': a new character, NPC, creature, object, or group appeared for the first time. Provide canonical_name, entity_type, and optional fields.
            - 'update': an existing entity's presence, emotion, or aliases changed. Reference entity_id from Current_State exactly. Only include changed fields in 'changes'.
            - 'invalidate': an entity is permanently removed from the story (death, destruction, departure with no return).

            ## Fact mutations
            - 'add': a new piece of knowledge, trait, goal, secret, ability, or possession was revealed or established. Attach it to the entity_id it belongs to.
            - 'invalidate': a previously recorded fact is now definitively false or obsolete. Reference the fact's id from the entity's knowledge_boundary, traits, goals, secrets, abilities, or possessions arrays in Current_State.

            ## Relationship mutations
            - 'add': a new relationship formed between two entities. Use source_entity_id and target_entity_id from Current_State.
            - 'update': an existing relationship's dynamic_status or type changed. Reference relationship_id exactly.
            - 'invalidate': a relationship is permanently severed.

            ## Location mutations
            - 'add': a new named location is introduced for the first time.
            - 'update': an existing location's description or environmental_modifiers changed. Reference location_id exactly.

            ## Location edge mutations
            - 'add': a spatial connection between two locations is established or discovered.
            - 'invalidate': a spatial connection is permanently severed (path destroyed, portal closed).

            ## Placement mutations
            - 'move': an entity physically moved to a different location. Use entity_id and to_location_id from Current_State. Use micro_position for sub-location detail (e.g. 'by the fireplace', 'at the bar counter').
            - If a new location is introduced and entities move there, emit the location 'add' first. In placement, reference the new location by its canonical_name prefixed with 'NEW:' (e.g. 'NEW:The Crypt').
            - If a new entity appears at a location, emit entity 'add' first. In placement, reference the new entity by its canonical_name prefixed with 'NEW:' (e.g. 'NEW:Shadow Wolf').

            ## Narrative thread mutations
            - 'add': a new plot thread, quest, or objective emerged.
            - 'update': an existing thread's status or objective changed. Reference thread_id exactly.
            - 'resolve': a thread reached completion. Reference thread_id exactly.

            ## Timeline events
            - Only create a timeline_event if the latest turn produced a genuinely notable beat: a reveal, betrayal, discovery, combat engagement, scene change, time skip, major relationship shift, significant emotional moment, or meaningful spatial movement.
            - Do NOT create timeline events for routine dialogue, minor reactions, or unremarkable continuations.
            - importance: 1 = minor note, 3 = notable moment, 5 = story-defining event.

            # Rules
            1. NEVER hallucinate changes not directly supported by the literal text of <Latest_Transcript>.
            2. If nothing changed in a category, return an empty array for that mutation field.
            3. Reference entity_id, relationship_id, location_id, edge_id, and thread_id values from <Current_State> exactly as given. Do not fabricate IDs.
            4. When information is revealed TO a character (not by them), add a knowledge fact to that character's entity.
            5. When a character physically moves, always emit a placement 'move' mutation.
            6. When emotions shift, emit an entity 'update' with the new primary_emotion, emotion_intensity, and emotion_catalyst.
            7. Summaries (story_summary, scene_summary, last_turn_beat) must incorporate the latest turn. Do not just copy the previous snapshot values.
            8. For the very first turn (empty Current_State), add all initial entities, locations, relationships, and facts as 'add' operations.
            9. Keep mutation operations minimal. Do not re-add entities or facts that already exist in Current_State unchanged.
            10. If the Current_State is empty or minimal, this is an initialization turn — be thorough in establishing the world state from the transcript.
            11. OUTPUT COMPACTNESS: Respond ONLY with the JSON object. Do NOT repeat or echo back Current_State. Keep strings concise. Omit optional fields when unchanged.
            12. Your response MUST be valid, complete JSON. Do not truncate, do not add trailing commentary.
        """.trimIndent()
    }

    private fun buildExtractionUserMessage(snapshot: DurableMemorySnapshot, recentTranscript: String): String {
        return """
            <Current_State>
            ${json.encodeToString(DurableMemorySnapshot.serializer(), snapshot)}
            </Current_State>

            <Latest_Transcript>
            ${if (recentTranscript.isNotEmpty()) recentTranscript else "No transcript available."}
            </Latest_Transcript>
        """.trimIndent()
    }

    /**
     * Reshapes a model's JSON into the flat schema [ExtractionOutput] expects. Capable
     * models (e.g. Mistral) often emit a reasonable-but-different structure: summaries
     * nested under `summaries`, `transition_type` under `metadata`, and mutations grouped
     * as `{add:[…], update:[…], invalidate:[…]}` instead of a flat `[{op, …}]` array.
     * This deterministically lifts those back so extraction doesn't silently carry-forward.
     */
    private fun normalizeExtractionJson(jsonText: String): String {
        val root = try {
            json.parseToJsonElement(jsonText).jsonObject
        } catch (e: Exception) {
            return jsonText
        }
        val out = LinkedHashMap<String, JsonElement>()
        for ((k, v) in root) out[k] = v

        // Lift nested summaries / metadata to the flat top-level fields the schema needs.
        (root["summaries"] as? JsonObject)?.let { s ->
            listOf("story_summary", "scene_summary", "last_turn_beat", "narrative_timestamp", "transition_type").forEach { key ->
                s[key]?.let { if (!out.containsKey(key)) out[key] = it }
            }
        }
        (root["metadata"] as? JsonObject)?.let { m ->
            listOf("transition_type", "narrative_timestamp").forEach { key ->
                m[key]?.let { if (!out.containsKey(key)) out[key] = it }
            }
        }

        // Flatten grouped {op:[…]} mutation objects into the flat [{op, …}] arrays.
        val mutationKeys = listOf(
            "entity_mutations", "fact_mutations", "relationship_mutations",
            "location_mutations", "location_edge_mutations", "placement_mutations",
            "narrative_thread_mutations"
        )
        for (key in mutationKeys) {
            val v = root[key]
            if (v is JsonObject) {
                out[key] = buildJsonArray {
                    for ((op, arr) in v) {
                        (arr as? JsonArray)?.forEach { item ->
                            (item as? JsonObject)?.let { obj ->
                                add(buildJsonObject {
                                    put("op", op)
                                    obj.forEach { (ik, iv) -> if (ik != "op") put(ik, iv) }
                                })
                            }
                        }
                    }
                }
            }
        }

        return JsonObject(out).toString()
    }

    private fun extractJsonFromText(text: String): String {
        val fenceRegex = Regex("```(?:json)?\\s*\\n?([\\s\\S]*?)```")
        val match = fenceRegex.find(text)
        if (match != null) {
            return match.groupValues[1].trim()
        }
        val braceStart = text.indexOf("{")
        val braceEnd = text.lastIndexOf("}")
        if (braceStart != -1 && braceEnd > braceStart) {
            return text.substring(braceStart, braceEnd + 1)
        }
        return text.trim()
    }
}
