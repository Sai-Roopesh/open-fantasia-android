package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import kotlin.math.roundToInt
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.Passage

/** How near a passage's ends a press opens the menu beside the whole passage, and how far from the finger otherwise. */
private val NEAR_THE_END = 160.dp
private val UNDER_THE_FINGER = 24.dp

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

/** What holding a passage offers (LongPress.dc.html), and what each choice does. */
internal class PassageActions(
    val isMove: Boolean,
    /** The latest Move or Reply, which an edit changes in place; anything earlier, an edit carries on a new Path. */
    val latest: Boolean,
    /** Not on the latest Reply, which has nothing after it to set aside. */
    val canRewind: Boolean,
    /** Off while a Reply is being written (openspec paths: A Path changes only between Replies). */
    val pathsEnabled: Boolean,
    val copy: () -> Unit,
    val rewind: () -> Unit,
    val tryAnotherWay: () -> Unit,
    val edit: () -> Unit
)

/**
 * A passage that can be held, a Reply or a Move: holding it lifts it and opens its menu, under it as drawn when it
 * ends near where it was pressed, under the finger on one that runs on past it and may be taller than the screen.
 */
@Composable private fun Holdable(held: Boolean, hold: () -> Unit, release: () -> Unit, actions: PassageActions,
    content: @Composable (Modifier) -> Unit) {
    var pressed by remember { mutableStateOf<Offset?>(null) }
    var height by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    // The span the menu opens beside: the whole passage when it was pressed near both its ends, so the menu sits under
    // it or, with no room on the screen, wholly above it; otherwise a band around the finger.
    val (top, bottom) = with(density) {
        val press = pressed
        if (press == null) 0f to height.toFloat()
        else (if (press.y <= NEAR_THE_END.toPx()) 0f else press.y - UNDER_THE_FINGER.toPx()) to
            (if (height - press.y <= NEAR_THE_END.toPx()) height.toFloat() else press.y + UNDER_THE_FINGER.toPx())
    }
    Box(Modifier.fillMaxWidth()) {
        content(Modifier.onSizeChanged { height = it.height }
            .pointerInput(Unit) { awaitEachGesture { pressed = awaitFirstDown(requireUnconsumed = false).position } }
            .combinedClickable(interactionSource = null, indication = null, onClick = {}, onLongClickLabel = "Open this passage's menu", onLongClick = hold))
        Box(Modifier.offset { IntOffset(0, top.roundToInt()) }.width(0.dp).height(with(density) { (bottom - top).coerceAtLeast(0f).toDp() })) {
            PassageMenu(held, release, actions)
        }
    }
}

/** A Reply that can be held (openspec scenes: The latest Reply has its actions in view). */
@Composable internal fun HeldReply(reply: Passage, held: Boolean, dimmed: Boolean, actions: PassageActions, hold: () -> Unit, release: () -> Unit) {
    Holdable(held, hold, release, actions) { gestures ->
        val lifted = if (held) Modifier.bleed(12.dp).background(FantasiaHeld, FantasiaShapes.field)
            .border(1.dp, FantasiaAccent, FantasiaShapes.field).padding(12.dp) else Modifier
        Text(prose(reply.text), style = FantasiaType.prose, color = if (dimmed) FantasiaDimmed else if (held) FantasiaText else FantasiaProse,
            modifier = Modifier.fillMaxWidth().then(lifted).testTag("reply-${reply.entryID}").then(gestures))
    }
}

/** A Move that can be held, opening the same menu. */
@Composable internal fun HeldMove(move: Passage, playerCharacter: String, held: Boolean, dimmed: Boolean, actions: PassageActions,
    hold: () -> Unit, release: () -> Unit) {
    Holdable(held, hold, release, actions) { gestures ->
        MovePassage(move, playerCharacter, dimmed = dimmed, held = held, modifier = gestures.testTag("move-${move.entryID}"))
    }
}

/**
 * The menu as drawn in LongPress.dc.html: Copy, Rewind to here, Try another way from here and Edit, then the line under
 * it that says what an edit does here.
 */
@Composable private fun PassageMenu(held: Boolean, release: () -> Unit, actions: PassageActions) {
    val card = RoundedCornerShape(16.dp)
    DropdownMenu(expanded = held, onDismissRequest = release, offset = DpOffset(0.dp, 8.dp), containerColor = Color.Transparent,
        shadowElevation = 0.dp, tonalElevation = 0.dp) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.widthIn(min = 230.dp).shadow(12.dp, card).background(FantasiaRaised, card).border(1.dp, FantasiaStrongLine, card)
                .padding(vertical = 6.dp)) {
                MenuItem("Copy", FantasiaIconKind.Copy, true) { release(); actions.copy() }
                if (actions.canRewind) MenuItem("Rewind to here", FantasiaIconKind.Rewind, actions.pathsEnabled) { release(); actions.rewind() }
                MenuItem("Try another way from here", FantasiaIconKind.TryAnotherWay, actions.pathsEnabled) { release(); actions.tryAnotherWay() }
                MenuItem("Edit", FantasiaIconKind.Edit, actions.pathsEnabled) { release(); actions.edit() }
            }
            val passage = if (actions.isMove) "Move" else "Reply"
            Text(if (actions.latest && actions.isMove) "Editing the latest Move changes it where it is, and the Story answers it again."
                else if (actions.latest) "Editing the latest $passage changes it where it is."
                else "Editing an earlier $passage carries the Story on from the edit on a new Path. The Path you were on stays as it was.",
                style = FantasiaType.small.copy(lineHeight = 18.sp), color = FantasiaCaption, modifier = Modifier.widthIn(max = 280.dp)
                    // A soft ground of its own, so the line reads over whatever passage lies under the menu.
                    .background(FantasiaBackground.copy(alpha = .92f), RoundedCornerShape(10.dp)).padding(horizontal = 8.dp, vertical = 6.dp))
        }
    }
}

@Composable private fun MenuItem(label: String, icon: FantasiaIconKind, enabled: Boolean, onClick: () -> Unit) {
    val color = if (enabled) FantasiaText else FantasiaDisabled
    DropdownMenuItem(text = { Text(label, style = FantasiaType.menuItem, color = color) }, onClick = onClick, enabled = enabled,
        leadingIcon = { FantasiaIcon(icon, Modifier.size(18.dp), color) }, modifier = Modifier.height(48.dp),
        contentPadding = PaddingValues(horizontal = 18.dp))
}
