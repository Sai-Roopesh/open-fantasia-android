package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class SceneCommandsTest {
    private fun connection(mac: MacServer): MacConnection {
        val paired = PairedMac("mac", "Mac", mac.fingerprint, "secret", MacAddress("127.0.0.1", mac.server.port))
        val store = object : PairingStore {
            override fun read() = paired
            override fun write(mac: PairedMac) = Unit
        }
        return MacConnection(store, MacDiscovery { emptyList() }, "Phone")
    }

    @Test fun `End scene posts the head and reads Accepted over the current contract`() = runBlocking {
        MacServer().use { mac ->
            val link = connection(mac)
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            link.stories()
            mac.server.takeRequest()
            mac.enqueue(MockResponse().setBody("""{"head_entry_id":"closed","trace_id":"end"}"""))
            assertEquals(Accepted(headEntryID = "closed", traceID = "end"), link.endScene("story", EndSceneRequest(after = "reply")))
            val request = mac.server.takeRequest()
            assertEquals("/stories/story/end-scene", request.path)
            assertEquals("POST", request.method)
            assertEquals("application/json; charset=utf-8", request.getHeader("Content-Type"))
            assertEquals("""{"after":"reply"}""", request.body.readUtf8())
            assertEquals(com.openfantasia.protocol.CONTRACT_VERSION.toString(), request.getHeader("Fantasia-Contract"))
            assertEquals("Bearer secret", request.getHeader("Authorization"))
        }
    }

    // Contract 12: the body says which model, if any, runs the Weaver for this one try. An empty body with a JSON
    // content type was refused by the Mac before it reached the route.
    @Test fun `World retry posts its model, or null, and reads Accepted`() = runBlocking {
        MacServer().use { mac ->
            val link = connection(mac)
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            link.stories()
            mac.server.takeRequest()
            mac.enqueue(MockResponse().setResponseCode(202).setBody("""{"head_entry_id":"closed","trace_id":"world-retry"}"""))
            assertEquals(Accepted(headEntryID = "closed", traceID = "world-retry"), link.retryWorld("story", RetryWorldRequest()))
            val request = mac.server.takeRequest()
            assertEquals("/stories/story/world/retry", request.path)
            assertEquals("POST", request.method)
            assertEquals("""{"model":null}""", request.body.readUtf8())
            assertEquals(CONTRACT_VERSION.toString(), request.getHeader("Fantasia-Contract"))
            assertEquals("Bearer secret", request.getHeader("Authorization"))
        }
    }

    @Test fun `Focus posts a name or explicit null with the current head`() = runBlocking {
        MacServer().use { mac ->
            val link = connection(mac)
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            link.stories()
            mac.server.takeRequest()
            for (on in listOf("Hermione", null)) {
                mac.enqueue(MockResponse().setBody("""{"head_entry_id":"focus","trace_id":"focus"}"""))
                assertEquals("focus", link.focus("story", FocusRequest(after = "reply", on = on)).headEntryID)
                val request = mac.server.takeRequest()
                assertEquals("/stories/story/focus", request.path)
                assertEquals("POST", request.method)
                val expected = if (on == null) """{"after":"reply","on":null}""" else """{"after":"reply","on":"Hermione"}"""
                assertEquals(expected, request.body.readUtf8())
                assertEquals(com.openfantasia.protocol.CONTRACT_VERSION.toString(), request.getHeader("Fantasia-Contract"))
            }
        }
    }

    @Test fun `Linger posts on and off with the head`() = runBlocking {
        MacServer().use { mac ->
            val link = connection(mac)
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            link.stories()
            mac.server.takeRequest()
            for (on in listOf(true, false)) {
                mac.enqueue(MockResponse().setBody("""{"head_entry_id":"linger","trace_id":"linger"}"""))
                assertEquals("linger", link.linger("story", LingerRequest(after = "reply", on = on)).headEntryID)
                val request = mac.server.takeRequest()
                assertEquals("/stories/story/linger", request.path)
                assertEquals("POST", request.method)
                assertEquals("""{"after":"reply","on":$on}""", request.body.readUtf8())
                assertEquals(com.openfantasia.protocol.CONTRACT_VERSION.toString(), request.getHeader("Fantasia-Contract"))
            }
        }
    }

    @Test fun `Redo posts Direction or explicit null and remember and reads TurnAccepted`() = runBlocking {
        MacServer().use { mac ->
            val link = connection(mac)
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            link.stories()
            mac.server.takeRequest()
            for (direction in listOf("move on", null)) {
                mac.enqueue(MockResponse().setBody("""{"move_entry_id":"move","trace_id":"redo"}"""))
                assertEquals(TurnAccepted(moveEntryID = "move", traceID = "redo"), link.redo("story",
                    RedoRequest(after = "reply", direction = direction, remember = false)))
                val request = mac.server.takeRequest()
                assertEquals("/stories/story/redo", request.path)
                assertEquals("POST", request.method)
                val expected = if (direction == null) """{"after":"reply","direction":null,"model":null,"remember":false}"""
                    else """{"after":"reply","direction":"move on","model":null,"remember":false}"""
                assertEquals(expected, request.body.readUtf8())
                assertEquals(com.openfantasia.protocol.CONTRACT_VERSION.toString(), request.getHeader("Fantasia-Contract"))
            }
        }
    }

    @Test fun `Choose posts every kind and explicit blank Gap and reads TurnAccepted`() = runBlocking {
        MacServer().use { mac ->
            val link = connection(mac)
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            link.stories()
            mac.server.takeRequest()
            val choices = listOf(
                ChooseRequest(after = "closed", kind = ChooseRequestKind.Go, happening = "hospital", gap = "I read."),
                ChooseRequest(after = "closed", kind = ChooseRequestKind.Follow, who = "Hermione"),
                ChooseRequest(after = "closed", kind = ChooseRequestKind.Somewhere, place = "The library"),
                ChooseRequest(after = "closed", kind = ChooseRequestKind.Skip, at = "Day 4 07:30"),
                ChooseRequest(after = "closed", kind = ChooseRequestKind.Story))
            for (choice in choices) {
                mac.enqueue(MockResponse().setResponseCode(202).setBody("""{"move_entry_id":"choice-move","trace_id":"choose"}"""))
                assertEquals(TurnAccepted(moveEntryID = "choice-move", traceID = "choose"), link.choose("story", choice))
                val request = mac.server.takeRequest()
                assertEquals("/stories/story/choose", request.path)
                assertEquals("POST", request.method)
                val body = request.body.readUtf8()
                assertEquals(choice, linkJson.decodeFromString<ChooseRequest>(body))
                assertTrue(body.contains(if (choice.gap == null) "\"gap\":null" else "\"gap\":\"I read.\""))
                assertEquals(CONTRACT_VERSION.toString(), request.getHeader("Fantasia-Contract"))
                assertEquals("Bearer secret", request.getHeader("Authorization"))
            }
        }
    }

    @Test fun `each Scene command preserves busy stale head and invalid reasons and trace ids`() = runBlocking {
        MacServer().use { mac ->
            val link = connection(mac)
            mac.enqueue(MockResponse().setBody("""{"stories":[],"trace_id":"list"}"""))
            link.stories()
            mac.server.takeRequest()
            val commands: List<Pair<String, suspend () -> Any>> = listOf(
                "choose" to { link.choose("story", ChooseRequest(after = "reply", kind = ChooseRequestKind.Story)) },
                "end-scene" to { link.endScene("story", EndSceneRequest(after = "reply")) },
                "focus" to { link.focus("story", FocusRequest(after = "reply", on = "Hermione")) },
                "linger" to { link.linger("story", LingerRequest(after = "reply", on = true)) },
                "redo" to { link.redo("story", RedoRequest(after = "reply", direction = null, remember = false)) })
            for ((path, command) in commands) for (code in listOf("busy", "stale_head", "invalid")) {
                mac.enqueue(MockResponse().setResponseCode(409).setBody(
                    """{"error":{"code":"$code","message":"The reason for $code","trace_id":"$code-trace"}}"""))
                val error = runCatching { command() }.exceptionOrNull() as LinkFailure
                assertEquals("The reason for $code", error.reason)
                assertEquals("$code-trace", error.traceID)
                assertEquals("/stories/story/$path", mac.server.takeRequest().path)
            }
            assertEquals(16, mac.server.requestCount)
        }
    }
}
