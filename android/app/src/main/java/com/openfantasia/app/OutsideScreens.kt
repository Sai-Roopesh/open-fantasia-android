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
import androidx.compose.ui.semantics.clearAndSetSemantics
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
 * visited): what the Player Character does not know. The player's brief, How it's going, The record, Off-screen one
 * day at a time, the Threads and where each stands, the Lives, what the Director is building toward and what each
 * Stretch brought, the Writer's plan for this Scene, and Taste, each lesson with a ✕.
 */
@Composable fun BackstageScreen(backstage: BackstageView?, playerCharacter: String, enabled: Boolean, back: () -> Unit,
    removeTaste: (String) -> Unit, modifier: Modifier = Modifier, reword: (String) -> Unit = {},
    brief: Brief = Brief(more = emptyList(), less = emptyList()), editBrief: () -> Unit = {}) {
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
            item(key = "brief") { YourBrief(brief, enabled, editBrief) }
            item(key = "how-its-going") { HowItsGoingSection(backstage.howItsGoing) }
            if (backstage.record.isNotEmpty()) item(key = "record") { TheRecord(backstage.record) }
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
            if (backstage.director != null || backstage.newThings.isNotEmpty()) item(key = "director") { DirectorCard(backstage.director, backstage.newThings) }
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

/**
 * The player's brief (Backstage.dc.html: YOUR BRIEF): what they want more of and less of, a thing to a line, with Edit,
 * which opens the sheet that sets it (openspec long-run: The player steers with a brief and reactions).
 */
@Composable private fun YourBrief(brief: Brief, enabled: Boolean, edit: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(BackstageCard, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 14.dp)
        .testTag("your-brief"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionLabel("YOUR BRIEF", Modifier.weight(1f))
            Surface(onClick = edit, enabled = enabled, shape = FantasiaShapes.round, color = FantasiaRaised, modifier = Modifier.height(32.dp)) {
                Box(Modifier.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                    Text("Edit", style = FantasiaType.meta, color = if (enabled) FantasiaText else FantasiaDisabled)
                }
            }
        }
        if (brief.more.isEmpty() && brief.less.isEmpty())
            Text("Nothing yet. Say what you want more of and less of, and the Director plans every Stretch from it.",
                style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaCaption)
        for ((label, color, lines) in listOf(Triple("MORE OF", FantasiaSeen, brief.more), Triple("LESS OF", FantasiaRumour, brief.less))) {
            if (lines.isEmpty()) continue
            Text(label, style = FantasiaType.meanwhileTag.copy(letterSpacing = .88.sp), color = color)
            lines.forEach { Text(it, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaProse) }
        }
    }
}

/**
 * How it's going (Backstage.dc.html: HOW IT'S GOING): how long a Scene's end takes lately, how often the player took
 * the Story's pick, the pace of the recent Scenes as bars, and in a line how often a job needed its second model or
 * failed on both, and the player's reactions (openspec outside-the-scene: How it's going).
 */
@Composable private fun HowItsGoingSection(going: HowItsGoing) {
    Column(Modifier.testTag("how-its-going"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel("HOW IT'S GOING")
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tile(going.sceneEndSeconds.takeIf { it.isNotEmpty() }?.let { sayDuration(it.average().toLong()) } ?: "–", "a Scene's end, lately")
            Tile("${going.picksTaken} of ${going.picksOffered}", "times you took the Story's pick")
        }
        if (going.pace.isNotEmpty()) {
            val said = "Pace of the last ${countWord(going.pace.size)} ${if (going.pace.size == 1) "Scene" else "Scenes"}"
            Row(Modifier.fillMaxWidth().height(56.dp).background(BackstageCard, RoundedCornerShape(14.dp)).border(1.dp, FantasiaLine, RoundedCornerShape(14.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp).testTag("pace")
                .clearAndSetSemantics { contentDescription = "$said: " + going.pace.joinToString("; ") { "Scene ${it.sceneNumber}, ${it.title}, ${it.intensity} of 5" } },
                horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
                for (row in going.pace) {
                    val intensity = row.intensity.coerceIn(1, 5).toInt()
                    Spacer(Modifier.weight(1f).fillMaxHeight(intensity / 5f).background(PACE[intensity - 1], RoundedCornerShape(3.dp)))
                }
            }
        }
        Text(howItsGoingLine(going), style = FantasiaType.caption, color = FantasiaSecondary)
    }
}

@Composable private fun RowScope.Tile(value: String, label: String) {
    Column(Modifier.weight(1f).fillMaxHeight().background(BackstageCard, RoundedCornerShape(14.dp)).border(1.dp, FantasiaLine, RoundedCornerShape(14.dp))
        .padding(horizontal = 14.dp, vertical = 12.dp).semantics(mergeDescendants = true) { }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(value, style = FantasiaType.countdown.copy(fontSize = 22.sp), color = FantasiaText)
        Text(label, style = FantasiaType.small.copy(lineHeight = 16.sp), color = FantasiaSecondary)
    }
}

/** The pace bars' colours, by intensity 1 to 5. */
private val PACE = listOf(Color(0xFF4A4256), Color(0xFF4A4256), Color(0xFF6E5BA6), Color(0xFF8E7AD6), FantasiaLabel)

/** "2 min 40", "40 sec". */
internal fun sayDuration(seconds: Long): String =
    if (seconds < 60) "$seconds sec" else "${seconds / 60} min" + (seconds % 60).takeIf { it > 0 }?.let { " %02d".format(it) }.orEmpty()

private fun countWord(count: Int) = listOf("no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten").getOrNull(count) ?: count.toString()
private fun times(count: Long) = when (count) { 1L -> "once"; 2L -> "twice"; else -> "$count times" }

/**
 * How it's going in words: "The Weaver needed its second model twice; nothing failed on both. You said more like this
 * to 3 Scenes, less to 1."
 */
internal fun howItsGoingLine(going: HowItsGoing): String {
    fun name(job: ModelJob) = "the " + job.value.replaceFirstChar(Char::uppercase)
    val second = going.jobs.filter { it.secondModel > 0 }
    val failed = going.jobs.filter { it.failed > 0 }
    val helped = if (second.isEmpty()) "No job needed its second model"
        else second.mapIndexed { index, job -> if (index == 0) "${name(job.job)} needed its second model ${times(job.secondModel)}" else "${name(job.job)} ${times(job.secondModel)}" }
            .joinToString(", ").replaceFirstChar(Char::uppercase)
    val both = if (failed.isEmpty()) "nothing failed on both" else failed.joinToString(", ") { "${name(it.job)} failed on both ${times(it.failed)}" }
    val reactions = if (going.more == 0L && going.less == 0L) "You have not said more or less like this to a Scene yet."
        else "You said more like this to ${going.more} ${if (going.more == 1L) "Scene" else "Scenes"}, less to ${going.less}."
    return "$helped; $both. $reactions"
}

/**
 * The record, as Backstage.dc.html draws it (living-world: One bad part does not lose the Scene): each Scene recorded
 * with parts left out, and which, and why. Shown only while there is one.
 */
@Composable private fun TheRecord(rows: List<RecordRow>) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel("THE RECORD")
        for (row in rows) {
            Column(Modifier.fillMaxWidth().background(BackstageCard, RoundedCornerShape(14.dp))
                .border(1.dp, FantasiaLine, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Scene ${row.sceneNumber} · ${row.sceneTitle}", style = FantasiaType.metadata.copy(fontWeight = FontWeight.SemiBold), color = FantasiaText)
                Text("Recorded without ${if (row.dropped.size == 1) "one part" else "${row.dropped.size} parts"}: ${row.dropped.joinToString("; ")}",
                    style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaSecondary)
            }
        }
        Text("Shown only for Scenes recorded with a part left out.", style = FantasiaType.small, color = FantasiaCaption)
    }
}

/**
 * What the Director is building toward, in one line, and the Stretch he planned (Backstage.dc.html: THE DIRECTOR): its
 * days, its Scenes that matter and whether each was played, what each Stretch brought that was new, and what each Lead
 * does this week. His working stays in his call.
 */
@Composable private fun DirectorCard(director: DirectorLine?, newThings: List<NewThingRow>) {
    Column(Modifier.fillMaxWidth().background(BackstageCard, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionLabel("THE DIRECTOR")
        director?.let { Text(it.line, style = FantasiaType.metadata.copy(lineHeight = 21.sp), color = FantasiaProse) }
        val stretch = director?.stretch
        if (stretch != null) {
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
        }
        NewThings(newThings)
        if (stretch != null && stretch.leads.isNotEmpty()) {
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

/**
 * What each Stretch brought that he had not met (Backstage.dc.html: NEW THIS STRETCH; openspec long-run: Something new
 * every Stretch), the newest Stretch first, each thing marked with its kind.
 */
@Composable private fun NewThings(rows: List<NewThingRow>) {
    for ((stretch, things) in rows.groupBy { it.stretch }) {
        Text(if (stretch == "This Stretch") "NEW THIS STRETCH" else "NEW IN ${stretch.uppercase(Locale.ROOT)}",
            style = FantasiaType.sectionLabel.copy(fontSize = 11.sp), color = FantasiaCaption, modifier = Modifier.padding(top = 4.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (thing in things) Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                val (ink, ground) = when (thing.kind.lowercase(Locale.ROOT)) {
                    "person" -> FantasiaPressed to Color(0xFF2B2342)
                    "place" -> FantasiaSeen to FantasiaSeenGround
                    else -> FantasiaRumour to FantasiaRumourGround
                }
                Text(thing.kind.uppercase(Locale.ROOT), style = FantasiaType.meanwhileTag, color = ink,
                    modifier = Modifier.background(ground, RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 2.dp))
                Text(thing.what, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaProse)
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
