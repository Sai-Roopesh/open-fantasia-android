package com.openfantasia.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openfantasia.protocol.*

/**
 * The Story as drawn in Story.dc.html (editing-the-story design decision 6): what the Story is built on, as it stands
 * on the current Path. The Premise, the Style with the reply length beside it, the Arcs, the Landmarks with when each
 * falls, what the World is, its places and institutions, and the time. Each opens the editor sheet; a Landmark that has
 * happened does not.
 */
@Composable fun StoryScreen(story: StoryView?, enabled: Boolean, back: () -> Unit, edit: (StoryEdit) -> Unit, setLength: (Length) -> Unit,
    modifier: Modifier = Modifier) {
    BackHandler(onBack = back)
    Column(modifier) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back, modifier = Modifier.size(44.dp).semantics { contentDescription = "Back to the Scene" }) {
                FantasiaIcon(FantasiaIconKind.Back, Modifier.size(22.dp))
            }
            Text("The Story", modifier = Modifier.weight(1f), style = FantasiaType.pathsTitle)
        }
        HorizontalDivider(color = FantasiaHeaderLine)
        if (story == null) { Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@Column }
        LazyColumn(Modifier.weight(1f).testTag("story-screen"), contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp)) {
            item(key = "title") {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(story.title, style = FantasiaType.homeTitle)
                    Text("Edits apply from now on, on this Path.", style = FantasiaType.meta, color = FantasiaCaption)
                }
            }
            item(key = "premise") { Words("PREMISE", story.premise, "Edit the Premise", enabled) { edit(StoryEdit.Premise) } }
            item(key = "style") {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Words("STYLE", story.style, "Edit the Style", enabled) { edit(StoryEdit.Style) }
                    ReplyLength(story.replyLength, enabled, setLength)
                }
            }
            item(key = "arcs") {
                Section("ARCS") {
                    StoryCard {
                        story.arcs.forEachIndexed { index, arc ->
                            if (index > 0) Line()
                            OpenRow(arc, null, enabled) { edit(StoryEdit.Arc(index)) }
                        }
                        if (story.arcs.isNotEmpty()) Line()
                        Add("Add an Arc", enabled) { edit(StoryEdit.Arc(null)) }
                    }
                }
            }
            item(key = "landmarks") {
                Section("LANDMARKS") {
                    StoryCard {
                        story.landmarks.forEachIndexed { index, landmark ->
                            if (index > 0) Line()
                            LandmarkRow(landmark, enabled) { edit(StoryEdit.Landmark(landmark.name)) }
                        }
                        if (story.landmarks.isNotEmpty()) Line()
                        Add("Add a Landmark", enabled) { edit(StoryEdit.Landmark(null)) }
                    }
                }
            }
            item(key = "world") {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Words("THE WORLD", story.worldSummary.ifBlank { "Nothing said yet." }, "Edit the World", enabled) { edit(StoryEdit.World) }
                    if (story.worldHistory.isNotBlank()) Text("History: ${story.worldHistory}", style = FantasiaType.caption, color = FantasiaSecondary)
                }
            }
            item(key = "places") { Places("PLACES", story.places, "Add a place", institution = false, enabled, edit) }
            item(key = "institutions") { Places("INSTITUTIONS", story.institutions, "Add an institution", institution = true, enabled, edit) }
            item(key = "time") {
                Section("THE TIME") {
                    Surface(shape = FantasiaShapes.card, color = FantasiaSurface, border = BorderStroke(1.dp, FantasiaLine)) {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(story.clock.atLabel, style = FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold))
                                // The clock's date from Day 1's date, or its day number when the Story has no calendar.
                                val day = dayOf(story.clock.at)
                                (sayDay(day, story.clock.dayOne?.let(::dateOf)) ?: day?.let { "Day $it" })?.let {
                                    Text(it, style = FantasiaType.meta, color = FantasiaCaption)
                                }
                            }
                            Surface(onClick = { edit(StoryEdit.Clock) }, enabled = enabled, shape = FantasiaShapes.round, color = FantasiaRaised) {
                                Text("Move the clock on", modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp), style = FantasiaType.metadata,
                                    color = if (enabled) FantasiaText else FantasiaDisabled)
                            }
                        }
                    }
                    Text("The clock only moves on. The World catches up over the time passed.", style = FantasiaType.small, color = FantasiaCaption)
                }
            }
        }
    }
}

/** The day number in a Story time, "Day N HH:MM". */
internal fun dayOf(at: String): Int? = Regex("""^Day (\d+) """).find(at)?.groupValues?.get(1)?.toIntOrNull()

@Composable private fun Section(label: String, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = FantasiaType.sectionLabel, color = FantasiaCaption)
        content()
    }
}

/** A label, the player's own words in Literata, and Edit. */
@Composable private fun Words(label: String, words: String, editLabel: String, enabled: Boolean, edit: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, modifier = Modifier.weight(1f), style = FantasiaType.sectionLabel, color = FantasiaCaption)
            TextButton(onClick = edit, enabled = enabled, modifier = Modifier.height(44.dp).semantics { contentDescription = editLabel },
                contentPadding = PaddingValues(horizontal = 4.dp)) {
                Text("Edit", style = FantasiaType.metadata, color = if (enabled) FantasiaLabel else FantasiaDisabled)
            }
        }
        Text(words, style = FantasiaType.previously, color = FantasiaProse)
    }
}

@Composable private fun ReplyLength(length: Length, enabled: Boolean, choose: (Length) -> Unit) {
    Row(Modifier.selectableGroup().padding(top = 6.dp).semantics { contentDescription = "Reply length" }, verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Reply length", modifier = Modifier.padding(end = 4.dp), style = FantasiaType.meta, color = FantasiaSecondary)
        for ((each, label) in listOf(Length.LengthShort to "Short", Length.Medium to "Medium", Length.Full to "Full")) {
            val chosen = each == length
            Surface(shape = FantasiaShapes.round, color = if (chosen) FantasiaAccent else FantasiaBackground,
                border = BorderStroke(1.dp, if (chosen) FantasiaAccent else FantasiaStrongLine),
                modifier = Modifier.height(36.dp).selectable(selected = chosen, enabled = enabled && !chosen, role = Role.RadioButton) { choose(each) }) {
                Box(Modifier.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                    Text(label, style = FantasiaType.meta.copy(fontWeight = if (chosen) FontWeight.SemiBold else FontWeight.Normal),
                        color = if (chosen) Color.White else FantasiaSecondary)
                }
            }
        }
    }
}

@Composable private fun StoryCard(content: @Composable ColumnScope.() -> Unit) =
    Surface(shape = FantasiaShapes.card, color = FantasiaSurface, border = BorderStroke(1.dp, FantasiaLine)) { Column(content = content) }

@Composable private fun Line() = HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = FantasiaLine)

/** A row that opens its editor: a name or an Arc's words, and what it is. */
@Composable private fun OpenRow(title: String, line: String?, enabled: Boolean, open: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(enabled = enabled, role = Role.Button, onClick = open).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = if (line == null) FantasiaType.plain.copy(lineHeight = 21.sp) else FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold))
            line?.let { Text(it, style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaSecondary) }
        }
        Text("›", style = FantasiaType.plain, color = FantasiaCaption)
    }
}

@Composable private fun LandmarkRow(landmark: StoryLandmark, enabled: Boolean, open: () -> Unit) {
    if (landmark.passed) {
        // It has happened on this Path, and stays as it was: shown, never opened.
        Column(Modifier.fillMaxWidth().alpha(.55f).padding(horizontal = 16.dp, vertical = 12.dp).semantics(mergeDescendants = true) {},
            verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(landmark.name, modifier = Modifier.weight(1f), style = FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold))
                Text("Happened", style = FantasiaType.small, color = FantasiaSeen)
            }
            Text(landmark.atLabel, style = FantasiaType.meta, color = FantasiaCaption)
        }
        return
    }
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled, role = Role.Button, onClick = open).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(landmark.name, style = FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold))
            Text(listOfNotNull(landmark.atLabel, landmark.storyLandmarkWhen).joinToString(" · "), style = FantasiaType.meta, color = FailureAmber)
            Text(landmark.what, style = FantasiaType.meta.copy(lineHeight = 19.sp), color = FantasiaSecondary)
        }
        Text("›", style = FantasiaType.plain, color = FantasiaCaption)
    }
}

@Composable private fun Places(label: String, places: List<StoryPlace>, addLabel: String, institution: Boolean, enabled: Boolean, edit: (StoryEdit) -> Unit) {
    Section(label) {
        StoryCard {
            places.forEachIndexed { index, place ->
                if (index > 0) Line()
                OpenRow(place.name, place.description, enabled) { edit(StoryEdit.Place(place.name, institution)) }
            }
            if (places.isNotEmpty()) Line()
            Add(addLabel, enabled) { edit(StoryEdit.Place(null, institution)) }
        }
    }
}

@Composable private fun Add(label: String, enabled: Boolean, add: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(enabled = enabled, role = Role.Button, onClick = add).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FantasiaIcon(FantasiaIconKind.Add, Modifier.size(16.dp), if (enabled) FantasiaLabel else FantasiaDisabled)
        Text(label, style = FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold), color = if (enabled) FantasiaLabel else FantasiaDisabled)
    }
}
