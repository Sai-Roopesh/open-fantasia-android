package com.openfantasia.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.Lifecycle

@Composable fun FantasiaApp(model: FantasiaModel, scanner: PairingScanner, portrait: (String) -> PortraitSource? = { null }) {
    val state by model.state.collectAsStateWithLifecycle()
    BackHandler(enabled = state.scene != null) {
        if (state.readingScene != null) model.closePastScene() else model.home()
    }
    LifecycleEventEffect(Lifecycle.Event.ON_START) { model.resume() }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { model.pause() }
    FantasiaTheme {
        Surface(Modifier.fillMaxSize(), color = FantasiaBackground) {
            Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
                state.problem?.let { problem ->
                    Text(problem.reason, color = FailureAmber)
                    problem.traceID?.let { Text("Trace id: $it", color = FailureAmber) }
                }
                if (!state.paired) PairScreen(loading = state.loading, scan = { model.pair(scanner) }, modifier = Modifier.weight(1f))
                else if (state.scene != null) {
                    val scene = state.scene!!
                    val scrollState = key(scene.storyID) { rememberSceneScrollState() }
                    val focusManager = LocalFocusManager.current
                    if (state.readingScene != null) {
                        PastSceneScreen(state.readingScene!!, state.pastScene, scene.playerCharacter,
                            scene.scene.number, model::closePastScene, Modifier.weight(1f))
                        if (state.pastSceneLoading) CircularProgressIndicator()
                    } else {
                        SceneScreen(scene, portrait, Modifier.weight(1f), controlsEnabled = state.canChangeScene,
                            focus = model::focus, redo = model::redo, dismissPreviously = model::dismissPreviously, back = model::home, awaitingReply = state.replyComing,
                            openPastScene = { focusManager.clearFocus(); model.openPastScene(it) }, scrollState = scrollState,
                            storyTitle = state.stories.firstOrNull { it.id == scene.storyID }?.title ?: scene.scene.title,
                            failure = { ReplyFailure(state, model::retryReply) })
                        if (scene.dayView == null) HorizontalDivider(color = FantasiaHeaderLine)
                        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = if (scene.dayView == null) 10.dp else 4.dp, bottom = if (scene.dayView == null) 18.dp else 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            if (scene.dayView == null && scene.turn.kind != com.openfantasia.protocol.TurnStateKind.Failed) SceneControls(scene, state.canChangeScene, model::endScene, model::linger)
                            MoveComposer(state, model::writeMove, model::sendMove)
                        }
                    }
                }
                else {
                    HomeScreen(state, model::openStory, Modifier.weight(1f))
                }
                if (state.loading) CircularProgressIndicator()
            }
        }
    }
}
