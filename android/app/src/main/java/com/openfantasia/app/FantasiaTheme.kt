package com.openfantasia.app

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.*
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.text.googlefonts.Font as GoogleFontFace
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// docs/design/README.md: the only palette, type and shape definitions for the phone.
val FantasiaBackground = Color(0xFF141218)
val FantasiaSurface = Color(0xFF1E1B24)
val FantasiaRaised = Color(0xFF2A2632)
val FantasiaBackstage = Color(0xFF100E13)
val FantasiaFolded = Color(0xFF1A1720)
val FantasiaLine = Color(0xFF2E2A36)
val FantasiaStrongLine = Color(0xFF3A3544)
val FantasiaHeaderLine = Color(0xFF26222D)
val FantasiaText = Color(0xFFEEEAF4)
val FantasiaSecondary = Color(0xFFB3ACC0)
val FantasiaCaption = Color(0xFF8E879C)
val FantasiaProse = Color(0xFFE2DDEA)
val FantasiaAccent = Color(0xFF7552DD)
val FantasiaLabel = Color(0xFFB9A4FF)
val FantasiaPressed = Color(0xFFD6C9FF)
val FantasiaSeen = Color(0xFF63CDB5)
val FantasiaTold = Color(0xFF8EB8FF)
val FantasiaRumour = Color(0xFFE9B95C)
val FailureAmber = FantasiaRumour
val FantasiaDisabled = Color(0xFF6E6879)
val FantasiaFailureSurface = Color(0xFF221C17)
val FantasiaFailureLine = Color(0xFF5A4526)
val FantasiaScrim = Color(0xFF08060C).copy(alpha = .66f)

private val provider = GoogleFont.Provider("com.google.android.gms.fonts", "com.google.android.gms", R.array.com_google_android_gms_fonts_certs)
private fun storyFont(name: String, fallback: String) = FontFamily(
    listOf(FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold, FontWeight.Bold).flatMap { weight ->
        listOf(GoogleFontFace(GoogleFont(name), provider, weight = weight), Font(DeviceFontFamilyName(fallback), weight = weight))
    }
)
val Literata = storyFont("Literata", "serif")
val Manrope = storyFont("Manrope", "sans-serif")

private fun type(family: FontFamily, size: Float, height: Float = size * 1.4f, weight: FontWeight = FontWeight.Normal, tracking: Float = 0f) = TextStyle(
    fontFamily = family, fontSize = size.sp, lineHeight = height.sp, fontWeight = weight, letterSpacing = tracking.sp,
    platformStyle = PlatformTextStyle(includeFontPadding = false),
    lineHeightStyle = LineHeightStyle(alignment = LineHeightStyle.Alignment.Center, trim = LineHeightStyle.Trim.None)
)
object FantasiaType {
    val prose = type(Literata, 16f, 25.6f)
    val previously = type(Literata, 15f, 23.25f)
    val homeTitle = type(Literata, 24f, weight = FontWeight.SemiBold, tracking = -.24f)
    val pairTitle = type(Literata, 30f, weight = FontWeight.SemiBold, tracking = -.3f)
    val storyTitle = type(Literata, 19f, weight = FontWeight.SemiBold)
    val sceneTitle = type(Literata, 26f, weight = FontWeight.SemiBold, tracking = -.26f)
    val header = type(Literata, 17f, weight = FontWeight.SemiBold)
    val sheetTitle = type(Literata, 21f, weight = FontWeight.SemiBold)
    val movingDay = type(Literata, 30f, weight = FontWeight.SemiBold, tracking = -.3f)
    val endedSceneTitle = type(Literata, 18f, weight = FontWeight.SemiBold)
    val meanwhileTag = type(Manrope, 11f, weight = FontWeight.Bold)
    val sectionLabel = type(Manrope, 12f, weight = FontWeight.Bold, tracking = 1.2f)
    val day = type(Literata, 32f, weight = FontWeight.SemiBold, tracking = -.32f)
    val countdownLabel = type(Manrope, 13f, 17.55f)
    val countdown = type(Literata, 24f, weight = FontWeight.SemiBold)
    val portraitLetter = type(Literata, 20f)
    val direction = type(Manrope, 15f, 21.75f)
    val fieldLabel = type(Manrope, 13f, weight = FontWeight.SemiBold)
    val composer = type(Manrope, 15f, 21f)
    val body = type(Manrope, 15f, 22.5f)
    val code = type(FontFamily.Monospace, 14f, 19f)
    val intro = type(Manrope, 16f, 24.8f)
    val metadata = type(Manrope, 14f)
    val meta = type(Manrope, 13f)
    val plain = type(Manrope, 15f)
    val step = type(Manrope, 16f, weight = FontWeight.Bold)
    val scan = type(Manrope, 16f, weight = FontWeight.SemiBold)
    val detail = type(Manrope, 14f, 21f)
    val caption = type(Manrope, 13f, 19.5f)
    val small = type(Manrope, 12f)
    val eyebrow = type(Manrope, 11f, weight = FontWeight.Bold, tracking = 1.32f)
    val player = type(Manrope, 11f, weight = FontWeight.Bold, tracking = .88f)
    val failureTitle = type(Manrope, 15f, weight = FontWeight.Bold)
    val retryButton = type(Manrope, 14f, weight = FontWeight.SemiBold)
    val button = type(Manrope, 15f, weight = FontWeight.SemiBold)
}
object FantasiaShapes {
    val card = RoundedCornerShape(16.dp)
    val titleCard = RoundedCornerShape(18.dp)
    val folded = RoundedCornerShape(12.dp)
    val field = RoundedCornerShape(14.dp)
    val code = RoundedCornerShape(6.dp)
    val composer = RoundedCornerShape(24.dp)
    val round = CircleShape
    val sheet = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    val move = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 4.dp)
}
@Composable fun FantasiaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = darkColorScheme(
        primary = FantasiaAccent, onPrimary = Color.White, primaryContainer = FantasiaRaised, onPrimaryContainer = FantasiaPressed,
        secondary = FantasiaLabel, onSecondary = FantasiaBackground, secondaryContainer = FantasiaRaised, onSecondaryContainer = FantasiaLabel,
        tertiary = FantasiaSeen, onTertiary = FantasiaBackground, tertiaryContainer = FantasiaRaised, onTertiaryContainer = FantasiaSeen,
        background = FantasiaBackground, onBackground = FantasiaText, surface = FantasiaSurface, onSurface = FantasiaText,
        surfaceVariant = FantasiaRaised, onSurfaceVariant = FantasiaSecondary, surfaceTint = FantasiaAccent,
        surfaceDim = FantasiaBackstage, surfaceBright = FantasiaRaised, surfaceContainerLowest = FantasiaBackground,
        surfaceContainerLow = FantasiaFolded, surfaceContainer = FantasiaSurface, surfaceContainerHigh = FantasiaRaised, surfaceContainerHighest = FantasiaRaised,
        outline = FantasiaStrongLine, outlineVariant = FantasiaLine, error = FailureAmber, onError = FantasiaBackground,
        errorContainer = FantasiaFailureSurface, onErrorContainer = FantasiaProse, scrim = FantasiaScrim,
        inverseSurface = FantasiaText, inverseOnSurface = FantasiaBackground, inversePrimary = FantasiaAccent
    ), typography = Typography(
        displayLarge = FantasiaType.day, displayMedium = FantasiaType.pairTitle, displaySmall = FantasiaType.sceneTitle,
        headlineLarge = FantasiaType.sceneTitle, headlineMedium = FantasiaType.homeTitle, headlineSmall = FantasiaType.sheetTitle,
        titleLarge = FantasiaType.storyTitle, titleMedium = FantasiaType.header, titleSmall = FantasiaType.button,
        bodyLarge = FantasiaType.body, bodyMedium = FantasiaType.detail, bodySmall = FantasiaType.caption,
        labelLarge = FantasiaType.button, labelMedium = FantasiaType.small, labelSmall = FantasiaType.eyebrow
    ), shapes = Shapes(extraSmall = FantasiaShapes.field, small = FantasiaShapes.field, medium = FantasiaShapes.card,
        large = FantasiaShapes.titleCard, extraLarge = FantasiaShapes.sheet), content = content)
}
