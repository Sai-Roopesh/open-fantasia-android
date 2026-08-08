package com.example.open_fantasia.ui.chat

import android.util.Log
import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.open_fantasia.data.local.dao.CharacterDao
import com.example.open_fantasia.data.local.dao.ChatDao
import com.example.open_fantasia.data.local.dao.ConnectionDao
import com.example.open_fantasia.data.local.dao.PersonaDao
import com.example.open_fantasia.data.local.dao.PortraitTaskDao
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
import com.example.open_fantasia.data.local.entity.RoleplayGenerationJobEntity
import com.example.open_fantasia.data.local.entity.CastPortraitEntity
import com.example.open_fantasia.data.continuity.ContinuityCheckpointCoordinator
import com.example.open_fantasia.data.continuity.ContinuityHostClient
import com.example.open_fantasia.data.continuity.ContinuityHostState
import com.example.open_fantasia.data.continuity.ContinuityCheckpointScheduler
import com.example.open_fantasia.data.continuity.ContinuityHostPreferences
import com.example.open_fantasia.data.continuity.RoleplayGenerationCoordinator
import com.example.open_fantasia.data.continuity.RoleplayGenerationScheduler
import com.example.open_fantasia.data.continuity.RoleplayProtocol
import com.example.open_fantasia.data.continuity.PortraitGenerationCoordinator
import com.example.open_fantasia.domain.model.RoleplayContextAssembler
import com.example.open_fantasia.domain.model.CharacterBundle
import com.example.open_fantasia.domain.model.CastProfile
import com.example.open_fantasia.domain.model.DurableMemorySnapshot
import com.example.open_fantasia.domain.model.RoleplayGenerationRequest
import com.example.open_fantasia.domain.model.RoleplayGenerationSettings
import com.example.open_fantasia.domain.model.RoleplayLineageEntry
import com.example.open_fantasia.domain.model.BranchLineage
import com.example.open_fantasia.domain.model.BranchLineageRef
import com.example.open_fantasia.domain.model.TurnLineageRef
import com.example.open_fantasia.domain.model.resolveCastRoster
import com.example.open_fantasia.domain.reducer.PromptBuilder
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.Dispatchers
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
        val castRoster: List<CastProfile>,
        val castPortraits: List<CastPortraitEntity>,
        val needsContinuityEngineChoice: Boolean
    ) : ChatUiState
}

class ChatViewModel(
    private val threadId: String,
    private val chatDao: ChatDao,
    private val characterDao: CharacterDao,
    private val connectionDao: ConnectionDao,
    private val personaDao: PersonaDao,
    private val continuityCheckpointCoordinator: ContinuityCheckpointCoordinator,
    private val roleplayGenerationCoordinator: RoleplayGenerationCoordinator,
    private val portraitGenerationCoordinator: PortraitGenerationCoordinator,
    private val portraitTaskDao: PortraitTaskDao,
    private val continuityHostClient: ContinuityHostClient,
    private val continuityHostPreferences: ContinuityHostPreferences,
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
                    }
                } catch (_: Exception) {
                    // The database can close underneath instrumentation teardown; retry on the next tick in normal use.
                }
                delay(10_000)
            }
        }
        viewModelScope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    chatDao.getPendingRoleplayJobs().filter { it.thread_id == threadId }.forEach { job ->
                        if (job.status !in setOf("failed", "accepted", "superseded")) {
                            if (job.execution_mode == RoleplayGenerationCoordinator.EXECUTION_MODE_MAC_HOST) {
                                RoleplayGenerationScheduler.enqueue(context)
                            }
                            roleplayGenerationCoordinator.resume(job)
                        }
                    }
                } catch (_: Exception) {}
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

    private val _needsContinuityEngineChoice = MutableStateFlow(false)
    private data class PendingSend(
        val inputText: String,
        val guidance: String?,
        val parentTurnIdOverride: String?,
        val forceParentOverride: Boolean,
        val replaceTurnId: String?,
        val expectedHeadTurnIdOverride: String?,
        val requestedSpeakerIdOverride: String?,
        val speakerModeOverride: String?
    )
    private data class PendingAssistantEdit(val turnId: String, val text: String)
    private var pendingSendForEngine: PendingSend? = null
    private var pendingRewindForEngine: String? = null
    private var pendingAssistantEditForEngine: PendingAssistantEdit? = null
    private var pendingEarlyCheckpointForEngine = false

    // One-shot user-facing result of the last Deep Scan (success/failure). The UI shows it as a
    // toast then calls consumeScanEvent(). Deep Scan used to fail silently — this makes it visible.
    private val _scanEvent = MutableStateFlow<String?>(null)
    val scanEvent = _scanEvent.asStateFlow()
    fun consumeScanEvent() { _scanEvent.value = null }

    private data class DbState(
        val thread: ThreadEntity?,
        val activeBranch: BranchEntity?,
        val branches: List<BranchEntity>,
        val turns: List<TurnEntity>,
        val timelineEvents: List<TimelineEntity>,
        val pins: List<PinEntity> = emptyList(),
        val castSeeds: List<CastSeedEntity> = emptyList(),
        val castOverrides: List<CastProfileOverrideEntity> = emptyList(),
        val castPortraits: List<CastPortraitEntity> = emptyList(),
        val characters: List<CharacterEntity> = emptyList()
    )


    // SLOW state — recomputed only on DB / connection / persona / snapshot changes. The
    // fast-changing stream flags (isGenerating/generatingText/isScanning) are layered on
    // afterwards, so a streamed token does NOT re-run getCharacter/getSnapshot/getActivePins.
    private val slowChatState = combine(
        combine(combine(combine(combine(combine(combine(
            chatDao.getThreadFlow(threadId),
            chatDao.getActiveBranchForThreadFlow(threadId),
            chatDao.getBranchesForThreadFlow(threadId),
            chatDao.getTurnsForThreadFlow(threadId),
            chatDao.getAllTimelineEventsForThreadFlow(threadId)
        ) { thread, activeBranch, branches, turns, timeline ->
            DbState(thread, activeBranch, branches, turns, timeline)
        }, chatDao.getAllActivePinsForThreadFlow(threadId)) { dbState, pins ->
            dbState.copy(pins = pins)
        }, chatDao.getCastSeedsFlow(threadId)) { dbState, castSeeds ->
            dbState.copy(castSeeds = castSeeds)
        }, chatDao.getCastOverridesForThreadFlow(threadId)) { dbState, overrides ->
            dbState.copy(castOverrides = overrides)
        }, portraitTaskDao.getCastPortraitsForThreadFlow(threadId)) { dbState, portraits ->
            dbState.copy(castPortraits = portraits)
        }, characterDao.getAllCharactersFlow()) { dbState, characters ->
            dbState.copy(characters = characters)
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
            val character = dbState.characters.firstOrNull { it.id == thread.character_id }
            if (character == null) {
                ChatUiState.Error
            } else {
                val branchTurns = buildTurnPath(dbState.turns, activeBranch.head_turn_id)
                val lineage = BranchLineage.select(
                    dbState.branches.map { BranchLineageRef(it.id, it.parent_branch_id) },
                    dbState.turns.map { TurnLineageRef(it.id, it.parent_turn_id) },
                    activeBranch.id,
                    activeBranch.head_turn_id
                )
                val latestTurn = branchTurns.lastOrNull { it.generation_status == "committed" }
                val snapshot = latestTurn?.let { chatDao.getNearestSnapshot(it.id)?.world_state }
                val baselineIndex = snapshot?.metadata?.current_turn_id?.let { id -> branchTurns.indexOfFirst { it.id == id } } ?: -1
                val exchangesSinceSnapshot = branchTurns.drop(baselineIndex + 1)
                    .count { it.generation_status == "committed" && !it.starter_seed }
                val lineageIds = branchTurns.map { it.id }.toSet()
                val checkpoint = checkpoints.firstOrNull { it.status !in setOf("accepted", "superseded") && it.target_turn_id in lineageIds }
                val pins = BranchLineage.reachable(
                    dbState.pins,
                    lineage,
                    branchId = { it.branch_id },
                    turnId = { it.turn_id }
                )
                val timeline = BranchLineage.reachable(
                    dbState.timelineEvents,
                    lineage,
                    branchId = { it.branch_id },
                    turnId = { it.turn_id }
                )
                val overrides = BranchLineage.overlay(
                    dbState.castOverrides,
                    lineage,
                    branchId = { it.branch_id },
                    firstSeenTurnId = { it.first_seen_turn_id },
                    key = { it.cast_id }
                )
                val activePersona = thread.persona_id?.let { pid -> personas.find { it.id == pid } }
                val castRoster = resolveCastRoster(
                    snapshot = snapshot,
                    seeds = dbState.castSeeds.map { it.toDomain() },
                    overrides = overrides.map { it.toDomain() },
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
                    timelineEvents = timeline,
                    connections = connections,
                    personas = personas,
                    activePersona = activePersona,
                    isGenerating = false,
                    generatingText = "",
                    isScanning = false,
                    checkpoint = checkpoint,
                    continuityHostState = continuityHostClient.state.value,
                    exchangesUntilCheckpoint = (15 - exchangesSinceSnapshot).coerceAtLeast(0),
                    castRoster = castRoster,
                    castPortraits = BranchLineage.overlay(
                        dbState.castPortraits,
                        lineage,
                        branchId = { it.branch_id },
                        firstSeenTurnId = { null },
                        key = { it.cast_id }
                    ),
                    needsContinuityEngineChoice = false
                )
            }
        }
    }

    private data class FastState(
        val isGenerating: Boolean,
        val generatingText: String,
        val isScanning: Boolean,
        val hostState: ContinuityHostState,
        val needsEngine: Boolean
    )

    private val fastState = combine(
        _isGenerating,
        _generatingText,
        _isScanning,
        continuityHostClient.state,
        _needsContinuityEngineChoice
    ) { isGen, genText, isScan, hostState, needsEngine ->
        FastState(isGen, genText, isScan, hostState, needsEngine)
    }

    val uiState: StateFlow<ChatUiState> = combine(slowChatState, fastState) { slow, fast ->
        // Cheap overlay of fast-changing stream state — no DB work on each streamed token.
        if (slow is ChatUiState.Success) {
            val lockedTurn = slow.activeBranch.locked_by_turn_id?.let { id -> slow.turns.firstOrNull { it.id == id } }
            val durableGenerationActive = slow.activeBranch.generation_locked && lockedTurn?.generation_status != "failed"
            slow.copy(
                isGenerating = fast.isGenerating || durableGenerationActive,
                generatingText = fast.generatingText,
                isScanning = fast.isScanning,
                continuityHostState = fast.hostState,
                needsContinuityEngineChoice = fast.needsEngine
            )
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
            if (state.exchangesUntilCheckpoint == 1 && continuityHostPreferences.continuityEngineId() == null) {
                pendingSendForEngine = PendingSend(
                    inputText, guidance, parentTurnIdOverride, forceParentOverride, replaceTurnId,
                    expectedHeadTurnIdOverride, requestedSpeakerIdOverride, speakerModeOverride
                )
                _needsContinuityEngineChoice.value = true
                return@launch
            }
            val connection = connectionDao.getConnection(thread.connection_id)
            if (connection == null) {
                _scanEvent.value = "The selected Roleplay Model connection no longer exists."
                return@launch
            }
            if (!connection.enabled) {
                _scanEvent.value = "The selected Roleplay Model connection is disabled."
                return@launch
            }

            val contextHeadTurnId = if (forceParentOverride) {
                parentTurnIdOverride
            } else {
                activeBranch.head_turn_id
            }
            val contextSnapshot = contextHeadTurnId?.let { chatDao.getNearestSnapshot(it) }
            val contextLineage = chatDao.resolveLineageState(activeBranch.id, contextHeadTurnId)
            val contextCastRoster = resolveCastRoster(
                snapshot = contextSnapshot?.world_state,
                seeds = chatDao.getCastSeeds(thread.id).map { it.toDomain() },
                overrides = contextLineage.castOverrides.map { it.toDomain() },
                playerName = state.activePersona?.name
            )
            val shortcut = resolveSpeakerShortcut(inputText, contextCastRoster)
            val visibleInput = shortcut?.second ?: inputText
            val speakerMode = speakerModeOverride ?: activeBranch.speaker_mode
            val requestedSpeakerId = requestedSpeakerIdOverride ?: shortcut?.first?.cast_id
                ?: activeBranch.active_speaker_id ?: "primary:${thread.id}"
            val activeSpeaker = contextCastRoster.firstOrNull { it.cast_id == requestedSpeakerId }
            if (speakerMode != "ensemble" && activeSpeaker == null) {
                _scanEvent.value = "The selected Active Speaker is not valid at this point in the branch."
                return@launch
            }
            val turnInputPayload = "{\"sticky_speaker_id\":\"${activeBranch.active_speaker_id ?: "primary:${thread.id}"}\",\"sticky_mode\":\"${activeBranch.speaker_mode}\",\"shortcut\":${shortcut != null}}"

            val replyControl = PromptBuilder.buildReplyControlContext(
                replyLengthTokens = thread.max_output_tokens,
                activeSpeaker = activeSpeaker,
                castRoster = contextCastRoster,
                speakerMode = speakerMode
            )
            val renderedUserMessage = "$replyControl\n\n$visibleInput"

            // Build one provider-neutral context before reserving the turn. Every reply-producing
            // action converges here, so normal send, regenerate, edit, branch, and post-rewind
            // generation cannot select history differently.
            val allTurns = chatDao.getTurnsForThread(thread.id)
            val assembledContext = RoleplayContextAssembler.assemble(
                lineage = allTurns.map { turn ->
                    RoleplayLineageEntry(
                        id = turn.id,
                        parent_id = turn.parent_turn_id,
                        user_text = turn.user_input_text,
                        assistant_text = turn.assistant_output_text,
                        generation_status = turn.generation_status,
                        starter_seed = turn.starter_seed
                    )
                },
                head_exchange_id = contextHeadTurnId,
                continuity_baseline_exchange_id = contextSnapshot?.turn_id,
                current_user_message = renderedUserMessage,
                regeneration_direction = guidance
            )
            val continuityContext = PromptBuilder.buildContinuityContext(
                snapshot = contextSnapshot?.world_state,
                pins = contextLineage.pins
                    .filter {
                        it.turn_id == null ||
                            it.turn_id in assembledContext.retained_lineage_exchange_ids
                    }
                    .map { it.toDomain() },
                timeline = emptyList()
            )
            val staticSystemPrompt = PromptBuilder.buildSystemPrompt(
                characterBundle = CharacterBundle(
                    state.character.toDomain(),
                    state.character.starters,
                    state.character.example_conversations
                ),
                persona = state.activePersona?.toDomain(),
                directorNotes = thread.director_notes
            )
            val systemPrompt = "$staticSystemPrompt\n\n$continuityContext"

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

            val modelId = if (connection.provider == RoleplayProtocol.PROVIDER) {
                RoleplayProtocol.MODEL_ID
            } else {
                thread.model_id.trim()
            }
            if (modelId.isBlank()) {
                chatDao.discardUncommittedTurn(activeBranch.id, newTurn.id)
                _isGenerating.value = false
                _scanEvent.value = "Select a Roleplay Model before sending."
                return@launch
            }
            val executionMode = if (connection.provider == RoleplayProtocol.PROVIDER) {
                RoleplayGenerationCoordinator.EXECUTION_MODE_MAC_HOST
            } else {
                RoleplayGenerationCoordinator.EXECUTION_MODE_DIRECT
            }
            val request = RoleplayGenerationRequest(
                system_prompt = systemPrompt,
                messages = assembledContext.messages,
                requested_speaker_id = newTurn.requested_speaker_id,
                speaker_mode = newTurn.speaker_mode,
                settings = RoleplayGenerationSettings(
                    temperature = state.character.temperature,
                    top_p = state.character.top_p,
                    max_tokens = thread.max_output_tokens
                )
            )
            val now = Instant.now().toString()
            val job = RoleplayGenerationJobEntity(
                id = UUID.randomUUID().toString(),
                turn_id = newTurn.id,
                thread_id = thread.id,
                branch_id = activeBranch.id,
                expected_head_turn_id = expectedHeadTurnIdOverride ?: activeBranch.head_turn_id,
                replace_turn_id = replaceTurnId,
                requested_speaker_id = newTurn.requested_speaker_id,
                speaker_mode = newTurn.speaker_mode,
                model_id = modelId,
                system_prompt = request.system_prompt,
                messages_json = RoleplayProtocol.messagesJson(request.messages),
                temperature = request.settings.temperature,
                top_p = request.settings.top_p,
                max_tokens = request.settings.max_tokens,
                provider = connection.provider,
                connection_id = connection.id,
                connection_label = connection.label,
                execution_mode = executionMode,
                request_hash = request.sha256(),
                status = if (executionMode == RoleplayGenerationCoordinator.EXECUTION_MODE_MAC_HOST) {
                    "pending_export"
                } else {
                    "queued"
                },
                created_at = now,
                updated_at = now
            )
            chatDao.insertRoleplayJob(job)
            if (executionMode == RoleplayGenerationCoordinator.EXECUTION_MODE_MAC_HOST) {
                chatDao.markTurnGenerationStatus(newTurn.id, "waiting_for_host", now)
                RoleplayGenerationScheduler.enqueue(context)
            }
            try {
                roleplayGenerationCoordinator.execute(job) { accumulatedText ->
                    _generatingText.value = accumulatedText
                }
            } finally {
                _isGenerating.value = false
            }
        }
    }

    fun regenerateLatestTurn(guidance: String? = null) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val latestTurn = state.turns.lastOrNull() ?: return@launch
            val parentTurnId = latestTurn.parent_turn_id
            val userText = latestTurn.user_input_text
            val remoteJob = chatDao.getLatestRoleplayJobForTurn(latestTurn.id)
            if (remoteJob != null && remoteJob.status !in setOf("accepted", "superseded")) {
                if (!guidance.isNullOrBlank() ||
                    remoteJob.execution_mode != RoleplayGenerationCoordinator.EXECUTION_MODE_MAC_HOST
                ) {
                    roleplayGenerationCoordinator.discard(remoteJob)
                    sendUserMessage(
                        inputText = userText,
                        guidance = guidance,
                        parentTurnIdOverride = parentTurnId,
                        forceParentOverride = true,
                        expectedHeadTurnIdOverride = parentTurnId,
                        requestedSpeakerIdOverride = latestTurn.requested_speaker_id,
                        speakerModeOverride = latestTurn.speaker_mode
                    )
                } else {
                    roleplayGenerationCoordinator.retry(remoteJob)
                    RoleplayGenerationScheduler.enqueue(context)
                }
                return@launch
            }

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

    fun selectContinuityEngine(engineId: String) {
        continuityHostPreferences.saveContinuityEngineId(engineId)
        _needsContinuityEngineChoice.value = false
        pendingSendForEngine?.also { pending ->
            pendingSendForEngine = null
            sendUserMessage(
                pending.inputText, pending.guidance, pending.parentTurnIdOverride,
                pending.forceParentOverride, pending.replaceTurnId, pending.expectedHeadTurnIdOverride,
                pending.requestedSpeakerIdOverride, pending.speakerModeOverride
            )
            return
        }
        pendingRewindForEngine?.also { turnId ->
            pendingRewindForEngine = null
            rewindToTurn(turnId)
            return
        }
        pendingAssistantEditForEngine?.also { edit ->
            pendingAssistantEditForEngine = null
            editAssistantText(edit.turnId, edit.text)
            return
        }
        if (pendingEarlyCheckpointForEngine) {
            pendingEarlyCheckpointForEngine = false
            runDeepScan()
        }
    }

    fun dismissContinuityEngineChoice() {
        pendingSendForEngine = null
        pendingRewindForEngine = null
        pendingAssistantEditForEngine = null
        pendingEarlyCheckpointForEngine = false
        _needsContinuityEngineChoice.value = false
    }

    fun editTurnText(turnId: String, newUserText: String) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val activeBranch = state.activeBranch
            val targetTurn = state.turns.find { it.id == turnId } ?: return@launch
            val parentTurnId = targetTurn.parent_turn_id
            val remoteJob = chatDao.getLatestRoleplayJobForTurn(targetTurn.id)
            if (remoteJob != null && remoteJob.status !in setOf("accepted", "superseded")) {
                roleplayGenerationCoordinator.discard(remoteJob)
                sendUserMessage(
                    inputText = newUserText,
                    parentTurnIdOverride = parentTurnId,
                    forceParentOverride = true,
                    expectedHeadTurnIdOverride = parentTurnId,
                    requestedSpeakerIdOverride = targetTurn.requested_speaker_id,
                    speakerModeOverride = targetTurn.speaker_mode
                )
                return@launch
            }

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
            val profile = state.castRoster.firstOrNull {
                it.cast_id == castId && it.status == "active" && it.speaker_eligible && !it.player_controlled
            }
            if (profile != null) {
                chatDao.setActiveSpeaker(state.activeBranch.id, castId, "single", Instant.now().toString())
                portraitGenerationCoordinator.ensureCast(
                    state.character.id,
                    state.thread.id,
                    state.activeBranch.id,
                    profile
                )
            }
        }
    }

    fun ensureActiveSpeakerPortrait() {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            if (state.activeBranch.speaker_mode != "single") return@launch
            val profile = state.castRoster.firstOrNull { it.cast_id == state.activeBranch.active_speaker_id } ?: return@launch
            portraitGenerationCoordinator.ensureCast(state.character.id, state.thread.id, state.activeBranch.id, profile)
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
            } else if (profile.status == "active" && profile.cast_id == state.activeBranch.active_speaker_id) {
                portraitGenerationCoordinator.ensureCast(state.character.id, threadId, state.activeBranch.id, profile)
            }
        }
    }

    /**
     * Adds a new Cast Seed from every field the editor collected. Earlier this took only name and
     * role_background, so personality, voice, appearance, goals, and boundaries typed into the add
     * form were discarded and had to be re-entered through a second edit pass.
     */
    fun addManualCast(profile: CastProfile) {
        if (profile.canonical_name.isBlank()) return
        saveCastProfile(
            profile.copy(
                cast_id = profile.cast_id.ifBlank { "seed:$threadId:${UUID.randomUUID()}" },
                provenance = "manual_seed"
            )
        )
    }

    /** Builds a blank Cast Seed the editor can fill, so a new member always has a stable identity. */
    fun newCastSeed(): CastProfile = CastProfile(
        cast_id = "seed:$threadId:${UUID.randomUUID()}",
        canonical_name = "",
        provenance = "manual_seed"
    )

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

    /** Creates a branch-local replacement lineage and blocks it until continuity is rebuilt. */
    fun editAssistantText(turnId: String, newText: String) {
        if (newText.isBlank()) return
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            if (state.checkpoint != null) return@launch
            if (state.turns.none { it.id == turnId }) return@launch
            val engineId = continuityHostPreferences.continuityEngineId()
            if (engineId == null) {
                pendingAssistantEditForEngine = PendingAssistantEdit(turnId, newText)
                _needsContinuityEngineChoice.value = true
            } else {
                chatDao.replaceAssistantReply(
                    userId = FIXED_USER_ID,
                    branchId = state.activeBranch.id,
                    turnId = turnId,
                    assistantText = newText,
                    continuityEngineId = engineId
                )
                ContinuityCheckpointScheduler.enqueue(context)
            }
        }
    }

    fun rewindToTurn(turnId: String) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            if (state.checkpoint != null || state.activeBranch.generation_locked) return@launch
            val engineId = continuityHostPreferences.continuityEngineId()
            if (engineId == null) {
                pendingRewindForEngine = turnId
                _needsContinuityEngineChoice.value = true
                return@launch
            }
            val activeBranch = state.activeBranch
            try {
                chatDao.rewindBranchToTurn(
                    userId = FIXED_USER_ID,
                    branchId = activeBranch.id,
                    targetTurnId = turnId,
                    expectedHeadTurnId = activeBranch.head_turn_id,
                    continuityEngineId = engineId
                )
            } catch (_: IllegalStateException) {
                // The branch can become locked or advance between the rendered UI state and
                // this transaction. A stale history action must never terminate the app.
            }
        }
    }

    fun discardPendingReply(turnId: String) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            val job = chatDao.getLatestRoleplayJobForTurn(turnId)
            if (job != null && job.status !in setOf("accepted", "superseded")) {
                roleplayGenerationCoordinator.discard(job)
            } else {
                chatDao.discardUncommittedTurn(state.activeBranch.id, turnId)
            }
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
        directorNotes: String,
        portraitBackgroundEnabled: Boolean,
        portraitBackgroundDimness: Float
    ) {
        viewModelScope.launch {
            val state = uiState.value as? ChatUiState.Success ?: return@launch
            if (state.checkpoint != null) return@launch
            val connection = connectionDao.getConnection(connectionId)
            if (connection == null || !connection.enabled) {
                _scanEvent.value = "Select an enabled Roleplay Model connection."
                return@launch
            }
            val resolvedModelId = if (connection.provider == RoleplayProtocol.PROVIDER) {
                RoleplayProtocol.MODEL_ID
            } else {
                modelId.trim()
            }
            if (resolvedModelId.isBlank()) {
                _scanEvent.value = "Select a Roleplay Model."
                return@launch
            }
            val thread = chatDao.getThread(threadId) ?: return@launch
            val updated = thread.copy(
                connection_id = connectionId,
                model_id = resolvedModelId,
                max_output_tokens = maxTokens,
                persona_id = personaId,
                director_notes = directorNotes.trim(),
                portrait_background_enabled = portraitBackgroundEnabled,
                portrait_background_dimness = portraitBackgroundDimness.coerceIn(0.35f, 0.80f),
                updated_at = Instant.now().toString()
            )
            chatDao.updateThread(updated)
        }
    }

    fun runDeepScan() {
        val state = uiState.value as? ChatUiState.Success ?: return
        val engineId = continuityHostPreferences.continuityEngineId()
        if (engineId == null) {
            pendingEarlyCheckpointForEngine = true
            _needsContinuityEngineChoice.value = true
            return
        }
        viewModelScope.launch {
            try { chatDao.requestEarlyCheckpoint(state.activeBranch.id, engineId); _scanEvent.value = "Continuity update requested — waiting for Mac Host." }
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

    fun replaceCheckpointEngine() {
        val state = uiState.value as? ChatUiState.Success ?: return
        val request = state.checkpoint ?: return
        val replacement = if (request.engine_id == ContinuityHostPreferences.CODEX_TERRA_HIGH)
            ContinuityHostPreferences.ANTIGRAVITY_GEMINI_FLASH_HIGH else ContinuityHostPreferences.CODEX_TERRA_HIGH
        viewModelScope.launch {
            continuityCheckpointCoordinator.replaceEngine(request, replacement)
            ContinuityCheckpointScheduler.enqueue(context)
        }
    }

    private fun buildTurnPath(turns: List<TurnEntity>, headTurnId: String?): List<TurnEntity> {
        if (headTurnId == null) {
            return turns.filter { it.parent_turn_id == null && it.generation_status != "committed" }
                .maxByOrNull { it.created_at }?.let(::listOf) ?: emptyList()
        }
        val turnsMap = turns.associateBy { it.id }
        val path = mutableListOf<TurnEntity>()
        var currentId = headTurnId
        while (currentId != null) {
            val turn = turnsMap[currentId] ?: break
            path.add(turn)
            currentId = turn.parent_turn_id
        }
        val ordered = path.reversed().toMutableList()
        // A pending or failed generation does not advance the branch head. Surface its newest
        // child so durable Mac Host work survives navigation, process death, and reconnects.
        val pendingChild = turns
            .filter { it.parent_turn_id == headTurnId && it.generation_status != "committed" }
            .maxByOrNull { it.created_at }
        if (pendingChild != null) ordered.add(pendingChild)
        return ordered
    }

}
