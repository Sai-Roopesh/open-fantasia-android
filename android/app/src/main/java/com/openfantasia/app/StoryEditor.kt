package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.*
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** What the editor sends: one call on the model for each kind of edit. */
class StoryActions(
    val premise: (String) -> Unit = {},
    val style: (String) -> Unit = {},
    val world: (String, String) -> Unit = { _, _ -> },
    val clock: (String, String?) -> Unit = { _, _ -> },
    val arc: (Int?, String) -> Unit = { _, _ -> },
    val dropArc: (Int) -> Unit = {},
    val landmark: (String, Boolean, String, String) -> Unit = { _, _, _, _ -> },
    val dropLandmark: (String) -> Unit = {},
    val place: (String, Boolean, Boolean, String) -> Unit = { _, _, _, _ -> },
    val taste: (Scope, String, String) -> Unit = { _, _, _ -> },
    val brief: (List<String>, List<String>) -> Unit = { _, _ -> }
)

/**
 * The Story's editor, drawn in StoryEdit.dc.html (editing-the-story design decision 6): one sheet in the Redo sheet's
 * style, shaped by what it edits, with Save (or "Add to the Story" for something new) and Drop for an Arc or a
 * Landmark. A refusal shows in the sheet with what was written kept.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun StoryEditor(editing: StoryEditing, story: StoryView?, enabled: Boolean, actions: StoryActions, dismiss: () -> Unit) {
    val target = editing.target
    val key = target.toString()
    val landmark = (target as? StoryEdit.Landmark)?.name?.let { name -> story?.landmarks?.firstOrNull { it.name == name } }
    val place = (target as? StoryEdit.Place)?.let { edit -> edit.name?.let { name -> (if (edit.institution) story?.institutions else story?.places)?.firstOrNull { it.name == name } } }
    val arcIndex = (target as? StoryEdit.Arc)?.index
    val clockAt = if (target is StoryEdit.Clock) story?.clock?.at else landmark?.at
    var first by rememberSaveable(key) { mutableStateOf(when (target) {
        StoryEdit.Premise -> story?.premise.orEmpty()
        StoryEdit.Style -> story?.style.orEmpty()
        StoryEdit.World -> story?.worldSummary.orEmpty()
        is StoryEdit.Arc -> arcIndex?.let { story?.arcs?.getOrNull(it) }.orEmpty()
        is StoryEdit.Landmark -> landmark?.what.orEmpty()
        is StoryEdit.Place -> place?.description.orEmpty()
        is StoryEdit.Taste -> target.line
        is StoryEdit.Brief -> target.more.joinToString("\n")
        StoryEdit.Clock -> ""
    }) }
    var history by rememberSaveable(key) { mutableStateOf(story?.worldHistory.orEmpty()) }
    var less by rememberSaveable(key) { mutableStateOf((target as? StoryEdit.Brief)?.less?.joinToString("\n").orEmpty()) }
    var name by rememberSaveable(key) { mutableStateOf("") }
    var day by rememberSaveable(key) { mutableStateOf(clockAt?.let(::dayOf)?.toString() ?: story?.clock?.at?.let(::dayOf)?.plus(1)?.toString().orEmpty()) }
    var minute by rememberSaveable(key) { mutableIntStateOf(clockAt?.let(::minuteOf) ?: 10 * 60) }
    var dayOne by rememberSaveable(key) { mutableStateOf(story?.clock?.dayOne.orEmpty()) }
    var pickingTime by remember(key) { mutableStateOf(false) }
    val creating = when (target) {
        is StoryEdit.Arc -> target.index == null
        is StoryEdit.Landmark -> target.name == null
        is StoryEdit.Place -> target.name == null
        else -> false
    }
    val (title, caption) = when (target) {
        StoryEdit.Premise -> "The Premise" to "What the Story is for. From now on, on this Path."
        StoryEdit.Style -> "The Style" to "How the Story is written, in your own words. Everything that writes for it reads this."
        StoryEdit.World -> "The World" to "What the World is, and its history. From now on, on this Path."
        StoryEdit.Clock -> "Move the clock on" to "The clock only moves on. The World catches up over the time passed."
        is StoryEdit.Arc -> (if (creating) "A new Arc" else "An Arc") to "A journey the Story builds toward, with no fixed end. From now on, on this Path."
        is StoryEdit.Landmark -> (target.name ?: "A new Landmark") to "The World brings it about at its time, whether or not the Arcs are ready. From now on, on this Path."
        is StoryEdit.Place -> (target.name ?: if (target.institution) "A new institution" else "A new place") to "From now on, on this Path."
        is StoryEdit.Taste -> if (target.scope == Scope.Player) "A lesson of yours" to "A line of your own Taste: every Story you play reads it, this one and the next."
            else "A lesson" to "A line of this Story's Taste: the Story reads it in every Scene."
        is StoryEdit.Brief -> "Your brief" to "What you want more of and less of, one to a line. The Director plans every Stretch from it."
    }
    val at = day.trim().toIntOrNull()?.takeIf { it > 0 }?.let { "Day $it ${"%02d:%02d".format(minute / 60, minute % 60)}" }
    // Day 1's date: blank for no calendar; otherwise it has to be a date before the clock can be saved.
    val dayOneDate = dateOf(dayOne)
    val dayOneProblem = dayOne.isNotBlank() && dayOneDate == null
    val ready = !editing.saving && enabled && when (target) {
        StoryEdit.Clock -> at != null && !dayOneProblem
        is StoryEdit.Landmark -> at != null && first.isNotBlank() && (!creating || name.isNotBlank())
        is StoryEdit.Place -> first.isNotBlank() && (!creating || name.isNotBlank())
        StoryEdit.World, is StoryEdit.Brief -> true
        else -> first.isNotBlank()
    }
    val save = {
        when (target) {
            StoryEdit.Premise -> actions.premise(first.trim())
            StoryEdit.Style -> actions.style(first.trim())
            StoryEdit.World -> actions.world(first.trim(), history.trim())
            StoryEdit.Clock -> at?.let { actions.clock(it, dayOneDate?.toString()) }
            is StoryEdit.Arc -> actions.arc(target.index, first.trim())
            is StoryEdit.Landmark -> at?.let { actions.landmark(target.name ?: name.trim(), creating, it, first.trim()) }
            is StoryEdit.Place -> actions.place(target.name ?: name.trim(), target.institution, creating, first.trim())
            is StoryEdit.Taste -> actions.taste(target.scope, target.line, first.trim())
            is StoryEdit.Brief -> actions.brief(lines(first), lines(less))
        }
        Unit
    }

    ModalBottomSheet(onDismissRequest = dismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = FantasiaShapes.sheet, containerColor = FantasiaSurface, contentColor = FantasiaText,
        scrimColor = FantasiaScrim, dragHandle = null, sheetGesturesEnabled = false) {
        Column(Modifier.fillMaxWidth().testTag("story-editor").verticalScroll(rememberScrollState()).imePadding()
            .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Spacer(Modifier.align(Alignment.CenterHorizontally).size(width = 36.dp, height = 4.dp).background(FantasiaStrongLine, FantasiaShapes.round))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = FantasiaType.sheetTitle)
                Text(caption, style = FantasiaType.caption, color = FantasiaSecondary)
            }
            if (creating && (target is StoryEdit.Landmark || target is StoryEdit.Place)) SheetField("Name", name, "story-name") { name = it }
            if (target is StoryEdit.Landmark || target is StoryEdit.Clock) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Day", style = FantasiaType.fieldLabel, color = FantasiaSecondary)
                            BasicTextField(value = day, onValueChange = { typed -> day = typed.filter(Char::isDigit).take(5) }, singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), textStyle = FantasiaType.plain.copy(color = FantasiaText),
                                cursorBrush = SolidColor(FantasiaLabel), modifier = Modifier.height(48.dp).fillMaxWidth().testTag("story-day").semantics { contentDescription = "Day" }
                                    .background(FantasiaBackground, FantasiaShapes.field).border(1.dp, FantasiaAccent, FantasiaShapes.field).padding(horizontal = 14.dp),
                                decorationBox = { field -> Box(contentAlignment = Alignment.CenterStart) { field() } })
                        }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Time", style = FantasiaType.fieldLabel, color = FantasiaSecondary)
                            Surface(onClick = { pickingTime = true }, shape = FantasiaShapes.field, color = FantasiaBackground, border = BorderStroke(1.dp, FantasiaStrongLine),
                                modifier = Modifier.height(48.dp).fillMaxWidth().semantics { contentDescription = "Time" }) {
                                Box(Modifier.padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) { Text(sayMinute(minute), style = FantasiaType.plain) }
                            }
                        }
                    }
                    sayDay(day.toIntOrNull(), dayOneDate)?.let { Text(it, style = FantasiaType.meta, color = FantasiaCaption) }
                }
            }
            if (target is StoryEdit.Clock) DayOne(dayOne, dayOneDate) { dayOne = it }
            when (target) {
                StoryEdit.Clock -> {}
                StoryEdit.World -> {
                    SheetField("What the World is", first, "story-words", lines = 3) { first = it }
                    SheetField("Its history", history, "story-history", lines = 3) { history = it }
                }
                // Backstage.dc.html: two fields, a thing to a line (openspec long-run: A brief from the phone).
                is StoryEdit.Brief -> {
                    SheetField("More of", first, "brief-more", lines = 3) { first = it }
                    SheetField("Less of", less, "brief-less", lines = 3) { less = it }
                }
                else -> SheetField(when (target) {
                    is StoryEdit.Landmark -> "What happens"
                    is StoryEdit.Place -> "What it is"
                    is StoryEdit.Arc -> "The Arc"
                    is StoryEdit.Taste -> "The lesson"
                    else -> title
                }, first, "story-words", lines = 3) { first = it }
            }
            editing.problem?.let {
                Text(it, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = FantasiaType.caption, color = FailureAmber)
            }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                val drop: (() -> Unit)? = when (target) {
                    is StoryEdit.Arc -> target.index?.let { index -> { actions.dropArc(index) } }
                    is StoryEdit.Landmark -> target.name?.let { named -> { actions.dropLandmark(named) } }
                    else -> null
                }
                if (drop != null) TextButton(onClick = drop, enabled = enabled && !editing.saving, modifier = Modifier.height(48.dp), shape = FantasiaShapes.round) {
                    Text("Drop", style = FantasiaType.plain, color = if (enabled) FailureAmber else FantasiaDisabled)
                }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = dismiss, modifier = Modifier.height(48.dp), shape = FantasiaShapes.round,
                    contentPadding = PaddingValues(horizontal = 20.dp)) { Text("Cancel", style = FantasiaType.plain, color = FantasiaSecondary) }
                Button(onClick = save, enabled = ready, modifier = Modifier.height(48.dp).testTag("story-save"), shape = FantasiaShapes.round,
                    contentPadding = PaddingValues(horizontal = 24.dp)) {
                    Text(if (creating) "Add to the Story" else "Save", style = FantasiaType.button)
                }
            }
        }
    }
    if (pickingTime) {
        val picker = rememberTimePickerState(initialHour = minute / 60, initialMinute = minute % 60, is24Hour = false)
        AlertDialog(onDismissRequest = { pickingTime = false }, containerColor = FantasiaSurface,
            confirmButton = { TextButton(onClick = { minute = picker.hour * 60 + picker.minute; pickingTime = false }) { Text("Set", color = FantasiaLabel) } },
            dismissButton = { TextButton(onClick = { pickingTime = false }) { Text("Cancel", color = FantasiaSecondary) } },
            text = { TimePicker(state = picker) })
    }
}

@Composable private fun SheetField(label: String, value: String, tag: String, lines: Int = 1, change: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = FantasiaType.fieldLabel, color = FantasiaSecondary)
        BasicTextField(value = value, onValueChange = change, minLines = lines, maxLines = maxOf(lines, 10), textStyle = FantasiaType.direction.copy(color = FantasiaText),
            cursorBrush = SolidColor(FantasiaLabel), modifier = Modifier.fillMaxWidth().testTag(tag).semantics { contentDescription = label }
                .background(FantasiaBackground, FantasiaShapes.field).border(1.dp, FantasiaStrongLine, FantasiaShapes.field).padding(horizontal = 15.dp, vertical = 13.dp))
    }
}

/** Day 1's date, YYYY-MM-DD, said back in words; blank for a Story with no calendar, and a clear problem when it isn't a date. */
@Composable private fun DayOne(text: String, date: LocalDate?, change: (String) -> Unit) {
    val problem = text.isNotBlank() && date == null
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Day 1 was", style = FantasiaType.fieldLabel, color = FantasiaSecondary)
        BasicTextField(value = text, onValueChange = { typed -> change(typed.filter { it.isDigit() || it == '-' }.take(10)) }, singleLine = true,
            // The ordinary keyboard: not every number pad has a dash.
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii), textStyle = FantasiaType.plain.copy(color = FantasiaText),
            cursorBrush = SolidColor(FantasiaLabel), modifier = Modifier.height(48.dp).fillMaxWidth().testTag("story-day-one").semantics { contentDescription = "Day 1 was" }
                .background(FantasiaBackground, FantasiaShapes.field).border(1.dp, if (problem) FailureAmber else FantasiaStrongLine, FantasiaShapes.field).padding(horizontal = 14.dp),
            decorationBox = { field ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (text.isEmpty()) Text("YYYY-MM-DD", style = FantasiaType.plain, color = FantasiaCaption)
                    field()
                }
            })
        when {
            problem -> Text("Not a date. Write it as YYYY-MM-DD, such as 1991-09-01, or leave it blank.",
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = FantasiaType.caption, color = FailureAmber)
            date != null -> Text(sayDay(1, date).orEmpty(), style = FantasiaType.meta, color = FantasiaCaption)
            else -> Text("No calendar: the Story says its days by number.", style = FantasiaType.meta, color = FantasiaCaption)
        }
    }
}

/** A field's lines, each a thing, blank ones dropped. */
private fun lines(text: String): List<String> = text.lines().map(String::trim).filter(String::isNotEmpty)

/** The minute of the day in a Story time, "Day N HH:MM". */
internal fun minuteOf(at: String): Int? = Regex("""(\d{2}):(\d{2})$""").find(at)?.let { match -> match.groupValues[1].toInt() * 60 + match.groupValues[2].toInt() }

/** "10:00 am", as the Story says a time. */
internal fun sayMinute(minute: Int): String {
    val hour = minute / 60
    return "${if (hour % 12 == 0) 12 else hour % 12}:${"%02d".format(minute % 60)} ${if (hour < 12) "am" else "pm"}"
}

/** A date written YYYY-MM-DD, such as Day 1's, or null when [text] isn't one. */
internal fun dateOf(text: String): LocalDate? = runCatching { LocalDate.parse(text.trim()) }.getOrNull()

/** Day [day] as a date, "Monday 9 September 1991", when the Story's calendar has Day 1 on [dayOne]. */
internal fun sayDay(day: Int?, dayOne: LocalDate?): String? {
    if (day == null || day < 1 || dayOne == null) return null
    return dayOne.plusDays(day - 1L).format(DAY_AS_DATE)
}

private val DAY_AS_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d MMMM yyyy", Locale.ENGLISH)
