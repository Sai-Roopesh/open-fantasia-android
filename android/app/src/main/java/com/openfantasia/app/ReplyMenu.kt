package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.Passage

/** Passages other than the held Reply step back, as drawn in LongPress.dc.html. */
internal val FantasiaDimmed = Color(0xFF6E6879)
internal val FantasiaDimmedMove = Color(0xFF211E28)
private val FantasiaHeld = Color(0xFF24202C)

/** Lets a held passage's highlight reach [by] past its column on both sides, so its words do not move. */
private fun Modifier.bleed(by: Dp) = layout { measurable, constraints ->
    val extra = by.roundToPx() * 2
    val placeable = measurable.measure(constraints.copy(minWidth = constraints.minWidth + extra, maxWidth = constraints.maxWidth + extra))
    layout(placeable.width - extra, placeable.height) { placeable.place(-by.roundToPx(), 0) }
}

/**
 * A Reply that can be held (openspec paths: Try another way from any Reply). Holding it lifts it and opens its menu as
 * drawn in LongPress.dc.html: Copy, Rewind to here (not on the latest Reply, which has nothing after it), and Try
 * another way from here. The Path actions are off while a Reply is being written. Edit comes with Editing.
 */
@Composable internal fun HeldReply(
    reply: Passage,
    held: Boolean,
    dimmed: Boolean,
    canRewind: Boolean,
    pathsEnabled: Boolean,
    hold: () -> Unit,
    release: () -> Unit,
    copy: () -> Unit,
    rewind: () -> Unit,
    tryAnotherWay: () -> Unit
) {
    Box(Modifier.fillMaxWidth()) {
        val lifted = if (held) Modifier.bleed(12.dp).background(FantasiaHeld, FantasiaShapes.field)
            .border(1.dp, FantasiaAccent, FantasiaShapes.field).padding(12.dp) else Modifier
        Text(prose(reply.text), style = FantasiaType.prose, color = if (dimmed) FantasiaDimmed else if (held) FantasiaText else FantasiaProse,
            modifier = Modifier.fillMaxWidth().then(lifted).testTag("reply-${reply.entryID}")
                .combinedClickable(interactionSource = null, indication = null, onClick = {}, onLongClickLabel = "Open this Reply's menu", onLongClick = hold))
        DropdownMenu(expanded = held, onDismissRequest = release, offset = DpOffset(0.dp, 8.dp), shape = RoundedCornerShape(16.dp),
            containerColor = FantasiaRaised, border = BorderStroke(1.dp, FantasiaStrongLine), shadowElevation = 12.dp,
            modifier = Modifier.widthIn(min = 230.dp)) {
            MenuItem("Copy", FantasiaIconKind.Copy, true) { release(); copy() }
            if (canRewind) MenuItem("Rewind to here", FantasiaIconKind.Rewind, pathsEnabled) { release(); rewind() }
            MenuItem("Try another way from here", FantasiaIconKind.TryAnotherWay, pathsEnabled) { release(); tryAnotherWay() }
        }
    }
}

@Composable private fun MenuItem(label: String, icon: FantasiaIconKind, enabled: Boolean, onClick: () -> Unit) {
    val color = if (enabled) FantasiaText else FantasiaDisabled
    DropdownMenuItem(text = { Text(label, style = FantasiaType.menuItem, color = color) }, onClick = onClick, enabled = enabled,
        leadingIcon = { FantasiaIcon(icon, Modifier.size(18.dp), color) }, modifier = Modifier.height(48.dp),
        contentPadding = PaddingValues(horizontal = 18.dp))
}
