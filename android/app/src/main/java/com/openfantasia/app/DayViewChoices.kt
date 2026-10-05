package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.*

// Compare the contract's Story time, not its display words (which may include Tomorrow or a weekday).
internal fun storyMinute(at: String): Long {
    val match = Regex("Day (\\d+) (\\d{2}):(\\d{2})").matchEntire(at) ?: error("Invalid Story time: $at")
    val (day, hour, minute) = match.destructured
    return day.toLong() * 1440 + hour.toLong() * 60 + minute.toLong()
}

internal data class DayChoice(val request: ChooseRequest, val at: String, val time: String, val destination: String, val action: String)
internal enum class DayPicker(val title: String) { Follow("Follow someone"), Somewhere("Go somewhere"), Skip("Skip to later") }

@Composable internal fun Today(day: DayView, enabled: Boolean, go: (Happening) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("WHAT'S ON TODAY", style = FantasiaType.sectionLabel, color = FantasiaCaption)
        day.happenings.forEach { happening ->
            Surface(Modifier.fillMaxWidth().testTag("happening-${happening.id}"), shape = FantasiaShapes.titleCard,
                color = FantasiaSurface, border = BorderStroke(1.dp, if (happening.pick) FantasiaAccent else FantasiaLine)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (happening.pick || happening.expected) Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (happening.pick) Text("The Story's pick", style = FantasiaType.pickLabel, color = FantasiaLabel)
                        if (happening.expected) Text("You're expected", style = FantasiaType.meanwhileTag, color = FailureAmber,
                            modifier = Modifier.background(Color(0xFF30261A), androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                                .padding(horizontal = 8.dp, vertical = 2.dp))
                    }
                    Text("${happening.time} · ${happening.place}", style = FantasiaType.metadata, color = FantasiaSecondary)
                    Text(happening.what, style = FantasiaType.happening, color = FantasiaText)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(happening.who.joinToString(" · "), style = FantasiaType.meta, color = FantasiaCaption, modifier = Modifier.weight(1f))
                        val modifier = Modifier.height(44.dp).testTag("go-${happening.id}")
                        if (happening.pick) Button(onClick = { go(happening) }, enabled = enabled, modifier = modifier,
                            shape = FantasiaShapes.round, contentPadding = PaddingValues(horizontal = 20.dp)) { Text("Go", style = FantasiaType.retryButton) }
                        else OutlinedButton(onClick = { go(happening) }, enabled = enabled, modifier = modifier,
                            shape = FantasiaShapes.round, border = BorderStroke(1.dp, FantasiaStrongLine),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = FantasiaText), contentPadding = PaddingValues(horizontal = 20.dp)) {
                            Text("Go", style = FantasiaType.metadata)
                        }
                    }
                }
            }
        }
    }
}

@Composable internal fun OtherChoices(day: DayView, enabled: Boolean, picker: (DayPicker) -> Unit, story: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("OR", style = FantasiaType.sectionLabel, color = FantasiaCaption)
        val actions = buildList<Pair<String, () -> Unit>> {
            add("Follow someone" to { picker(DayPicker.Follow) })
            if (day.choices.places.isNotEmpty()) add("Go somewhere" to { picker(DayPicker.Somewhere) })
            add("Skip to later" to { picker(DayPicker.Skip) })
            if (day.happenings.any { it.pick }) add("Let the Story choose" to story)
        }
        actions.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { (label, action) ->
                    val pick = label == "Let the Story choose"
                    OutlinedButton(onClick = action, enabled = enabled, modifier = Modifier.weight(1f).height(48.dp),
                        shape = FantasiaShapes.field, border = BorderStroke(1.dp, if (pick) FantasiaAccent else FantasiaStrongLine),
                        colors = ButtonDefaults.outlinedButtonColors(containerColor = if (pick) Color(0xFF211B33) else FantasiaFolded,
                            contentColor = if (pick) FantasiaPressed else FantasiaText), contentPadding = PaddingValues(horizontal = 4.dp)) {
                        Text(label, style = if (pick) FantasiaType.retryButton else FantasiaType.metadata)
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun DaySheet(tag: String, dismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    ModalBottomSheet(onDismissRequest = dismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = FantasiaShapes.sheet, containerColor = FantasiaSurface, contentColor = FantasiaText,
        scrimColor = FantasiaScrim, dragHandle = null) {
        Column(Modifier.fillMaxWidth().drawWithContent {
            drawContent()
            clipRect(bottom = 24.dp.toPx()) {
                drawOutline(FantasiaShapes.sheet.createOutline(size, layoutDirection, this), Color(0xFF34303D), style = Stroke(1.dp.toPx()))
            }
        }.testTag(tag).verticalScroll(rememberScrollState())
            .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Spacer(Modifier.align(Alignment.CenterHorizontally).size(width = 36.dp, height = 4.dp).background(FantasiaStrongLine, FantasiaShapes.round))
            content()
        }
    }
}

@Composable internal fun ChoiceSheet(day: DayView, picker: DayPicker, enabled: Boolean, dismiss: () -> Unit,
    choose: (String) -> Unit) {
    DaySheet("choice-sheet", dismiss) {
        Text(picker.title, style = FantasiaType.sheetTitle)
        val options = when (picker) {
            DayPicker.Follow -> day.choices.follow
            DayPicker.Somewhere -> day.choices.places
            DayPicker.Skip -> day.choices.skips.map { it.at }
        }
        options.forEach { option ->
            TextButton(onClick = { choose(option) }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                shape = FantasiaShapes.field, contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)) {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    val skip = day.choices.skips.firstOrNull { picker == DayPicker.Skip && it.at == option }
                    Text(skip?.label ?: option, style = FantasiaType.plain, color = FantasiaText)
                    skip?.let { Text(it.time, style = FantasiaType.metadata, color = FantasiaSecondary) }
                }
            }
        }
        TextButton(onClick = dismiss, modifier = Modifier.align(Alignment.End).height(48.dp)) { Text("Back", color = FantasiaSecondary) }
    }
}

@Composable internal fun GapSheet(day: DayView, player: String, choice: DayChoice, enabled: Boolean, problem: String?, dismiss: () -> Unit,
    go: (String?) -> Unit) {
    var text by remember { mutableStateOf("") }
    val name = firstName(player)
    val missed = day.happenings.filter { storyMinute(it.at) >= storyMinute(day.at) && storyMinute(it.at) < storyMinute(choice.at) }
    DaySheet("gap-sheet", dismiss) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("What did you do in the Gap?", style = FantasiaType.sheetTitle)
            Text("${day.time} – ${choice.time}, before ${choice.destination}", style = FantasiaType.metadata, color = FantasiaSecondary)
        }
        if (missed.isNotEmpty()) Surface(shape = FantasiaShapes.field, color = Color(0xFF211C17), border = BorderStroke(1.dp, Color(0xFF4A3A22))) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("GOES ON WITHOUT YOU", style = FantasiaType.gapLabel, color = FailureAmber)
                missed.forEach {
                    Text("${it.time} · ${it.place}." + if (it.expected) " You're expected." else "",
                        style = FantasiaType.gapHappening, color = FantasiaProse)
                }
            }
        }
        Box(Modifier.fillMaxWidth().background(FantasiaBackground, FantasiaShapes.field)
            .border(1.dp, FantasiaStrongLine, FantasiaShapes.field).padding(horizontal = 14.dp, vertical = 12.dp)) {
            if (text.isEmpty()) Text("I spent the morning in the library reading about life debts.", style = FantasiaType.direction, color = FantasiaCaption)
            BasicTextField(value = text, onValueChange = { text = it }, minLines = 4, maxLines = 6,
                textStyle = FantasiaType.direction.copy(color = FantasiaText), cursorBrush = SolidColor(FantasiaLabel),
                modifier = Modifier.fillMaxWidth().testTag("gap-text").semantics { contentDescription = "What $name did" })
        }
        Text("Left blank, $name spends it quietly in ${day.place.replaceFirst(Regex("^The "), "the ")}.", style = FantasiaType.caption, color = FantasiaCaption)
        problem?.let { Text(it, style = FantasiaType.small, color = FailureAmber, modifier = Modifier.testTag("gap-problem")) }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End)) {
            TextButton(onClick = dismiss, modifier = Modifier.height(48.dp), shape = FantasiaShapes.round,
                contentPadding = PaddingValues(horizontal = 20.dp)) { Text("Back", style = FantasiaType.plain, color = FantasiaSecondary) }
            Button(onClick = { go(text.takeIf { it.isNotBlank() }) }, enabled = enabled, modifier = Modifier.height(48.dp),
                shape = FantasiaShapes.round, contentPadding = PaddingValues(horizontal = 22.dp)) { Text(choice.action, style = FantasiaType.button) }
        }
    }
}
