package com.example.open_fantasia.ui.persona

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.open_fantasia.data.local.dao.PersonaDao
import com.example.open_fantasia.data.local.entity.PersonaEntity
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

class PersonaViewModel(
    private val personaDao: PersonaDao
) : ViewModel() {

    private val FIXED_USER_ID = "00000000-0000-0000-0000-000000000000"

    private val _snackbarMessage = MutableSharedFlow<String>()
    val snackbarMessage = _snackbarMessage.asSharedFlow()

    val personas: StateFlow<List<PersonaEntity>> = personaDao.getAllPersonasFlow().stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    val personaUsage: StateFlow<Map<String, com.example.open_fantasia.data.local.dao.PersonaUsage>> = personaDao.getPersonaUsageFlow()
        .map { list -> list.associateBy { it.persona_id } }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyMap()
        )

    fun savePersona(
        id: String?,
        name: String,
        identity: String,
        backstory: String,
        voiceStyle: String,
        goals: String,
        boundaries: String,
        privateNotes: String,
        isDefault: Boolean,
        voiceSamples: List<String> = emptyList()
    ) {
        viewModelScope.launch {
            val now = Instant.now().toString()
            val personaId = id ?: UUID.randomUUID().toString()

            val existingPersona = id?.let { personaDao.getPersona(it) }

            val persona = PersonaEntity(
                id = personaId,
                user_id = FIXED_USER_ID,
                name = name,
                identity = identity,
                backstory = backstory,
                voice_style = voiceStyle,
                goals = goals,
                boundaries = boundaries,
                private_notes = privateNotes,
                is_default = isDefault,
                created_at = existingPersona?.created_at ?: now,
                updated_at = now,
                voice_samples = voiceSamples.map { it.trim().trim('"', '\u201C', '\u201D').trim() }.filter { it.isNotEmpty() }
            )

            personaDao.insertPersona(persona)

            if (isDefault) {
                personaDao.setDefaultPersona(FIXED_USER_ID, personaId)
                _snackbarMessage.emit("Default updated.")
            } else {
                _snackbarMessage.emit("Persona saved.")
            }
        }
    }

    fun makeDefault(personaId: String) {
        viewModelScope.launch {
            personaDao.setDefaultPersona(FIXED_USER_ID, personaId)
            _snackbarMessage.emit("Default updated.")
        }
    }

    fun deletePersona(persona: PersonaEntity) {
        viewModelScope.launch {
            personaDao.deletePersonaPreservingThreads(persona)
            _snackbarMessage.emit("Persona deleted.")
        }
    }

    fun duplicatePersona(persona: PersonaEntity) {
        viewModelScope.launch {
            val now = Instant.now().toString()
            val copy = persona.copy(
                id = UUID.randomUUID().toString(),
                name = "${persona.name} Copy",
                is_default = false,
                created_at = now,
                updated_at = now
            )
            personaDao.insertPersona(copy)
            _snackbarMessage.emit("Persona duplicated.")
        }
    }
}
