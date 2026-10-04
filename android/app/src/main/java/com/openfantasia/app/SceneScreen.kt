package com.openfantasia.app

import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.border
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.window.DialogProperties
import com.openfantasia.protocol.*

@Composable fun SceneScreen(
    scene: SceneView,
    portrait: (String) -> PortraitSource?,
    modifier: Modifier = Modifier,
    controlsEnabled: Boolean = true,
    endScene: () -> Unit = {},
    focus: (String) -> Unit = {},
    linger: (Boolean) -> Unit = {},
    redo: (String?, Boolean) -> Unit = { _, _ -> }
) {
    val list = rememberLazyListState()
    var viewportSize by remember { mutableStateOf(IntSize.Zero) }
    var showRedo by rememberSaveable(scene.storyID) { mutableStateOf(false) }
    val clipboard = LocalContext.current.getSystemService(ClipboardManager::class.java)
    val imeBottom = WindowInsets.ime.getBottom(LocalDensity.current)
    val keyboardOpen = imeBottom > 0
    // The Writer plans each Reply before its first word, so a Move waiting for its Reply already shows it coming.
    val replyComing = scene.turn.kind == TurnStateKind.Writing ||
        (scene.turn.kind == TurnStateKind.Idle && scene.exchanges.lastOrNull()?.let { it.move != null && it.reply == null } == true)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!keyboardOpen) SceneTitleCard(scene.scene, portrait, scene.focus, controlsEnabled && scene.dayView == null, focus)
        else Text(scene.scene.title, color = FantasiaLabel, style = MaterialTheme.typography.titleMedium)
        LazyColumn(state = list, modifier = Modifier.weight(1f).onSizeChanged { viewportSize = it }.testTag("scene-passages"),
            verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 16.dp)) {
            items(scene.earlierScenes, key = { "earlier-${it.number}" }) { EarlierScene(it) }
            items(scene.exchanges, key = { it.move?.entryID ?: it.reply!!.entryID }) { exchange ->
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    exchange.move?.let { MovePassage(it, scene.playerCharacter) }
                    exchange.reply?.let { Text(it.text, modifier = Modifier.fillMaxWidth().padding(end = 24.dp)) }
                }
            }
            scene.dayView?.let { day -> item(key = "day-view") {
                Surface(color = FantasiaSurface, shape = MaterialTheme.shapes.medium) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Day View", style = MaterialTheme.typography.titleMedium, color = FantasiaLabel)
                        Text(day.atLabel)
                        Text(day.place)
                        day.countdowns.forEach { Text(it.label) }
                    }
                }
            } }
            if (replyComing) item(key = "reply-being-written") {
                Column {
                    Text("Reply being written", color = FantasiaLabel, style = MaterialTheme.typography.labelLarge)
                    Text(scene.turn.textSoFar.orEmpty(), modifier = Modifier.fillMaxWidth().padding(end = 24.dp))
                }
            }
            // A tiny final item lets even a Reply taller than the screen scroll to its end.
            item(key = "scene-end") { Spacer(Modifier.height(1.dp)) }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = endScene, enabled = controlsEnabled && scene.turn.kind == TurnStateKind.Idle && scene.dayView == null) { Text("End scene") }
            Text(if (scene.linger) "Linger on" else "Linger off", color = FantasiaLabel)
            Switch(checked = scene.linger, onCheckedChange = linger,
                enabled = controlsEnabled && scene.turn.kind == TurnStateKind.Idle && scene.dayView == null,
                modifier = Modifier.semantics { contentDescription = "Linger" })
        }
        scene.exchanges.lastOrNull { it.reply != null }?.reply?.let { reply ->
            Row {
                TextButton(onClick = { clipboard.setPrimaryClip(ClipData.newPlainText("Reply", reply.text)) },
                    modifier = Modifier.heightIn(min = 48.dp)) { Text("Copy") }
                // A Reply the Story closed the Scene with can be redone; after End scene the player has moved on.
                if (scene.turn.kind == TurnStateKind.Idle && scene.dayView?.closedBy != ClosedBy.Player &&
                    scene.exchanges.lastOrNull()?.let { it.move != null && it.reply != null } == true) {
                    TextButton(onClick = { showRedo = true }, enabled = controlsEnabled) { Text("Redo") }
                }
            }
        }
    }
    if (showRedo) RedoDialog(onDismiss = { showRedo = false }, onRedo = { direction, remember ->
        showRedo = false
        redo(direction, remember)
    })
    LaunchedEffect(scene.storyID, scene.headEntryID, scene.exchanges, scene.turn.kind, replyComing, scene.turn.textSoFar, scene.dayView, imeBottom, viewportSize) {
        val count = scene.earlierScenes.size + scene.exchanges.size + (if (replyComing) 1 else 0) + (if (scene.dayView != null) 1 else 0)
        withFrameNanos { }
        list.scrollToItem(count)
    }
}

@Composable fun MoveComposer(state: FantasiaState, write: (String) -> Unit, send: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!state.reachable) Text("The Mac is unreachable", color = FailureAmber)
        OutlinedTextField(value = state.draft, onValueChange = write,
            label = { Text("Move", color = FantasiaLabel) }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag("composer"), maxLines = 5)
        Button(onClick = send, modifier = Modifier.align(Alignment.End).heightIn(min = 48.dp),
            enabled = state.draft.isNotBlank() && state.reachable && !state.loading && !state.sending && !state.waiting &&
                state.scene?.turn?.kind == TurnStateKind.Idle && state.problem?.needsUpdate != true) { Text("Send") }
    }
}

@Composable fun ReplyFailure(state: FantasiaState, retry: () -> Unit) {
    val turn = state.scene?.turn ?: return
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Reply failed", color = FailureAmber, style = MaterialTheme.typography.titleSmall)
        Text(turn.reason.orEmpty(), color = FailureAmber)
        turn.traceID?.let { Text("Trace id: $it", color = FailureAmber) }
        Button(onClick = retry, modifier = Modifier.heightIn(min = 48.dp),
            enabled = state.reachable && !state.sending && !state.waiting && state.problem?.needsUpdate != true) { Text("Retry") }
    }
}

@Composable private fun SceneTitleCard(card: SceneCard, portrait: (String) -> PortraitSource?, focus: String?, enabled: Boolean, setFocus: (String) -> Unit) {
    Surface(color = FantasiaSurface, shape = MaterialTheme.shapes.medium) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(card.title, style = MaterialTheme.typography.titleLarge, color = FantasiaLabel)
            Text(card.place)
            Text(card.atLabel, style = MaterialTheme.typography.labelLarge, color = FantasiaLabel)
            focus?.let { Text("Focus: $it", color = FantasiaLabel, style = MaterialTheme.typography.labelLarge) }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                items(card.people, key = { it.name }) { person ->
                    Portrait(person, person.portraitURL?.let(portrait), Modifier
                        .selectable(selected = person.name == focus, enabled = enabled, role = Role.Button, onClick = { setFocus(person.name) })
                        .then(if (person.name == focus) Modifier.border(2.dp, FantasiaLabel, MaterialTheme.shapes.small) else Modifier)
                        .padding(4.dp))
                }
            }
        }
    }
}

@Composable private fun EarlierScene(scene: SceneSummaryLine) {
    var expanded by rememberSaveable(scene.number) { mutableStateOf(false) }
    Card(onClick = { expanded = !expanded }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("earlier-${scene.number}"),
        colors = CardDefaults.cardColors(containerColor = FantasiaSurface)) {
        Column(Modifier.padding(12.dp)) {
            Text("Scene ${scene.number} · ${scene.title} · ${scene.summary}", maxLines = 1, overflow = TextOverflow.Ellipsis, color = FantasiaLabel)
            if (expanded) Text(scene.summary)
        }
    }
}

@Composable private fun MovePassage(move: Passage, playerCharacter: String) {
    Column(Modifier.fillMaxWidth().padding(start = 24.dp), horizontalAlignment = Alignment.End) {
        Text(playerCharacter, color = PlayerCharacterColor, style = MaterialTheme.typography.labelLarge)
        Surface(shape = MaterialTheme.shapes.medium, color = FantasiaSurface) {
            Text(move.text, Modifier.padding(12.dp))
        }
    }
}

@Composable private fun RedoDialog(onDismiss: () -> Unit, onRedo: (String?, Boolean) -> Unit) {
    var direction by rememberSaveable { mutableStateOf("") }
    var remember by rememberSaveable { mutableStateOf(false) }
    AlertDialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false),
        modifier = Modifier.widthIn(max = 560.dp).padding(24.dp), title = { Text("Redo") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = direction, onValueChange = { direction = it }, label = { Text("Direction (optional)") },
                modifier = Modifier.fillMaxWidth().testTag("redo-direction"), maxLines = 4)
            // Only a Direction can be remembered, as a line of Taste.
            val canRemember = direction.isNotBlank()
            Row(Modifier.fillMaxWidth().toggleable(value = remember && canRemember, enabled = canRemember, role = Role.Checkbox, onValueChange = { remember = it }),
                verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = remember && canRemember, onCheckedChange = null, enabled = canRemember)
                Text("Remember this")
            }
        }
    }, confirmButton = {
        TextButton(onClick = { onRedo(direction.takeIf { it.isNotBlank() }, remember && direction.isNotBlank()) }, modifier = Modifier.testTag("confirm-redo")) { Text("Redo") }
    }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}
