package com.openfantasia.app

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import com.openfantasia.protocol.CONTRACT_VERSION
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ClosedSceneTest {
    // The Scene view the Mac sent on 5 October 2026 after the Story closed the Night Train's first Scene, in contract 21's shape.
    private val closedScene = javaClass.getResource("/closed-scene-view.json")!!.readText()

    @Test fun `opening a Story whose Scene has closed shows its Day View`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            MacServer().use { mac ->
                val paired = PairedMac("mac", "Mac", mac.fingerprint, "secret", MacAddress("127.0.0.1", mac.server.port))
                val store = object : PairingStore {
                    override fun read() = paired
                    override fun write(mac: PairedMac) = Unit
                }
                mac.server.dispatcher = object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse {
                        val response = when {
                            request.path!!.endsWith("/scene") -> MockResponse().setBody(closedScene)
                            request.path!!.endsWith("/events") -> MockResponse().setHeader("Content-Type", "text/event-stream").setSocketPolicy(SocketPolicy.KEEP_OPEN)
                            else -> MockResponse().setBody("""{"stories":[],"trace_id":"list"}""")
                        }
                        return response.setHeader("Fantasia-Contract", CONTRACT_VERSION.toString())
                    }
                }
                val model = FantasiaModel(MacConnection(store, MacDiscovery { emptyList() }, "Phone"))
                model.openStory("dbbb56fa-ffeb-4f10-8d98-867971a7fa39")
                val state = withContext(Dispatchers.Default) { withTimeout(5000) { model.state.first { !it.loading && (it.scene != null || it.problem != null) } } }
                assertNull(state.problem?.reason, state.problem?.reason)
                assertEquals("Tomorrow: Arrival at Kalka", state.scene!!.dayView!!.countdowns.single().label)
                model.pause()
            }
        } finally { Dispatchers.resetMain() }
    }
}
