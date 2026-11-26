package com.openfantasia.app

import com.openfantasia.protocol.CONTRACT_VERSION
import kotlinx.coroutines.*
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class LinkThreadTest {
    // On the phone, link calls start on the main thread, where Android forbids reading the network. A long Scene's
    // answer is still arriving when its headers do; reading it must happen elsewhere, or opening it fails.
    @Test fun `a long answer is read without holding the thread that asked for it`() = runBlocking {
        MacServer().use { mac ->
            // About 24 KB, sent 1 KB every 50 ms: the body takes over a second to arrive after its headers.
            val fixture = sceneFixture()
            val passage = com.openfantasia.protocol.Passage(entryID = "long", text = "The rain goes on. ".repeat(1400))
            val long = fixture.copy(exchanges = listOf(com.openfantasia.protocol.Exchange(reply = passage)))
            val view = linkJson.encodeToString(com.openfantasia.protocol.SceneView.serializer(), long)
            mac.enqueue(MockResponse().setBody(view).setHeader("Fantasia-Contract", CONTRACT_VERSION.toString())
                .throttleBody(1024, 50, TimeUnit.MILLISECONDS))
            val caller = Executors.newSingleThreadExecutor { Thread(it, "caller") }.asCoroutineDispatcher()
            caller.use {
                var ticks = 0
                val started = System.nanoTime()
                withContext(caller) {
                    val ticker = launch { while (isActive) { ticks++; delay(10) } }
                    mac.client.scene("story")
                    ticker.cancel()
                }
                val elapsed = (System.nanoTime() - started) / 1_000_000
                // Ticking every 10 ms, a free thread ticks most of the time the answer took; a held one only until its headers.
                assertTrue("the caller's thread was held while the answer arrived: $ticks ticks in $elapsed ms", elapsed > 800 && ticks * 10 > elapsed / 2)
            }
        }
    }
}
