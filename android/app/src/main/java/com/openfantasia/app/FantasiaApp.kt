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
import kotlinx.coroutines.launch

@Composable fun FantasiaApp(model: FantasiaModel, scanner: PairingScanner, portrait: (String) -> PortraitSource? = { null }, moveSent: () -> Unit = {},
    portraitPicker: PortraitPicker = PortraitPicker { null }) {
    val state by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val personActions = PersonActions(enabled = state.canChangePath, groups = state.people?.groups, loadGroups = model::loadPeople,
        edit = model::editPerson, setLead = model::setLead, setGroup = model::setPersonGroup, newGroup = model::newGroup,
        replacePortrait = { name -> scope.launch { portraitPicker.pick()?.let { model.replacePortrait(name, it) } } })
    BackHandler(enabled = state.scene == null && state.showingModels) { model.closeModels() }
    BackHandler(enabled = state.scene != null) {
        when {
            state.readingScene != null -> model.closePastScene()
            state.showingPaths -> model.closePaths()
            state.showingJournal -> model.closeJournal()
            state.showingWorld -> model.closeWorld()
            state.showingBackstage -> model.closeBackstage()
            else -> model.home()
        }
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
                            scene.scene.number, model::closePastScene, Modifier.weight(1f), pathsEnabled = state.canChangePath,
                            rewind = model::rewind, tryAnotherWay = model::tryAnotherWay, edit = model::edit)
                        if (state.pastSceneLoading) CircularProgressIndicator()
                    } else if (state.showingWorld) {
                        val editing = state.editing
                        val page = state.personPage
                        when {
                            editing != null -> PersonEditor(editing, scene.playerCharacter, state.canChangePath, portraitPicker::pick, cancel = model::closeEditor,
                                save = model::savePerson, modifier = Modifier.weight(1f))
                            page != null -> {
                                BackHandler { model.closePersonPage() }
                                PersonPage(page.page(), portrait, personActions, back = model::closePersonPage, backLabel = "Back to everyone", modifier = Modifier.weight(1f))
                            }
                            state.showingEveryone -> {
                                BackHandler { model.closeEveryone() }
                                EveryoneScreen(state.people, portrait, state.canChangePath, back = model::closeEveryone, add = model::newPerson,
                                    open = model::openPersonPage, modifier = Modifier.weight(1f))
                            }
                            else -> WorldScreen(state.world, portrait, back = model::closeWorld, actions = personActions, add = model::newPerson,
                                everyone = model::openEveryone, modifier = Modifier.weight(1f))
                        }
                    } else if (state.showingJournal) {
                        JournalScreen(state.journal, back = model::closeJournal, modifier = Modifier.weight(1f), open = { number ->
                            if (number == scene.scene.number) model.closeJournal() else model.openPastScene(number)
                        })
                    } else if (state.showingBackstage) {
                        BackstageScreen(state.backstage, firstName(scene.playerCharacter), state.canChangePath, back = model::closeBackstage,
                            removeTaste = model::removeTaste, modifier = Modifier.weight(1f))
                    } else if (state.showingPaths) {
                        PathsScreen(state.paths, state.canChangePath, model::closePaths, model::openPath, model::renamePath,
                            model::deletePath, model::clearPaths, startAgain = { model.tryAnotherWay(null) }, modifier = Modifier.weight(1f))
                    } else {
                        SceneScreen(scene, portrait, Modifier.weight(1f), controlsEnabled = state.canChangeScene,
                            openPaths = model::openPaths, openWorld = model::openWorld, openJournal = model::openJournal, openBackstage = model::openBackstage, pathsEnabled = state.canChangePath, rewind = model::rewind, tryAnotherWay = model::tryAnotherWay,
                            edit = model::edit,
                            focus = model::focus, redo = model::redo, models = state.models, loadModels = model::loadModels, choose = model::choose, problem = state.problem?.reason, dismissPreviously = model::dismissPreviously, back = model::home, awaitingReply = state.replyComing,
                            openPastScene = { focusManager.clearFocus(); model.openPastScene(it) }, scrollState = scrollState,
                            storyTitle = state.stories.firstOrNull { it.id == scene.storyID }?.title ?: scene.scene.title,
                            worldFailure = { WorldFailureContent(state, model::retryWorld, model::loadModels) },
                            failure = { ReplyFailure(state, model::retryReply, model::loadModels) })
                        if (state.worldReady) {
                            if (scene.dayView == null) HorizontalDivider(color = FantasiaHeaderLine)
                            Column(Modifier.padding(start = 16.dp, end = 16.dp, top = if (scene.dayView == null) 10.dp else 4.dp, bottom = if (scene.dayView == null) 18.dp else 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                if (scene.dayView == null && scene.turn.kind != com.openfantasia.protocol.TurnStateKind.Failed) SceneControls(scene, state.canChangeScene, model::endScene, model::linger)
                                MoveComposer(state, model::writeMove) { model.sendMove(); moveSent() }
                            }
                        }
                    }
                }
                else if (state.showingModels) {
                    ModelsScreen(state.models, enabled = state.reachable, back = model::closeModels, setJob = model::setJobModel,
                        setActor = { storyID, choice -> model.setActor(storyID, choice) }, modifier = Modifier.weight(1f))
                }
                else {
                    HomeScreen(state, model::openStory, Modifier.weight(1f), openModels = model::openModels)
                }
                if (state.loading) CircularProgressIndicator()
            }
        }
    }
}
