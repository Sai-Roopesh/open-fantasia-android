package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.*

private val FantasiaOpenRow = Color(0xFF221D30)
private val FantasiaChosenEffort = Color(0xFF2B2245)

/** Which row of the Models screen is open: a Story's Actor, the Actor's fallback, or a background job. */
private sealed interface Opened {
    data class Actor(val storyID: String) : Opened
    data object ActorBackup : Opened
    data class Job(val job: ModelJob) : Opened
}

@Composable fun ModelsScreen(
    models: ModelsView?,
    enabled: Boolean,
    back: () -> Unit,
    setJob: (ModelJob, ModelChoice) -> Unit,
    setActor: (String, ModelChoice) -> Unit,
    modifier: Modifier = Modifier,
    setBackup: (ModelJob, ModelChoice) -> Unit = { _, _ -> },
    setEditorEnabled: (Boolean) -> Unit = {}
) {
    var opened by remember { mutableStateOf<Opened?>(null) }
    Column(modifier) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            IconButton(onClick = back, modifier = Modifier.size(44.dp).semantics { contentDescription = "Back to Stories" }) {
                FantasiaIcon(FantasiaIconKind.Back, Modifier.size(22.dp))
            }
            Text("Models", modifier = Modifier.weight(1f), style = FantasiaType.pathsTitle)
        }
        HorizontalDivider(color = FantasiaHeaderLine)
        if (models == null) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }
        LazyColumn(Modifier.weight(1f).testTag("models"), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp)) {
            item(key = "actors") {
                Section("STORY ACTORS") {
                    models.stories.forEachIndexed { index, story ->
                        if (index > 0) RowDivider()
                        val open = opened == Opened.Actor(story.storyID)
                        ModelRow(title = story.title, does = null, label = story.actor.label, open = open,
                            first = index == 0, last = false,
                            toggle = { opened = if (open) null else Opened.Actor(story.storyID) }) {
                            ModelPicker(models.providers, story.actor.choice, enabled, "${story.title}'s Actor") { setActor(story.storyID, it) }
                        }
                    }
                    if (models.stories.isNotEmpty()) RowDivider()
                    val open = opened == Opened.ActorBackup
                    ModelRow(title = "Actor fallback", does = "Used if a story's Actor fails", label = models.actorBackup.label, open = open,
                        first = models.stories.isEmpty(), last = true, toggle = { opened = if (open) null else Opened.ActorBackup }) {
                        BackupPicker(models.providers, models.actorBackup.choice, models.actorBackup.label, enabled, "The Actor's fallback", collapsible = false) {
                            setBackup(ModelJob.Actor, it)
                        }
                    }
                }
            }
            item(key = "jobs") {
                Section("BACKGROUND JOBS") {
                    val editorOn = models.editEveryReply != false
                    models.jobs.forEachIndexed { index, job ->
                        if (index > 0) RowDivider()
                        val open = opened == Opened.Job(job.job)
                        val isEditor = job.job == ModelJob.Editor
                        val rowLabel = if (isEditor && !editorOn) "Off" else job.model.label
                        ModelRow(title = job.title, does = job.does, label = rowLabel, open = open, dimmed = isEditor && !editorOn,
                            first = index == 0, last = index == models.jobs.lastIndex,
                            toggle = { opened = if (open) null else Opened.Job(job.job) }) {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                if (isEditor) {
                                    Row(Modifier.fillMaxWidth().testTag("editor-toggle"), verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("Review every Reply", style = FantasiaType.plain)
                                            Text("Off by default for live streaming and lower token cost.", style = FantasiaType.small, color = FantasiaCaption)
                                        }
                                        Switch(checked = editorOn, onCheckedChange = setEditorEnabled, enabled = enabled)
                                    }
                                    if (editorOn) HorizontalDivider(color = FantasiaLine)
                                }
                                if (!isEditor || editorOn) {
                                    ModelPicker(models.providers, job.model.choice, enabled, "${job.title}'s model") { setJob(job.job, it) }
                                    HorizontalDivider(color = FantasiaLine)
                                    BackupPicker(models.providers, job.backup.choice, job.backup.label, enabled, "${job.title}'s fallback", collapsible = true) {
                                        setBackup(job.job, it)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable private fun Section(title: String, rows: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = FantasiaType.sectionLabel, color = FantasiaCaption)
        Surface(shape = FantasiaShapes.card, color = FantasiaSurface, border = BorderStroke(1.dp, FantasiaLine)) {
            Column(content = rows)
        }
    }
}

@Composable private fun RowDivider() {
    HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = FantasiaLine)
}

/** One row: its name, what it does, and a clean model pill; tapping expands its picker in place. */
@Composable private fun ModelRow(
    title: String, does: String?, label: String, open: Boolean, first: Boolean, last: Boolean,
    dimmed: Boolean = false, toggle: () -> Unit, picker: @Composable () -> Unit
) {
    val shape = RoundedCornerShape(topStart = if (first) 16.dp else 0.dp, topEnd = if (first) 16.dp else 0.dp,
        bottomStart = if (last) 16.dp else 0.dp, bottomEnd = if (last) 16.dp else 0.dp)
    Column(Modifier.fillMaxWidth().then(if (open) Modifier.background(FantasiaOpenRow, shape) else Modifier)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).clickable(role = Role.Button, onClick = toggle)
            .semantics { stateDescription = if (open) "Open" else "Closed" }
            .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, style = if (open) FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold) else FantasiaType.plain,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                does?.let { Text(it, style = FantasiaType.small, color = FantasiaCaption, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
            Surface(shape = FantasiaShapes.round, color = when { dimmed -> Color.Transparent; open -> FantasiaChosenEffort; else -> FantasiaRaised },
                border = BorderStroke(1.dp, when { dimmed -> FantasiaLine; open -> FantasiaAccent; else -> FantasiaLine })) {
                Text(label, style = FantasiaType.meta, color = when { dimmed -> FantasiaCaption; open -> FantasiaPressed; else -> FantasiaSecondary },
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 168.dp).padding(horizontal = 10.dp, vertical = 4.dp))
            }
            FantasiaIcon(if (open) FantasiaIconKind.ChevronDown else FantasiaIconKind.ChevronRight, Modifier.size(14.dp), FantasiaCaption)
        }
        if (open) Box(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp)) { picker() }
    }
}

/**
 * Provider-tabbed model picker: reachable providers first, effort pills right at the top (never buried under
 * dozens of models), and an instant search bar whenever a provider exposes more than 10 models.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun ModelPicker(
    providers: List<ProviderModels>, current: ModelChoice?, enabled: Boolean, description: String,
    showEffort: Boolean = true, tag: String = "model-picker", pick: (ModelChoice) -> Unit
) {
    val ordered = remember(providers) { providers.sortedByDescending { it.reachable } }
    var selectedProvider by remember(ordered) {
        mutableStateOf(
            ordered.firstOrNull { it.provider == current?.provider }?.provider
                ?: ordered.firstOrNull { it.reachable }?.provider
                ?: ordered.firstOrNull()?.provider
        )
    }
    var query by remember(selectedProvider) { mutableStateOf("") }
    val active = ordered.firstOrNull { it.provider == selectedProvider } ?: ordered.firstOrNull()
    val currentModel = current?.let { choice ->
        ordered.firstOrNull { it.provider == choice.provider }?.models?.firstOrNull { it.id == choice.model }
    }

    Column(Modifier.fillMaxWidth().testTag(tag).semantics { contentDescription = description },
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // Provider tabs
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth().selectableGroup()) {
            items(ordered, key = { it.provider.value }) { provider ->
                val chosen = provider.provider == active?.provider
                Surface(selected = chosen, onClick = { selectedProvider = provider.provider }, shape = FantasiaShapes.round,
                    color = if (chosen) FantasiaRaised else Color.Transparent,
                    border = BorderStroke(1.dp, if (chosen) FantasiaAccent else FantasiaLine),
                    modifier = Modifier.height(34.dp).semantics { role = Role.Tab }) {
                    Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Spacer(Modifier.size(6.dp).background(if (provider.reachable) FantasiaSeen else FantasiaDisabled, FantasiaShapes.round))
                        Text(provider.label, style = if (chosen) FantasiaType.meta.copy(fontWeight = FontWeight.SemiBold) else FantasiaType.meta,
                            color = when { chosen -> FantasiaText; provider.reachable -> FantasiaSecondary; else -> FantasiaDisabled })
                    }
                }
            }
        }

        // Effort pills live at the top so tweaking effort never requires scrolling past a large model list.
        if (showEffort && current != null && currentModel != null && currentModel.efforts.isNotEmpty()) {
            val currentReachable = ordered.firstOrNull { it.provider == current.provider }?.reachable == true
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("EFFORT", style = FantasiaType.pathLabel, color = FantasiaCaption)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.selectableGroup()) {
                    for (effort in currentModel.efforts) {
                        Chip(effortName(effort), selected = current.effort == effort, enabled = enabled && currentReachable, filled = false) {
                            pick(current.copy(effort = effort))
                        }
                    }
                }
            }
        }

        if (active != null) {
            active.reason?.takeIf { !active.reachable }?.let {
                Text(it, style = FantasiaType.small, color = FailureAmber)
            }
            if (active.models.size > 10) {
                Row(Modifier.fillMaxWidth().background(FantasiaBackground, FantasiaShapes.field)
                    .border(1.dp, FantasiaLine, FantasiaShapes.field).padding(horizontal = 12.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f)) {
                        if (query.isEmpty()) Text("Filter ${active.models.size} models…", style = FantasiaType.meta, color = FantasiaCaption)
                        BasicTextField(value = query, onValueChange = { query = it }, singleLine = true,
                            textStyle = FantasiaType.meta.copy(color = FantasiaText), cursorBrush = SolidColor(FantasiaLabel),
                            modifier = Modifier.fillMaxWidth().testTag("model-search"))
                    }
                    if (query.isNotEmpty()) {
                        Box(Modifier.clickable(role = Role.Button) { query = "" }.padding(2.dp)) {
                            FantasiaIcon(FantasiaIconKind.Dismiss, Modifier.size(14.dp), FantasiaCaption)
                        }
                    }
                }
            }
            val needle = query.trim().lowercase()
            val shown = if (needle.isEmpty()) active.models else active.models.filter {
                it.name.lowercase().contains(needle) || it.id.lowercase().contains(needle)
            }
            if (shown.isEmpty()) {
                Text("No matching models.", style = FantasiaType.small, color = FantasiaCaption)
            } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.selectableGroup()) {
                    for (option in shown) {
                        val chosen = current?.provider == active.provider && current.model == option.id
                        Chip(option.name, selected = chosen, enabled = enabled && active.reachable, filled = true) {
                            val effort = current?.effort?.takeIf { it in option.efforts } ?: option.defaultEffort
                            pick(ModelChoice(provider = active.provider, model = option.id, effort = effort))
                        }
                    }
                }
            }
        }
    }
}

/**
 * Fallback model tried once if the primary model fails. Collapsed to a crisp single line inside job rows so the
 * primary picker stays focused; expanded, offers one quick pick per provider plus "More…" for the full picker.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun BackupPicker(
    providers: List<ProviderModels>, current: ModelChoice, currentLabel: String, enabled: Boolean,
    description: String, collapsible: Boolean = true, pick: (ModelChoice) -> Unit
) {
    var expanded by remember { mutableStateOf(!collapsible) }
    var more by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (collapsible) {
            Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { expanded = !expanded }.padding(vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Fallback", style = FantasiaType.small, color = FantasiaCaption)
                Text(currentLabel, style = FantasiaType.meta, color = FantasiaSecondary, modifier = Modifier.weight(1f),
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (expanded) "Hide" else "Change", style = FantasiaType.small, color = FantasiaLabel)
            }
        }
        if (expanded) {
            if (more) {
                ModelPicker(providers, current, enabled, description, showEffort = false, tag = "backup-picker", pick = pick)
            } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.selectableGroup().testTag("backup-picker").semantics { contentDescription = description }) {
                    for (provider in providers.sortedByDescending { it.reachable }) {
                        val option = provider.models.firstOrNull { provider.provider == current.provider && it.id == current.model }
                            ?: provider.models.firstOrNull() ?: continue
                        val chosen = provider.provider == current.provider && option.id == current.model
                        Chip(option.name, selected = chosen, enabled = enabled && provider.reachable, filled = false) {
                            pick(ModelChoice(provider = provider.provider, model = option.id,
                                effort = current.effort?.takeIf { it in option.efforts } ?: option.defaultEffort))
                        }
                    }
                    Surface(onClick = { more = true }, shape = FantasiaShapes.round, color = Color.Transparent,
                        border = BorderStroke(1.dp, FantasiaStrongLine), modifier = Modifier.height(34.dp)) {
                        Box(Modifier.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                            Text("More…", style = FantasiaType.meta, color = FantasiaSecondary)
                        }
                    }
                }
            }
        }
    }
}

/** As the screen says an effort: "Low", "Extra high". */
internal fun effortName(effort: String) = when (effort) {
    "xhigh" -> "Extra high"
    else -> effort.replaceFirstChar { it.uppercase() }
}

/** A round choice: a model chip is filled when chosen, an effort chip is outlined in the accent. */
@Composable private fun Chip(text: String, selected: Boolean, enabled: Boolean, filled: Boolean, onClick: () -> Unit) {
    val background = when { !selected -> Color.Transparent; filled -> FantasiaAccent; else -> FantasiaChosenEffort }
    val content = when { !enabled -> FantasiaDisabled; selected && filled -> Color.White; selected -> FantasiaPressed; else -> FantasiaText }
    Surface(selected = selected, onClick = onClick, enabled = enabled, shape = FantasiaShapes.round, color = background,
        border = BorderStroke(1.dp, if (selected) FantasiaAccent else FantasiaStrongLine),
        modifier = Modifier.height(34.dp).semantics { role = Role.RadioButton }) {
        Box(Modifier.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
            Text(text, style = if (selected && filled) FantasiaType.meta.copy(fontWeight = FontWeight.SemiBold) else FantasiaType.meta, color = content)
        }
    }
}

/**
 * Pick another model for a single Reply or retry: uses the same provider-tabbed, searchable picker inside a
 * scrollable bottom sheet so large provider catalogs never clip off-screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun AnotherModelSheet(
    title: String, models: ModelsView?, onDismiss: () -> Unit,
    current: ModelChoice? = null, resetLabel: String? = null, onReset: (() -> Unit)? = null,
    pick: (ModelChoice) -> Unit
) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = FantasiaShapes.sheet, containerColor = FantasiaSurface, contentColor = FantasiaText,
        scrimColor = FantasiaScrim, dragHandle = null) {
        Column(Modifier.fillMaxWidth().testTag("another-model").verticalScroll(rememberScrollState())
            .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Spacer(Modifier.align(Alignment.CenterHorizontally).size(width = 36.dp, height = 4.dp).background(FantasiaStrongLine, FantasiaShapes.round))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = FantasiaType.sheetTitle)
                Text("For this try only.", style = FantasiaType.caption, color = FantasiaSecondary)
            }
            if (resetLabel != null && onReset != null) {
                OutlinedButton(onClick = onReset, shape = FantasiaShapes.round, border = BorderStroke(1.dp, FantasiaStrongLine),
                    modifier = Modifier.fillMaxWidth().height(42.dp)) {
                    Text(resetLabel, style = FantasiaType.meta, color = FantasiaText)
                }
            }
            if (models == null) Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            else ModelPicker(models.providers, current = current, enabled = true, description = title, showEffort = false, pick = pick)
        }
    }
}
