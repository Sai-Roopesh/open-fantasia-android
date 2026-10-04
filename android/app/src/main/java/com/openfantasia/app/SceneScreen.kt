package com.openfantasia.app

import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.foundation.layout.*
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
import com.openfantasia.protocol.*

@Composable fun SceneScreen(scene: SceneView, portrait: (String) -> PortraitSource?, modifier: Modifier = Modifier) {
    val list = rememberLazyListState()
    val clipboard = LocalContext.current.getSystemService(ClipboardManager::class.java)
    val keyboardOpen = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!keyboardOpen) SceneTitleCard(scene.scene, portrait)
        else Text(scene.scene.title, color = FantasiaLabel, style = MaterialTheme.typography.titleMedium)
        LazyColumn(state = list, modifier = Modifier.weight(1f).testTag("scene-passages"),
            verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 16.dp)) {
            items(scene.earlierScenes, key = { "earlier-${it.number}" }) { EarlierScene(it) }
            items(scene.exchanges, key = { it.move?.entryID ?: it.reply!!.entryID }) { exchange ->
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    exchange.move?.let { MovePassage(it, scene.playerCharacter) }
                    exchange.reply?.let { Text(it.text, modifier = Modifier.fillMaxWidth().padding(end = 24.dp)) }
                }
            }
            if (scene.turn.kind == TurnStateKind.Writing) item(key = "reply-being-written") {
                Column {
                    Text("Reply being written", color = FantasiaLabel, style = MaterialTheme.typography.labelLarge)
                    Text(scene.turn.textSoFar.orEmpty(), modifier = Modifier.fillMaxWidth().padding(end = 24.dp))
                }
            }
        }
        scene.exchanges.lastOrNull { it.reply != null }?.reply?.let { reply ->
            TextButton(onClick = { clipboard.setPrimaryClip(ClipData.newPlainText("Reply", reply.text)) },
                modifier = Modifier.heightIn(min = 48.dp)) { Text("Copy") }
        }
    }
    LaunchedEffect(scene.storyID, scene.headEntryID, scene.turn.textSoFar) {
        val count = scene.earlierScenes.size + scene.exchanges.size + if (scene.turn.kind == TurnStateKind.Writing) 1 else 0
        if (count > 0) list.scrollToItem(count - 1)
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

@Composable private fun SceneTitleCard(card: SceneCard, portrait: (String) -> PortraitSource?) {
    Surface(color = FantasiaSurface, shape = MaterialTheme.shapes.medium) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(card.title, style = MaterialTheme.typography.titleLarge, color = FantasiaLabel)
            Text(card.place)
            Text(card.atLabel, style = MaterialTheme.typography.labelLarge, color = FantasiaLabel)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                items(card.people) { person -> Portrait(person, person.portraitURL?.let(portrait)) }
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
