package com.example.open_fantasia.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

private val OpenFantasiaColorScheme = darkColorScheme(
    primary = Primary,
    onPrimary = OnPrimary,
    primaryContainer = PrimaryContainer,
    onPrimaryContainer = OnPrimaryContainer,
    secondary = Secondary,
    onSecondary = OnSecondary,
    secondaryContainer = SecondaryContainer,
    onSecondaryContainer = OnSecondaryContainer,
    tertiary = Tertiary,
    onTertiary = OnTertiary,
    tertiaryContainer = TertiaryContainer,
    onTertiaryContainer = OnTertiaryContainer,
    background = Background,
    onBackground = OnBackground,
    surface = Surface,
    onSurface = OnSurface,
    surfaceVariant = SurfaceVariant,
    onSurfaceVariant = OnSurfaceVariant,
    surfaceContainerLowest = SurfaceContainerLowest,
    surfaceContainerLow = SurfaceContainerLow,
    surfaceContainer = SurfaceContainer,
    surfaceContainerHigh = SurfaceContainerHigh,
    surfaceContainerHighest = SurfaceContainerHighest,
    outline = Outline,
    outlineVariant = OutlineVariant,
    error = Error,
    onError = OnError,
    errorContainer = ErrorContainer,
    onErrorContainer = OnErrorContainer,
    scrim = Color(0xFF000000),
)

/**
 * Access the design's extended colors (success/warning/pink/muted text/etc.):
 * `MaterialTheme.extended.cyan`.
 */
val MaterialTheme.extended: ExtendedColors
    @Composable
    @ReadOnlyComposable
    get() = LocalExtendedColors.current

@Composable
fun OpenFantasiaTheme(
    darkTheme: Boolean = true, // Force dark for immersive storytelling
    dynamicColor: Boolean = false, // Keep the brand identity, no dynamic color
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalExtendedColors provides ExtendedColors()) {
        MaterialTheme(
            colorScheme = OpenFantasiaColorScheme,
            typography = Typography,
            content = content,
        )
    }
}
