package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openfantasia.protocol.*
import java.util.Locale

private val BackstageGround = Color(0xFF100E13)
private val BackstageCard = Color(0xFF1C1823)
private val BackstageLine = Color(0xFF24202A)
private val BackstageDash = Color(0xFF4A4256)
private val FantasiaToldGround = Color(0xFF1B2537)
private val FantasiaSeenGround = Color(0xFF1A2B27)
private val FantasiaRumourGround = Color(0xFF30261A)

/** A screen outside the Scene: the back arrow and its name, as the Paths screen has. */
@Composable private fun OutsideHeader(title: String, back: () -> Unit, line: Color = FantasiaHeaderLine) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        IconButton(onClick = back, modifier = Modifier.size(44.dp).semantics { contentDescription = "Back to the Scene" }) {
            FantasiaIcon(FantasiaIconKind.Back, Modifier.size(22.dp))
        }
        Text(title, modifier = Modifier.weight(1f), style = FantasiaType.pathsTitle)
    }
    HorizontalDivider(color = line)
}

@Composable private fun Loading(modifier: Modifier) = Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

/** A small label in capitals, as the drawings' section heads are. */
@Composable private fun SectionLabel(text: String, modifier: Modifier = Modifier) =
    Text(text, modifier = modifier, style = FantasiaType.sectionLabel, color = FantasiaCaption)

/**
 * The Journal as drawn in Journal.dc.html (openspec outside-the-scene: The Journal reads the Story back): the Scenes
 * on this Path by day, each a card with its time, place, title and summary, the one the player is in lit; and what
 * he heard Meanwhile between them. Tapping an earlier Scene opens it in full; the Scene he is in goes back to it.
 */
@Composable fun JournalScreen(journal: JournalView?, back: () -> Unit, open: (Long) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier) {
        OutsideHeader("Journal", back)
        if (journal == null) Loading(Modifier.weight(1f))
        else LazyColumn(Modifier.weight(1f).testTag("journal"), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            for (day in journal.days) {
                item(key = "day-${day.day}-${day.rows.firstOrNull()?.scene?.number}") { SectionLabel(day.day.uppercase(Locale.ROOT)) }
                items(day.rows) { row ->
                    row.scene?.let { scene -> JournalSceneCard(scene) { open(scene.number) } }
                    row.meanwhile?.let { MeanwhileLine(it) }
                }
            }
        }
    }
}

@Composable private fun JournalSceneCard(scene: JournalScene, open: () -> Unit) {
    val shape = RoundedCornerShape(16.dp)
    Column(Modifier.fillMaxWidth().background(FantasiaSurface, shape).border(1.dp, if (scene.now) FantasiaAccent else FantasiaLine, shape)
        .clickable(role = Role.Button, onClickLabel = "Read this Scene", onClick = open).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(scene.label, style = FantasiaType.small, color = if (scene.now) FantasiaLabel else FantasiaCaption)
        Text(scene.title, style = FantasiaType.pathTitle, color = FantasiaText)
        if (scene.summary.isNotEmpty()) Text(scene.summary, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaSecondary)
    }
}

/** One thing he heard Meanwhile, marked as seen, told or rumour, as the Day View marks it. */
@Composable private fun MeanwhileLine(item: MeanwhileItem) {
    val (label, color, ground) = when (item.how) {
        How.Seen -> Triple("SEEN", FantasiaSeen, FantasiaSeenGround)
        How.Told -> Triple("TOLD", FantasiaTold, FantasiaToldGround)
        How.Rumour -> Triple("RUMOUR", FantasiaRumour, FantasiaRumourGround)
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(label, modifier = Modifier.width(58.dp).background(ground, RoundedCornerShape(8.dp)).padding(vertical = 3.dp),
            style = FantasiaType.meanwhileTag, color = color, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text(item.text, style = FantasiaType.meta.copy(lineHeight = 19.5.sp), color = FantasiaSecondary)
    }
}

/**
 * Backstage as drawn in Backstage.dc.html (openspec outside-the-scene: Backstage shows everything else, only when
 * visited): what the Player Character does not know. Off-screen one day at a time, the Threads and where each stands,
 * the Lives, what the Director is building toward, the Writer's plan for this Scene, and Taste, each lesson with a ✕.
 */
@Composable fun BackstageScreen(backstage: BackstageView?, playerCharacter: String, enabled: Boolean, back: () -> Unit,
    removeTaste: (String) -> Unit, modifier: Modifier = Modifier, reword: (String) -> Unit = {}, retryRecord: (Long) -> Unit = {}) {
    Column(modifier.background(BackstageGround)) {
        OutsideHeader("Backstage", back, BackstageLine)
        if (backstage == null) { Loading(Modifier.weight(1f)); return@Column }
        var day by remember(backstage.offscreen) { mutableStateOf(backstage.offscreen.firstOrNull()?.day) }
        LazyColumn(Modifier.weight(1f).testTag("backstage"), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp)) {
            item(key = "notice") {
                Text("Everything $playerCharacter doesn't know. Nothing here reaches the Scene, the Day View, the World or the Journal.",
                    style = FantasiaType.caption, color = FantasiaSecondary,
                    modifier = Modifier.fillMaxWidth().background(BackstageCard, RoundedCornerShape(14.dp)).drawBehind {
                        drawRoundRect(BackstageDash, cornerRadius = CornerRadius(14.dp.toPx()),
                            style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f))))
                    }.padding(horizontal = 14.dp, vertical = 12.dp))
            }
            if (backstage.record.isNotEmpty()) item(key = "record") { TheRecord(backstage.record, enabled, retryRecord) }
            if (backstage.offscreen.isNotEmpty()) item(key = "offscreen") {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SectionLabel("OFF-SCREEN", Modifier.weight(1f))
                        DayChip(backstage.offscreen.map { it.day }, day) { day = it }
                    }
                    backstage.offscreen.firstOrNull { it.day == day }?.items?.forEach { item ->
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(item.time, modifier = Modifier.width(64.dp), style = FantasiaType.meta, color = FantasiaCaption)
                            Text(item.what, style = FantasiaType.metadata.copy(lineHeight = 21.sp), color = FantasiaProse)
                        }
                    }
                }
            }
            if (backstage.threads.isNotEmpty()) item(key = "threads") {
                // Where each Thread stands, in the Weaver's words: the Mac keeps no measure of how far, so no bar.
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionLabel("THREADS")
                    backstage.threads.forEach { thread -> Named(thread.name, thread.now) }
                }
            }
            if (backstage.lives.isNotEmpty()) item(key = "lives") {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionLabel("LIVES")
                    backstage.lives.forEach { life -> Named(life.who, listOfNotNull(life.doing, life.where?.let { "In $it." }).joinToString(" ").ifEmpty { "Doing what they do." }) }
                }
            }
            backstage.director?.let { director -> item(key = "director") { DirectorCard(director) } }
            backstage.writer?.let { plan -> item(key = "writer") { WriterCard(plan) } }
            item(key = "taste") {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionLabel("TASTE · WHAT THE STORY HAS LEARNED")
                    if (backstage.taste.isEmpty()) Text("Nothing yet. A Redo you ask it to remember becomes a line here.", style = FantasiaType.meta, color = FantasiaCaption)
                    backstage.taste.forEach { lesson ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            // Tapping a lesson rewords it (editing-the-story design decision 6).
                            Text(lesson, modifier = Modifier.weight(1f).clickable(enabled = enabled, role = Role.Button, onClickLabel = "Reword this line") { reword(lesson) },
                                style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaText)
                            IconButton(onClick = { removeTaste(lesson) }, enabled = enabled, modifier = Modifier.size(40.dp).semantics { contentDescription = "Delete this line" }) {
                                FantasiaIcon(FantasiaIconKind.Dismiss, Modifier.size(14.dp), if (enabled) FantasiaCaption else FantasiaDisabled)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable private fun Named(name: String, line: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(name, style = FantasiaType.metadata.copy(fontWeight = FontWeight.SemiBold), color = FantasiaText)
        Text(line, style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaSecondary)
    }
}

/** The day Off-screen shows, with the other days a tap away. */
@Composable private fun DayChip(days: List<String>, day: String?, choose: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.height(36.dp), shape = FantasiaShapes.round,
            border = BorderStroke(1.dp, FantasiaStrongLine), contentPadding = PaddingValues(horizontal = 12.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = FantasiaText)) { Text(day ?: "", style = FantasiaType.meta) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = FantasiaRaised) {
            days.forEach { other -> DropdownMenuItem(text = { Text(other, style = FantasiaType.menuItem) }, onClick = { open = false; choose(other) }) }
        }
    }
}

/** The Writer's plan for this Scene: its call, what the Scene is for, its beats as they stand, and its way out. */
/**
 * The record, as Backstage.dc.html draws it (openspec outside-the-scene: Backstage shows everything else): each Scene
 * not yet recorded, and why, with Retry for one given up; and each recorded with parts left out, and which. Shown only
 * while something is missing.
 */
@Composable private fun TheRecord(rows: List<RecordRow>, enabled: Boolean, retry: (Long) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel("THE RECORD")
        for (row in rows) {
            val missing = row.state != RecordRowState.Recorded
            Column(Modifier.fillMaxWidth().background(if (missing) FantasiaFailureSurface else BackstageCard, RoundedCornerShape(14.dp))
                .border(1.dp, if (missing) FantasiaFailureLine else FantasiaLine, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Scene ${row.sceneNumber} · ${row.sceneTitle}", modifier = Modifier.weight(1f), style = FantasiaType.metadata.copy(fontWeight = FontWeight.SemiBold), color = FantasiaText)
                    if (row.state == RecordRowState.GivenUp) Surface(onClick = { retry(row.sceneNumber) }, enabled = enabled, shape = FantasiaShapes.round, color = FantasiaRaised,
                        modifier = Modifier.height(32.dp)) {
                        Box(Modifier.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                            Text("Retry", style = FantasiaType.meta, color = if (enabled) FantasiaText else FantasiaDisabled)
                        }
                    }
                }
                when (row.state) {
                    RecordRowState.GivenUp -> Text("Not recorded after three tries: ${row.reason ?: "it could not be made."}", style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaRumour)
                    RecordRowState.Waiting -> Text("Not recorded yet; it is tried again after the next Scene: ${row.reason ?: "it could not be made."}", style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaRumour)
                    RecordRowState.Recorded -> Text("Recorded, without ${if (row.dropped.size == 1) "one part" else "${row.dropped.size} parts"}: ${row.dropped.joinToString("; ")}",
                        style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaSecondary)
                }
                if (row.state != RecordRowState.Recorded && row.dropped.isNotEmpty())
                    Text("Left out before: ${row.dropped.joinToString("; ")}", style = FantasiaType.small, color = FantasiaSecondary)
            }
        }
        Text("Shown only while something is missing.", style = FantasiaType.small, color = FantasiaCaption)
    }
}

/**
 * What the Director is building toward, in one line, and the Stretch he planned (Backstage.dc.html: THE DIRECTOR): its
 * days, its Scenes that matter and whether each was played, and what each Lead does this week. His working stays in his call.
 */
@Composable private fun DirectorCard(director: DirectorLine) {
    Column(Modifier.fillMaxWidth().background(BackstageCard, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionLabel("THE DIRECTOR")
        Text(director.line, style = FantasiaType.metadata.copy(lineHeight = 21.sp), color = FantasiaProse)
        director.stretch?.let { stretch ->
            Text("This Stretch: ${stretch.fromLabel} to ${stretch.untilLabel}", style = FantasiaType.meta, color = FantasiaSecondary)
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                for (scene in stretch.scenes) {
                    val played = scene.state == StretchSceneState.Played
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(scene.time, modifier = Modifier.width(86.dp), style = FantasiaType.meta, color = FantasiaCaption)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("${scene.place}: ${scene.purpose}", style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = if (played) FantasiaCaption else FantasiaProse)
                            if (scene.who.isNotEmpty()) Text(scene.who.joinToString(" · "), style = FantasiaType.small, color = FantasiaCaption)
                        }
                        Text(when (scene.state) { StretchSceneState.Played -> "✓ played"; StretchSceneState.Passed -> "passed"; StretchSceneState.Ahead -> "ahead" },
                            style = FantasiaType.small, color = if (played) FantasiaSeen else FantasiaCaption)
                    }
                }
            }
            if (stretch.leads.isNotEmpty()) {
                Text("THE LEADS THIS WEEK", style = FantasiaType.sectionLabel.copy(fontSize = 11.sp), color = FantasiaCaption, modifier = Modifier.padding(top = 4.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (lead in stretch.leads) Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(buildAnnotatedString {
                            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(lead.who) }
                            append(" · ${lead.move}")
                        }, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaProse)
                        Text(lead.label, style = FantasiaType.small, color = FantasiaCaption)
                    }
                }
            }
        }
    }
}

@Composable private fun WriterCard(plan: WriterPlan) {
    Column(Modifier.fillMaxWidth().background(BackstageCard, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionLabel("THE WRITER · THIS SCENE", Modifier.weight(1f))
            plan.call?.let { call ->
                val (label, color) = when (call) {
                    SceneCall.Continue -> "GOING ON" to FantasiaSecondary
                    SceneCall.Land -> "LANDING" to FantasiaRumour
                    SceneCall.End -> "ENDING" to FailureAmber
                }
                Text(label, style = FantasiaType.meanwhileTag, color = color,
                    modifier = Modifier.background(FantasiaRumourGround, RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 2.dp))
            }
        }
        plan.purpose?.let { Text(it, style = FantasiaType.metadata.copy(lineHeight = 21.sp), color = FantasiaProse) }
        plan.beats.forEach { beat ->
            val (mark, markColor, textColor) = when (beat.status) {
                BeatStatus.Done -> Triple("✓", FantasiaCaption, FantasiaCaption)
                BeatStatus.InPlay -> Triple("●", FantasiaRumour, FantasiaText)
                BeatStatus.Pending -> Triple("○", FantasiaCaption, FantasiaSecondary)
                BeatStatus.Skipped -> Triple("–", FantasiaDisabled, FantasiaDisabled)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(mark, style = FantasiaType.meta, color = markColor)
                Text(beat.text, style = FantasiaType.meta, color = textColor)
            }
        }
        plan.exit?.let { exit ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("○", style = FantasiaType.meta, color = FantasiaCaption)
                Text("Out: $exit", style = FantasiaType.meta, color = FantasiaCaption)
            }
        }
    }
}
