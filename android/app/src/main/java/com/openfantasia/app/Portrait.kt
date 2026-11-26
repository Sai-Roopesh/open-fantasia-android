package com.openfantasia.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.ui.platform.testTag
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil3.ImageLoader
import coil3.compose.AsyncImage
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import com.openfantasia.protocol.PersonCard
import okhttp3.OkHttpClient

data class PortraitSource(val url: String, val http: OkHttpClient)

@Composable fun Portrait(person: PersonCard, source: PortraitSource?, modifier: Modifier = Modifier, focused: Boolean = false) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        val imageModifier = Modifier.size(56.dp).testTag("portrait-${person.name}").clip(FantasiaShapes.round)
            .then(if (focused) Modifier.background(FantasiaBackground, FantasiaShapes.round).border(2.dp, FantasiaLabel, FantasiaShapes.round) else Modifier)
            .padding(if (focused) 5.dp else 0.dp).clip(FantasiaShapes.round)
        PortraitImage(person.name, source, imageModifier)
        Text(firstName(person.name), color = if (focused) FantasiaText else FantasiaSecondary, style = FantasiaType.small)
    }
}

/** Someone's Portrait, or their letters on a plain ground while it has none, in whatever shape [modifier] gives it. */
@Composable fun PortraitImage(name: String, source: PortraitSource?, modifier: Modifier, shape: androidx.compose.ui.graphics.Shape = FantasiaShapes.round,
    letters: androidx.compose.ui.text.TextStyle = FantasiaType.portraitLetter, alignment: Alignment = Alignment.Center) {
    val description = "$name's Portrait"
    if (source != null) {
        val context = LocalContext.current
        val loader = remember(source.http) {
            ImageLoader.Builder(context).components {
                add(OkHttpNetworkFetcherFactory(callFactory = { source.http }))
            }.build()
        }
        AsyncImage(source.url, description, loader, modifier.clip(shape), contentScale = ContentScale.Crop)
    } else {
        Surface(modifier.semantics { contentDescription = description }, shape = shape, color = FantasiaRaised) {
            Box(contentAlignment = alignment) { Text(portraitLetters(name), color = FantasiaText, style = letters) }
        }
    }
}

/** The letters a Portrait shows while it has none: the first of the first two words that start with a capital ("CG" for Crabbe and Goyle). */
internal fun portraitLetters(name: String): String {
    val words = name.split(" ").filter { it.isNotBlank() }
    val named = words.filter { it.first().isUpperCase() }.ifEmpty { words }
    return named.take(2).joinToString("") { it.take(1) }
}

