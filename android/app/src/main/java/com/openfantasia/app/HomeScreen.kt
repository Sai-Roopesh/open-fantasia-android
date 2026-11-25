package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

internal fun playedAgo(updatedAt: String, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String {
    val then = runCatching { Instant.parse(updatedAt) }.getOrNull() ?: return ""
    val seconds = Duration.between(then, now).seconds.coerceAtLeast(0)
    val day = then.atZone(zone).toLocalDate()
    val today = now.atZone(zone).toLocalDate()
    return when {
        day == today.minusDays(1) -> "yesterday"
        seconds < 60 -> "just now"
        seconds < 3600 -> "${seconds / 60} min ago"
        seconds < 86400 -> "${seconds / 3600} h ago"
        else -> "${Duration.between(day.atStartOfDay(zone), today.atStartOfDay(zone)).toDays()} days ago"
    }
}

@Composable fun HomeScreen(state: FantasiaState, openStory: (String) -> Unit, modifier: Modifier = Modifier, openModels: () -> Unit = {}) {
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) { while (true) { delay(60_000); now = Instant.now() } }
    Column(modifier.fillMaxSize()) {
        // Main.dc.html: the title, and the Models button beside it.
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 12.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Open Fantasia", style = FantasiaType.homeTitle, modifier = Modifier.weight(1f))
            IconButton(onClick = openModels, modifier = Modifier.size(44.dp).semantics { contentDescription = "Models" }) {
                FantasiaIcon(FantasiaIconKind.Models, Modifier.size(22.dp), FantasiaSecondary)
            }
        }
        Row(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 20.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Spacer(Modifier.size(8.dp).background(if (state.reachable) FantasiaSeen else FailureAmber, FantasiaShapes.round))
            Text("${state.hostName} · ${if (state.reachable) "connected" else "unreachable"}", style = FantasiaType.meta, color = FantasiaSecondary)
        }
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(state.stories, key = { it.id }) { story ->
                Surface(onClick = { openStory(story.id) }, modifier = Modifier.fillMaxWidth(), shape = FantasiaShapes.card,
                    color = FantasiaSurface, border = BorderStroke(1.dp, FantasiaLine)) {
                    Row(Modifier.padding(17.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(story.title, style = FantasiaType.storyTitle)
                            Text(story.standing, style = FantasiaType.metadata,
                                color = if (story.standing.endsWith("choosing where to go")) FailureAmber else FantasiaLabel)
                            Text(story.detail, style = FantasiaType.meta, color = FantasiaSecondary)
                        }
                        Text(playedAgo(story.updatedAt, now), style = FantasiaType.small, color = FantasiaCaption, maxLines = 1, overflow = TextOverflow.Clip)
                    }
                }
            }
        }
    }
}
