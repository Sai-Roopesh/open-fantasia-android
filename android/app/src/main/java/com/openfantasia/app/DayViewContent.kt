package com.openfantasia.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.openfantasia.protocol.DayView

@Composable internal fun DayViewContent(day: DayView, modifier: Modifier = Modifier) {
    Column(modifier.padding(top = 4.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(day.day, style = FantasiaType.day)
            Text("${day.time} · you're in ${day.place}", style = FantasiaType.metadata, color = FantasiaSecondary)
        }
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            // Keep both tiles the same measured width even when a viewport has an odd number of pixels.
            val tileWidth = with(LocalDensity.current) { ((maxWidth.toPx().toInt() - 10.dp.roundToPx()) / 2).toDp() }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // The Mac supplies the upcoming Landmarks in order; the first is the nearest.
                day.countdowns.chunked(2).forEachIndexed { rowIndex, row ->
                    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEachIndexed { columnIndex, countdown ->
                            Surface(Modifier.width(tileWidth).fillMaxHeight().testTag("countdown-${countdown.landmark}"), shape = FantasiaShapes.card,
                                color = FantasiaSurface, border = BorderStroke(1.dp, FantasiaLine)) {
                                Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(countdown.linkSchemaWhen, style = FantasiaType.countdown,
                                        color = if (rowIndex == 0 && columnIndex == 0) FailureAmber else FantasiaProse)
                                    Text("to ${countdown.landmark}", style = FantasiaType.countdownLabel, color = FantasiaSecondary)
                                }
                            }
                        }
                        if (row.size == 1) Spacer(Modifier.width(tileWidth))
                    }
                }
            }
        }
    }
}
