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

@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun RedoSheet(onDismiss: () -> Unit, onRedo: (String?, Boolean) -> Unit) {
    var direction by rememberSaveable { mutableStateOf("") }
    var remember by rememberSaveable { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = FantasiaShapes.sheet, containerColor = FantasiaSurface, contentColor = FantasiaText,
        scrimColor = FantasiaScrim, dragHandle = null) {
        Column(Modifier.fillMaxWidth().testTag("redo-sheet").padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Spacer(Modifier.align(Alignment.CenterHorizontally).size(width = 36.dp, height = 4.dp).background(FantasiaStrongLine, FantasiaShapes.round))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Redo this Reply", style = FantasiaType.sheetTitle)
                Text("A Direction steers the new Reply. It never appears in the Story.", style = FantasiaType.caption, color = FantasiaSecondary)
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Direction (optional)", style = FantasiaType.fieldLabel, color = FantasiaSecondary)
                BasicTextField(value = direction, onValueChange = { direction = it; if (it.isBlank()) remember = false },
                    minLines = 3, maxLines = 4, textStyle = FantasiaType.direction.copy(color = FantasiaText), cursorBrush = SolidColor(FantasiaLabel),
                    modifier = Modifier.fillMaxWidth().testTag("redo-direction").semantics { contentDescription = "Direction (optional)" }
                        .background(FantasiaBackground, FantasiaShapes.field).border(1.dp, FantasiaAccent, FantasiaShapes.field)
                        .padding(horizontal = 15.dp, vertical = 13.dp))
            }
            val canRemember = direction.isNotBlank()
            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).toggleable(value = remember && canRemember, enabled = canRemember,
                role = Role.Checkbox, onValueChange = { remember = it }), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
                    Checkbox(checked = remember && canRemember, onCheckedChange = null, enabled = canRemember, modifier = Modifier.size(20.dp))
                }
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("Remember this", style = FantasiaType.plain)
                    Text("Keep it as a line of Taste for every Scene after.", style = FantasiaType.small, color = FantasiaCaption)
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End)) {
                TextButton(onClick = onDismiss, modifier = Modifier.height(48.dp), shape = FantasiaShapes.round,
                    contentPadding = PaddingValues(horizontal = 20.dp)) { Text("Cancel", style = FantasiaType.plain, color = FantasiaSecondary) }
                Button(onClick = { onRedo(direction.takeIf { it.isNotBlank() }, remember && canRemember) },
                    modifier = Modifier.height(48.dp).testTag("confirm-redo"), shape = FantasiaShapes.round,
                    contentPadding = PaddingValues(horizontal = 24.dp)) { Text("Redo", style = FantasiaType.button) }
            }
        }
    }
}
