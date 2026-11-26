package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class PeopleLinkTest {
    private val accepted = """{"head_entry_id":"new-head","trace_id":"t"}"""

    @Test fun `a Portrait goes up as the image itself, its type, and the head the phone saw`() = runBlocking {
        MacServer().use { mac ->
            val png = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7)
            mac.enqueue(MockResponse().setBody(accepted))
            assertEquals("new-head", mac.client.uploadPortrait("story", "Daphne Greengrass", png, "image/png", "reply").headEntryID)
            val request = mac.server.takeRequest()
            assertEquals("PUT", request.method)
            assertEquals("/stories/story/people/Daphne%20Greengrass/portrait?after=reply", request.path)
            assertEquals("image/png", request.getHeader("Content-Type"))
            assertArrayEquals(png, request.body.readByteArray())
        }
    }

    @Test fun `people are read and written by name`() = runBlocking {
        MacServer().use { mac ->
            mac.enqueue(MockResponse().setBody(accepted))
            mac.client.setPerson("story", "Theodore Nott", PersonEdit(after = "reply", create = true, aliases = listOf("Theo"), whoTheyAre = "A quiet Slytherin.",
                known = null, appearance = "", wants = "", voice = emptyList(), knows = emptyList(), group = null))
            mac.server.takeRequest().let {
                assertEquals("PUT", it.method)
                assertEquals("/stories/story/people/Theodore%20Nott", it.path)
                assertTrue(it.body.readUtf8().contains("\"create\":true"))
            }
            mac.enqueue(MockResponse().setBody(accepted))
            mac.client.setLead("story", "Theodore Nott", LeadRequest(after = "reply", lead = true))
            assertEquals("/stories/story/people/Theodore%20Nott/lead", mac.server.takeRequest().path)
            mac.enqueue(MockResponse().setBody(accepted))
            mac.client.setGroup("story", "The library regulars", GroupRequest(after = "reply", description = "Always reading."))
            assertEquals("/stories/story/groups/The%20library%20regulars", mac.server.takeRequest().path)
        }
    }
}
