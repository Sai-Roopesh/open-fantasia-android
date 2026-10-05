package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.*
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.style.TextAlign
import com.openfantasia.protocol.*

@Composable internal fun DayViewContent(day: DayView, scene: SceneCard, modifier: Modifier = Modifier, failure: @Composable () -> Unit = {},
    enabled: Boolean = true, go: (Happening) -> Unit = {}, picker: (DayPicker) -> Unit = {}, story: () -> Unit = {}) {
    Column(modifier.padding(top = 4.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(if (day.world == World.Ready) 22.dp else 18.dp)) {
        if (day.world != World.Ready) EndedSceneCard(scene, day.sceneSpan)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(day.day, style = if (day.world == World.Ready) FantasiaType.day else FantasiaType.movingDay)
            Text("${day.time} · you're in ${day.place}", style = FantasiaType.metadata, color = FantasiaSecondary)
        }
        if (day.world == World.MovingOn) {
            Surface(shape = FantasiaShapes.field, color = FantasiaSurface) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Canvas(Modifier.size(18.dp)) {
                        drawArc(FantasiaLabel, -70f, 290f, false, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round))
                    }
                    Text("Recording the Scene. The World is moving on.", style = FantasiaType.metadata,
                        color = FantasiaProse, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                }
            }
            WorldPlaceholders()
        }
        if (day.world == World.Failed) failure()
        if (day.world == World.Ready) BoxWithConstraints(Modifier.fillMaxWidth()) {
            // Keep both tiles the same measured width even when a viewport has an odd number of pixels.
            val tileWidth = with(LocalDensity.current) { ((maxWidth.toPx().toInt() - 10.dp.roundToPx()) / 2).toDp() }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // The Mac supplies the upcoming Landmarks in order; the first is the nearest.
                day.countdowns.chunked(2).forEachIndexed { rowIndex, row ->
                    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEachIndexed { columnIndex, countdown ->
                            Surface(Modifier.width(tileWidth).fillMaxHeight().testTag("countdown-${countdown.landmark}"), shape = FantasiaShapes.card,
                                color = FantasiaSurface, border = BorderStroke(1.dp, FantasiaLine)) {
                                Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(countdown.linkSchemaWhen, style = FantasiaType.countdown,
                                        color = if (rowIndex == 0 && columnIndex == 0) FailureAmber else FantasiaProse)
                                    Text("to ${countdown.landmark}", style = FantasiaType.countdownLabel, color = FantasiaSecondary)
                                }
                            }
                        }
                        if (row.size == 1) Spacer(Modifier.width(tileWidth))
                    }
                }
            }
        }
        if (day.world == World.Ready && day.meanwhile.isNotEmpty()) Meanwhile(day.meanwhile)
        if (day.world == World.Ready && day.happenings.isNotEmpty()) Today(day, enabled, go)
        if (day.world == World.Ready && (day.happenings.isNotEmpty() || day.choices.follow.isNotEmpty() ||
            day.choices.places.isNotEmpty() || day.choices.skips.isNotEmpty())) OtherChoices(day, enabled, picker, story)
    }
}

@Composable private fun Meanwhile(items: List<MeanwhileItem>) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("MEANWHILE", style = FantasiaType.sectionLabel, color = FantasiaCaption)
        items.forEach { item ->
            val (ink, tint) = when (item.how) {
                How.Seen -> FantasiaSeen to Color(0xFF163029)
                How.Told -> FantasiaTold to Color(0xFF1B2537)
                How.Rumour -> FantasiaRumour to Color(0xFF30261A)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                Text(item.how.value.uppercase(java.util.Locale.ROOT), style = FantasiaType.meanwhileTag, color = ink,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.width(58.dp).background(tint, RoundedCornerShape(8.dp)).semantics(mergeDescendants = true) { }.padding(vertical = 3.dp))
                Text(item.text, style = FantasiaType.detail, color = FantasiaProse, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable private fun EndedSceneCard(scene: SceneCard, span: String) {
    Surface(Modifier.fillMaxWidth(), shape = FantasiaShapes.card, color = FantasiaFolded,
        border = BorderStroke(1.dp, FantasiaRaised)) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("SCENE ${scene.number} · ENDED", style = FantasiaType.eyebrow, color = FantasiaCaption)
            Text(scene.title, style = FantasiaType.endedSceneTitle)
            Text("$span · ${scene.place}", style = FantasiaType.meta, color = FantasiaSecondary)
        }
    }
}

@Composable private fun WorldPlaceholders() {
    Column(Modifier.fillMaxWidth().testTag("world-placeholders").clearAndSetSemantics { },
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("MEANWHILE", style = FantasiaType.sectionLabel, color = FantasiaDisabled)
        listOf(.92f, .76f, .84f).forEach { width ->
            Spacer(Modifier.fillMaxWidth(width).height(14.dp).background(Color(0xFF211E28), RoundedCornerShape(7.dp)))
        }
        Text("WHAT'S ON TODAY", modifier = Modifier.padding(top = 14.dp), style = FantasiaType.sectionLabel, color = FantasiaDisabled)
        repeat(2) { Spacer(Modifier.fillMaxWidth().height(92.dp).background(FantasiaFolded, FantasiaShapes.card)) }
    }
}
