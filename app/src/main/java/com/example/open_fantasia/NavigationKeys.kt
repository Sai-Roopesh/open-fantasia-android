package com.example.open_fantasia

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable data object Dashboard : NavKey
@Serializable data class Chat(val threadId: String) : NavKey
@Serializable data object CharacterStudio : NavKey
@Serializable data object PersonaStudio : NavKey
@Serializable data object Settings : NavKey
