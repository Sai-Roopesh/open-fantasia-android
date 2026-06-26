package com.example.open_fantasia.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.example.open_fantasia.R

// Bundled variable fonts (res/font). Compose applies the requested weight to the
// variable font via the default FontVariation settings, so one TTF per family.
val Sora = FontFamily(
    Font(R.font.sora, FontWeight.Normal),
    Font(R.font.sora, FontWeight.Medium),
    Font(R.font.sora, FontWeight.SemiBold),
    Font(R.font.sora, FontWeight.Bold),
    Font(R.font.sora, FontWeight.ExtraBold),
)

val Inter = FontFamily(
    Font(R.font.inter, FontWeight.Normal),
    Font(R.font.inter, FontWeight.Medium),
    Font(R.font.inter, FontWeight.SemiBold),
    Font(R.font.inter, FontWeight.Bold),
)

val SpaceGrotesk = FontFamily(
    Font(R.font.space_grotesk, FontWeight.Normal),
    Font(R.font.space_grotesk, FontWeight.Medium),
    Font(R.font.space_grotesk, FontWeight.SemiBold),
    Font(R.font.space_grotesk, FontWeight.Bold),
)

// Roles: Sora = display/titles/names · Space Grotesk = labels/eyebrows/meta/buttons
// · Inter = body & story prose.
val Typography = Typography(
    // Wordmark "Open Fantasia"
    displayLarge = TextStyle(
        fontFamily = Sora, fontWeight = FontWeight.ExtraBold,
        fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = (-0.5).sp,
    ),
    // Drawer title
    displayMedium = TextStyle(
        fontFamily = Sora, fontWeight = FontWeight.Bold,
        fontSize = 21.sp, lineHeight = 28.sp,
    ),
    // Sheet / large dialog title
    headlineLarge = TextStyle(
        fontFamily = Sora, fontWeight = FontWeight.Bold,
        fontSize = 19.sp, lineHeight = 26.sp,
    ),
    // Dialog title
    headlineMedium = TextStyle(
        fontFamily = Sora, fontWeight = FontWeight.Bold,
        fontSize = 17.sp, lineHeight = 24.sp,
    ),
    // Thread / entity / card names
    titleLarge = TextStyle(
        fontFamily = Sora, fontWeight = FontWeight.Bold,
        fontSize = 15.sp, lineHeight = 20.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = Sora, fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp, lineHeight = 20.sp,
    ),
    // Story prose (AI reply) — the typographic centerpiece.
    bodyLarge = TextStyle(
        fontFamily = Inter, fontWeight = FontWeight.Normal,
        fontSize = 15.sp, lineHeight = 26.sp,
    ),
    // User bubble / general body
    bodyMedium = TextStyle(
        fontFamily = Inter, fontWeight = FontWeight.Normal,
        fontSize = 14.sp, lineHeight = 22.sp,
    ),
    // Helper / subtitle
    bodySmall = TextStyle(
        fontFamily = Inter, fontWeight = FontWeight.Normal,
        fontSize = 13.sp, lineHeight = 19.sp,
    ),
    // Buttons
    labelLarge = TextStyle(
        fontFamily = SpaceGrotesk, fontWeight = FontWeight.Bold,
        fontSize = 13.sp, lineHeight = 16.sp, letterSpacing = 0.3.sp,
    ),
    // Chips / model tags / per-turn actions
    labelMedium = TextStyle(
        fontFamily = SpaceGrotesk, fontWeight = FontWeight.Medium,
        fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 0.5.sp,
    ),
    // Eyebrows / meta / timestamps (used uppercase)
    labelSmall = TextStyle(
        fontFamily = SpaceGrotesk, fontWeight = FontWeight.SemiBold,
        fontSize = 10.sp, lineHeight = 13.sp, letterSpacing = 1.2.sp,
    ),
)
