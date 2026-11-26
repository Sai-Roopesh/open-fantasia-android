package com.openfantasia.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable fun PairScreen(loading: Boolean, scan: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, top = 56.dp, bottom = 32.dp)) {
        Text("Open Fantasia", style = FantasiaType.pairTitle)
        Spacer(Modifier.height(12.dp))
        Text("Your Stories live on your Mac. Pair once, and this phone finds it on any network you share.", style = FantasiaType.intro, color = FantasiaSecondary)
        Spacer(Modifier.height(36.dp))
        PairStep("1") {
            Text(buildAnnotatedString {
                append("On the Mac, run ")
                appendInlineContent("command", "fantasia pair")
            }, style = FantasiaType.body, modifier = Modifier.padding(top = 5.dp), inlineContent = mapOf(
                "command" to InlineTextContent(Placeholder(113.sp, 23.sp, PlaceholderVerticalAlign.TextCenter)) {
                    Box(Modifier.fillMaxSize().background(FantasiaRaised, FantasiaShapes.code).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
                        Text("fantasia pair", style = FantasiaType.code)
                    }
                }
            ))
        }
        Spacer(Modifier.height(18.dp))
        PairStep("2") { Text("Scan the code it shows. It works once, for ten minutes.", style = FantasiaType.body, modifier = Modifier.padding(top = 5.dp)) }
        Spacer(Modifier.weight(1f))
        Button(onClick = scan, enabled = !loading, shape = FantasiaShapes.round,
            modifier = Modifier.fillMaxWidth().height(56.dp), contentPadding = PaddingValues(0.dp)) {
            FantasiaIcon(FantasiaIconKind.Scan, Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Text("Scan the QR code", style = FantasiaType.scan)
        }
    }
}

@Composable private fun PairStep(number: String, text: @Composable () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(32.dp).background(FantasiaRaised, FantasiaShapes.round), contentAlignment = Alignment.Center) {
            Text(number, style = FantasiaType.step, color = FantasiaPressed)
        }
        Box(Modifier.weight(1f)) { text() }
    }
}
