package com.example.open_fantasia.ui.chat

import android.util.Log
import android.content.Context
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
import com.example.open_fantasia.data.local.entity.ContinuityCheckpointEntity
import com.example.open_fantasia.data.local.entity.CastSeedEntity
import com.example.open_fantasia.data.local.entity.CastProfileOverrideEntity
import com.example.open_fantasia.data.continuity.ContinuityCheckpointCoordinator
import com.example.open_fantasia.data.continuity.ContinuityHostClient
import com.example.open_fantasia.data.continuity.ContinuityHostState
import com.example.open_fantasia.data.continuity.ContinuityCheckpointScheduler
import com.example.open_fantasia.data.remote.ChatMessage
import com.example.open_fantasia.data.remote.LLMClient
import com.example.open_fantasia.domain.model.CharacterBundle
import com.example.open_fantasia.domain.model.CastMember
import com.example.open_fantasia.domain.model.CastProfile
import com.example.open_fantasia.domain.model.UserPersonaRecord
import com.example.open_fantasia.domain.model.parseSupportingCast
import com.example.open_fantasia.domain.model.DurableMemorySnapshot
import com.example.open_fantasia.domain.model.SnapshotMetadata
import com.example.open_fantasia.domain.model.SpatialState
import com.example.open_fantasia.domain.model.NarrativeState
import com.example.open_fantasia.domain.model.resolveCastRoster
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
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
        val isScanning: Boolean,
        val checkpoint: ContinuityCheckpointEntity?,
        val continuityHostState: ContinuityHostState,
        val exchangesUntilCheckpoint: Int,
        val castRoster: List<CastProfile>
    ) : ChatUiState
}

class ChatViewModel(
    private val threadId: String,
    private val chatDao: ChatDao,
    private val characterDao: CharacterDao,
    private val connectionDao: ConnectionDao,
    private val personaDao: PersonaDao,
    private val llmClient: LLMClient,
    private val runContinuityExtractionUseCase: RunContinuityExtractionUseCase,
    private val continuityCheckpointCoordinator: ContinuityCheckpointCoordinator,
    private val continuityHostClient: ContinuityHostClient,
    private val context: Context
) : ViewModel() {

    private val FIXED_USER_ID = "00000000-0000-0000-0000-000000000000"

    init {
        viewModelScope.launch {
            chatDao.clearStaleLocks()
            chatDao.markEmptyCommittedTurnsFailed(Instant.now().toString())
        }
        viewModelScope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    chatDao.getPendingCheckpoints().filter { it.thread_id == threadId }.forEach { request ->
                        if (request.status != "failed") ContinuityCheckpointScheduler.enqueue(context)
                        val thread = chatDao.getThread(threadId) ?: return@forEach
                        val character = characterDao.getCharacter(thread.character_id) ?: return@forEach
                        val persona = thread.persona_id?.let { personaDao.getPersona(it) }
                        continuityCheckpointCoordinator.sync(
                            request, character, persona,
                            chatDao.getActivePins(threadId, request.branch_id), thread.director_notes
                        )
                    }
                } catch (_: Exception) {
                    // The database can close underneath instrumentation teardown; retry on the next tick in normal use.
                }
                delay(10_000)
            }
        }
        viewModelScope.launch(Dispatchers.IO) {
            while (isActive) {
                try { continuityHostClient.checkHealth() }
                catch (error: Throwable) { continuityHostClient.markUnavailable(error) }
                delay(30_000)
            }
        }
    }

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating = _isGenerating.asStateFlow()

    private val _generatingText = MutableStateFlow("")
    val generatingText = _generatingText.asStateFlow()

    private val _isScanning = MutableStateFlow(false)
    val isScanning = _isScanning.asStateFlow()

    // One-shot user-facing result of the last Deep Scan (success/failure). The UI shows it as a
    // toast then calls consumeScanEvent(). Deep Scan used to fail silently — this makes it visible.
    private val _scanEvent = MutableStateFlow<String?>(null)
    val scanEvent = _scanEvent.asStateFlow()
    fun consumeScanEvent() { _scanEvent.value = null }

    // Turn ids we've already attempted to self-heal this session, so an empty snapshot doesn't
    // re-trigger a rebuild on every slow-state re-emission.
    private val selfHealAttempted = java.util.Collections.synchronizedSet(mutableSetOf<String>())

    private data class DbState(
        val thread: ThreadEntity?,
        val activeBranch: BranchEntity?,
        val branches: List<BranchEntity>,
        val turns: List<TurnEntity>,
        val timelineEvents: List<TimelineEntity>,
        val castSeeds: List<CastSeedEntity> = emptyList(),
        val castOverrides: List<CastProfileOverrideEntity> = emptyList()
    )


    // SLOW state — recomputed only on DB / connection / persona / snapshot changes. The
    // fast-changing stream flags (isGenerating/generatingText/isScanning) are layered on
    // afterwards, so a streamed token does NOT re-run getCharacter/getSnapshot/getActivePins.
    private val slowChatState = combine(
        combine(combine(combine(
            chatDao.getThreadFlow(threadId),
            chatDao.getActiveBranchForThreadFlow(threadId),
            chatDao.getBranchesForThreadFlow(threadId),
            chatDao.getTurnsForThreadFlow(threadId),
            chatDao.getAllTimelineEventsForThreadFlow(threadId)
        ) { thread, activeBranch, branches, turns, timeline ->
            DbState(thread, activeBranch, branches, turns, timeline)
        }, chatDao.getCastSeedsFlow(threadId)) { dbState, castSeeds ->
            dbState.copy(castSeeds = castSeeds)
        }, chatDao.getCastOverridesForThreadFlow(threadId)) { dbState, overrides ->
            dbState.copy(castOverrides = overrides)
        },
        connectionDao.getAllConnectionsFlow(),
        personaDao.getAllPersonasFlow(),
        // Re-emits when a snapshot is saved (background HCE materialization) so currentSnapshot re-queries.
        chatDao.getSnapshotSignalFlow(threadId),
        chatDao.getCheckpointsForThreadFlow(threadId)
    ) { dbState, connections, personas, _, checkpoints ->
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
                val snapshot = latestTurn?.let { chatDao.getNearestSnapshot(it.id)?.world_state }
                val baselineIndex = snapshot?.metadata?.current_turn_id?.let { id -> branchTurns.indexOfFirst { it.id == id } } ?: -1
                val exchangesSinceSnapshot = branchTurns.drop(baselineIndex + 1)
                    .count { it.generation_status == "committed" && !it.starter_seed }
                val lineageIds = branchTurns.map { it.id }.toSet()
                val checkpoint = checkpoints.firstOrNull { it.status != "accepted" && it.target_turn_id in lineageIds }
                val pins = chatDao.getActivePins(threadId, activeBranch.id)
                val activePersona = thread.persona_id?.let { pid -> personas.find { it.id == pid } }
                val castRoster = resolveCastRoster(
                    snapshot = snapshot,
                    seeds = dbState.castSeeds.map { it.toDomain() },
                    overrides = dbState.castOverrides.filter { it.branch_id == activeBranch.id }.map { it.toDomain() },
                    playerName = activePersona?.name
                )

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
                    isScanning = false,
                    checkpoint = checkpoint,
                    continuityHostState = continuityHostClient.state.value,
                    exchangesUntilCheckpoint = (7 - exchangesSinceSnapshot).coerceAtLeast(0),
                    castRoster = castRoster
                )
            }
        }
    }

    val uiState: StateFlow<ChatUiState> = combine(
        slowChatState,
        _isGenerating,
        _generatingText,
        _isScanning,
        continuityHostClient.state
    ) { slow, isGen, genText, isScan, hostState ->
        // Cheap overlay of fast-changing stream state — no DB work on each streamed token.
        if (slow is ChatUiState.Success) {
            slow.copy(isGenerating = isGen, generatingText = genText, isScanning = isScan, continuityHostState = hostState)
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
        expectedHeadTurnIdOverride: String? = null,
        requestedSpeakerIdOverride: String? = null,
        speakerModeOverride: String? = null
    ) {
        if (inputText.isBlank()) return
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val thread = state.thread
            val activeBranch = state.activeBranch
            if (state.checkpoint != null) return@launch
            val connection = connectionDao.getConnection(thread.connection_id) ?: return@launch

            val shortcut = resolveSpeakerShortcut(inputText, state.castRoster)
            val visibleInput = shortcut?.second ?: inputText
            val speakerMode = speakerModeOverride ?: activeBranch.speaker_mode
            val requestedSpeakerId = requestedSpeakerIdOverride ?: shortcut?.first?.cast_id
                ?: activeBranch.active_speaker_id ?: "primary:${thread.id}"
            val activeSpeaker = state.castRoster.firstOrNull { it.cast_id == requestedSpeakerId }
                ?: state.castRoster.firstOrNull { it.provenance == "primary" }
            val turnInputPayload = "{\"sticky_speaker_id\":\"${activeBranch.active_speaker_id ?: "primary:${thread.id}"}\",\"sticky_mode\":\"${activeBranch.speaker_mode}\",\"shortcut\":${shortcut != null}}"

            val parentSnapshot = if (forceParentOverride && parentTurnIdOverride != null) {
                chatDao.getNearestSnapshot(parentTurnIdOverride)?.world_state
            } else {
                state.currentSnapshot
            }
            val stateContext = PromptBuilder.buildStateContext(
                snapshot = parentSnapshot,
                pins = state.pins.map { it.toDomain() },
                timeline = emptyList(),
                replyLengthTokens = thread.max_output_tokens,
                activeSpeaker = activeSpeaker,
                castRoster = state.castRoster,
                speakerMode = speakerMode
            )
            val renderedUserMessage = "$stateContext\n\n$visibleInput"

            _isGenerating.value = true
            _generatingText.value = ""

            // 1. Begin turn
            val newTurn = try {
                chatDao.beginTurn(
                    userId = FIXED_USER_ID,
                    branchId = activeBranch.id,
                    expectedHeadTurnId = expectedHeadTurnIdOverride ?: activeBranch.head_turn_id,
                    userInputText = visibleInput,
                    userInputPayload = turnInputPayload,
                    parentTurnIdOverride = parentTurnIdOverride,
                    forceParentOverride = forceParentOverride,
                    requestedSpeakerId = activeSpeaker?.cast_id,
                    requestedSpeakerName = if (speakerMode == "ensemble") "Ensemble" else activeSpeaker?.canonical_name,
                    speakerMode = speakerMode,
                    renderedUserMessage = renderedUserMessage
                )
            } catch (e: Exception) {
                _isGenerating.value = false
                return@launch
            }

            // 2. Build system prompt & messages context
            // Static, per-thread system prompt = the cacheable prefix.
            val systemPrompt = PromptBuilder.buildSystemPrompt(
                characterBundle = CharacterBundle(state.character.toDomain(), state.character.starters, state.character.example_conversations),
                persona = state.activePersona?.toDomain(),
                directorNotes = thread.director_notes
            )

            val allTurns = chatDao.getTurnsForThread(thread.id)
            val historyTurns = buildTurnPath(allTurns, parentTurnIdOverride ?: activeBranch.head_turn_id)

            val apiMessages = mutableListOf<ChatMessage>()
            historyTurns.forEach { turn ->
                if (turn.generation_status == "committed") {
                    apiMessages.add(ChatMessage(role = "user", content = turn.rendered_user_message ?: turn.user_input_text))
                    turn.assistant_output_text?.let {
                        apiMessages.add(ChatMessage(role = "assistant", content = it))
                    }
                }
            }
            apiMessages.add(ChatMessage(role = "user", content = renderedUserMessage))

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
            var providerTotalTokens: Int? = null
            var providerPromptTokens: Int? = null
            var providerCompletionTokens: Int? = null
            var cacheHitTokens: Int? = null
            var cacheMissTokens: Int? = null
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
                    providerTotalTokens = chunk.totalTokens ?: providerTotalTokens
                    providerPromptTokens = chunk.promptTokens ?: providerPromptTokens
                    providerCompletionTokens = chunk.completionTokens ?: providerCompletionTokens
                    cacheHitTokens = chunk.promptCacheHitTokens ?: cacheHitTokens
                    cacheMissTokens = chunk.promptCacheMissTokens ?: cacheMissTokens
                    _generatingText.value = accumulatedText
                }

                // Estimate token usage if the provider doesn't supply it
                val generatedTokens = accumulatedText.split(Regex("\\s+")).size * 4 / 3
                val promptTokens = systemPrompt.split(Regex("\\s+")).size * 4 / 3 + apiMessages.sumOf { it.content.split(Regex("\\s+")).size * 4 / 3 }
                val finalPromptTokens = providerPromptTokens ?: promptTokens
                val finalCompletionTokens = providerCompletionTokens ?: generatedTokens
                val totalTokens = providerTotalTokens ?: (finalCompletionTokens + finalPromptTokens)
                val assistantPayload = buildString {
                    append("{\"prompt_cache_hit_tokens\":")
                    append(cacheHitTokens ?: "null")
                    append(",\"prompt_cache_miss_tokens\":")
                    append(cacheMissTokens ?: "null")
                    append('}')
                }

                // 4. Commit turn on success
                chatDao.commitTurn(
                    userId = FIXED_USER_ID,
                    branchId = activeBranch.id,
                    turnId = newTurn.id,
                    assistantText = accumulatedText,
                    assistantPayload = assistantPayload,
                    provider = connection.provider,
                    model = thread.model_id,
                    label = connection.label,
                    finishReason = "stop",
                    totalTokens = totalTokens,
                    promptTokens = finalPromptTokens,
                    completionTokens = finalCompletionTokens,
                    replaceTurnId = replaceTurnId
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
                , requestedSpeakerIdOverride = latestTurn.requested_speaker_id
                , speakerModeOverride = latestTurn.speaker_mode
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
                , requestedSpeakerIdOverride = targetTurn.requested_speaker_id
                , speakerModeOverride = targetTurn.speaker_mode
            )
        }
    }

    fun selectSpeaker(castId: String) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val valid = state.castRoster.any { it.cast_id == castId && it.status == "active" && it.speaker_eligible && !it.player_controlled }
            if (valid) chatDao.setActiveSpeaker(state.activeBranch.id, castId, "single", Instant.now().toString())
        }
    }

    fun selectEnsemble() {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            chatDao.setActiveSpeaker(state.activeBranch.id, state.activeBranch.active_speaker_id, "ensemble", Instant.now().toString())
        }
    }

    fun saveCastProfile(profile: CastProfile) {
        if (profile.provenance == "primary" || profile.canonical_name.isBlank()) return
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val now = Instant.now().toString()
            val locked = listOf(
                "canonical_name", "aliases", "role_background", "personality", "voice_style",
                "appearance", "goals", "boundaries", "status", "speaker_eligible"
            )
            if (profile.provenance == "manual_seed") {
                chatDao.upsertCastSeed(
                    CastSeedEntity(
                        cast_id = profile.cast_id, thread_id = threadId, entity_id = profile.entity_id,
                        canonical_name = profile.canonical_name.trim(), aliases = profile.aliases,
                        role_background = profile.role_background.trim(), personality = profile.personality.trim(),
                        voice_style = profile.voice_style.trim(), appearance = profile.appearance.trim(),
                        goals = profile.goals.trim(), boundaries = profile.boundaries.trim(),
                        provenance = profile.provenance, first_seen_turn_id = profile.first_seen_turn_id,
                        evidence = profile.evidence, status = profile.status,
                        speaker_eligible = profile.speaker_eligible, player_controlled = false,
                        manual_locks = locked, created_at = now, updated_at = now
                    )
                )
            } else {
                chatDao.upsertCastOverride(
                    CastProfileOverrideEntity(
                        branch_id = state.activeBranch.id, cast_id = profile.cast_id, entity_id = profile.entity_id,
                        canonical_name = profile.canonical_name.trim(), aliases = profile.aliases,
                        role_background = profile.role_background.trim(), personality = profile.personality.trim(),
                        voice_style = profile.voice_style.trim(), appearance = profile.appearance.trim(),
                        goals = profile.goals.trim(), boundaries = profile.boundaries.trim(),
                        provenance = profile.provenance, first_seen_turn_id = profile.first_seen_turn_id,
                        evidence = profile.evidence, status = profile.status,
                        speaker_eligible = profile.speaker_eligible, player_controlled = false,
                        manual_locks = locked, updated_at = now
                    )
                )
            }
            if (profile.status == "archived" && state.activeBranch.active_speaker_id == profile.cast_id) {
                chatDao.setActiveSpeaker(state.activeBranch.id, "primary:$threadId", "single", now)
            }
        }
    }

    fun addManualCast(name: String, roleBackground: String) {
        val cleanName = name.trim()
        if (cleanName.isEmpty()) return
        saveCastProfile(
            CastProfile(
                cast_id = "seed:$threadId:${UUID.randomUUID()}", canonical_name = cleanName,
                role_background = roleBackground.trim(), provenance = "manual_seed",
                manual_locks = listOf("canonical_name", "role_background")
            )
        )
    }

    private fun resolveSpeakerShortcut(input: String, roster: List<CastProfile>): Pair<CastProfile, String>? {
        if (!input.startsWith('@')) return null
        val candidates = roster.filter { it.status == "active" && it.speaker_eligible && !it.player_controlled }
            .flatMap { profile -> (listOf(profile.canonical_name) + profile.aliases).map { it to profile } }
            .sortedByDescending { it.first.length }
        val match = candidates.firstOrNull { (name, _) ->
            input.regionMatches(1, name, 0, name.length, ignoreCase = true) &&
                input.getOrNull(name.length + 1)?.let { it.isWhitespace() || it in ":,-" } != false
        } ?: return null
        val stripped = input.drop(match.first.length + 1).trimStart(' ', '\t', ':', ',', '-')
        return match.second to stripped.ifBlank { input }
    }

    /** In-place edit of the assistant reply (web "Edit last reply"): rewrites the
     *  stored output without regenerating. The next prompt reads assistant_output_text. */
    fun editAssistantText(turnId: String, newText: String) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            if (state.checkpoint != null) return@launch
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
            if (state.checkpoint != null) return@launch
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
            if (state.checkpoint != null) return@launch
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
            if (state.checkpoint != null) return@launch
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
            if (state.checkpoint != null) return@launch
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
            if (state.checkpoint != null) return@launch
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
        directorNotes: String
    ) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            if (state.checkpoint != null) return@launch
            val thread = chatDao.getThread(threadId) ?: return@launch
            val updated = thread.copy(
                connection_id = connectionId,
                model_id = modelId,
                max_output_tokens = maxTokens,
                persona_id = personaId,
                brain_connection_id = brainConnectionId,
                brain_model_id = brainModelId,
                director_notes = directorNotes.trim(),
                updated_at = Instant.now().toString()
            )
            chatDao.updateThread(updated)
        }
    }

    fun runDeepScan() {
        val state = uiState.value as? ChatUiState.Success ?: return
        viewModelScope.launch {
            try { chatDao.requestEarlyCheckpoint(state.activeBranch.id); _scanEvent.value = "Continuity update requested — waiting for Codex." }
            catch (e: Exception) { _scanEvent.value = e.message ?: "Unable to request continuity update" }
        }
    }

    fun retryCheckpoint() {
        val state = uiState.value as? ChatUiState.Success ?: return
        val request = state.checkpoint ?: return
        viewModelScope.launch {
            continuityCheckpointCoordinator.retry(request)
            ContinuityCheckpointScheduler.enqueue(context)
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
        // Re-derive the full world state more often so incremental-diff drift (dropped entities,
        // stale placements) gets audited and repaired sooner.
        return count >= 6
    }

    /**
     * Rebuilds the world state for the latest committed turn when it is missing or empty — the
     * signature of a thread whose initial extraction failed and left an empty base that every
     * incremental diff since has built on. Runs a full re-materialization once per turn per
     * session, in the background, and only persists if it actually recovered state.
     */
    private fun selfHealSnapshotIfNeeded(
        thread: ThreadEntity,
        character: CharacterEntity,
        activeBranch: BranchEntity,
        branchTurns: List<TurnEntity>,
        currentSnapshot: DurableMemorySnapshot?
    ) {
        val latestCommitted = branchTurns.lastOrNull { it.generation_status == "committed" } ?: return
        val isEmpty = currentSnapshot == null ||
            (currentSnapshot.entity_state.isEmpty() && currentSnapshot.narrative_state.story_summary.isBlank())
        if (!isEmpty) return
        // Don't fight an in-flight generation/scan (which will materialize on its own), and only
        // try each turn once per session.
        if (_isGenerating.value || _isScanning.value) return
        if (!selfHealAttempted.add(latestCommitted.id)) return

        viewModelScope.launch(Dispatchers.Default) {
            try {
                val connection = connectionDao.getConnection(thread.connection_id) ?: return@launch
                val brainConnection = thread.brain_connection_id?.let { connectionDao.getConnection(it) } ?: connection
                val brainModel = thread.brain_model_id ?: thread.model_id
                val brainStructuredOutput = brainConnection.provider in setOf("mistral", "groq", "openrouter")

                val apiMessages = mutableListOf<ChatMessage>()
                branchTurns.forEach { t ->
                    if (t.generation_status == "committed") {
                        apiMessages.add(ChatMessage(role = "user", content = t.user_input_text))
                        t.assistant_output_text?.let { apiMessages.add(ChatMessage(role = "assistant", content = it)) }
                    }
                }
                if (apiMessages.isEmpty()) return@launch

                Log.d("ChatViewModel", "Self-healing empty world state for turn ${latestCommitted.id}")
                val baseSnapshot = buildEmptyDurableSnapshot(latestCommitted.id)
                val extraction = runContinuityExtractionUseCase.execute(
                    connection = brainConnection.toDomain(),
                    modelId = brainModel,
                    character = character.toDomain(),
                    currentSnapshot = baseSnapshot,
                    recentMessages = apiMessages,
                    isFullMaterialization = true,
                    forceJson = true,
                    userPersona = null,
                    supportingCast = parseSupportingCast(thread.supporting_cast),
                    structuredOutput = brainStructuredOutput
                )

                // Only persist if we actually recovered something — never overwrite with another empty.
                val recovered = extraction.entity_mutations.isNotEmpty() || extraction.story_summary.isNotBlank()
                if (!recovered) {
                    Log.w("ChatViewModel", "Self-heal produced no state for turn ${latestCommitted.id}")
                    return@launch
                }

                val reducerResult = WorldStateReducer.applyExtractionToSnapshot(
                    previous = baseSnapshot,
                    extraction = extraction,
                    turnId = latestCommitted.id
                )
                chatDao.upsertWorldSnapshot(
                    turnId = latestCommitted.id,
                    threadId = thread.id,
                    branchId = latestCommitted.branch_origin_id,
                    basedOnTurnId = latestCommitted.parent_turn_id,
                    worldState = reducerResult.snapshot,
                    version = reducerResult.snapshot.metadata.version,
                    isFullMaterialization = true
                )
            } catch (e: Exception) {
                Log.w("ChatViewModel", "Self-heal materialization failed for turn ${latestCommitted.id}", e)
            }
        }
    }

    private fun materializeSnapshotForTurnInBackground(
        thread: ThreadEntity,
        character: CharacterEntity,
        connection: ConnectionEntity,
        turn: TurnEntity,
        previousSnapshot: DurableMemorySnapshot?,
        recentMessages: List<ChatMessage>,
        historyTurns: List<TurnEntity>,
        userPersona: UserPersonaRecord? = null,
        supportingCast: List<CastMember> = emptyList()
    ) {
        viewModelScope.launch(Dispatchers.Default) {
            val baseSnapshot = previousSnapshot ?: buildEmptyDurableSnapshot(turn.parent_turn_id ?: "turn-0")
            try {
                val brainConnection = thread.brain_connection_id?.let { connectionDao.getConnection(it) } ?: connection
                if (thread.brain_model_id == null) {
                    Log.w("ChatViewModel", "Thread has no brain_model_id; HCE is running on the roleplay model '${thread.model_id}'. Set a dedicated brain model for reliable extraction.")
                }
                val brainModel = thread.brain_model_id ?: thread.model_id
                // HCE always wants JSON. The old supportsJson gate silently disabled it whenever the
                // model_cache flag was stale/missing, which is a major cause of parse failures. The
                // extraction use case degrades gracefully if a provider rejects the request.
                val brainForceJson = true
                val brainStructuredOutput = brainConnection.provider in setOf("mistral", "groq", "openrouter")

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
                    historyMessages.takeLast(40) + listOf(
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
                    forceJson = brainForceJson,
                    userPersona = userPersona,
                    supportingCast = supportingCast,
                    structuredOutput = brainStructuredOutput
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
