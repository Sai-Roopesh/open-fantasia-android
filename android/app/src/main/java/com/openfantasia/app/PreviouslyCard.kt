package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.Previously
import java.time.Duration
import java.time.Instant

internal fun previouslyAgo(since: String, now: Instant): String {
    val hours = Duration.between(Instant.parse(since), now).toHours().coerceAtLeast(0)
    return if (hours < 48) "$hours HOURS AGO" else "${hours / 24} DAYS AGO"
}

@Composable internal fun PreviouslyCard(previously: Previously, dismiss: () -> Unit, modifier: Modifier = Modifier, now: Instant = Instant.now()) {
    Surface(modifier.fillMaxWidth().testTag("previously-card"), color = FantasiaSurface,
        shape = FantasiaShapes.card, border = BorderStroke(1.dp, FantasiaLine)) {
        Column(Modifier.padding(start = 16.dp, top = 14.dp, end = 14.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("PREVIOUSLY · ${previouslyAgo(previously.since, now)}", Modifier.weight(1f), style = FantasiaType.eyebrow, color = FantasiaCaption)
                // Keep the drawn row compact, with the larger touch target centred over its cross.
                Box(Modifier.width(30.dp).height(20.dp), contentAlignment = Alignment.Center) {
                    IconButton(onClick = dismiss, modifier = Modifier.requiredSize(44.dp).offset(x = 3.dp).semantics { contentDescription = "Dismiss" }) {
                        FantasiaIcon(FantasiaIconKind.Dismiss, Modifier.size(16.dp), FantasiaCaption)
                    }
                }
            }
            Text(previously.summary, style = FantasiaType.previously, color = FantasiaProse)
        }
    }
}
