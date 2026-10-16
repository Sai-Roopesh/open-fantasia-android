package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openfantasia.protocol.*
import com.openfantasia.protocol.State as SetupState
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
 * visited): what the Player Character does not know. The player's brief, the Outline and the player's notes to the
 * Director, How it's going, The record, Off-screen one day at a time, the Threads, the Lives by tier, the Director's
 * Stretch, the Writer's plan for this Scene, what the Story keeps with where each item came from, and the Story's Taste
 * beside the player's own, each lesson with a ✕. The brief is on the Path ([enabled]); Taste and the notes live beside
 * the Story ([besideEnabled]).
 */
@Composable fun BackstageScreen(backstage: BackstageView?, playerCharacter: String, enabled: Boolean, back: () -> Unit,
    removeTaste: (Scope, String) -> Unit, modifier: Modifier = Modifier, reword: (Scope, String) -> Unit = { _, _ -> },
    brief: Brief = Brief(more = emptyList(), less = emptyList()), editBrief: () -> Unit = {}, besideEnabled: Boolean = enabled,
    note: String = "", writeNote: (String) -> Unit = {}, sendNote: () -> Unit = {}, deleteNote: (String) -> Unit = {}) {
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
            backstage.outline?.let { outline -> item(key = "outline") { OutlineCard(outline) } }
            item(key = "notes") { SteeringNotes(backstage.notes, note, besideEnabled, writeNote, sendNote, deleteNote) }
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
            backstage.livesByTier.takeIf { it.close.isNotEmpty() || it.movers.isNotEmpty() || it.others.isNotEmpty() }?.let { lives ->
                item(key = "lives") { Lives(lives) }
            }
            backstage.director?.let { director -> item(key = "director") { DirectorCard(director) } }
            backstage.writer?.let { plan -> item(key = "writer") { WriterCard(plan) } }
            backstage.truth.takeIf { it.people.isNotEmpty() || it.between.isNotEmpty() || it.truths.isNotEmpty() || it.rules.isNotEmpty() || it.names.isNotEmpty() }
                ?.let { truth -> item(key = "truth") { WhatTheStoryKeeps(truth) } }
            item(key = "taste") {
                Taste("TASTE · WHAT THE STORY HAS LEARNED", "Nothing yet. A Redo you ask it to remember becomes a line here.",
                    backstage.taste, besideEnabled, reword = { reword(Scope.Story, it) }, remove = { removeTaste(Scope.Story, it) })
            }
            item(key = "player-taste") {
                Taste("YOUR OWN TASTE · EVERY STORY", "Nothing yet. A lesson about how you like to read, learned in any Story, becomes a line here.",
                    backstage.playerTaste, besideEnabled, reword = { reword(Scope.Player, it) }, remove = { removeTaste(Scope.Player, it) },
                    modifier = Modifier.testTag("player-taste"))
            }
        }
    }
}

/** A Taste's lessons, each tapped to reword it (editing-the-story design decision 6) or deleted with its ✕. */
@Composable private fun Taste(title: String, empty: String, lessons: List<String>, enabled: Boolean, reword: (String) -> Unit, remove: (String) -> Unit,
    modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel(title)
        if (lessons.isEmpty()) Text(empty, style = FantasiaType.meta, color = FantasiaCaption)
        lessons.forEach { lesson ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(lesson, modifier = Modifier.weight(1f).clickable(enabled = enabled, role = Role.Button, onClickLabel = "Reword this line") { reword(lesson) },
                    style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaText)
                Dismiss("Delete this line", enabled) { remove(lesson) }
            }
        }
    }
}

@Composable private fun Dismiss(label: String, enabled: Boolean, onClick: () -> Unit) {
    IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(40.dp).semantics { contentDescription = label }) {
        FantasiaIcon(FantasiaIconKind.Dismiss, Modifier.size(14.dp), if (enabled) FantasiaCaption else FantasiaDisabled)
    }
}

@Composable private fun Named(name: String, line: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(name, style = FantasiaType.metadata.copy(fontWeight = FontWeight.SemiBold), color = FantasiaText)
        Text(line, style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaSecondary)
    }
}

/** A small label in capitals within a section, as the drawings' sub-heads are. */
@Composable private fun SubLabel(text: String) =
    Text(text, style = FantasiaType.sectionLabel.copy(fontSize = 11.sp), color = FantasiaCaption, modifier = Modifier.padding(top = 6.dp))

/** A word in a coloured chip: a setup's state, an Act's detail, a kind of truth or name. */
@Composable private fun Tag(text: String, ink: Color, ground: Color) =
    Text(text, style = FantasiaType.meanwhileTag, color = ink, modifier = Modifier.background(ground, RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 2.dp))

/** "**Who** · what", a line each, as the Leads and the Outline's people are written. */
@Composable private fun WhoLine(who: String, what: String) =
    Text(buildAnnotatedString {
        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(who) }
        append(" · $what")
    }, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaProse)

private val PurpleGround = Color(0xFF2B2342)

/**
 * The Outline (Backstage.dc.html: THE OUTLINE; openspec the-outline: The player sees and steers the Outline): the current
 * Act's question and what it builds to, its turns with the ones done ticked, where each relationship should stand by its
 * end, what each person pursues, who drives the World, every setup with its payoff, the Acts after it, how the Story
 * ends, what the Director looked up, and when he last revised it.
 */
@Composable private fun OutlineCard(outline: OutlineView) {
    Column(Modifier.fillMaxWidth().background(BackstageCard, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 14.dp)
        .testTag("outline"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionLabel("THE OUTLINE", Modifier.weight(1f))
            if (outline.revised.isNotEmpty()) Text("Revised ${outline.revised}", style = FantasiaType.small, color = FantasiaCaption)
        }
        outline.current?.let { act ->
            Text("ACT ${act.number} · NOW", style = FantasiaType.eyebrow, color = FantasiaLabel)
            Text(act.title, style = FantasiaType.endedSceneTitle.copy(fontSize = 19.sp), color = FantasiaText)
            Text(act.question, style = FantasiaType.prose.copy(fontSize = 15.sp, lineHeight = 22.5.sp), color = FantasiaProse)
            if (act.buildsTo.isNotEmpty()) Text("Builds to ${act.buildsTo.trimEnd('.')}.", style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaSecondary)
            if (act.turns.isNotEmpty()) {
                SubLabel("THE TURNS")
                val next = act.turns.indexOfFirst { !it.done }
                act.turns.forEachIndexed { index, turn ->
                    val (mark, markColor, textColor) = when {
                        turn.done -> Triple("✓", FantasiaSeen, FantasiaCaption)
                        index == next -> Triple("●", FantasiaRumour, FantasiaText)
                        else -> Triple("○", FantasiaCaption, FantasiaProse)
                    }
                    Row(Modifier.semantics(mergeDescendants = true) { stateDescription = if (turn.done) "Done" else "To come" },
                        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(mark, modifier = Modifier.width(14.dp), style = FantasiaType.meta, color = markColor)
                        Text(turn.linkSchemaWhen, modifier = Modifier.width(76.dp), style = FantasiaType.meta, color = FantasiaCaption)
                        Text(turn.what, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = textColor)
                    }
                }
            }
            if (act.relationships.isNotEmpty()) {
                SubLabel("BY THE END OF ${act.title.uppercase(Locale.ROOT)}")
                act.relationships.forEach { Named(it.people.joinToString(" & "), it.byEnd) }
            }
            if (act.intentions.isNotEmpty()) {
                SubLabel("WHAT EACH PURSUES")
                act.intentions.forEach { intention ->
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        WhoLine(intention.who, intention.pursues)
                        if (intention.heading.isNotEmpty()) Text("Heading: ${intention.heading}", style = FantasiaType.small, color = FantasiaCaption)
                    }
                }
            }
            if (act.movers.isNotEmpty()) {
                SubLabel("DRIVING THE WORLD")
                act.movers.forEach { WhoLine(it.who, it.doing) }
            }
        }
        if (outline.setups.isNotEmpty()) {
            SubLabel("SETUPS")
            outline.setups.forEach { setup ->
                val (label, ink, ground) = when (setup.state) {
                    SetupState.Waiting -> Triple("WAITING", FantasiaRumour, FantasiaRumourGround)
                    SetupState.Paid -> Triple("PAID", FantasiaSeen, FantasiaSeenGround)
                    SetupState.Dropped -> Triple("DROPPED", FantasiaCaption, FantasiaRaised)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                    Tag(label, ink, ground)
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(setup.what, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = if (setup.state == SetupState.Waiting) FantasiaProse else FantasiaCaption)
                        val payoff = when (setup.state) { SetupState.Waiting -> "pays off: "; SetupState.Paid -> "paid off: "; SetupState.Dropped -> "was to pay off: " } + setup.payoff
                        Text(listOfNotNull(setup.planted, payoff).joinToString(" · "), style = FantasiaType.small, color = FantasiaCaption)
                    }
                }
            }
        }
        if (outline.later.isNotEmpty()) {
            SubLabel("AFTER THIS")
            outline.later.forEach { act ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                    if (act.detail == Detail.Outlined) Tag("OUTLINED", FantasiaPressed, PurpleGround) else Tag("SKETCHED", FantasiaSecondary, FantasiaRaised)
                    Named(act.title, listOf(act.question, act.buildsTo.takeIf { it.isNotEmpty() }?.let { "Builds to ${it.trimEnd('.')}." })
                        .filterNotNull().filter { it.isNotEmpty() }.joinToString(" "))
                }
            }
        }
        if (outline.ending.isNotEmpty()) Text(buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = FantasiaProse)) { append("How it ends: ") }
            append(outline.ending)
        }, style = FantasiaType.meta.copy(lineHeight = 19.5.sp), color = FantasiaSecondary)
        if (outline.lookedUp.isNotEmpty()) {
            SubLabel("LOOKED UP")
            outline.lookedUp.forEach { Text(it, style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaSecondary) }
        }
    }
}

/**
 * The player's notes to the Director (Backstage.dc.html: YOUR NOTES TO THE DIRECTOR; openspec the-outline: The player
 * sees and steers the Outline): a field to write one, and each note with whether the Director has answered it yet.
 */
@Composable private fun SteeringNotes(notes: List<SteeringNote>, draft: String, enabled: Boolean, write: (String) -> Unit, send: () -> Unit, delete: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().background(BackstageCard, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 14.dp)
        .testTag("notes"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel("YOUR NOTES TO THE DIRECTOR")
        Text("A note is an order: the Director re-plans at the next Scene's end and follows it over his own reading of play.",
            style = FantasiaType.caption, color = FantasiaSecondary)
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BasicTextField(value = draft, onValueChange = write, minLines = 2, maxLines = 5, textStyle = FantasiaType.composer.copy(color = FantasiaText),
                cursorBrush = SolidColor(FantasiaLabel), modifier = Modifier.weight(1f).testTag("note-field").semantics { contentDescription = "Write a note" }
                    .background(FantasiaBackground, FantasiaShapes.field).border(1.dp, FantasiaStrongLine, FantasiaShapes.field),
                decorationBox = { field ->
                    Box(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                        if (draft.isEmpty()) Text("Write a note", style = FantasiaType.composer, color = FantasiaCaption)
                        field()
                    }
                })
            Button(onClick = send, enabled = enabled && draft.isNotBlank(), modifier = Modifier.height(44.dp).testTag("add-note"), shape = FantasiaShapes.round,
                contentPadding = PaddingValues(horizontal = 18.dp)) { Text("Add", style = FantasiaType.button) }
        }
        notes.forEach { note ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f).semantics(mergeDescendants = true) { }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(note.text, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaText)
                    if (note.answered) Text("✓ Answered", style = FantasiaType.small, color = FantasiaSeen)
                    else Text("Waiting for the next Scene's end", style = FantasiaType.small, color = FantasiaRumour)
                }
                Dismiss("Delete this note", enabled) { delete(note.id) }
            }
        }
    }
}

/**
 * The Lives by tier (Backstage.dc.html: LIVES; openspec living-world: Everyone has a Life): those close to the Story in
 * full, those who drive the World, and everyone else living their lives in a line.
 */
@Composable private fun Lives(lives: LivesByTier) {
    Column(Modifier.testTag("lives"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel("LIVES")
        for ((label, rows) in listOf("CLOSE TO THE STORY" to lives.close, "MOVING THE WORLD" to lives.movers)) {
            if (rows.isEmpty()) continue
            SubLabel(label)
            rows.forEach { life ->
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(life.who, style = FantasiaType.metadata.copy(fontWeight = FontWeight.SemiBold), color = FantasiaText)
                    if (life.now.isNotEmpty()) Text(life.now, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaProse)
                    listOfNotNull(life.wants.takeIf { it.isNotEmpty() }?.let { "Wants: $it" }, life.heading.takeIf { it.isNotEmpty() }?.let { "Heading: $it" })
                        .takeIf { it.isNotEmpty() }?.let { Text(it.joinToString(" · "), style = FantasiaType.small.copy(lineHeight = 17.sp), color = FantasiaCaption) }
                }
            }
        }
        if (lives.others.isNotEmpty()) Text("Also living their lives: ${lives.others.joinToString(", ")}.", style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaSecondary)
    }
}

/** Where something the Story keeps came from: "from Scene 8: “…”" (openspec the-truth: Nothing is deleted). */
internal fun sourceLine(source: SourceRow): String = "from ${source.sceneNumber?.let { "Scene $it" } ?: "the Story File"}: “${source.text}”"

@Composable private fun Sources(sources: List<SourceRow>) {
    sources.forEach { source ->
        val line = sourceLine(source)
        val words = line.indexOf('“')
        Text(buildAnnotatedString {
            append(line.substring(0, words))
            withStyle(SpanStyle(fontFamily = Literata, fontStyle = FontStyle.Italic, color = FantasiaSecondary)) { append(line.substring(words)) }
        }, style = FantasiaType.small.copy(lineHeight = 17.5.sp), color = FantasiaCaption)
    }
}

/**
 * What the Story keeps (Backstage.dc.html: WHAT THE STORY KEEPS; openspec the-truth): who each person is now, where
 * things stand between two people with their keepsakes, what is true now with its terms, deadline and who knows (an
 * item that ended kept, and said as ended), the Rules and the Names, each with where it came from.
 */
@Composable private fun WhatTheStoryKeeps(truth: TruthView) {
    Column(Modifier.testTag("truth"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionLabel("WHAT THE STORY KEEPS")
        if (truth.people.isNotEmpty()) {
            SubLabel("WHO THEY ARE NOW")
            truth.people.forEach { person ->
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(person.who, style = FantasiaType.metadata.copy(fontWeight = FontWeight.SemiBold), color = FantasiaText)
                    Text(person.now, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaProse)
                    Sources(person.sources)
                }
            }
        }
        if (truth.between.isNotEmpty()) {
            SubLabel("BETWEEN TWO PEOPLE")
            truth.between.forEach { between ->
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(between.people.joinToString(" & "), style = FantasiaType.metadata.copy(fontWeight = FontWeight.SemiBold), color = FantasiaText)
                    Text(between.stands, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaProse)
                    // Keepsakes in their own words, never faded (openspec the-truth: Where things stand between any two people is kept).
                    between.keepsakes.forEach { keepsake ->
                        Text("“$keepsake”", style = FantasiaType.prose.copy(fontSize = 14.sp, lineHeight = 21.sp), color = FantasiaSecondary,
                            modifier = Modifier.drawBehind { drawRect(BackstageDash, size = androidx.compose.ui.geometry.Size(2.dp.toPx(), size.height)) }.padding(start = 10.dp))
                    }
                    Sources(between.sources)
                }
            }
        }
        if (truth.truths.isNotEmpty()) {
            SubLabel("WHAT IS TRUE")
            truth.truths.forEach { item ->
                val ended = item.ended
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                    if (ended == null) Tag(item.kind.value.uppercase(Locale.ROOT), FantasiaPressed, PurpleGround)
                    else Tag(item.kind.value.uppercase(Locale.ROOT), FantasiaSecondary, FantasiaRaised)
                    Column(Modifier.testTag("truth-${item.what}"), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(item.what, style = FantasiaType.metadata.copy(fontWeight = FontWeight.SemiBold,
                            textDecoration = if (ended != null) TextDecoration.LineThrough else null), color = if (ended != null) FantasiaCaption else FantasiaText)
                        // Kept, never deleted: an item that ended says when (openspec the-truth: Nothing is deleted).
                        ended?.let { Text(it.replaceFirstChar(Char::uppercase), style = FantasiaType.small, color = FantasiaSecondary) }
                        item.terms.forEach { term -> Text("· $term", style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaProse) }
                        item.dueLabel?.let { Text(it, style = FantasiaType.small, color = FantasiaRumour) }
                        if (item.knownTo.isNotEmpty()) Text("Known to ${item.knownTo.joinToString(", ")}", style = FantasiaType.small, color = FantasiaCaption)
                        Sources(item.sources)
                    }
                }
            }
        }
        if (truth.rules.isNotEmpty()) {
            SubLabel("RULES")
            truth.rules.forEach { rule ->
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(rule.what, style = FantasiaType.metadata.copy(lineHeight = 20.sp), color = FantasiaProse)
                    Sources(rule.sources)
                }
            }
        }
        if (truth.names.isNotEmpty()) {
            SubLabel("NAMES")
            truth.names.forEach { name ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                    when (name.kind) {
                        NameKind.Place -> Tag("PLACE", FantasiaSeen, FantasiaSeenGround)
                        NameKind.Person -> Tag("PERSON", FantasiaPressed, PurpleGround)
                        NameKind.Thing -> Tag("THING", FantasiaRumour, FantasiaRumourGround)
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(name.name, style = FantasiaType.metadata.copy(fontWeight = FontWeight.SemiBold), color = FantasiaText)
                        if (name.what.isNotEmpty()) Text(name.what, style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaSecondary)
                        Text("First named in Scene ${name.firstScene}", style = FantasiaType.small, color = FantasiaCaption)
                    }
                }
            }
        }
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
 * How it's going (Backstage.dc.html: HOW IT'S GOING): how long a Scene's end and a Reply take lately, how often the
 * player took the Story's pick, how many Replies the Editor set right, the pace of the recent Scenes as bars, and in
 * words how often a job needed its second model or failed on both, the player's reactions, and what the Editor did
 * (openspec outside-the-scene: How it's going).
 */
@Composable private fun HowItsGoingSection(going: HowItsGoing) {
    Column(Modifier.testTag("how-its-going"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel("HOW IT'S GOING")
        val checked = going.jobs.firstOrNull { it.job == ModelJob.Editor }?.calls
        val setRight = going.editorFixed + going.editorRewrote
        for (row in listOf(
            listOf(going.sceneEndSeconds.lately() to "a Scene's end, lately", going.replySeconds.lately() to "a Reply, lately"),
            listOf("${going.picksTaken} of ${going.picksOffered}" to "times you took the Story's pick",
                (if (checked != null) "$setRight of $checked" else "$setRight") to "Replies the Editor set right"))) {
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { (value, label) -> Tile(value, label) }
            }
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
        Text(editorLine(going), style = FantasiaType.caption, color = FantasiaSecondary)
    }
}

/** The average of the latest durations, said as a duration, or a dash before there are any. */
private fun List<Long>.lately(): String = takeIf { it.isNotEmpty() }?.let { sayDuration(it.average().toLong()) } ?: "–"

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
 * What the Editor did, in words (docs/adr/0019): "The Editor set 4 Replies right in place and had 2 written again."
 */
internal fun editorLine(going: HowItsGoing): String {
    fun replies(count: Long) = if (count == 1L) "1 Reply" else "$count Replies"
    return when {
        going.editorFixed > 0 && going.editorRewrote > 0 -> "The Editor set ${replies(going.editorFixed)} right in place and had ${going.editorRewrote} written again."
        going.editorFixed > 0 -> "The Editor set ${replies(going.editorFixed)} right in place."
        going.editorRewrote > 0 -> "The Editor had ${replies(going.editorRewrote)} written again."
        else -> "The Editor has not had to set a Reply right."
    }
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
 * days, its Scenes that matter and whether each was played, and what each Lead does this week. His working stays in
 * his call.
 */
@Composable private fun DirectorCard(director: DirectorLine) {
    Column(Modifier.fillMaxWidth().background(BackstageCard, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionLabel("THE DIRECTOR")
        Text(director.line, style = FantasiaType.metadata.copy(lineHeight = 21.sp), color = FantasiaProse)
        val stretch = director.stretch
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

@Composable private fun WriterCard(plan: WriterPlan) {
    Column(Modifier.fillMaxWidth().background(BackstageCard, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionLabel("THE WRITER · THIS SCENE", Modifier.weight(1f))
            plan.call?.let { call ->
                val (label, color) = when (call) {
                    SceneCall.Continue -> "GOING ON" to FantasiaSecondary
                    SceneCall.Land -> "LANDING" to FantasiaRumour
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
