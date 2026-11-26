package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OpeningAppTest {
    @Test fun `opening the app asks for the Story list once as the Mac becomes reachable`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            MacServer().use { mac ->
                val paired = PairedMac("mac", "Mac", mac.fingerprint, "secret", MacAddress("127.0.0.1", mac.server.port))
                val store = object : PairingStore {
                    override fun read() = paired
                    override fun write(mac: PairedMac) = Unit
                }
                val connection = MacConnection(store, MacDiscovery { emptyList() }, "Phone")
                val link = object : FantasiaLink by connection {
                    override suspend fun stories(): StoryList {
                        val result = connection.stories()
                        // Let the reachability collector run before publishing this answer, as it
                        // can on the phone. This makes the state-update race deterministic.
                        yield()
                        return result
                    }
                }
                // A second answer lets the bug finish instead of hanging: the count must still be one.
                repeat(2) { mac.enqueue(MockResponse().setBody("""{"stories":[{"id":"story","title":"The Malfoy Problem","standing":"Scene 14","detail":"Friday 9:40 pm · with Hermione","updated_at":"now"}],"trace_id":"list"}""")) }
                val model = FantasiaModel(link)
                withContext(Dispatchers.Default) { withTimeout(5000) { model.state.first { !it.loading && it.stories.isNotEmpty() } } }
                assertTrue(model.state.value.reachable)
                assertEquals(1, mac.server.requestCount)
                assertEquals("/stories", mac.server.takeRequest().path)
                model.pause()
            }
        } finally { Dispatchers.resetMain() }
    }
}
