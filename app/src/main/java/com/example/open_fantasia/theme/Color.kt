package com.example.open_fantasia.theme

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

// Accents
val Primary = Color(0xFF8A2BE2)              // BlueViolet — FAB, primary buttons
val OnPrimary = Color(0xFFFFFFFF)
val PrimaryContainer = Color(0xFF3A1A55)
val OnPrimaryContainer = Color(0xFFEED9FF)

val Secondary = Color(0xFF00FBFB)            // cyan — HCE headers, character names
val OnSecondary = Color(0xFF003536)
val SecondaryContainer = Color(0xFF0B3A3A)
val OnSecondaryContainer = Color(0xFFA8FBFB)


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

