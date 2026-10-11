package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.*

private val FantasiaOpenRow = Color(0xFF221D30)
private val FantasiaChosenEffort = Color(0xFF2B2245)

/** Which row of the Models screen is open: a Story's Actor, the Actor's second model, or a job for every Story. */
private sealed interface Opened {
    data class Actor(val storyID: String) : Opened
    data object ActorBackup : Opened
    data class Job(val job: ModelJob) : Opened
}

/**
 * The Models screen as drawn in Models.dc.html (openspec outside-the-scene: One Models screen): each Story's Actor,
 * then every job for every Story with what it does and its model, and, opened, the second model it tries when its
 * own fails. Tapping a row opens its picker in place; a pick is sent at once and the row shows it when the Mac answers.
 */
@Composable fun ModelsScreen(
    models: ModelsView?,
    enabled: Boolean,
    back: () -> Unit,
    setJob: (ModelJob, ModelChoice) -> Unit,
    setActor: (String, ModelChoice) -> Unit,
    modifier: Modifier = Modifier,
    setBackup: (ModelJob, ModelChoice) -> Unit = { _, _ -> }
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
                Section("THE ACTOR · EACH STORY ITS OWN") {
                    models.stories.forEachIndexed { index, story ->
                        if (index > 0) RowDivider()
                        val open = opened == Opened.Actor(story.storyID)
                        ModelRow(title = story.title, does = null, label = story.actor.label, open = open, chevron = true,
                            first = index == 0, last = false,
                            toggle = { opened = if (open) null else Opened.Actor(story.storyID) }) {
                            ModelPicker(models.providers, story.actor.choice, enabled, "${story.title}'s Actor") { setActor(story.storyID, it) }
                        }
                    }
                    // The Actor's second model, for every Story: tried once before any word of a Reply is written.
                    if (models.stories.isNotEmpty()) RowDivider()
                    val open = opened == Opened.ActorBackup
                    ModelRow(title = "If it fails, try", does = "For every Story's Actor", label = models.actorBackup.label, open = open, chevron = false,
                        first = models.stories.isEmpty(), last = true, toggle = { opened = if (open) null else Opened.ActorBackup }) {
                        BackupPicker(models.providers, models.actorBackup.choice, enabled, "The Actor's second model", labelled = false) { setBackup(ModelJob.Actor, it) }
                    }
                }
            }
            item(key = "jobs") {
                Section("EVERY STORY") {
                    models.jobs.forEachIndexed { index, job ->
                        if (index > 0) RowDivider()
                        val open = opened == Opened.Job(job.job)
                        ModelRow(title = job.title, does = job.does, label = job.model.label, open = open, chevron = false,
                            first = index == 0, last = index == models.jobs.lastIndex,
                            toggle = { opened = if (open) null else Opened.Job(job.job) }) {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                ModelPicker(models.providers, job.model.choice, enabled, "${job.title}'s model") { setJob(job.job, it) }
                                BackupPicker(models.providers, job.backup.choice, enabled, "${job.title}'s second model") { setBackup(job.job, it) }
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

/** One row: its name, what it does, and its model; open, it is lit and its picker shows beneath. */
@Composable private fun ModelRow(
    title: String, does: String?, label: String, open: Boolean, chevron: Boolean, first: Boolean, last: Boolean,
    toggle: () -> Unit, picker: @Composable () -> Unit
) {
    val shape = RoundedCornerShape(topStart = if (first) 16.dp else 0.dp, topEnd = if (first) 16.dp else 0.dp,
        bottomStart = if (last) 16.dp else 0.dp, bottomEnd = if (last) 16.dp else 0.dp)
    Column(Modifier.fillMaxWidth().then(if (open) Modifier.background(FantasiaOpenRow, shape) else Modifier)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).clickable(role = Role.Button, onClick = toggle)
            .semantics { stateDescription = if (open) "Open" else "Closed" }
            .padding(horizontal = 16.dp, vertical = if (open) 14.dp else 0.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, style = if (open && does != null) FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold) else FantasiaType.plain)
                does?.let { Text(it, style = FantasiaType.small, color = FantasiaCaption) }
            }
            Text(label, style = FantasiaType.metadata, color = if (open) FantasiaPressed else FantasiaSecondary)
            if (chevron) FantasiaIcon(FantasiaIconKind.ChevronRight, Modifier.size(16.dp), FantasiaCaption)
        }
        if (open) Box(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp)) { picker() }
    }
}

/**
 * Every model each provider offers, a chip each under the provider's name, then the efforts the chosen model supports.
 * A provider that could not be asked shows what it last offered, its chips off, and why. Choosing a model keeps the
 * effort when the new model has it, and takes the model's own default otherwise.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun ModelPicker(
    providers: List<ProviderModels>, current: ModelChoice?, enabled: Boolean, description: String,
    showEffort: Boolean = true, tag: String = "model-picker", pick: (ModelChoice) -> Unit
) {
    Column(Modifier.fillMaxWidth().testTag(tag).semantics { contentDescription = description },
        verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for ((index, provider) in providers.withIndex()) {
            Text(provider.label, style = FantasiaType.pathLabel, color = FantasiaCaption, modifier = Modifier.padding(top = if (index > 0) 4.dp else 0.dp))
            provider.reason?.takeIf { !provider.reachable }?.let { Text(it, style = FantasiaType.small, color = FailureAmber) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.selectableGroup()) {
                for (option in provider.models) {
                    val chosen = current?.provider == provider.provider && current.model == option.id
                    Chip(option.name, selected = chosen, enabled = enabled && provider.reachable, filled = true) {
                        val effort = current?.effort?.takeIf { it in option.efforts } ?: option.defaultEffort
                        pick(ModelChoice(provider = provider.provider, model = option.id, effort = effort))
                    }
                }
            }
        }
        val model = current?.let { choice -> providers.firstOrNull { it.provider == choice.provider }?.models?.firstOrNull { it.id == choice.model } }
        if (showEffort && current != null && model != null && model.efforts.isNotEmpty()) {
            Text("EFFORT", style = FantasiaType.pathLabel, color = FantasiaCaption, modifier = Modifier.padding(top = 4.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.selectableGroup()) {
                val reachable = providers.firstOrNull { it.provider == current.provider }?.reachable == true
                for (effort in model.efforts) {
                    Chip(effortName(effort), selected = current.effort == effort, enabled = enabled && reachable, filled = false) {
                        pick(current.copy(effort = effort))
                    }
                }
            }
        }
    }
}

/**
 * IF IT FAILS, TRY (Models.dc.html): the job's second model, tried once when its own fails or runs too long. One model
 * a provider, the chosen one in its provider's place, and More… for every model. A pick keeps the effort when the
 * new model has it, and takes the model's own default otherwise.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun BackupPicker(providers: List<ProviderModels>, current: ModelChoice, enabled: Boolean, description: String,
    labelled: Boolean = true, pick: (ModelChoice) -> Unit) {
    var more by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (labelled) Text("IF IT FAILS, TRY", style = FantasiaType.pathLabel, color = FantasiaCaption, modifier = Modifier.padding(top = 4.dp))
        if (more) ModelPicker(providers, current, enabled, description, showEffort = false, tag = "backup-picker", pick = pick)
        else FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.selectableGroup().testTag("backup-picker").semantics { contentDescription = description }) {
            for (provider in providers) {
                val option = provider.models.firstOrNull { provider.provider == current.provider && it.id == current.model } ?: provider.models.firstOrNull() ?: continue
                val chosen = provider.provider == current.provider && option.id == current.model
                Chip(option.name, selected = chosen, enabled = enabled && provider.reachable, filled = false) {
                    pick(ModelChoice(provider = provider.provider, model = option.id, effort = current.effort?.takeIf { it in option.efforts } ?: option.defaultEffort))
                }
            }
            Surface(onClick = { more = true }, shape = FantasiaShapes.round, color = Color.Transparent, border = BorderStroke(1.dp, FantasiaStrongLine),
                modifier = Modifier.height(34.dp)) {
                Box(Modifier.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) { Text("More…", style = FantasiaType.meta, color = FantasiaSecondary) }
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
 * Another model for one try (openspec presence: Nothing fails silently): the same picker in a sheet; choosing a
 * model retries on it at its default effort and changes no setting.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun AnotherModelSheet(title: String, models: ModelsView?, onDismiss: () -> Unit, pick: (ModelChoice) -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = FantasiaShapes.sheet, containerColor = FantasiaSurface, contentColor = FantasiaText,
        scrimColor = FantasiaScrim, dragHandle = null) {
        Column(Modifier.fillMaxWidth().testTag("another-model").padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Spacer(Modifier.align(Alignment.CenterHorizontally).size(width = 36.dp, height = 4.dp).background(FantasiaStrongLine, FantasiaShapes.round))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = FantasiaType.sheetTitle)
                Text("Just for this try. The Models screen keeps what every job uses.", style = FantasiaType.caption, color = FantasiaSecondary)
            }
            if (models == null) Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            else ModelPicker(models.providers, current = null, enabled = true, description = title, showEffort = false, pick = pick)
        }
    }
}
