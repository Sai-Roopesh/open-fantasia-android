package com.example.open_fantasia.ui.character

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.open_fantasia.data.continuity.PortraitGenerationCoordinator
import com.example.open_fantasia.data.local.dao.CharacterDao
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.domain.model.ExampleConversation
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

class CharacterViewModel(
    private val characterDao: CharacterDao,
    private val portraitGenerationCoordinator: PortraitGenerationCoordinator? = null
) : ViewModel() {

    private val FIXED_USER_ID = "00000000-0000-0000-0000-000000000000"

    private val _snackbarMessage = MutableSharedFlow<String>()
    val snackbarMessage = _snackbarMessage.asSharedFlow()

    val characters: StateFlow<List<CharacterEntity>> = characterDao.getAllCharactersFlow().stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    fun saveCharacter(
        id: String?,
        name: String,
        story: String,
        corePersona: String,
        greeting: String,
        appearance: String,
        styleRules: String,
        definition: String,
        negativeGuidance: String,
        temperature: Double,
        topP: Double,
        starters: List<String>,
        exampleConversations: List<ExampleConversation>,
        triggerPortraitGen: Boolean
    ) {
        viewModelScope.launch {
            val now = Instant.now().toString()
            val charId = id ?: UUID.randomUUID().toString()

            val existingChar = id?.let { characterDao.getCharacter(it) }

            var portraitStatus = existingChar?.portrait_status ?: "none"
            var portraitPath = existingChar?.portrait_path
            var portraitPrompt = existingChar?.portrait_prompt
            var portraitSeed = existingChar?.portrait_seed

            val trimmedExamples = exampleConversations.map {
                ExampleConversation(
                    user_line = it.user_line.trim(),
                    character_line = it.character_line.trim()
                )
            }.filter { it.user_line.isNotEmpty() || it.character_line.isNotEmpty() }

            val character = CharacterEntity(
                id = charId,
                user_id = FIXED_USER_ID,
                name = name,
                story = story,
                core_persona = corePersona,
                greeting = greeting,
                appearance = appearance,
                style_rules = styleRules,
                definition = definition,
                negative_guidance = negativeGuidance,
                temperature = temperature,
                top_p = topP,
                starters = starters,
                example_conversations = trimmedExamples,
                portrait_status = portraitStatus,
                portrait_path = portraitPath,
                portrait_prompt = portraitPrompt,
                portrait_seed = portraitSeed,
                portrait_source_hash = existingChar?.portrait_source_hash,
                portrait_last_error = existingChar?.portrait_last_error,
                portrait_generated_at = existingChar?.portrait_generated_at,
                created_at = existingChar?.created_at ?: now,
                updated_at = now
            )

            characterDao.saveCharacterAndSyncPrimarySeeds(character)

            portraitGenerationCoordinator?.ensurePrimary(character, force = triggerPortraitGen)
            _snackbarMessage.emit("Character saved.")
        }
    }

    /**
     * Re-enqueue portrait generation for an already-saved character without
     * requiring a form re-save (web parity: "Regenerate portrait" button).
     * Loads the persisted character and reuses the existing enqueue logic so the
     * portrait is regenerated from its currently-saved appearance/name/persona.
     */
    fun regeneratePortrait(characterId: String) {
        viewModelScope.launch {
            val existingChar = characterDao.getCharacter(characterId)
            if (existingChar == null) {
                _snackbarMessage.emit("Character not found.")
                return@launch
            }
            if (existingChar.appearance.isBlank()) {
                _snackbarMessage.emit("Add an appearance and save before regenerating.")
                return@launch
            }
            portraitGenerationCoordinator?.ensurePrimary(existingChar, force = true)
            _snackbarMessage.emit("Portrait regeneration queued.")
        }
    }

    fun deleteCharacter(character: CharacterEntity) {
        viewModelScope.launch {
            if (characterDao.deleteCharacterIfUnused(character)) {
                _snackbarMessage.emit("Character deleted.")
            } else {
                _snackbarMessage.emit("This character owns an existing thread. Delete that thread before deleting the character.")
            }
        }
    }

}
