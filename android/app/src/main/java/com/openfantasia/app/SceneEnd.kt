package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.*

/** The steps of a Scene's end in their order (docs/adr/0016). */
private val SCENE_END_ORDER = listOf(SceneEndStep.Chronicler, SceneEndStep.Director, SceneEndStep.Weaver, SceneEndStep.Folder)
private val StillToComeDot = Color(0xFF4A4554)
private val ReactedGround = Color(0xFF2B2342)

internal enum class StepState(val said: String) { Done("Done"), UnderWay("Under way"), ToCome("Still to come") }
internal data class SceneEndRow(val step: SceneEndStep, val state: StepState, val line: String)

/**
 * The rows MovingOn.dc.html draws for a Scene's end that is under way or stopped: each step done, the one under way
 * (or stopped), and those still to come. The Director reconsiders the Outline after every Scene, so his row is always
 * there; the Folder's shows only when it runs, at an Act's end. While the Director re-plans an Act deeply, his line
 * says so ("Rethinking Year One…").
 */
internal fun sceneEndRows(end: SceneEnd): List<SceneEndRow> {
    val at = end.failed?.step ?: end.step ?: return emptyList()
    val index = SCENE_END_ORDER.indexOf(at)
    return SCENE_END_ORDER.mapIndexedNotNull { place, step ->
        val state = when { place < index -> StepState.Done; place == index -> StepState.UnderWay; else -> StepState.ToCome }
        if (step == SceneEndStep.Folder && step != at) null
        else SceneEndRow(step, state, sceneEndStepLine(step, underWay = state != StepState.Done, rethinking = end.rethinking))
    }
}

/** A step as the Day View's line says it: done, or under way and still to come; the Director's while he rethinks an Act. */
internal fun sceneEndStepLine(step: SceneEndStep, underWay: Boolean, rethinking: String? = null): String = when (step) {
    SceneEndStep.Chronicler -> if (underWay) "Recording the Scene" else "The Scene is recorded"
    SceneEndStep.Director -> when {
        !underWay -> "The Outline is reconsidered"
        rethinking != null -> "Rethinking $rethinking…"
        else -> "The Director is reconsidering the Outline"
    }
    SceneEndStep.Weaver -> if (underWay) "The World moves on" else "The World has moved on"
    SceneEndStep.Folder -> if (underWay) "Folding The Story So Far" else "The Story So Far is folded"
}

/** "The <Agent> could not <its work>" (SceneEndFailed.dc.html). */
internal fun sceneEndFailureTitle(step: SceneEndStep): String = when (step) {
    SceneEndStep.Chronicler -> "The Chronicler could not record the Scene"
    SceneEndStep.Director -> "The Director could not reconsider the Outline"
    SceneEndStep.Weaver -> "The Weaver could not move the World on"
    SceneEndStep.Folder -> "The Folder could not fold The Story So Far"
}

/** What waits for the step that stopped: nothing after it runs without it (openspec presence: Nothing fails silently). */
private fun sceneEndWaits(step: SceneEndStep): String = when (step) {
    SceneEndStep.Chronicler -> "The World waits for the record."
    SceneEndStep.Director -> "The World waits for the Outline."
    SceneEndStep.Weaver -> "The Day View waits for the World."
    SceneEndStep.Folder -> "The Day View waits for The Story So Far."
}

private fun anotherModelFor(step: SceneEndStep): String = when (step) {
    SceneEndStep.Chronicler -> "Record the Scene with another model"
    SceneEndStep.Director -> "Reconsider the Outline with another model"
    SceneEndStep.Weaver -> "Move the World on with another model"
    SceneEndStep.Folder -> "Fold The Story So Far with another model"
}

/**
 * The Scene's end, a step a line (MovingOn.dc.html): ✓ for each done, a spinner for the one under way, a dot for
 * each still to come. Framed while it runs; when a step stopped, only the steps done, above the failure.
 */
@Composable internal fun SceneEndSteps(rows: List<SceneEndRow>, framed: Boolean) {
    val shape = RoundedCornerShape(14.dp)
    Column(Modifier.fillMaxWidth().testTag("scene-end")
        .then(if (framed) Modifier.background(FantasiaSurface, shape).padding(horizontal = 14.dp, vertical = 12.dp)
            else Modifier.padding(start = 14.dp, end = 14.dp, top = 12.dp)),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        for (row in rows) {
            val underWay = row.state == StepState.UnderWay
            Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {
                stateDescription = row.state.said
                if (underWay) liveRegion = LiveRegionMode.Polite
            }, horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                when (row.state) {
                    StepState.Done -> FantasiaIcon(FantasiaIconKind.Check, Modifier.size(18.dp), FantasiaSeen)
                    StepState.UnderWay -> Canvas(Modifier.size(18.dp)) {
                        drawArc(FantasiaLabel, -70f, 290f, false, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round))
                    }
                    StepState.ToCome -> Box(Modifier.size(18.dp), contentAlignment = Alignment.Center) {
                        Spacer(Modifier.size(6.dp).background(StillToComeDot, FantasiaShapes.round))
                    }
                }
                Text(row.line, style = FantasiaType.metadata,
                    color = when (row.state) { StepState.Done -> FantasiaCaption; StepState.UnderWay -> FantasiaProse; StepState.ToCome -> FantasiaDisabled })
            }
        }
    }
}

/**
 * A step that failed on its model and its second one (SceneEndFailed.dc.html): what could not be done, why, and what
 * waits for it, with Retry, which goes on from that step, and Another model, for that step's one try.
 */
@Composable internal fun SceneEndFailureContent(state: FantasiaState, failure: SceneEndFailure, retry: (ModelChoice?) -> Unit, loadModels: () -> Unit = {}) {
    StoryFailure(sceneEndFailureTitle(failure.step), listOf(failure.reason.trim(), sceneEndWaits(failure.step)).filter { it.isNotEmpty() }.joinToString(" "),
        failure.traceID.takeIf { it.isNotEmpty() }, retry,
        state.reachable && !state.loading && !state.sending && !state.waiting && state.problem?.needsUpdate != true,
        Modifier.testTag("scene-end-failure"), another = anotherModelFor(failure.step), models = state.models, loadModels = loadModels)
}

/** The Scene that just ended, with the player's reaction to it (MovingOn.dc.html; openspec long-run). */
@Composable internal fun EndedSceneCard(scene: SceneCard, span: String, reaction: Reaction?, enabled: Boolean, react: (Reaction?) -> Unit) {
    Surface(Modifier.fillMaxWidth(), shape = FantasiaShapes.card, color = FantasiaFolded, border = BorderStroke(1.dp, FantasiaRaised)) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("SCENE ${scene.number} · ENDED", style = FantasiaType.eyebrow, color = FantasiaCaption)
            Text(scene.title, style = FantasiaType.endedSceneTitle)
            Text("$span · ${scene.place}", style = FantasiaType.meta, color = FantasiaSecondary)
            Reactions(reaction, enabled, compact = false, react = react, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

/**
 * The Scene that just ended, in a line, once the Day View is ready (DayView.dc.html): the ended card's style, smaller,
 * so any Scene can still be reacted to.
 */
@Composable internal fun EndedSceneLine(scene: SceneCard, reaction: Reaction?, enabled: Boolean, react: (Reaction?) -> Unit) {
    Column(Modifier.fillMaxWidth().testTag("ended-scene").background(FantasiaFolded, RoundedCornerShape(14.dp))
        .border(1.dp, FantasiaRaised, RoundedCornerShape(14.dp)).padding(start = 14.dp, end = 14.dp, top = 10.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Scene ${scene.number} · ${scene.title}", style = FantasiaType.meta, color = FantasiaSecondary, maxLines = 1,
            overflow = TextOverflow.Ellipsis)
        Reactions(reaction, enabled, compact = true, react = react)
    }
}

/** More like this and Less like this: a tap gives one, a tap on the one given takes it back. */
@Composable private fun Reactions(reaction: Reaction?, enabled: Boolean, compact: Boolean, react: (Reaction?) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.semantics { contentDescription = "Your reaction" }, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for ((kind, label, icon) in listOf(Triple(Reaction.More, "More like this", FantasiaIconKind.More), Triple(Reaction.Less, "Less like this", FantasiaIconKind.Less))) {
            val pressed = reaction == kind
            ReactionChip(label, icon, pressed, enabled, compact) { react(if (pressed) null else kind) }
        }
    }
}

@Composable private fun ReactionChip(label: String, icon: FantasiaIconKind, pressed: Boolean, enabled: Boolean, compact: Boolean, toggle: () -> Unit) {
    val ink = when { !enabled -> FantasiaDisabled; pressed -> FantasiaPressed; else -> FantasiaSecondary }
    val type = if (compact) FantasiaType.small else FantasiaType.meta
    Row(Modifier.height(if (compact) 32.dp else 36.dp).clip(FantasiaShapes.round)
        .background(if (pressed) ReactedGround else Color.Transparent, FantasiaShapes.round)
        .border(1.dp, if (pressed) FantasiaAccent else FantasiaStrongLine, FantasiaShapes.round)
        .toggleable(value = pressed, enabled = enabled, role = Role.Checkbox) { toggle() }
        .padding(horizontal = if (compact) 12.dp else 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        FantasiaIcon(icon, Modifier.size(if (compact) 12.dp else 14.dp), ink)
        Text(label, style = if (pressed) type.copy(fontWeight = FontWeight.SemiBold) else type, color = ink)
    }
}
