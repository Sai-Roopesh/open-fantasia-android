package com.openfantasia.app

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** A Move or a Reply being edited: which, its words, and whether it is the latest, which changes in place. */
internal data class Editing(val entryID: String, val text: String, val isMove: Boolean, val latest: Boolean)

/**
 * The Edit sheet, in the Redo sheet's style (openspec scenes: Editing): the words to change, and a line saying
 * whether they change where they are or carry the Story on from the edit on a new Path.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun EditSheet(editing: Editing, enabled: Boolean, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var words by rememberSaveable(editing.entryID) { mutableStateOf(editing.text) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = FantasiaShapes.sheet, containerColor = FantasiaSurface, contentColor = FantasiaText,
        scrimColor = FantasiaScrim, dragHandle = null, sheetGesturesEnabled = false) {
        Column(Modifier.fillMaxWidth().testTag("edit-sheet").padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Spacer(Modifier.align(Alignment.CenterHorizontally).size(width = 36.dp, height = 4.dp).background(FantasiaStrongLine, FantasiaShapes.round))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(if (editing.isMove) "Edit this Move" else "Edit this Reply", style = FantasiaType.sheetTitle)
                Text(if (editing.latest && editing.isMove) "Changes it where it is, and the Story answers it again."
                    else if (editing.latest) "Changes it where it is. Nothing after it changes."
                    else "Carries the Story on from the edit on a new Path. The Path you are on stays as it was.",
                    style = FantasiaType.caption, color = FantasiaSecondary)
            }
            BasicTextField(value = words, onValueChange = { words = it }, minLines = 3, maxLines = 10,
                textStyle = (if (editing.isMove) FantasiaType.body else FantasiaType.prose).copy(color = FantasiaText), cursorBrush = SolidColor(FantasiaLabel),
                modifier = Modifier.fillMaxWidth().testTag("edit-text").semantics { contentDescription = "The words it should read" }
                    .background(FantasiaBackground, FantasiaShapes.field).border(1.dp, FantasiaAccent, FantasiaShapes.field)
                    .padding(horizontal = 15.dp, vertical = 13.dp))
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End)) {
                TextButton(onClick = onDismiss, modifier = Modifier.height(48.dp), shape = FantasiaShapes.round,
                    contentPadding = PaddingValues(horizontal = 20.dp)) { Text("Cancel", style = FantasiaType.plain, color = FantasiaSecondary) }
                Button(onClick = { onSave(words.trim()) }, enabled = enabled && words.isNotBlank() && words.trim() != editing.text.trim(),
                    modifier = Modifier.height(48.dp).testTag("confirm-edit"), shape = FantasiaShapes.round,
                    contentPadding = PaddingValues(horizontal = 24.dp)) { Text("Save", style = FantasiaType.button) }
            }
        }
    }
}
