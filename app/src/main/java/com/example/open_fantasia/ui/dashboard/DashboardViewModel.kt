package com.example.open_fantasia.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.open_fantasia.data.local.dao.CharacterDao
import com.example.open_fantasia.data.local.dao.ChatDao
import com.example.open_fantasia.data.local.dao.ConnectionDao
import com.example.open_fantasia.data.local.dao.PersonaDao
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import com.example.open_fantasia.data.local.entity.PersonaEntity
import com.example.open_fantasia.data.local.entity.ThreadEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

data class ThreadDashboardItem(
    val thread: ThreadEntity,
    val character: CharacterEntity?
)

data class OnboardingStep(
    val id: Int,
    val title: String,
    val isCompleted: Boolean,
    val ctaRoute: String
)

data class OnboardingState(
    val steps: List<OnboardingStep>,
    val progress: Float,
    val isCompleted: Boolean
)

class DashboardViewModel(
    private val chatDao: ChatDao,
    private val characterDao: CharacterDao,
    private val connectionDao: ConnectionDao,
    private val personaDao: PersonaDao
) : ViewModel() {

    private val FIXED_USER_ID = "00000000-0000-0000-0000-000000000000"

    private val _searchQuery = MutableStateFlow("")
    val searchQuery = _searchQuery.asStateFlow()

    private val _statusFilter = MutableStateFlow("active") // "active" or "archived"
    val statusFilter = _statusFilter.asStateFlow()

    val personas: StateFlow<List<PersonaEntity>> = personaDao.getAllPersonasFlow().stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    val characters: StateFlow<List<CharacterEntity>> = characterDao.getAllCharactersFlow().stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    val connections: StateFlow<List<ConnectionEntity>> = connectionDao.getAllConnectionsFlow()
        .map { connections -> connections.filter { it.enabled } }
        .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    val dashboardItems: StateFlow<List<ThreadDashboardItem>> = combine(
        chatDao.getAllThreadsFlow(),
        characterDao.getAllCharactersFlow(),
        _searchQuery,
        _statusFilter
    ) { threads, characters, query, status ->
        threads
            .filter { t ->
                val matchesStatus = t.status == status
                val matchesQuery = query.isEmpty() || t.title.contains(query, ignoreCase = true)
                matchesStatus && matchesQuery
            }
            .sortedWith(
                compareByDescending<ThreadEntity> { it.pinned_at != null }
                    .thenByDescending { it.updated_at }
            )
            .map { t ->
                ThreadDashboardItem(t, characters.find { it.id == t.character_id })
            }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    val onboardingState: StateFlow<OnboardingState> = combine(
        personas,
        connections,
        characters,
        chatDao.getAllThreadsFlow()
    ) { personas, connections, characters, threads ->
        val step1 = OnboardingStep(1, "Create a Persona", personas.isNotEmpty(), "personas")
        val step2 = OnboardingStep(2, "Configure an API Provider", connections.isNotEmpty(), "settings")
        val step3 = OnboardingStep(3, "Health-Test active Provider", connections.any { it.health_status == "healthy" }, "settings")
        val step4 = OnboardingStep(4, "Refresh Provider Models", connections.any { it.model_cache.isNotEmpty() }, "settings")
        val step5 = OnboardingStep(5, "Build a Character Sheet", characters.isNotEmpty(), "characters")
        val step6 = OnboardingStep(6, "Start your first Thread", threads.isNotEmpty(), "dashboard")

        val steps = listOf(step1, step2, step3, step4, step5, step6)
        val completedCount = steps.count { it.isCompleted }
        val progress = completedCount.toFloat() / steps.size
        
        OnboardingState(
            steps = steps,
            progress = progress,
            isCompleted = completedCount == steps.size
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = OnboardingState(emptyList(), 0f, false)
    )

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun setStatusFilter(status: String) {
        _statusFilter.value = status
    }

    fun togglePin(threadId: String) {
        viewModelScope.launch {
            val thread = chatDao.getThread(threadId) ?: return@launch
            val updated = thread.copy(
                pinned_at = if (thread.pinned_at == null) Instant.now().toString() else null,
                updated_at = Instant.now().toString()
            )
            chatDao.updateThread(updated)
        }
    }

    fun toggleArchive(threadId: String) {
        viewModelScope.launch {
            val thread = chatDao.getThread(threadId) ?: return@launch
            val updated = thread.copy(
                status = if (thread.status == "active") "archived" else "active",
                archived_at = if (thread.status == "active") Instant.now().toString() else null,
                updated_at = Instant.now().toString()
            )
            chatDao.updateThread(updated)
        }
    }

    fun renameThread(threadId: String, newTitle: String) {
        if (newTitle.isBlank()) return
        viewModelScope.launch {
            val thread = chatDao.getThread(threadId) ?: return@launch
            val updated = thread.copy(
                title = newTitle,
                is_title_autogenerated = false,
                updated_at = Instant.now().toString()
            )
            chatDao.updateThread(updated)
        }
    }

    fun deleteThread(threadId: String) {
        viewModelScope.launch {
            chatDao.deleteThread(threadId)
        }
    }

    fun createThread(
        characterId: String,
        connectionId: String,
        modelId: String,
        title: String,
        onCreated: (String) -> Unit
    ) {
        viewModelScope.launch {
            val connection = requireNotNull(connectionDao.getConnection(connectionId)) {
                "Select an existing Roleplay Model connection"
            }
            require(connection.enabled) { "The selected Roleplay Model connection is disabled" }
            val finalModelId = if (connection.provider == com.example.open_fantasia.data.continuity.RoleplayProtocol.PROVIDER) {
                com.example.open_fantasia.data.continuity.RoleplayProtocol.MODEL_ID
            } else {
                modelId.trim()
            }
            require(finalModelId.isNotBlank()) { "Select a Roleplay Model" }
            // Apply the user's default persona to new threads (was hardcoded null, ignoring it).
            val defaultPersonaId = personaDao.getDefaultPersona(FIXED_USER_ID)?.id
            val newThread = chatDao.createThreadWithBranch(
                userId = FIXED_USER_ID,
                characterId = characterId,
                connectionId = connectionId,
                modelId = finalModelId,
                personaId = defaultPersonaId,
                brainConnectionId = null,
                brainModelId = null,
                maxOutputTokens = 4096,
                title = title.trim().ifEmpty { "New Conversation" }
            )
            onCreated(newThread.id)
        }
    }
}
