package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.PathCard
import com.openfantasia.protocol.PathRow
import com.openfantasia.protocol.PathRowKind
import com.openfantasia.protocol.PathsView
import java.time.Instant

private val FantasiaCurrentPath = Color(0xFF211B33)
private val FantasiaCurrentRing = Color(0xFF2B2245)

/**
 * The Paths screen as drawn in Paths.dc.html (openspec paths: The Paths screen): the Mac's rows down a rail, folded
 * Scenes, the Scene where Paths part, and a card per Path, the one the player is on lit; then Start again from the
 * beginning, and Clear when there is anything to clear. Everything that changes a Path is off while a Reply is written.
 */
@Composable fun PathsScreen(
    paths: PathsView?,
    enabled: Boolean,
    back: () -> Unit,
    open: (String) -> Unit,
    rename: (String, String) -> Unit,
    delete: (String) -> Unit,
    clear: () -> Unit,
    startAgain: () -> Unit,
    modifier: Modifier = Modifier,
    now: Instant = Instant.now()
) {
    var renaming by remember { mutableStateOf<PathCard?>(null) }
    var deleting by remember { mutableStateOf<PathCard?>(null) }
    Column(modifier) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            IconButton(onClick = back, modifier = Modifier.size(44.dp).semantics { contentDescription = "Back to the Scene" }) {
                FantasiaIcon(FantasiaIconKind.Back, Modifier.size(22.dp))
            }
            Text("Paths", modifier = Modifier.weight(1f), style = FantasiaType.pathsTitle)
        }
        HorizontalDivider(color = FantasiaHeaderLine)
        if (paths == null) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else LazyColumn(Modifier.weight(1f).testTag("paths"), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 18.dp)) {
            items(paths.rows, key = { row -> row.path?.id ?: "${row.kind}-${row.depth}-${row.label}" }) { row ->
                PathRowView(row, enabled, now, open, rename = { renaming = it }, delete = { deleting = it })
            }
            item(key = "actions") {
                Column(Modifier.fillMaxWidth().padding(top = 28.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = startAgain, enabled = enabled, modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = FantasiaShapes.round, border = BorderStroke(1.dp, FantasiaStrongLine),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = FantasiaText)) {
                        Text("Start again from the beginning", style = FantasiaType.plain)
                    }
                    if (paths.clearable > 0) TextButton(onClick = clear, enabled = enabled, modifier = Modifier.fillMaxWidth().height(44.dp)) {
                        Text("Clear Paths you never went back to", style = FantasiaType.metadata, color = if (enabled) FantasiaSecondary else FantasiaDisabled)
                    }
                }
            }
        }
    }
    renaming?.let { card ->
        var name by remember(card.id) { mutableStateOf(card.title) }
        DaySheet("rename-sheet", dismiss = { renaming = null }) {
            Text("Rename this Path", style = FantasiaType.sheetTitle)
            BasicTextField(value = name, onValueChange = { name = it }, singleLine = true,
                textStyle = FantasiaType.direction.copy(color = FantasiaText), cursorBrush = SolidColor(FantasiaLabel),
                modifier = Modifier.fillMaxWidth().testTag("path-name").semantics { contentDescription = "The Path's name" }
                    .background(FantasiaBackground, FantasiaShapes.field).border(1.dp, FantasiaStrongLine, FantasiaShapes.field)
                    .padding(horizontal = 14.dp, vertical = 12.dp))
            Text("Left empty, it is called by its newest Scene.", style = FantasiaType.caption, color = FantasiaCaption)
            SheetButtons("Save", Modifier.testTag("confirm-rename"), back = { renaming = null }) { renaming = null; rename(card.id, name.trim()) }
        }
    }
    deleting?.let { card ->
        DaySheet("delete-sheet", dismiss = { deleting = null }) {
            Text("Delete ${card.title}?", style = FantasiaType.sheetTitle)
            Text("Its Scenes go with it. The Path you are on stays as it is.", style = FantasiaType.caption, color = FantasiaCaption)
            SheetButtons("Delete", Modifier.testTag("confirm-delete"), enabled = enabled, back = { deleting = null }) { deleting = null; delete(card.id) }
        }
    }
}

@Composable private fun SheetButtons(action: String, modifier: Modifier, enabled: Boolean = true, back: () -> Unit, go: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End)) {
        TextButton(onClick = back, modifier = Modifier.height(48.dp), shape = FantasiaShapes.round,
            contentPadding = PaddingValues(horizontal = 20.dp)) { Text("Back", style = FantasiaType.plain, color = FantasiaSecondary) }
        Button(onClick = go, enabled = enabled, modifier = modifier.height(48.dp), shape = FantasiaShapes.round,
            contentPadding = PaddingValues(horizontal = 22.dp)) { Text(action, style = FantasiaType.button) }
    }
}

/** One row with its stretch of the rail: a dot for folded Scenes, a lit dot where Paths part, and a mark per Path. */
@Composable private fun PathRowView(row: PathRow, enabled: Boolean, now: Instant, open: (String) -> Unit,
    rename: (PathCard) -> Unit, delete: (PathCard) -> Unit) {
    val card = row.path
    val other = card != null && !card.current
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).padding(start = (16 * maxOf(row.depth - 1, 0L)).toInt().dp, top = if (other) 14.dp else 0.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Rail(row.kind, card)
        Box(Modifier.weight(1f).padding(vertical = if (row.kind == PathRowKind.Scenes) 10.dp else if (other) 0.dp else 6.dp)) {
            when (row.kind) {
                PathRowKind.Scenes -> Text(row.label, style = FantasiaType.metadata, color = FantasiaSecondary,
                    modifier = Modifier.fillMaxWidth().background(FantasiaFolded, FantasiaShapes.field).padding(horizontal = 14.dp, vertical = 12.dp))
                PathRowKind.Fork -> Column(Modifier.fillMaxWidth().background(FantasiaSurface, FantasiaShapes.field)
                    .border(1.dp, FantasiaLine, FantasiaShapes.field).padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(row.label, style = FantasiaType.small, color = FantasiaCaption)
                    row.title?.let { Text(it, style = FantasiaType.forkTitle, color = FantasiaText) }
                }
                PathRowKind.Path -> card?.let { PathCardView(it, enabled, now, open, rename, delete) }
            }
        }
    }
}

@Composable private fun Rail(kind: PathRowKind, card: PathCard?) {
    Column(Modifier.width(22.dp).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
        when {
            kind == PathRowKind.Scenes -> {
                Spacer(Modifier.padding(top = 16.dp).size(12.dp).background(FantasiaStrongLine, FantasiaShapes.round))
                Spacer(Modifier.weight(1f).width(2.dp).background(FantasiaAccent))
            }
            kind == PathRowKind.Fork -> {
                Spacer(Modifier.height(16.dp).width(2.dp).background(FantasiaAccent))
                Spacer(Modifier.size(12.dp).background(FantasiaAccent, FantasiaShapes.round))
                Spacer(Modifier.weight(1f).width(2.dp).background(FantasiaAccent))
            }
            card?.current == true -> {
                Spacer(Modifier.height(16.dp).width(2.dp).background(FantasiaAccent))
                Spacer(Modifier.size(24.dp).background(FantasiaCurrentRing, FantasiaShapes.round).padding(4.dp).background(FantasiaLabel, FantasiaShapes.round))
            }
            else -> Spacer(Modifier.padding(top = 18.dp).size(12.dp).border(2.dp, FantasiaSeen, FantasiaShapes.round))
        }
    }
}

@Composable private fun PathCardView(card: PathCard, enabled: Boolean, now: Instant, open: (String) -> Unit,
    rename: (PathCard) -> Unit, delete: (PathCard) -> Unit) {
    val shape = RoundedCornerShape(16.dp)
    Column(Modifier.fillMaxWidth().background(if (card.current) FantasiaCurrentPath else FantasiaSurface, shape)
        .border(1.dp, if (card.current) FantasiaAccent else FantasiaLine, shape)
        .clickable(enabled = enabled, role = Role.Button, onClickLabel = "Go to this Path") { open(card.id) }
        .padding(14.dp).testTag("path-${card.id}"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(card.label, style = FantasiaType.pathLabel, color = if (card.current) FantasiaLabel else FantasiaSeen)
        Text(card.title, style = FantasiaType.pathTitle, color = FantasiaText)
        // When it was last played, as the home screen says it for a Story: "played 2 days ago", "played yesterday".
        Text(if (card.current) card.detail else "${card.detail} · played ${playedAgo(card.playedAt, now)}", style = FantasiaType.meta, color = FantasiaSecondary)
        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PathButton("Rename", true) { rename(card) }
            if (card.canDelete) PathButton("Delete", enabled) { delete(card) }
        }
    }
}

@Composable private fun PathButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
        OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.height(36.dp), shape = FantasiaShapes.round,
            border = BorderStroke(1.dp, FantasiaStrongLine), contentPadding = PaddingValues(horizontal = 14.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = FantasiaText)) { Text(label, style = FantasiaType.meta) }
    }
}
