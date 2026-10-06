package com.openfantasia.app

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.material3.LocalContentColor

internal enum class FantasiaIconKind { Back, Send, Scan, Linger, Dismiss, Copy, Rewind, TryAnotherWay, Edit }

// The strokes and viewboxes of the approved HTML icons, without a platform icon font.
@Composable internal fun FantasiaIcon(kind: FantasiaIconKind, modifier: Modifier, color: Color = LocalContentColor.current) {
    Canvas(modifier) {
        val sx = size.width / 24f
        val sy = size.height / 24f
        fun line(x1: Float, y1: Float, x2: Float, y2: Float, width: Float = 1.8f) =
            drawLine(color, Offset(x1 * sx, y1 * sy), Offset(x2 * sx, y2 * sy), width * sx, StrokeCap.Round)
        when (kind) {
            FantasiaIconKind.Dismiss -> { line(6f, 6f, 18f, 18f, 2f); line(18f, 6f, 6f, 18f, 2f) }
            FantasiaIconKind.Back -> { line(15f, 18f, 9f, 12f); line(9f, 12f, 15f, 6f) }
            FantasiaIconKind.Send -> { line(5f, 12f, 19f, 12f, 2f); line(13f, 6f, 19f, 12f, 2f); line(19f, 12f, 13f, 18f, 2f) }
            FantasiaIconKind.Scan -> {
                for ((x, y) in listOf(4f to 4f, 20f to 4f, 4f to 20f, 20f to 20f)) {
                    line(x, y, if (x == 4f) 8f else 16f, y, 1.9f)
                    line(x, y, x, if (y == 4f) 8f else 16f, 1.9f)
                }
                line(8f, 12f, 16f, 12f, 1.9f)
            }
            FantasiaIconKind.Copy -> svg(color, sx, sy, "M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z",
                "M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2")
            FantasiaIconKind.Rewind -> svg(color, sx, sy, "M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5")
            FantasiaIconKind.Edit -> svg(color, sx, sy, "M4 20h4L19 9l-4-4L4 16z")
            FantasiaIconKind.TryAnotherWay -> svg(color, sx, sy, "M6 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4z", "M6 17a2 2 0 1 0 0 4a2 2 0 1 0 0-4z",
                "M18 7a2 2 0 1 0 0 4a2 2 0 1 0 0-4z", "M6 7v10", "M18 11c0 4-6 3-12 6")
            FantasiaIconKind.Linger -> { drawCircle(color, 9f * sx, style = Stroke(1.8f * sx)); line(12f, 7f, 12f, 12f); line(12f, 12f, 15f, 14f) }
        }
    }
}

/** Strokes SVG path data drawn on the icons' 24-unit box, scaled to the Canvas. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.svg(color: Color, sx: Float, sy: Float, vararg paths: String) {
    withTransform({ scale(sx, sy, Offset.Zero) }) {
        for (data in paths) drawPath(PathParser().parsePathString(data).toPath(), color,
            style = Stroke(1.8f, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}
