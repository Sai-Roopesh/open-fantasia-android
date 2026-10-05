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
        val description = "${person.name}'s Portrait"
        val imageModifier = Modifier.size(56.dp).testTag("portrait-${person.name}").clip(FantasiaShapes.round)
            .then(if (focused) Modifier.background(FantasiaBackground, FantasiaShapes.round).border(2.dp, FantasiaLabel, FantasiaShapes.round) else Modifier)
            .padding(if (focused) 5.dp else 0.dp).clip(FantasiaShapes.round)
        if (source != null) {
            val context = LocalContext.current
            val loader = remember(source.http) {
                ImageLoader.Builder(context).components {
                    add(OkHttpNetworkFetcherFactory(callFactory = { source.http }))
                }.build()
            }
            AsyncImage(source.url, description, loader, imageModifier, contentScale = ContentScale.Crop)
        } else {
            Surface(imageModifier.semantics { contentDescription = description }, shape = FantasiaShapes.round, color = FantasiaRaised) {
                Box(contentAlignment = Alignment.Center) { Text(person.name.split(" ").filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }, color = FantasiaText, style = FantasiaType.portraitLetter) }
            }
        }
        Text(firstName(person.name), color = if (focused) FantasiaText else FantasiaSecondary, style = FantasiaType.small)
    }
}
