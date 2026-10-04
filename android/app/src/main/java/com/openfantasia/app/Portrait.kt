package com.openfantasia.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
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

@Composable fun Portrait(person: PersonCard, source: PortraitSource?, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        val description = "${person.name}'s Portrait"
        if (source != null) {
            val context = LocalContext.current
            val loader = remember(source.http) {
                ImageLoader.Builder(context).components {
                    add(OkHttpNetworkFetcherFactory(callFactory = { source.http }))
                }.build()
            }
            AsyncImage(source.url, description, loader, Modifier.size(56.dp).clip(CircleShape), contentScale = ContentScale.Crop)
        } else {
            Surface(Modifier.size(56.dp).semantics { contentDescription = description }, shape = CircleShape) {
                Box(contentAlignment = Alignment.Center) { Text("—", color = FantasiaLabel) }
            }
        }
        Text(person.name, color = FantasiaLabel, style = MaterialTheme.typography.labelMedium)
    }
}
