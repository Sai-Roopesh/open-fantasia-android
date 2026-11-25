package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.ChosenModel
import com.openfantasia.protocol.ModelChoice
import com.openfantasia.protocol.ModelsView

@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun RedoSheet(storyID: String, models: ModelsView?, onDismiss: () -> Unit, onRedo: (String?, Boolean, ModelChoice?) -> Unit) {
    var direction by rememberSaveable { mutableStateOf("") }
    var remember by rememberSaveable { mutableStateOf(false) }
    var writtenBy by remember { mutableStateOf<ModelChoice?>(null) }
    var pickingModel by remember { mutableStateOf(false) }
    val actor = models?.stories?.firstOrNull { it.storyID == storyID }?.actor

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = FantasiaShapes.sheet, containerColor = FantasiaSurface, contentColor = FantasiaText,
        scrimColor = FantasiaScrim, dragHandle = null, sheetGesturesEnabled = false) {
        Column(Modifier.fillMaxWidth().testTag("redo-sheet").padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Spacer(Modifier.align(Alignment.CenterHorizontally).size(width = 36.dp, height = 4.dp).background(FantasiaStrongLine, FantasiaShapes.round))
            Text("Redo this Reply", style = FantasiaType.sheetTitle)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Direction (optional)", style = FantasiaType.fieldLabel, color = FantasiaSecondary)
                Box(Modifier.fillMaxWidth().background(FantasiaBackground, FantasiaShapes.field)
                    .border(1.dp, FantasiaAccent, FantasiaShapes.field).padding(horizontal = 15.dp, vertical = 13.dp)) {
                    if (direction.isEmpty()) Text("Steer this reply…", style = FantasiaType.direction, color = FantasiaCaption)
                    BasicTextField(value = direction, onValueChange = { direction = it },
                        minLines = 3, maxLines = 4, textStyle = FantasiaType.direction.copy(color = FantasiaText), cursorBrush = SolidColor(FantasiaLabel),
                        modifier = Modifier.fillMaxWidth().testTag("redo-direction").semantics { contentDescription = "Direction (optional)" })
                }
            }
            Row(
                Modifier.fillMaxWidth().toggleable(value = remember, enabled = direction.isNotBlank(), role = Role.Checkbox, onValueChange = { remember = it }).testTag("redo-remember"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Checkbox(checked = remember && direction.isNotBlank(), onCheckedChange = null, enabled = direction.isNotBlank())
                Column {
                    Text("Remember for future replies", style = FantasiaType.plain, color = if (direction.isNotBlank()) FantasiaText else FantasiaCaption)
                    Text("Off applies to this reply only.", style = FantasiaType.small, color = FantasiaCaption)
                }
            }
            WrittenBy(actor, models, writtenBy) { pickingModel = true }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End)) {
                TextButton(onClick = onDismiss, modifier = Modifier.height(48.dp), shape = FantasiaShapes.round,
                    contentPadding = PaddingValues(horizontal = 20.dp)) { Text("Cancel", style = FantasiaType.plain, color = FantasiaSecondary) }
                Button(onClick = { val clean = direction.takeIf { it.isNotBlank() }; onRedo(clean, clean != null && remember, writtenBy) },
                    modifier = Modifier.height(48.dp).testTag("confirm-redo"), shape = FantasiaShapes.round,
                    contentPadding = PaddingValues(horizontal = 24.dp)) { Text("Redo", style = FantasiaType.button) }
            }
        }
    }
    if (pickingModel) {
        val actorLabel = actor?.let { "Use Story's Actor (${it.label})" } ?: "Use Story's Actor"
        AnotherModelSheet(
            title = "Write this Reply with",
            models = models,
            current = writtenBy ?: actor?.choice,
            resetLabel = if (writtenBy != null) actorLabel else null,
            onReset = { writtenBy = null; pickingModel = false },
            onDismiss = { pickingModel = false }
        ) { choice ->
            val sameAsActor = actor?.choice?.let { it.provider == choice.provider && it.model == choice.model } == true
            writtenBy = if (sameAsActor) null else choice
            pickingModel = false
        }
    }
}

@Composable private fun WrittenBy(actor: ChosenModel?, models: ModelsView?, chosen: ModelChoice?, openPicker: () -> Unit) {
    val chosenName = chosen?.let { choice ->
        models?.providers?.firstOrNull { it.provider == choice.provider }?.models?.firstOrNull { it.id == choice.model }?.name ?: choice.model
    }
    val actorLine = actor?.let { "${it.label} · Story Actor" } ?: "Story Actor"
    val shown = chosenName?.let { "$it · this reply only" } ?: actorLine
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Written by", style = FantasiaType.fieldLabel, color = FantasiaSecondary)
        Surface(onClick = openPicker, shape = FantasiaShapes.field, color = FantasiaBackground,
            border = BorderStroke(1.dp, FantasiaStrongLine),
            modifier = Modifier.fillMaxWidth().height(48.dp).testTag("written-by").semantics { contentDescription = "Written by" }) {
            Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(shown, style = FantasiaType.plain, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                FantasiaIcon(FantasiaIconKind.ChevronRight, Modifier.size(14.dp), FantasiaSecondary)
            }
        }
    }
}

