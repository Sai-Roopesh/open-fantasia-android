package com.openfantasia.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.inspector.WindowInspector
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import java.io.File

// Optional local renders for visual review: ./gradlew testDebugUnitTest -PfantasiaPreviews
// Draw the visible windows together so a sheet includes the screen behind its scrim.
// Draw directly: PixelCopy's callback is not implemented by Robolectric.
internal fun ComposeContentTestRule.preview(name: String) {
    val directory = System.getProperty("fantasia.previews") ?: return
    runOnIdle {
        val views = WindowInspector.getGlobalWindowViews().filter { it.visibility == View.VISIBLE }
        val view = views.first()
        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        views.forEach { it.draw(canvas) }
        File(directory).mkdirs()
        File(directory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
