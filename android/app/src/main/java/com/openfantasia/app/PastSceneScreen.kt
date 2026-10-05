package com.openfantasia.app

import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.PastScene
import com.openfantasia.protocol.SceneSummaryLine

@Composable fun PastSceneScreen(
    selected: SceneSummaryLine,
    scene: PastScene?,
    playerCharacter: String,
    currentNumber: Long,
    back: () -> Unit,
    modifier: Modifier = Modifier,
    pathsEnabled: Boolean = false,
    rewind: (String) -> Unit = {},
    tryAnotherWay: (String) -> Unit = {}
) {
    // A Reply in an earlier Scene can be held too (openspec paths: Try another way from any Reply).
    var held by remember(scene?.number) { mutableStateOf<String?>(null) }
    val clipboard = LocalContext.current.getSystemService(ClipboardManager::class.java)
    Column(modifier) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            IconButton(onClick = back, modifier = Modifier.size(44.dp).semantics { contentDescription = "Back to Scene $currentNumber" }) {
                FantasiaIcon(FantasiaIconKind.Back, Modifier.size(22.dp))
            }
            Text("Scene ${scene?.number ?: selected.number} · ${scene?.title ?: selected.title}",
                modifier = Modifier.weight(1f), style = FantasiaType.header, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        HorizontalDivider(color = FantasiaHeaderLine)
        if (scene != null) LazyColumn(Modifier.weight(1f).testTag("past-scene-passages"),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                Text("${scene.place} · ${scene.atLabel}", style = FantasiaType.metadata, color = FantasiaSecondary)
            }
            if (scene.summary.isNotEmpty()) item {
                Text(scene.summary, modifier = Modifier.testTag("past-scene-summary"), style = FantasiaType.caption, color = FantasiaCaption)
            }
            items(scene.exchanges) { exchange ->
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    exchange.move?.let { MovePassage(it, playerCharacter, dimmed = held != null) }
                    exchange.reply?.let { reply ->
                        HeldReply(reply, held = held == reply.entryID, dimmed = held != null && held != reply.entryID, canRewind = true,
                            pathsEnabled = pathsEnabled, hold = { held = reply.entryID }, release = { held = null },
                            copy = { clipboard.setPrimaryClip(ClipData.newPlainText("Reply", reply.text)) },
                            rewind = { rewind(reply.entryID) }, tryAnotherWay = { tryAnotherWay(reply.entryID) })
                    }
                }
            }
        }
    }
}
