package com.openfantasia.app

import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.clickable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.lazy.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.*
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import kotlinx.coroutines.flow.first
import com.openfantasia.protocol.*
import java.util.Locale

internal fun firstName(name: String) = name.trim().substringBefore(' ')
internal val SceneView.replyComing: Boolean
    get() = turn.underWay ||
        (turn.kind == TurnStateKind.Idle && exchanges.lastOrNull()?.let { it.move != null && it.reply == null } == true)

/**
 * The one line while a Reply is under way (SceneWriting.dc.html; openspec presence: A Reply arrives checked and whole):
 * looking something up, being written, or being checked. Before the Mac has said which, the Story is looking back:
 * nothing is said to be written before it is.
 */
internal fun turnLine(kind: TurnStateKind): String = when (kind) {
    TurnStateKind.Writing -> "Writing…"
    TurnStateKind.Checking -> "Checking…"
    else -> "Looking back…"
}

// Owned by the current Scene's navigation entry so reading its past does not discard the scroll position.
class SceneScrollState(val list: LazyListState) {
    internal var hasBeenShown = false
}

@Composable fun rememberSceneScrollState(): SceneScrollState {
    val list = rememberLazyListState()
    return remember(list) { SceneScrollState(list) }
}

@Composable fun SceneScreen(
    scene: SceneView,
    portrait: (String) -> PortraitSource?,
    modifier: Modifier = Modifier,
    controlsEnabled: Boolean = true,
    focus: (String) -> Unit = {},
    redo: (String?, Boolean, ModelChoice?) -> Unit = { _, _, _ -> },
    /** What the Mac's jobs run on and what each provider offers, read when Redo opens, for "Written by". */
    models: ModelsView? = null,
    loadModels: () -> Unit = {},
    storyTitle: String = scene.scene.title,
    back: () -> Unit = {},
    awaitingReply: Boolean = false,
    openPastScene: (Long) -> Unit = {},
    scrollState: SceneScrollState = rememberSceneScrollState(),
    previously: Previously? = scene.previously,
    dismissPreviously: () -> Unit = {},
    choose: (ChooseRequest) -> Unit = {},
    problem: String? = null,
    openPaths: () -> Unit = {},
    openJournal: () -> Unit = {},
    openWorld: () -> Unit = {},
    openBackstage: () -> Unit = {},
    openStory: () -> Unit = {},
    pathsEnabled: Boolean = false,
    rewind: (String) -> Unit = {},
    tryAnotherWay: (String) -> Unit = {},
    edit: (String, String) -> Unit = { _, _ -> },
    /** A Scene's end that stopped at a step, with Retry and another model (SceneEndFailed.dc.html). */
    sceneEndFailure: @Composable (SceneEndFailure) -> Unit = {},
    /** The player's reaction to the Scene that just ended (openspec long-run: The player steers with a brief and reactions). */
    react: (Reaction?) -> Unit = {},
    reaction: Reaction? = scene.dayView?.reaction,
    reactEnabled: Boolean = controlsEnabled,
    failure: @Composable () -> Unit = {}
) {
    val day = scene.dayView
    val dayReady = day?.sceneEnd?.done == true
    var picker by remember(scene.storyID, scene.headEntryID, dayReady) { mutableStateOf<DayPicker?>(null) }
    var gap by remember(scene.storyID, scene.headEntryID, dayReady) { mutableStateOf<DayChoice?>(null) }
    // The Gap sheet stays open until the Mac takes the choice; a refusal leaves the player's words in it, with the reason.
    var gapSent by remember(gap) { mutableStateOf(false) }
    fun destination(happening: Happening, kind: ChooseRequestKind) {
        if (!controlsEnabled || day == null) return
        val request = ChooseRequest(after = scene.headEntryID, kind = kind,
            happening = happening.id.takeIf { kind == ChooseRequestKind.Go })
        if (storyMinute(happening.at) > storyMinute(day.at)) {
            gap = DayChoice(request, happening.at, happening.time, happening.place, "Go to ${happening.place}")
        } else choose(request)
    }
    val list = scrollState.list
    var entering by remember { mutableStateOf(true) }
    var viewportSize by remember { mutableStateOf(IntSize.Zero) }
    var showRedo by rememberSaveable(scene.storyID) { mutableStateOf(false) }
    val clipboard = LocalContext.current.getSystemService(ClipboardManager::class.java)
    val density = LocalDensity.current
    val imeBottom = WindowInsets.ime.getBottom(density)
    val replyComing = scene.replyComing || awaitingReply
    val latestReply = scene.exchanges.lastOrNull { it.reply != null }?.reply
    var previouslyOffset by remember(previously?.since) { mutableStateOf<Int?>(null) }
    val copy = { text: String -> clipboard.setPrimaryClip(ClipData.newPlainText("Reply", text)) }
    // The Reply being held, whose menu is open (LongPress.dc.html); everything else steps back.
    var held by remember(scene.storyID, scene.headEntryID) { mutableStateOf<String?>(null) }
    var editing by remember(scene.storyID, scene.headEntryID) { mutableStateOf<Editing?>(null) }
    // The latest Move and Reply: an edit changes them in place, anything earlier on a new Path (openspec scenes: Editing).
    val latestMove = scene.exchanges.lastOrNull()?.move?.entryID
    val latestReplyID = scene.exchanges.lastOrNull()?.reply?.entryID
    fun actions(passage: Passage, isMove: Boolean) = PassageActions(isMove = isMove,
        latest = passage.entryID == (if (isMove) latestMove else latestReplyID), canRewind = isMove || passage.entryID != scene.headEntryID,
        pathsEnabled = pathsEnabled, copy = { copy(passage.text) }, rewind = { rewind(passage.entryID) }, tryAnotherWay = { tryAnotherWay(passage.entryID) },
        edit = { editing = Editing(passage.entryID, passage.text, isMove, passage.entryID == (if (isMove) latestMove else latestReplyID)) })
    Column(modifier) {
        SceneHeader(scene, storyTitle, back, scene.dayView == null && scene.opening == null && (replyComing || scene.turn.kind == TurnStateKind.Failed || imeBottom > 0), openPaths, openJournal, openBackstage, openWorld, openStory)
        LazyColumn(state = list, modifier = Modifier.weight(1f).onSizeChanged { viewportSize = it }.testTag("scene-passages"),
            verticalArrangement = Arrangement.spacedBy(6.dp), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 8.dp)) {
            itemsIndexed(scene.earlierScenes, key = { _, scene -> "earlier-${scene.number}" }) { index, earlier ->
                Box(Modifier.padding(bottom = if (index == scene.earlierScenes.lastIndex) 8.dp else 0.dp)) { EarlierScene(earlier) { openPastScene(earlier.number) } }
            }
            item(key = "scene-title") {
                Box(Modifier.padding(bottom = 8.dp)) {
                    scene.opening?.let { NextSceneCard(it) } ?: SceneTitleCard(scene.scene, portrait, scene.focus, controlsEnabled && scene.dayView == null, focus)
                }
            }
            items(scene.exchanges, key = { it.move?.entryID ?: it.reply!!.entryID }) { exchange ->
                Column(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    exchange.move?.let { move ->
                        HeldMove(move, scene.playerCharacter, held = held == move.entryID, dimmed = held != null && held != move.entryID,
                            actions = actions(move, isMove = true), hold = { held = move.entryID }, release = { held = null })
                    }
                    exchange.reply?.let { reply ->
                        if (reply == latestReply && scene.dayView == null && previously != null) {
                            PreviouslyCard(previously, dismissPreviously, Modifier.onGloballyPositioned { previouslyOffset = it.positionInParent().y.toInt() })
                        }
                        HeldReply(reply, held = held == reply.entryID, dimmed = held != null && held != reply.entryID,
                            actions = actions(reply, isMove = false), hold = { held = reply.entryID }, release = { held = null })
                        val latestActions = reply == latestReply && !replyComing && scene.turn.kind != TurnStateKind.Failed
                        val canRedo = latestActions && scene.dayView == null &&
                            scene.exchanges.lastOrNull()?.let { it.move != null && it.reply != null } == true
                        // The Editor's note, when the Reply still breaks something after it was written again; Redo moves into it.
                        reply.note?.let { note -> EditorNote(note, if (canRedo) ({ showRedo = true }) else null, controlsEnabled) }
                        if (latestActions) {
                            // The latest Reply's actions, in view without a menu, as drawn in Scene.dc.html.
                            Row(Modifier.offset(x = (-8).dp).testTag("latest-actions"), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                ReplyAction("Copy", onClick = { copy(reply.text) })
                                if (canRedo && reply.note == null) {
                                    ReplyAction("Redo", enabled = controlsEnabled, onClick = { showRedo = true })
                                }
                                ReplyAction("Edit", enabled = pathsEnabled, onClick = { editing = Editing(reply.entryID, reply.text, isMove = false, latest = true) })
                                ReplyAction("Try another way", enabled = pathsEnabled, onClick = { tryAnotherWay(reply.entryID) })
                            }
                        }
                    }
                }
            }
            scene.dayView?.let { day -> item(key = "day-view") {
                val height = with(density) { viewportSize.height.toDp() }
                Column(Modifier.fillMaxWidth().heightIn(min = (height - 22.dp).coerceAtLeast(0.dp)), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    previously?.let { PreviouslyCard(it, dismissPreviously) }
                    DayViewContent(day, scene.scene, Modifier.fillMaxWidth(), sceneEndFailure, react = react, reaction = reaction, reactEnabled = reactEnabled, enabled = controlsEnabled,
                        go = { destination(it, ChooseRequestKind.Go) }, picker = { picker = it },
                        story = { day.happenings.firstOrNull { it.pick }?.let { destination(it, ChooseRequestKind.Story) } })
                }
            } }
            // No words arrive before the Editor has checked them: one line says what is under way (SceneWriting.dc.html).
            if (replyComing && scene.opening == null) item(key = "reply-under-way") {
                Row(Modifier.padding(bottom = 8.dp).testTag("reply-under-way").semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Spacer(Modifier.size(6.dp).background(FantasiaLabel, FantasiaShapes.round))
                    Text(turnLine(scene.turn.kind), color = FantasiaCaption, style = FantasiaType.small)
                }
            }
            if (scene.turn.kind == TurnStateKind.Failed) item(key = "reply-failure") { Box(Modifier.padding(bottom = 8.dp)) { failure() } }
            // Even a passage taller than the viewport must be able to scroll to its final line.
            item(key = "scene-end") { Spacer(Modifier.height(1.dp)) }
        }
    }
    if (showRedo) {
        LaunchedEffect(Unit) { loadModels() }
        RedoSheet(scene.storyID, models, onDismiss = { showRedo = false }, onRedo = { direction, remember, model ->
            showRedo = false
            redo(direction, remember, model)
        })
    }
    editing?.let { passage ->
        EditSheet(passage, enabled = pathsEnabled, onDismiss = { editing = null }) { words -> editing = null; edit(passage.entryID, words) }
    }
    // The player reading back keeps their place: the end is followed only while they are at it, and a new Move, Reply
    // or Scene change brings them back to it.
    var followingEnd by remember { mutableStateOf(true) }
    var scrollingOurselves by remember { mutableStateOf(false) }
    LaunchedEffect(list) {
        // The player has moved when the first visible line moves and the app did not scroll: a keyboard opening only
        // cuts the viewport short at the bottom, and a Reply growing moves only what is below. Whether they are at the
        // end is read from the finished layout, where the end marker is the last item.
        var last: Pair<Int, Int>? = null
        snapshotFlow { list.layoutInfo }.collect { info ->
            val position = list.firstVisibleItemIndex to list.firstVisibleItemScrollOffset
            if (last != null && last != position && !scrollingOurselves) {
                followingEnd = info.visibleItemsInfo.lastOrNull()?.key == "scene-end"
            }
            last = position
        }
    }
    if (day != null && dayReady) {
        picker?.let { showing ->
            ChoiceSheet(day, showing, controlsEnabled, dismiss = { picker = null }) { option ->
                if (controlsEnabled) {
                    picker = null
                    when (showing) {
                        DayPicker.Follow -> choose(ChooseRequest(after = scene.headEntryID, kind = ChooseRequestKind.Follow, who = option))
                        DayPicker.Somewhere -> choose(ChooseRequest(after = scene.headEntryID, kind = ChooseRequestKind.Somewhere, place = option))
                        DayPicker.Skip -> day.choices.skips.firstOrNull { it.at == option }?.let { skip ->
                            val request = ChooseRequest(after = scene.headEntryID, kind = ChooseRequestKind.Skip, at = skip.at)
                            if (storyMinute(skip.at) > storyMinute(day.at)) {
                                gap = DayChoice(request, skip.at, skip.time, skip.inSentence, "Skip to ${skip.inSentence}")
                            } else choose(request)
                        }
                    }
                }
            }
        }
        gap?.let { choice ->
            GapSheet(day, scene.playerCharacter, choice, controlsEnabled, problem.takeIf { gapSent }, dismiss = { gap = null }) { text ->
                if (controlsEnabled) { gapSent = true; choose(choice.request.copy(gap = text)) }
            }
            LaunchedEffect(awaitingReply) { if (awaitingReply) gap = null }
        }
    }
    var lastHead by remember { mutableStateOf<String?>(null) }
    val measuredViewport = viewportSize
    // A new Move, Reply or Scene change brings the player to the end; the turn's line changing, the keyboard opening and
    // the viewport resizing keep them there only if they are at it.
    LaunchedEffect(scene.storyID, scene.headEntryID, scene.exchanges, scene.turn.kind, replyComing, scene.dayView, imeBottom, measuredViewport) {
        if (measuredViewport == IntSize.Zero) return@LaunchedEffect
        if (entering) {
            entering = false
            val returning = scrollState.hasBeenShown
            scrollState.hasBeenShown = true
            // Returning from an earlier Scene resumes the player's place, as before.
            lastHead = scene.headEntryID
            if (returning) return@LaunchedEffect
            if (previously != null && scene.dayView == null && latestReply != null) {
                // As drawn, a fresh Scene with a card opens at its end, the card and the latest Reply above the composer.
                // A Reply too long for both to fit opens with the card at the top instead, so it is never out of sight.
                val index = scene.earlierScenes.size + 1 + scene.exchanges.indexOfLast { it.reply != null }
                scrollingOurselves = true
                try {
                    list.scrollToItem(scene.earlierScenes.size + 1 + scene.exchanges.size)
                    val offset = snapshotFlow { previouslyOffset }.first { it != null }!!
                    withFrameNanos { }
                    val card = list.layoutInfo.visibleItemsInfo.firstOrNull { it.index == index }
                    if (card == null || card.offset + offset < list.layoutInfo.viewportStartOffset) {
                        followingEnd = false
                        list.scrollToItem(index, offset)
                        withFrameNanos { }
                    }
                } finally { scrollingOurselves = false }
                return@LaunchedEffect
            }
        }
        val newHead = lastHead != scene.headEntryID
        lastHead = scene.headEntryID
        if (!newHead && !followingEnd) return@LaunchedEffect
        followingEnd = true
        val endIndex = scene.earlierScenes.size + 1 + scene.exchanges.size + (if (replyComing && scene.opening == null) 1 else 0) +
            (if (scene.dayView != null) 1 else 0) + (if (scene.turn.kind == TurnStateKind.Failed) 1 else 0)
        withFrameNanos { }
        scrollingOurselves = true
        try {
            if (scene.dayView != null && !replyComing) list.scrollToItem(scene.earlierScenes.size + 1 + scene.exchanges.size)
            else list.scrollToItem(endIndex)
            withFrameNanos { }
        } finally { scrollingOurselves = false }
    }
}

@Composable private fun SceneHeader(scene: SceneView, storyTitle: String, back: () -> Unit, compact: Boolean, openPaths: () -> Unit,
    openJournal: () -> Unit, openBackstage: () -> Unit, openWorld: () -> Unit, openStory: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        IconButton(onClick = back, modifier = Modifier.size(44.dp).semantics { contentDescription = "Stories" }) {
            FantasiaIcon(FantasiaIconKind.Back, Modifier.size(22.dp))
        }
        // The Story opens from its title, marked with a chevron: the header has no room for a fifth word (docs/design/README.md).
        // A tap and a button's semantics without merging, so the title and time keep their own nodes.
        Row(Modifier.weight(1f).heightIn(min = 44.dp).pointerInput(openStory) { detectTapGestures { openStory() } }
            .semantics { contentDescription = "The Story"; role = Role.Button; onClick(label = "The Story") { openStory(); true } },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Column(Modifier.weight(1f, fill = false)) {
                Text(if (compact) scene.scene.title else storyTitle, modifier = Modifier.testTag("scene-header-title"), style = FantasiaType.header, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (compact) Text("Scene ${scene.scene.number} · ${scene.scene.atLabel}", modifier = Modifier.testTag("scene-header-time"), style = FantasiaType.small,
                    color = FantasiaCaption, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            FantasiaIcon(FantasiaIconKind.ChevronRight, Modifier.size(14.dp), FantasiaCaption)
        }
        // The header's screens as Scene.dc.html draws them, icons each named for TalkBack, so the title keeps its room.
        for ((kind, open) in listOf(FantasiaIconKind.World to openWorld, FantasiaIconKind.Journal to openJournal,
            FantasiaIconKind.Paths to openPaths, FantasiaIconKind.Backstage to openBackstage)) {
            IconButton(onClick = open, modifier = Modifier.size(44.dp).semantics { contentDescription = kind.name }) {
                FantasiaIcon(kind, Modifier.size(21.dp), FantasiaSecondary)
            }
        }
    }
    HorizontalDivider(color = FantasiaHeaderLine)
}

@Composable internal fun SceneControls(scene: SceneView, enabled: Boolean, endScene: () -> Unit, linger: (Boolean) -> Unit) {
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            val active = enabled && !scene.replyComing && scene.turn.kind == TurnStateKind.Idle && scene.dayView == null
            Box(Modifier.height(36.dp).toggleable(value = scene.linger, enabled = active, role = Role.Checkbox, onValueChange = linger)
                .semantics { contentDescription = "Linger" }, contentAlignment = Alignment.Center) {
                Surface(shape = FantasiaShapes.round, color = if (scene.linger) FantasiaAccent else FantasiaBackground,
                    border = BorderStroke(1.dp, if (scene.linger) FantasiaAccent else if (active) FantasiaStrongLine else FantasiaLine)) {
                    Row(Modifier.height(36.dp).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        val color = if (!active) FantasiaDisabled else if (scene.linger) MaterialTheme.colorScheme.onPrimary else FantasiaSecondary
                        FantasiaIcon(FantasiaIconKind.Linger, Modifier.size(15.dp), color)
                        Text("Linger", style = FantasiaType.meta, color = color)
                    }
                }
            }
            OutlinedButton(onClick = endScene, enabled = active, modifier = Modifier.height(36.dp), shape = FantasiaShapes.round,
                border = BorderStroke(1.dp, if (active) FantasiaStrongLine else FantasiaLine), contentPadding = PaddingValues(horizontal = 14.dp)) {
                Text("End scene", style = FantasiaType.meta, color = if (active) FantasiaSecondary else FantasiaDisabled)
            }
        }
    }
}

@Composable fun MoveComposer(state: FantasiaState, write: (String) -> Unit, send: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (!state.reachable) Text("The Mac is unreachable", color = FailureAmber, style = FantasiaType.small)
        state.waitingMove?.takeIf { it.storyID == state.scene?.storyID }?.let { move ->
            Column(Modifier.fillMaxWidth().testTag("waiting-move"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(move.text, style = FantasiaType.composer, color = FantasiaSecondary, maxLines = 3, overflow = TextOverflow.Ellipsis)
                Text("Sends when the Mac is back.", style = FantasiaType.small, color = FantasiaCaption)
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BasicTextField(value = state.draft, onValueChange = write, minLines = 2, maxLines = 5,
                modifier = Modifier.weight(1f).heightIn(min = 70.dp).testTag("composer")
                    .semantics { contentDescription = "Your Move" }
                    .background(FantasiaSurface, FantasiaShapes.composer).border(1.dp, FantasiaStrongLine, FantasiaShapes.composer),
                textStyle = FantasiaType.composer.copy(color = FantasiaText), cursorBrush = SolidColor(FantasiaLabel),
                decorationBox = { field ->
                    Box(Modifier.padding(horizontal = 17.dp, vertical = 14.dp)) {
                        if (state.draft.isEmpty()) Text(if (state.scene?.dayView != null) "Or write your own Move" else if (state.scene?.turn?.kind == TurnStateKind.Failed) "Retry the Reply first" else "What does ${firstName(state.scene?.playerCharacter.orEmpty())} do?", style = FantasiaType.composer, color = FantasiaCaption)
                        field()
                    }
                })
            Button(onClick = send, modifier = Modifier.size(48.dp).testTag("send-move").semantics { contentDescription = if (state.replyComing) "Send when the Reply is done" else "Send" },
                shape = FantasiaShapes.round, contentPadding = PaddingValues(0.dp),
                colors = ButtonDefaults.buttonColors(disabledContainerColor = FantasiaRaised, disabledContentColor = FantasiaCaption),
                enabled = state.canSendMove) {
                FantasiaIcon(FantasiaIconKind.Send, Modifier.size(20.dp))
            }
        }
        if (state.replyComing) Text("Your Move sends once the Reply is done.", style = FantasiaType.small, color = FantasiaCaption)
    }
}

@Composable fun ReplyFailure(state: FantasiaState, retry: (ModelChoice?) -> Unit, loadModels: () -> Unit = {}) {
    val turn = state.scene?.turn ?: return
    StoryFailure("The Reply could not be written", turn.reason.orEmpty(), turn.traceID, retry,
        state.reachable && !state.sending && !state.waiting && state.problem?.needsUpdate != true,
        another = "Write it with another model", models = state.models, loadModels = loadModels)
}

/**
 * What failed, in words, with Retry and Another model beside it (SceneFailed.dc.html; openspec presence: Nothing fails
 * silently). Another model opens the picker in a sheet titled [another]; choosing one retries on it for this one try.
 */
@Composable internal fun StoryFailure(title: String, reason: String, traceID: String?, retry: (ModelChoice?) -> Unit,
    retryEnabled: Boolean, modifier: Modifier = Modifier, another: String, models: ModelsView?, loadModels: () -> Unit) {
    var choosing by remember { mutableStateOf(false) }
    Surface(modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Assertive }, shape = FantasiaShapes.card,
        color = FantasiaFailureSurface, border = BorderStroke(1.dp, FantasiaFailureLine)) {
        Column(Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, color = FailureAmber, style = FantasiaType.failureTitle)
            Text(reason, color = FantasiaProse, style = FantasiaType.detail)
            Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { retry(null) }, modifier = Modifier.height(44.dp), shape = FantasiaShapes.round,
                    contentPadding = PaddingValues(horizontal = 20.dp), enabled = retryEnabled) {
                    Text("Retry", style = FantasiaType.retryButton)
                }
                OutlinedButton(onClick = { loadModels(); choosing = true }, enabled = retryEnabled, modifier = Modifier.height(44.dp),
                    shape = FantasiaShapes.round, border = BorderStroke(1.dp, FantasiaStrongLine), contentPadding = PaddingValues(horizontal = 16.dp)) {
                    Text("Another model", style = FantasiaType.metadata, color = if (retryEnabled) FantasiaText else FantasiaDisabled)
                    Spacer(Modifier.width(6.dp))
                    FantasiaIcon(FantasiaIconKind.ChevronDown, Modifier.size(14.dp), if (retryEnabled) FantasiaText else FantasiaDisabled)
                }
            }
            traceID?.let { Text("Trace $it", color = FantasiaCaption, style = FantasiaType.small) }
        }
    }
    if (choosing) AnotherModelSheet(another, models, onDismiss = { choosing = false }) { choice -> choosing = false; retry(choice) }
}

@Composable private fun SceneTitleCard(card: SceneCard, portrait: (String) -> PortraitSource?, focus: String?, enabled: Boolean, setFocus: (String) -> Unit) {
    Surface(Modifier.fillMaxWidth().testTag("scene-title"), color = FantasiaSurface, shape = FantasiaShapes.titleCard, border = BorderStroke(1.dp, FantasiaLine)) {
        Column(Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("SCENE ${card.number}", style = FantasiaType.eyebrow, color = FantasiaCaption)
            Text(card.title, style = FantasiaType.sceneTitle, modifier = Modifier.padding(top = 2.dp))
            Text("${card.place} · ${card.atLabel}", style = FantasiaType.metadata, color = FantasiaSecondary)
            LazyRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                items(card.people, key = { it.name }) { person ->
                    Portrait(person, person.portraitURL?.let(portrait), Modifier.selectable(selected = person.name == focus,
                        enabled = enabled, role = Role.Button, onClick = { setFocus(person.name) }), focused = person.name == focus)
                }
            }
            if (focus != null) Text("Focus on ${firstName(focus)} · tap a Portrait to change", color = FantasiaLabel, style = FantasiaType.small, modifier = Modifier.padding(top = 8.dp))
            else if (card.people.isNotEmpty()) Text("Tap a Portrait to focus on someone", color = FantasiaCaption, style = FantasiaType.small, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

/** The next Scene while it is being written, in the Scene card's place: when it is, and that it is coming. */
@Composable private fun NextSceneCard(next: NextScene) {
    Surface(Modifier.fillMaxWidth().testTag("next-scene"), color = FantasiaSurface, shape = FantasiaShapes.titleCard, border = BorderStroke(1.dp, FantasiaLine)) {
        Column(Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("NEXT SCENE", style = FantasiaType.eyebrow, color = FantasiaCaption)
            next.atLabel?.let { Text(it, style = FantasiaType.metadata, color = FantasiaSecondary, modifier = Modifier.padding(top = 2.dp)) }
            Row(Modifier.padding(top = 10.dp).semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Spacer(Modifier.size(6.dp).background(FantasiaLabel, FantasiaShapes.round))
                Text("Scene being written", color = FantasiaCaption, style = FantasiaType.small)
            }
        }
    }
}

@Composable private fun EarlierScene(scene: SceneSummaryLine, open: () -> Unit) {
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
        Surface(onClick = open, modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp).testTag("earlier-${scene.number}"),
            shape = FantasiaShapes.folded, color = FantasiaFolded) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                Text("Scene ${scene.number} · ${scene.title}" + scene.summary.takeIf { it.isNotEmpty() }?.let { " · $it" }.orEmpty(),
                    maxLines = 1, overflow = TextOverflow.Ellipsis, color = FantasiaSecondary, style = FantasiaType.meta)
            }
        }
    }
}

@Composable internal fun ReplyPassage(reply: Passage) {
    Text(prose(reply.text), modifier = Modifier.fillMaxWidth(), style = FantasiaType.prose, color = FantasiaProse)
}

@Composable internal fun MovePassage(move: Passage, playerCharacter: String, dimmed: Boolean = false, held: Boolean = false, modifier: Modifier = Modifier) {
    BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Surface(shape = FantasiaShapes.move, color = if (dimmed) FantasiaDimmedMove else FantasiaRaised,
            border = if (held) BorderStroke(1.dp, FantasiaAccent) else null, modifier = Modifier.widthIn(max = maxWidth * .86f).then(modifier)) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(firstName(playerCharacter).uppercase(Locale.ROOT), color = if (dimmed) FantasiaDimmed else FantasiaLabel, style = FantasiaType.player)
                Text(prose(move.text), style = FantasiaType.body, color = if (dimmed) FantasiaDimmed else FantasiaText)
            }
        }
    }
}

/**
 * The Editor's note under a Reply (SceneWriting.dc.html; docs/adr/0019): what the Reply still breaks after it was
 * written again, in amber, with Redo when it is the latest Reply and can be redone.
 */
@Composable internal fun EditorNote(note: String, redo: (() -> Unit)?, enabled: Boolean) {
    Column(Modifier.fillMaxWidth().testTag("editor-note").background(EditorNoteGround, RoundedCornerShape(14.dp))
        .border(1.dp, EditorNoteLine, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("THE EDITOR'S NOTE", style = FantasiaType.meanwhileTag.copy(letterSpacing = 1.1.sp), color = FantasiaRumour)
        Text(note, style = FantasiaType.metadata.copy(lineHeight = 21.sp), color = FantasiaProse)
        if (redo != null) OutlinedButton(onClick = redo, enabled = enabled, modifier = Modifier.height(36.dp).testTag("editor-note-redo"),
            shape = FantasiaShapes.round, border = BorderStroke(1.dp, FantasiaStrongLine), contentPadding = PaddingValues(horizontal = 16.dp)) {
            Text("Redo", style = FantasiaType.meta, color = if (enabled) FantasiaText else FantasiaDisabled)
        }
    }
}

private val EditorNoteGround = androidx.compose.ui.graphics.Color(0xFF211B14)
private val EditorNoteLine = androidx.compose.ui.graphics.Color(0xFF4A3A22)

@Composable private fun ReplyAction(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Box(Modifier.height(36.dp).clip(FantasiaShapes.round).clickable(enabled = enabled, role = Role.Button, onClick = onClick).padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center) {
        Text(label, style = FantasiaType.meta, color = if (enabled) FantasiaSecondary else FantasiaDisabled)
    }
}
