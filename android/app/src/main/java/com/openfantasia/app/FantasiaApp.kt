package com.openfantasia.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.Lifecycle

@Composable fun FantasiaApp(model: FantasiaModel, scanner: PairingScanner, portrait: (String) -> PortraitSource? = { null }) {
    val state by model.state.collectAsStateWithLifecycle()
    BackHandler(enabled = state.scene != null) { model.home() }
    LifecycleEventEffect(Lifecycle.Event.ON_START) { model.resume() }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { model.pause() }
    FantasiaTheme {
        Surface(Modifier.fillMaxSize(), color = FantasiaBackground) {
            Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Open Fantasia", style = MaterialTheme.typography.headlineMedium, color = FantasiaLabel)
                state.problem?.let { problem ->
                    Text(problem.reason, color = FailureAmber)
                    problem.traceID?.let { Text("Trace id: $it", color = FailureAmber) }
                }
                if (!state.paired) PairScreen(state.loading) { model.pair(scanner) }
                else if (state.scene != null) {
                    TextButton(onClick = model::home, modifier = Modifier.heightIn(min = 48.dp)) { Text("Stories") }
                    SceneScreen(state.scene!!, portrait, Modifier.weight(1f), controlsEnabled = state.canChangeScene, endScene = model::endScene, focus = model::focus, linger = model::linger, redo = model::redo)
                    if (state.scene!!.turn.kind == com.openfantasia.protocol.TurnStateKind.Failed) {
                        ReplyFailure(state, model::retryReply)
                    }
                    MoveComposer(state, model::writeMove, model::sendMove)
                }
                else {
                    Text("Stories", style = MaterialTheme.typography.titleLarge)
                    LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(state.stories, key = { it.id }) { story ->
                            Card(onClick = { model.openStory(story.id) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                                colors = CardDefaults.cardColors(containerColor = FantasiaSurface)) {
                                Column(Modifier.padding(16.dp)) {
                                    Text(story.title, style = MaterialTheme.typography.titleMedium)
                                    Text(story.standing, color = FantasiaLabel)
                                }
                            }
                        }
                    }
                    if (state.stories.isEmpty() && !state.loading && state.problem == null) Text("Import a Story File on the Mac to begin.")
                    Button(onClick = model::home, enabled = !state.loading, modifier = Modifier.heightIn(min = 48.dp)) { Text("Refresh") }
                }
                if (state.loading) CircularProgressIndicator()
            }
        }
    }
}

@Composable private fun PairScreen(loading: Boolean, scan: () -> Unit) {
    Text("Pair with the Mac", style = MaterialTheme.typography.titleLarge)
    Text("Open the pairing QR code on the Mac, then scan it here.")
    Button(onClick = scan, enabled = !loading, modifier = Modifier.heightIn(min = 48.dp)) { Text("Scan Mac QR code") }
}
