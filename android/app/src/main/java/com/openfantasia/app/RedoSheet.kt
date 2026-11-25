package com.openfantasia.app

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
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.ChosenModel
import com.openfantasia.protocol.ModelChoice
import com.openfantasia.protocol.ModelsView
import com.openfantasia.protocol.ProviderModels

@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun RedoSheet(storyID: String, models: ModelsView?, onDismiss: () -> Unit, onRedo: (String?, Boolean, ModelChoice?) -> Unit) {
    var direction by rememberSaveable { mutableStateOf("") }
    var remember by rememberSaveable { mutableStateOf(false) }
    // Null is the Story's own Actor; anything else is a model for just this Reply (openspec scenes: Redo on another model).
    var writtenBy by remember { mutableStateOf<ModelChoice?>(null) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = FantasiaShapes.sheet, containerColor = FantasiaSurface, contentColor = FantasiaText,
        scrimColor = FantasiaScrim, dragHandle = null, sheetGesturesEnabled = false) {
        Column(Modifier.fillMaxWidth().testTag("redo-sheet").padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Spacer(Modifier.align(Alignment.CenterHorizontally).size(width = 36.dp, height = 4.dp).background(FantasiaStrongLine, FantasiaShapes.round))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Redo this Reply", style = FantasiaType.sheetTitle)
                Text("A Direction steers the new Reply. It never appears in the Story.", style = FantasiaType.caption, color = FantasiaSecondary)
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Direction (optional)", style = FantasiaType.fieldLabel, color = FantasiaSecondary)
                BasicTextField(value = direction, onValueChange = { direction = it },
                    minLines = 3, maxLines = 4, textStyle = FantasiaType.direction.copy(color = FantasiaText), cursorBrush = SolidColor(FantasiaLabel),
                    modifier = Modifier.fillMaxWidth().testTag("redo-direction").semantics { contentDescription = "Direction (optional)" }
                        .background(FantasiaBackground, FantasiaShapes.field).border(1.dp, FantasiaAccent, FantasiaShapes.field)
                        .padding(horizontal = 15.dp, vertical = 13.dp))
            }
            Row(
                Modifier.fillMaxWidth().toggleable(value = remember, enabled = direction.isNotBlank(), role = Role.Checkbox, onValueChange = { remember = it }).testTag("redo-remember"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Checkbox(checked = remember && direction.isNotBlank(), onCheckedChange = null, enabled = direction.isNotBlank())
                Column {
                    Text("Remember for future replies", style = FantasiaType.plain, color = if (direction.isNotBlank()) FantasiaText else FantasiaCaption)
                    Text("Off applies only to this Redo. Saved Directions can be edited in Backstage.", style = FantasiaType.small, color = FantasiaCaption)
                }
            }
            WrittenBy(models?.stories?.firstOrNull { it.storyID == storyID }?.actor, models?.providers.orEmpty(), writtenBy) { writtenBy = it }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End)) {
                TextButton(onClick = onDismiss, modifier = Modifier.height(48.dp), shape = FantasiaShapes.round,
                    contentPadding = PaddingValues(horizontal = 20.dp)) { Text("Cancel", style = FantasiaType.plain, color = FantasiaSecondary) }
                Button(onClick = { val clean = direction.takeIf { it.isNotBlank() }; onRedo(clean, clean != null && remember, writtenBy) },
                    modifier = Modifier.height(48.dp).testTag("confirm-redo"), shape = FantasiaShapes.round,
                    contentPadding = PaddingValues(horizontal = 24.dp)) { Text("Redo", style = FantasiaType.button) }
            }
        }
    }
}

/**
 * "Written by", as drawn in Redo.dc.html: the Story's Actor first, then every other model a reachable provider offers,
 * each for just this Reply at its own default effort.
 */
@Composable private fun WrittenBy(actor: ChosenModel?, providers: List<ProviderModels>, chosen: ModelChoice?, choose: (ModelChoice?) -> Unit) {
    val others = providers.filter { it.reachable }.flatMap { provider ->
        provider.models.filterNot { actor?.choice?.provider == provider.provider && actor.choice.model == it.id }
            .map { ModelChoice(provider = provider.provider, model = it.id, effort = it.defaultEffort) to it.name }
    }
    val actorLine = actor?.let { "${it.label} · this Story's Actor" } ?: "This Story's Actor"
    val shown = chosen?.let { choice -> others.firstOrNull { it.first == choice }?.second?.let { "$it · just this Reply" } } ?: actorLine
    var open by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Written by", style = FantasiaType.fieldLabel, color = FantasiaSecondary)
        Box {
            Surface(onClick = { open = true }, shape = FantasiaShapes.field, color = FantasiaBackground,
                border = androidx.compose.foundation.BorderStroke(1.dp, FantasiaStrongLine),
                modifier = Modifier.fillMaxWidth().height(48.dp).testTag("written-by").semantics { contentDescription = "Written by" }) {
                Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(shown, style = FantasiaType.plain, modifier = Modifier.weight(1f))
                    FantasiaIcon(FantasiaIconKind.ChevronDown, Modifier.size(14.dp), FantasiaSecondary)
                }
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = FantasiaRaised) {
                DropdownMenuItem(text = { Text(actorLine, style = FantasiaType.menuItem) }, onClick = { choose(null); open = false })
                for ((choice, name) in others) {
                    DropdownMenuItem(text = { Text("$name · just this Reply", style = FantasiaType.menuItem) }, onClick = { choose(choice); open = false })
                }
            }
        }
    }
}

