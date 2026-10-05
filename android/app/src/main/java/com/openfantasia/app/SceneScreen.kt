package com.openfantasia.app

import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.clickable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.TextLayoutResult
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
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.layout.onSizeChanged
import com.openfantasia.protocol.*
import java.util.Locale

internal fun firstName(name: String) = name.trim().substringBefore(' ')
internal val SceneView.replyComing: Boolean
    get() = turn.kind == TurnStateKind.Writing ||
        (turn.kind == TurnStateKind.Idle && exchanges.lastOrNull()?.let { it.move != null && it.reply == null } == true)

@Composable fun SceneScreen(
    scene: SceneView,
    portrait: (String) -> PortraitSource?,
    modifier: Modifier = Modifier,
    controlsEnabled: Boolean = true,
    focus: (String) -> Unit = {},
    redo: (String?, Boolean) -> Unit = { _, _ -> },
    storyTitle: String = scene.scene.title,
    back: () -> Unit = {},
    awaitingReply: Boolean = false,
    failure: @Composable () -> Unit = {}
) {
    val list = rememberLazyListState()
    var viewportSize by remember { mutableStateOf(IntSize.Zero) }
    var showRedo by rememberSaveable(scene.storyID) { mutableStateOf(false) }
    val clipboard = LocalContext.current.getSystemService(ClipboardManager::class.java)
    val density = LocalDensity.current
    val imeBottom = WindowInsets.ime.getBottom(density)
    val replyComing = scene.replyComing || awaitingReply
    val latestReply = scene.exchanges.lastOrNull { it.reply != null }?.reply
    Column(modifier) {
        SceneHeader(scene, storyTitle, back, scene.dayView == null && (replyComing || scene.turn.kind == TurnStateKind.Failed || imeBottom > 0))
        LazyColumn(state = list, modifier = Modifier.weight(1f).onSizeChanged { viewportSize = it }.testTag("scene-passages"),
            verticalArrangement = Arrangement.spacedBy(6.dp), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 8.dp)) {
            itemsIndexed(scene.earlierScenes, key = { _, scene -> "earlier-${scene.number}" }) { index, earlier ->
                Box(Modifier.padding(bottom = if (index == scene.earlierScenes.lastIndex) 8.dp else 0.dp)) { EarlierScene(earlier) }
            }
            item(key = "scene-title") {
                Box(Modifier.padding(bottom = 8.dp)) { SceneTitleCard(scene.scene, portrait, scene.focus, controlsEnabled && scene.dayView == null, focus) }
            }
            items(scene.exchanges, key = { it.move?.entryID ?: it.reply!!.entryID }) { exchange ->
                Column(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    exchange.move?.let { MovePassage(it, scene.playerCharacter) }
                    exchange.reply?.let { reply ->
                        Text(reply.text, modifier = Modifier.fillMaxWidth(), style = FantasiaType.prose, color = FantasiaProse)
                        if (reply == latestReply && !replyComing && scene.turn.kind != TurnStateKind.Failed) {
                            Row(Modifier.offset(x = (-8).dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                ReplyAction("Copy", onClick = { clipboard.setPrimaryClip(ClipData.newPlainText("Reply", reply.text)) })
                                if (scene.dayView?.closedBy != ClosedBy.Player && scene.exchanges.lastOrNull()?.let { it.move != null && it.reply != null } == true) {
                                    ReplyAction("Redo", enabled = controlsEnabled, onClick = { showRedo = true })
                                }
                            }
                        }
                    }
                }
            }
            scene.dayView?.let { day -> item(key = "day-view") {
                val height = with(density) { viewportSize.height.toDp() }
                DayViewContent(day, Modifier.fillMaxWidth().heightIn(min = (height - 22.dp).coerceAtLeast(0.dp)))
            } }
            if (replyComing) item(key = "reply-being-written") {
                Column(Modifier.padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Spacer(Modifier.size(6.dp).background(FantasiaLabel, FantasiaShapes.round))
                        Text("Reply being written", color = FantasiaCaption, style = FantasiaType.small)
                    }
                    ArrivingReply(scene.turn.textSoFar.orEmpty())
                }
            }
            if (scene.turn.kind == TurnStateKind.Failed) item(key = "reply-failure") { Box(Modifier.padding(bottom = 8.dp)) { failure() } }
            // Even a passage taller than the viewport must be able to scroll to its final line.
            item(key = "scene-end") { Spacer(Modifier.height(1.dp)) }
        }
    }
    if (showRedo) RedoSheet(onDismiss = { showRedo = false }, onRedo = { direction, remember ->
        showRedo = false
        redo(direction, remember)
    })
    LaunchedEffect(scene.storyID, scene.headEntryID, scene.exchanges, scene.turn.kind, replyComing, scene.turn.textSoFar, scene.dayView, imeBottom, viewportSize) {
        val endIndex = scene.earlierScenes.size + 1 + scene.exchanges.size + (if (replyComing) 1 else 0) +
            (if (scene.dayView != null) 1 else 0) + (if (scene.turn.kind == TurnStateKind.Failed) 1 else 0)
        withFrameNanos { }
        if (scene.dayView != null) list.scrollToItem(scene.earlierScenes.size + 1 + scene.exchanges.size)
        else list.scrollToItem(endIndex)
    }
}

@Composable private fun SceneHeader(scene: SceneView, storyTitle: String, back: () -> Unit, compact: Boolean) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        IconButton(onClick = back, modifier = Modifier.size(44.dp).semantics { contentDescription = "Stories" }) {
            FantasiaIcon(FantasiaIconKind.Back, Modifier.size(22.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(if (compact) scene.scene.title else storyTitle, modifier = Modifier.testTag("scene-header-title"), style = FantasiaType.header, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (compact) Text("Scene ${scene.scene.number} · ${scene.scene.atLabel}", modifier = Modifier.testTag("scene-header-time"), style = FantasiaType.small, color = FantasiaCaption)
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

@Composable private fun ArrivingReply(text: String) {
    var layout by remember(text) { mutableStateOf<TextLayoutResult?>(null) }
    Text(text, style = FantasiaType.prose, color = FantasiaProse, onTextLayout = { layout = it },
        modifier = Modifier.fillMaxWidth().testTag("reply-caret").drawWithContent {
            drawContent()
            layout?.let {
                val cursor = it.getCursorRect(text.length)
                val baseline = it.getLineBaseline(it.lineCount - 1)
                drawRect(FantasiaLabel, Offset((cursor.left + 2.dp.toPx()).coerceAtMost(size.width - 2.dp.toPx()), baseline - 15.dp.toPx()), Size(2.dp.toPx(), 18.dp.toPx()))
            }
        })
}

@Composable fun ReplyFailure(state: FantasiaState, retry: () -> Unit) {
    val turn = state.scene?.turn ?: return
    Surface(Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Assertive }, shape = FantasiaShapes.card,
        color = FantasiaFailureSurface, border = BorderStroke(1.dp, FantasiaFailureLine)) {
        Column(Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("The Reply could not be written", color = FailureAmber, style = FantasiaType.failureTitle)
            Text(turn.reason.orEmpty(), color = FantasiaProse, style = FantasiaType.detail)
            Button(onClick = retry, modifier = Modifier.padding(top = 2.dp).height(44.dp), shape = FantasiaShapes.round,
                contentPadding = PaddingValues(horizontal = 20.dp),
                enabled = state.reachable && !state.sending && !state.waiting && state.problem?.needsUpdate != true) {
                Text("Retry", style = FantasiaType.retryButton)
            }
            turn.traceID?.let { Text("Trace $it", color = FantasiaCaption, style = FantasiaType.small) }
        }
    }
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
            focus?.let { Text("Focus on ${firstName(it)} · tap a Portrait to change", color = FantasiaLabel, style = FantasiaType.small, modifier = Modifier.padding(top = 8.dp)) }
        }
    }
}

@Composable private fun EarlierScene(scene: SceneSummaryLine) {
    var expanded by rememberSaveable(scene.number) { mutableStateOf(false) }
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
        Surface(onClick = { expanded = !expanded }, modifier = Modifier.fillMaxWidth().testTag("earlier-${scene.number}"),
            shape = FantasiaShapes.folded, color = FantasiaFolded) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                Text("Scene ${scene.number} · ${scene.title}" + scene.summary.takeIf { it.isNotEmpty() }?.let { " · $it" }.orEmpty(),
                    maxLines = 1, overflow = TextOverflow.Ellipsis, color = FantasiaSecondary, style = FantasiaType.meta)
                if (expanded && scene.summary.isNotEmpty()) Text(scene.summary, style = FantasiaType.meta, color = FantasiaSecondary)
            }
        }
    }
}

@Composable private fun MovePassage(move: Passage, playerCharacter: String) {
    BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Surface(shape = FantasiaShapes.move, color = FantasiaRaised, modifier = Modifier.widthIn(max = maxWidth * .86f)) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(firstName(playerCharacter).uppercase(Locale.ROOT), color = FantasiaLabel, style = FantasiaType.player)
                Text(move.text, style = FantasiaType.body)
            }
        }
    }
}

@Composable private fun ReplyAction(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Box(Modifier.height(36.dp).clip(FantasiaShapes.round).clickable(enabled = enabled, role = Role.Button, onClick = onClick).padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center) {
        Text(label, style = FantasiaType.meta, color = if (enabled) FantasiaSecondary else FantasiaDisabled)
    }
}
