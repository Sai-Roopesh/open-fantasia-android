package com.example.open_fantasia.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.example.open_fantasia.AppContainer
import com.example.open_fantasia.ui.character.CharacterViewModel
import com.example.open_fantasia.ui.dashboard.DashboardViewModel
import com.example.open_fantasia.ui.persona.PersonaViewModel
import com.example.open_fantasia.ui.settings.SettingsViewModel
import com.example.open_fantasia.ui.chat.ChatViewModel

class ViewModelFactory(
    private val appContainer: AppContainer,
    private val context: Context,
    private val threadId: String? = null
) : ViewModelProvider.Factory {

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return when {
            modelClass.isAssignableFrom(DashboardViewModel::class.java) -> {
                DashboardViewModel(
                    chatDao = appContainer.database.chatDao(),
                    characterDao = appContainer.database.characterDao(),
                    connectionDao = appContainer.database.connectionDao(),
                    personaDao = appContainer.database.personaDao()
                ) as T
            }
            modelClass.isAssignableFrom(CharacterViewModel::class.java) -> {
                CharacterViewModel(
                    characterDao = appContainer.database.characterDao(),
                    portraitGenerationCoordinator = appContainer.portraitGenerationCoordinator
                ) as T
            }
            modelClass.isAssignableFrom(PersonaViewModel::class.java) -> {
                PersonaViewModel(
                    personaDao = appContainer.database.personaDao()
                ) as T
            }
            modelClass.isAssignableFrom(SettingsViewModel::class.java) -> {
                SettingsViewModel(
                    connectionDao = appContainer.database.connectionDao(),
                    llmClient = appContainer.llmClient,
                    continuityHostClient = appContainer.continuityHostClient,
                    continuityHostPreferences = appContainer.continuityHostPreferences
                ) as T
            }
            modelClass.isAssignableFrom(ChatViewModel::class.java) -> {
                requireNotNull(threadId) { "threadId must be provided for ChatViewModel" }
                ChatViewModel(
                    threadId = threadId,
                    chatDao = appContainer.database.chatDao(),
                    characterDao = appContainer.database.characterDao(),
                    connectionDao = appContainer.database.connectionDao(),
                    personaDao = appContainer.database.personaDao(),
                    continuityCheckpointCoordinator = appContainer.continuityCheckpointCoordinator,
                    roleplayGenerationCoordinator = appContainer.roleplayGenerationCoordinator,
                    portraitGenerationCoordinator = appContainer.portraitGenerationCoordinator,
                    portraitTaskDao = appContainer.database.portraitTaskDao(),
                    continuityHostClient = appContainer.continuityHostClient,
                    continuityHostPreferences = appContainer.continuityHostPreferences,
                    context = context.applicationContext
                ) as T
            }
            else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
    }
}
