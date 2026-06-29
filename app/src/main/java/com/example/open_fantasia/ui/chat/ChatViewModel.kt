package com.example.open_fantasia.ui.chat

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.open_fantasia.data.local.dao.CharacterDao
import com.example.open_fantasia.data.local.dao.ChatDao
import com.example.open_fantasia.data.local.dao.ConnectionDao
import com.example.open_fantasia.data.local.dao.PersonaDao
import com.example.open_fantasia.data.local.entity.BranchEntity
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import com.example.open_fantasia.data.local.entity.PersonaEntity
import com.example.open_fantasia.data.local.entity.PinEntity
import com.example.open_fantasia.data.local.entity.SnapshotEntity
import com.example.open_fantasia.data.local.entity.ThreadEntity
import com.example.open_fantasia.data.local.entity.TurnEntity
import com.example.open_fantasia.data.local.entity.TimelineEntity
import com.example.open_fantasia.data.remote.ChatMessage
import com.example.open_fantasia.data.remote.LLMClient
import com.example.open_fantasia.domain.model.CharacterBundle
import com.example.open_fantasia.domain.model.parseSupportingCast
import com.example.open_fantasia.domain.model.DurableMemorySnapshot
import com.example.open_fantasia.domain.model.SnapshotMetadata
import com.example.open_fantasia.domain.model.SpatialState
import com.example.open_fantasia.domain.model.NarrativeState
import com.example.open_fantasia.domain.reducer.PromptBuilder
import com.example.open_fantasia.domain.reducer.WorldStateReducer
import com.example.open_fantasia.domain.usecase.RunContinuityExtractionUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

sealed interface ChatUiState {
    object Loading : ChatUiState
    object Error : ChatUiState
    data class Success(
        val thread: ThreadEntity,
        val character: CharacterEntity,
        val activeBranch: BranchEntity,
        val branches: List<BranchEntity>,
        val turns: List<TurnEntity>,
        val currentSnapshot: DurableMemorySnapshot?,
        val pins: List<PinEntity>,
        val timelineEvents: List<TimelineEntity>,
        val connections: List<ConnectionEntity>,
        val personas: List<PersonaEntity>,
        val activePersona: PersonaEntity?,
        val isGenerating: Boolean,
        val generatingText: String,
        val isScanning: Boolean
    ) : ChatUiState
}

class ChatViewModel(
    private val threadId: String,
    private val chatDao: ChatDao,
    private val characterDao: CharacterDao,
    private val connectionDao: ConnectionDao,
    private val personaDao: PersonaDao,
    private val llmClient: LLMClient,
    private val runContinuityExtractionUseCase: RunContinuityExtractionUseCase
) : ViewModel() {

    private val FIXED_USER_ID = "00000000-0000-0000-0000-000000000000"

    init {
        viewModelScope.launch {
            chatDao.clearStaleLocks()
        }
    }

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating = _isGenerating.asStateFlow()

    private val _generatingText = MutableStateFlow("")
    val generatingText = _generatingText.asStateFlow()

    private val _isScanning = MutableStateFlow(false)
    val isScanning = _isScanning.asStateFlow()

    private data class DbState(
        val thread: ThreadEntity?,
        val activeBranch: BranchEntity?,
        val branches: List<BranchEntity>,
        val turns: List<TurnEntity>,
        val timelineEvents: List<TimelineEntity>
    )


    // SLOW state — recomputed only on DB / connection / persona / snapshot changes. The
    // fast-changing stream flags (isGenerating/generatingText/isScanning) are layered on
    // afterwards, so a streamed token does NOT re-run getCharacter/getSnapshot/getActivePins.
    private val slowChatState = combine(
        combine(
            chatDao.getThreadFlow(threadId),
            chatDao.getActiveBranchForThreadFlow(threadId),
            chatDao.getBranchesForThreadFlow(threadId),
            chatDao.getTurnsForThreadFlow(threadId),
            chatDao.getAllTimelineEventsForThreadFlow(threadId)
        ) { thread, activeBranch, branches, turns, timeline ->
            DbState(thread, activeBranch, branches, turns, timeline)
        },
        connectionDao.getAllConnectionsFlow(),
        personaDao.getAllPersonasFlow(),
        // Re-emits when a snapshot is saved (background HCE materialization) so currentSnapshot re-queries.
        chatDao.getSnapshotSignalFlow(threadId)
    ) { dbState, connections, personas, _ ->
        val thread = dbState.thread
        val activeBranch = dbState.activeBranch
        if (thread == null || activeBranch == null) {
            ChatUiState.Loading
        } else {
            val character = characterDao.getCharacter(thread.character_id)
            if (character == null) {
                ChatUiState.Error
            } else {
                val branchTurns = buildTurnPath(dbState.turns, activeBranch.head_turn_id)
                val latestTurn = branchTurns.lastOrNull { it.generation_status == "committed" }
                val snapshot = latestTurn?.let { chatDao.getSnapshot(it.id)?.world_state }
                val pins = chatDao.getActivePins(threadId, activeBranch.id)
                val activePersona = thread.persona_id?.let { pid -> personas.find { it.id == pid } }

                ChatUiState.Success(
                    thread = thread,
                    character = character,
                    activeBranch = activeBranch,
                    branches = dbState.branches,
                    turns = branchTurns,
                    currentSnapshot = snapshot,
                    pins = pins,
                    timelineEvents = dbState.timelineEvents.filter { it.branch_id == activeBranch.id },
                    connections = connections,
                    personas = personas,
                    activePersona = activePersona,
                    isGenerating = false,
                    generatingText = "",
                    isScanning = false
                )
            }
        }
    }

    val uiState: StateFlow<ChatUiState> = combine(
        slowChatState,
        _isGenerating,
        _generatingText,
        _isScanning
    ) { slow, isGen, genText, isScan ->
        // Cheap overlay of fast-changing stream state — no DB work on each streamed token.
        if (slow is ChatUiState.Success) {
            slow.copy(isGenerating = isGen, generatingText = genText, isScanning = isScan)
        } else slow
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = ChatUiState.Loading
    )

    fun sendUserMessage(
        inputText: String,
        guidance: String? = null,
        parentTurnIdOverride: String? = null,
        forceParentOverride: Boolean = false,
        replaceTurnId: String? = null,
        expectedHeadTurnIdOverride: String? = null
    ) {
        if (inputText.isBlank()) return
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val thread = state.thread
            val activeBranch = state.activeBranch
            val connection = connectionDao.getConnection(thread.connection_id) ?: return@launch

            _isGenerating.value = true
            _generatingText.value = ""

            // 1. Begin turn
            val newTurn = try {
                chatDao.beginTurn(
                    userId = FIXED_USER_ID,
                    branchId = activeBranch.id,
                    expectedHeadTurnId = expectedHeadTurnIdOverride ?: activeBranch.head_turn_id,
                    userInputText = inputText,
                    userInputPayload = "{}",
                    parentTurnIdOverride = parentTurnIdOverride,
                    forceParentOverride = forceParentOverride
                )
            } catch (e: Exception) {
                _isGenerating.value = false
                return@launch
            }

            // 2. Build system prompt & messages context
            val parentSnapshot = if (forceParentOverride && parentTurnIdOverride != null) {
                chatDao.getSnapshot(parentTurnIdOverride)?.world_state
            } else {
                state.currentSnapshot
            }

            // Static, per-thread system prompt = the cacheable prefix.
            val systemPrompt = PromptBuilder.buildSystemPrompt(
                characterBundle = CharacterBundle(state.character.toDomain(), state.character.starters, state.character.example_conversations),
                persona = state.activePersona?.toDomain(),
                directorNotes = thread.director_notes,
                supportingCast = parseSupportingCast(thread.supporting_cast)
            )
            // Volatile world state rides on the latest user turn (after the cached history),
            // NOT in the system prompt — so the static system + conversation history prefix
            // stays byte-identical across turns and gets a prompt-cache hit.
            val stateContext = PromptBuilder.buildStateContext(
                snapshot = parentSnapshot,
                pins = state.pins.map { it.toDomain() },
                timeline = emptyList(),
                replyLengthTokens = thread.max_output_tokens
            )

            val allTurns = chatDao.getTurnsForThread(thread.id)
            val historyTurns = buildTurnPath(allTurns, parentTurnIdOverride ?: activeBranch.head_turn_id)

            val apiMessages = mutableListOf<ChatMessage>()
            historyTurns.forEach { turn ->
                if (turn.generation_status == "committed") {
                    apiMessages.add(ChatMessage(role = "user", content = turn.user_input_text))
                    turn.assistant_output_text?.let {
                        apiMessages.add(ChatMessage(role = "assistant", content = it))
                    }
                }
            }
            apiMessages.add(ChatMessage(role = "user", content = "$stateContext\n\n$inputText"))

            // Add steering guidance if provided
            val guidanceText = guidance?.trim()
            if (!guidanceText.isNullOrEmpty()) {
                val guidancePrompt = """
                    Hidden direction for how to regenerate your previous reply.
                    This is out-of-character instruction from the user, not dialogue — do not quote it or acknowledge it in the scene.
                    Rewrite your reply to the latest exchange so that it follows this direction while staying in character and consistent with the established state.
                    
                    Direction: $guidanceText
                """.trimIndent()
                apiMessages.add(ChatMessage(role = "user", content = guidancePrompt))
            }

            // 3. Stream from client
            var accumulatedText = ""
            try {
                llmClient.streamGenerateText(
                    connection = connection.toDomain(),
                    modelId = thread.model_id,
                    systemPrompt = systemPrompt,
                    messages = apiMessages,
                    temperature = state.character.temperature,
                    topP = state.character.top_p,
                    maxTokens = thread.max_output_tokens
                ).collect { chunk ->
                    accumulatedText += chunk.text ?: ""
                    _generatingText.value = accumulatedText
                }

                // Estimate token usage if the provider doesn't supply it
                val generatedTokens = accumulatedText.split(Regex("\\s+")).size * 4 / 3
                val promptTokens = systemPrompt.split(Regex("\\s+")).size * 4 / 3 + apiMessages.sumOf { it.content.split(Regex("\\s+")).size * 4 / 3 }
                val totalTokens = generatedTokens + promptTokens

                // 4. Commit turn on success
                chatDao.commitTurn(
                    userId = FIXED_USER_ID,
                    branchId = activeBranch.id,
                    turnId = newTurn.id,
                    assistantText = accumulatedText,
                    assistantPayload = "{}",
                    provider = connection.provider,
                    model = thread.model_id,
                    label = connection.label,
                    finishReason = "stop",
                    totalTokens = totalTokens,
                    promptTokens = promptTokens,
                    completionTokens = generatedTokens,
                    replaceTurnId = replaceTurnId
                )

                // 5. Trigger background snapshot materialization
                materializeSnapshotForTurnInBackground(
                    thread = thread,
                    character = state.character,
                    connection = connection,
                    turn = newTurn.copy(assistant_output_text = accumulatedText),
                    previousSnapshot = parentSnapshot,
                    recentMessages = apiMessages,
                    historyTurns = historyTurns
                )

            } catch (e: Exception) {
                chatDao.failTurn(
                    userId = FIXED_USER_ID,
                    branchId = activeBranch.id,
                    turnId = newTurn.id,
                    failureCode = "API_ERROR",
                    failureMessage = e.message ?: "Streaming failed"
                )
            } finally {
                _isGenerating.value = false
                // Guarantee the branch is released even if this coroutine was cancelled
                // mid-stream (navigation/rotation) — commitTurn/failTurn may not run on a
                // cancelled coroutine, which would otherwise leave the branch locked.
                withContext(NonCancellable) {
                    chatDao.releaseBranchLock(activeBranch.id, newTurn.id, Instant.now().toString())
                }
            }
        }
    }

    fun regenerateLatestTurn(guidance: String? = null) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val latestTurn = state.turns.lastOrNull() ?: return@launch
            val parentTurnId = latestTurn.parent_turn_id
            val userText = latestTurn.user_input_text

            sendUserMessage(
                inputText = userText,
                guidance = guidance,
                parentTurnIdOverride = parentTurnId,
                forceParentOverride = true,
                replaceTurnId = latestTurn.id,
                expectedHeadTurnIdOverride = latestTurn.id
            )
        }
    }

    fun editTurnText(turnId: String, newUserText: String) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val activeBranch = state.activeBranch
            val targetTurn = state.turns.find { it.id == turnId } ?: return@launch
            val parentTurnId = targetTurn.parent_turn_id

            sendUserMessage(
                inputText = newUserText,
                guidance = null,
                parentTurnIdOverride = parentTurnId,
                forceParentOverride = true,
                replaceTurnId = targetTurn.id,
                expectedHeadTurnIdOverride = activeBranch.head_turn_id
            )
        }
    }

    /** In-place edit of the assistant reply (web "Edit last reply"): rewrites the
     *  stored output without regenerating. The next prompt reads assistant_output_text. */
    fun editAssistantText(turnId: String, newText: String) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val turn = state.turns.find { it.id == turnId } ?: return@launch
            chatDao.updateTurn(
                turn.copy(
                    assistant_output_text = newText,
                    updated_at = Instant.now().toString()
                )
            )
        }
    }

    fun rewindToTurn(turnId: String) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val activeBranch = state.activeBranch
            chatDao.rewindBranchToTurn(
                userId = FIXED_USER_ID,
                branchId = activeBranch.id,
                targetTurnId = turnId,
                expectedHeadTurnId = activeBranch.head_turn_id
            )
        }
    }

    fun createBranch(turnId: String, branchName: String) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val activeBranch = state.activeBranch
            chatDao.createBranchFromTurn(
                userId = FIXED_USER_ID,
                sourceBranchId = activeBranch.id,
                sourceTurnId = turnId,
                name = branchName,
                makeActive = true
            )
        }
    }

    fun switchBranch(branchId: String) {
        viewModelScope.launch {
            chatDao.activateBranch(
                userId = FIXED_USER_ID,
                threadId = threadId,
                branchId = branchId
            )
        }
    }

    fun togglePin(turnId: String, body: String) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val activeBranch = state.activeBranch
            val existing = state.pins.find { it.turn_id == turnId }
            if (existing != null) {
                chatDao.insertPin(existing.copy(status = "inactive", updated_at = Instant.now().toString()))
            } else {
                val now = Instant.now().toString()
                chatDao.insertPin(
                    PinEntity(
                        id = UUID.randomUUID().toString(),
                        thread_id = threadId,
                        branch_id = activeBranch.id,
                        turn_id = turnId,
                        body = body,
                        status = "active",
                        created_at = now,
                        updated_at = now
                    )
                )
            }
        }
    }

    /** Create a branch-local pin with a user-authored annotation (web "Pin fact" flow). */
    fun addPin(turnId: String, body: String) {
        val text = body.trim()
        if (text.isEmpty()) return
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val activeBranch = state.activeBranch
            val now = Instant.now().toString()
            chatDao.insertPin(
                PinEntity(
                    id = UUID.randomUUID().toString(),
                    thread_id = threadId,
                    branch_id = activeBranch.id,
                    turn_id = turnId,
                    body = text,
                    status = "active",
                    created_at = now,
                    updated_at = now
                )
            )
        }
    }

    /** Deactivate a pin by its own id (Inspector "Remove" button). */
    fun removePin(pinId: String) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val existing = state.pins.find { it.id == pinId } ?: return@launch
            chatDao.insertPin(existing.copy(status = "inactive", updated_at = Instant.now().toString()))
        }
    }

    fun setFeedbackRating(turnId: String, rating: Int?) {
        viewModelScope.launch {
            val turn = chatDao.getTurn(turnId) ?: return@launch
            chatDao.updateTurn(turn.copy(feedback_rating = rating, updated_at = Instant.now().toString()))
        }
    }

    fun updateThreadSettings(
        connectionId: String,
        modelId: String,
        maxTokens: Int,
        personaId: String?,
        brainConnectionId: String?,
        brainModelId: String?,
        directorNotes: String,
        supportingCast: String
    ) {
        viewModelScope.launch {
            val thread = chatDao.getThread(threadId) ?: return@launch
            val updated = thread.copy(
                connection_id = connectionId,
                model_id = modelId,
                max_output_tokens = maxTokens,
                persona_id = personaId,
                brain_connection_id = brainConnectionId,
                brain_model_id = brainModelId,
                director_notes = directorNotes.trim(),
                supporting_cast = supportingCast,
                updated_at = Instant.now().toString()
            )
            chatDao.updateThread(updated)
        }
    }

    fun runDeepScan() {
        val state = uiState.value as? ChatUiState.Success ?: return
        if (_isScanning.value) return
        _isScanning.value = true
        viewModelScope.launch(Dispatchers.Default) {
            try {
                val thread = state.thread
                val activeBranch = state.activeBranch
                val connection = connectionDao.getConnection(thread.connection_id) ?: return@launch
                val character = state.character

                val branchTurns = state.turns
                val apiMessages = mutableListOf<ChatMessage>()
                branchTurns.forEach { turn ->
                    if (turn.generation_status == "committed") {
                        apiMessages.add(ChatMessage(role = "user", content = turn.user_input_text))
                        turn.assistant_output_text?.let {
                            apiMessages.add(ChatMessage(role = "assistant", content = it))
                        }
                    }
                }

                val brainConnection = thread.brain_connection_id?.let { connectionDao.getConnection(it) } ?: connection
                val brainModel = thread.brain_model_id ?: thread.model_id
                val brainSupportsJson = brainConnection.model_cache.find { it.id == brainModel }?.supportsJson == true
                val baseSnapshot = state.currentSnapshot ?: buildEmptyDurableSnapshot(activeBranch.head_turn_id ?: "turn-0")

                val extraction = runContinuityExtractionUseCase.execute(
                    connection = brainConnection.toDomain(),
                    modelId = brainModel,
                    character = character.toDomain(),
                    currentSnapshot = baseSnapshot,
                    recentMessages = apiMessages,
                    isFullMaterialization = true,
                    forceJson = brainSupportsJson
                )

                val reducerResult = WorldStateReducer.applyExtractionToSnapshot(
                    previous = baseSnapshot,
                    extraction = extraction,
                    turnId = activeBranch.head_turn_id ?: ""
                )

                if (activeBranch.head_turn_id != null) {
                    chatDao.upsertWorldSnapshot(
                        turnId = activeBranch.head_turn_id,
                        threadId = thread.id,
                        branchId = activeBranch.id,
                        basedOnTurnId = branchTurns.lastOrNull()?.parent_turn_id,
                        worldState = reducerResult.snapshot,
                        version = reducerResult.snapshot.metadata.version, // no double increment
                        isFullMaterialization = true
                    )

                    // Persist timeline events
                    val nowStr = Instant.now().toString()
                    extraction.timeline_events.filter { it.title.isNotBlank() }.forEach { event ->
                        val resolvedEntityIds = event.affected_entity_ids.map { id ->
                            reducerResult.newEntityIds[id] ?: id
                        }
                        chatDao.insertTimelineEvent(
                            TimelineEntity(
                                id = UUID.randomUUID().toString(),
                                thread_id = thread.id,
                                branch_id = activeBranch.id,
                                turn_id = activeBranch.head_turn_id,
                                title = event.title,
                                detail = event.detail,
                                importance = event.importance,
                                event_type = event.event_type,
                                affected_entity_ids = resolvedEntityIds,
                                affected_relationship_ids = event.affected_relationship_ids,
                                created_at = nowStr
                            )
                        )
                    }

                    chatDao.insertTimelineEvent(
                        TimelineEntity(
                            id = UUID.randomUUID().toString(),
                            thread_id = thread.id,
                            branch_id = activeBranch.id,
                            turn_id = activeBranch.head_turn_id,
                            title = "Deep Scan Complete",
                            detail = "Periodic defragmentation pass resolved character emotional drift, updated memories, and pruned stale entity relationships.",
                            importance = 3,
                            event_type = "beat",
                            affected_entity_ids = emptyList(),
                            affected_relationship_ids = emptyList(),
                            created_at = nowStr
                        )
                    )
                }
            } catch (e: Exception) {
                // Scan failed
            } finally {
                _isScanning.value = false
            }
        }
    }

    private suspend fun shouldDefragment(turn: TurnEntity, historyTurns: List<TurnEntity>): Boolean {
        val parentId = turn.parent_turn_id ?: return false
        val index = historyTurns.indexOfFirst { it.id == parentId }
        if (index == -1) return false
        var count = 0
        for (i in index downTo 0) {
            val t = historyTurns[i]
            val snapshot = chatDao.getSnapshot(t.id)
            if (snapshot != null) {
                if (snapshot.is_full_materialization) {
                    break
                }
                count++
            }
        }
        return count >= 9
    }

    private fun materializeSnapshotForTurnInBackground(
        thread: ThreadEntity,
        character: CharacterEntity,
        connection: ConnectionEntity,
        turn: TurnEntity,
        previousSnapshot: DurableMemorySnapshot?,
        recentMessages: List<ChatMessage>,
        historyTurns: List<TurnEntity>
    ) {
        viewModelScope.launch(Dispatchers.Default) {
            val baseSnapshot = previousSnapshot ?: buildEmptyDurableSnapshot(turn.parent_turn_id ?: "turn-0")
            try {
                val brainConnection = thread.brain_connection_id?.let { connectionDao.getConnection(it) } ?: connection
                val brainModel = thread.brain_model_id ?: thread.model_id
                val brainSupportsJson = brainConnection.model_cache.find { it.id == brainModel }?.supportsJson == true

                val isDefrag = shouldDefragment(turn, historyTurns)
                val extractionMessages = if (isDefrag) {
                    historyTurns.flatMap { t ->
                        listOf(
                            ChatMessage(role = "user", content = t.user_input_text),
                            ChatMessage(role = "assistant", content = t.assistant_output_text ?: "")
                        )
                    } + listOf(
                        ChatMessage(role = "user", content = turn.user_input_text),
                        ChatMessage(role = "assistant", content = turn.assistant_output_text ?: "")
                    )
                } else {
                    val historyMessages = recentMessages.dropLast(1)
                    historyMessages.takeLast(28) + listOf(
                        ChatMessage(role = "user", content = turn.user_input_text),
                        ChatMessage(role = "assistant", content = turn.assistant_output_text ?: "")
                    )
                }

                val extraction = runContinuityExtractionUseCase.execute(
                    connection = brainConnection.toDomain(),
                    modelId = brainModel,
                    character = character.toDomain(),
                    currentSnapshot = baseSnapshot,
                    recentMessages = extractionMessages,
                    isFullMaterialization = isDefrag,
                    forceJson = brainSupportsJson
                )

                val reducerResult = WorldStateReducer.applyExtractionToSnapshot(
                    previous = baseSnapshot,
                    extraction = extraction,
                    turnId = turn.id
                )

                chatDao.upsertWorldSnapshot(
                    turnId = turn.id,
                    threadId = thread.id,
                    branchId = turn.branch_origin_id,
                    basedOnTurnId = turn.parent_turn_id,
                    worldState = reducerResult.snapshot,
                    version = reducerResult.snapshot.metadata.version, // no double increment
                    isFullMaterialization = isDefrag
                )

                // Persist timeline events
                val nowStr = Instant.now().toString()
                extraction.timeline_events.filter { it.title.isNotBlank() }.forEach { event ->
                    val resolvedEntityIds = event.affected_entity_ids.map { id ->
                        reducerResult.newEntityIds[id] ?: id
                    }
                    chatDao.insertTimelineEvent(
                        TimelineEntity(
                            id = UUID.randomUUID().toString(),
                            thread_id = thread.id,
                            branch_id = turn.branch_origin_id,
                            turn_id = turn.id,
                            title = event.title,
                            detail = event.detail,
                            importance = event.importance,
                            event_type = event.event_type,
                            affected_entity_ids = resolvedEntityIds,
                            affected_relationship_ids = event.affected_relationship_ids,
                            created_at = nowStr
                        )
                    )
                }
            } catch (e: Exception) {
                // Carry-forward snapshot on HCE failure
                try {
                    val clonedSnapshot = baseSnapshot.copy(
                        metadata = baseSnapshot.metadata.copy(
                            current_turn_id = turn.id,
                            version = baseSnapshot.metadata.version + 1,
                            transition_type = "continuation"
                        )
                    )
                    chatDao.upsertWorldSnapshot(
                        turnId = turn.id,
                        threadId = thread.id,
                        branchId = turn.branch_origin_id,
                        basedOnTurnId = turn.parent_turn_id,
                        worldState = clonedSnapshot,
                        version = clonedSnapshot.metadata.version,
                        isFullMaterialization = false
                    )
                } catch (inner: Exception) {
                    // Ignore DB failures
                }
            }
        }
    }

    private fun buildTurnPath(turns: List<TurnEntity>, headTurnId: String?): List<TurnEntity> {
        if (headTurnId == null) return emptyList()
        val turnsMap = turns.associateBy { it.id }
        val path = mutableListOf<TurnEntity>()
        var currentId = headTurnId
        while (currentId != null) {
            val turn = turnsMap[currentId] ?: break
            path.add(turn)
            currentId = turn.parent_turn_id
        }
        val ordered = path.reversed().toMutableList()
        // A failed generation does NOT advance the branch head, so its turn branches off the
        // head and would otherwise be invisible — hiding the failure + Retry/Edit panel.
        // Surface the most recent failed child of the head.
        val failedChild = turns
            .filter { it.parent_turn_id == headTurnId && it.generation_status == "failed" }
            .maxByOrNull { it.created_at }
        if (failedChild != null) ordered.add(failedChild)
        return ordered
    }

    private fun buildEmptyDurableSnapshot(turnId: String): DurableMemorySnapshot {
        return DurableMemorySnapshot(
            metadata = SnapshotMetadata(turnId, "", "continuation", 1),
            spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
            entity_state = emptyList(),
            relational_state = emptyList(),
            narrative_state = NarrativeState("", "", "", emptyList(), emptyList())
        )
    }
}
