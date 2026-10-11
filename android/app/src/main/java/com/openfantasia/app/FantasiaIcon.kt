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

internal enum class FantasiaIconKind { Back, Send, Scan, Linger, Dismiss, Copy, Rewind, TryAnotherWay, Edit, Models, ChevronRight, ChevronDown, Add, World, Journal, Paths, Backstage, Check, More, Less }

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
            FantasiaIconKind.Add -> { line(12f, 5f, 12f, 19f); line(5f, 12f, 19f, 12f) }
            // MovingOn.dc.html: a step done, and the ended Scene's More like this and Less like this.
            FantasiaIconKind.Check -> { line(5f, 12f, 9f, 16f, 2.2f); line(9f, 16f, 19f, 6f, 2.2f) }
            FantasiaIconKind.More -> { line(12f, 5f, 12f, 19f, 2.2f); line(5f, 12f, 19f, 12f, 2.2f) }
            FantasiaIconKind.Less -> line(5f, 12f, 19f, 12f, 2.2f)
            FantasiaIconKind.ChevronRight -> { line(9f, 6f, 15f, 12f, 2f); line(15f, 12f, 9f, 18f, 2f) }
            FantasiaIconKind.ChevronDown -> { line(6f, 9f, 12f, 15f, 2f); line(12f, 15f, 18f, 9f, 2f) }
            // Main.dc.html's Models button: a gear.
            FantasiaIconKind.Models -> svg(color, sx, sy, "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0z",
                "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z")
            // Scene.dc.html's header: the World, the Journal, Paths and Backstage.
            FantasiaIconKind.World -> svg(color, sx, sy, "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0z", "M3 12h18", "M12 3a14 14 0 0 1 0 18", "M12 3a14 14 0 0 0 0 18")
            FantasiaIconKind.Journal -> svg(color, sx, sy, "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z", "M5 17a3 3 0 0 1 3-3h11")
            FantasiaIconKind.Paths -> svg(color, sx, sy, "M4 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0z", "M4 19a2 2 0 1 0 4 0a2 2 0 1 0-4 0z",
                "M16 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0z", "M6 7v10", "M18 11c0 4-6 3-12 6")
            FantasiaIconKind.Backstage -> for (y in listOf(5f, 12f, 19f)) drawCircle(color, 1.4f * sx, Offset(12f * sx, y * sy))
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
