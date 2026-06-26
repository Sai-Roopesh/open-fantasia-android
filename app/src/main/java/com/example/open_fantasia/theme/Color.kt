package com.example.open_fantasia.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// ============================================================================
// Open Fantasia palette — dark, "Pretext"-style. Violet (#8A2BE2) + cyan
// (#00FBFB) accents over near-black surfaces. Matches the Claude Design spec.
// ============================================================================

// Surfaces, darkest -> lightest (a clean Material 3 container ramp).
val CanvasBlack = Color(0xFF0F0F13)          // app canvas / composer bar
val SurfaceContainerLowest = Color(0xFF0F0F13)
val SurfaceContainerLow = Color(0xFF16161C)  // modals, sheets, drawers, top bars
val SurfaceContainer = Color(0xFF1B1B1F)     // cards (thread, entity, starter)
val SurfaceContainerHigh = Color(0xFF1F1F23) // fields, user bubble, chips
val SurfaceContainerHighest = Color(0xFF2A292E) // action pills, dividers, toast
val Surface = Color(0xFF16161C)
val SurfaceVariant = Color(0xFF1F1F23)
val Background = CanvasBlack

// Text
val OnSurface = Color(0xFFE4E1E7)            // body / story prose
val OnSurfaceVariant = Color(0xFFCFC2D7)     // secondary text, chip labels
val TextMuted = Color(0xFF8A8590)            // helper / dialog subtitles
val TextFaint = Color(0xFF7A7580)            // placeholders, field labels
val TextFaintest = Color(0xFF6B6675)         // meta, timestamps, eyebrows
val ProseItalic = Color(0xFFB3ADBE)          // narration/action spans in AI prose

// Accents
val Primary = Color(0xFF8A2BE2)              // BlueViolet — FAB, primary buttons
val OnPrimary = Color(0xFFFFFFFF)
val PrimaryContainer = Color(0xFF3A1A55)
val OnPrimaryContainer = Color(0xFFEED9FF)
val AccentSoft = Color(0xFFDCB8FF)           // light violet — AI speaker name, caret

val Secondary = Color(0xFF00FBFB)            // cyan — HCE headers, character names
val OnSecondary = Color(0xFF003536)
val SecondaryContainer = Color(0xFF0B3A3A)
val OnSecondaryContainer = Color(0xFFA8FBFB)

val SuccessGreen = Color(0xFF00FF87)         // online dot, "saves automatically"
val WarningAmber = Color(0xFFE8C547)         // "AT RISK"
val Pink = Color(0xFFFF7AA8)                 // pinned, rate-active, error title
val PinkSoft = Color(0xFFFFB1C4)

// Lines
val Outline = Color(0xFF4C4354)              // field border (resting)
val OutlineVariant = Color(0xFF2C2C35)       // card/control hairline

// Error / destructive
val Error = Color(0xFFC40060)                // Rewind / Delete
val OnError = Color(0xFFFFFFFF)
val ErrorContainer = Color(0xFF5A1030)
val OnErrorContainer = Color(0xFFFFD7DF)

// Tertiary kept for Material completeness (magenta family).
val Tertiary = Color(0xFFFFB1C4)
val OnTertiary = Color(0xFF65002E)
val TertiaryContainer = Color(0xFFC40060)
val OnTertiaryContainer = Color(0xFFFFD7DF)

val OnBackground = OnSurface

/**
 * Colors that don't map cleanly onto a Material 3 ColorScheme slot but are part
 * of the design language. Access via `MaterialTheme.extended` (see Theme.kt).
 */
data class ExtendedColors(
    val accentSoft: Color = AccentSoft,
    val cyan: Color = Secondary,
    val success: Color = SuccessGreen,
    val warning: Color = WarningAmber,
    val pink: Color = Pink,
    val pinkSoft: Color = PinkSoft,
    val proseItalic: Color = ProseItalic,
    val textMuted: Color = TextMuted,
    val textFaint: Color = TextFaint,
    val textFaintest: Color = TextFaintest,
    val cardBorder: Color = OutlineVariant,
    val fieldBorder: Color = Outline,
    val composer: Color = CanvasBlack,
)

val LocalExtendedColors = staticCompositionLocalOf { ExtendedColors() }
