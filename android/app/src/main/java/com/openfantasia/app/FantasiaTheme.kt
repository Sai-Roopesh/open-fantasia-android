package com.openfantasia.app

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val FantasiaBackground = Color(0xFF0F0F13)
val FantasiaSurface = Color(0xFF1B1B1F)
val FantasiaAccent = Color(0xFF8A2BE2)
val FantasiaLabel = Color(0xFFDCB8FF)
val PlayerCharacterColor = Color(0xFF7FF5F5)
val FailureAmber = Color(0xFFFFC857)

@Composable fun FantasiaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = darkColorScheme(
        primary = FantasiaAccent, onPrimary = Color.White, secondary = FantasiaLabel,
        background = FantasiaBackground, surface = FantasiaSurface,
        onBackground = Color(0xFFF4EFFA), onSurface = Color(0xFFF4EFFA), error = FailureAmber
    ), content = content)
}
