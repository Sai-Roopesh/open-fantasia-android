package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class KeptCopyTest {
    // GIVEN the Mac is asleep
    // WHEN the player opens a Story
    // THEN its Scenes, Journal and World screen can be read
    // AND the composer says the Mac is unreachable
    @Test fun `presence › What has been seen can be read without the Mac › The Mac is asleep`() = runBlocking {
        val mac = MacServer()
        val address = MacAddress("127.0.0.1", mac.server.port)
        val store = object : PairingStore {
            var paired: PairedMac? = PairedMac("mac", "Mac", mac.fingerprint, "secret", address, listOf(address))
            override fun read() = paired
            override fun write(mac: PairedMac) { paired = mac }
        }
        val kept = MemoryReadCache()
        val connection = MacConnection(store, MacDiscovery { emptyList() }, "Phone", kept)
        val stories = StoryList(stories = listOf(StorySummary(id = "story", title = "The Night Train to Kalka", standing = "Scene 7", detail = "", updatedAt = "now")), traceID = "list")
        mac.enqueue(MockResponse().setBody(linkJson.encodeToString(stories)))
        mac.enqueue(MockResponse().setBody(linkJson.encodeToString(sceneFixture())))
        mac.enqueue(MockResponse().setBody(linkJson.encodeToString(FakeFantasiaLink.pastSceneFixture())))
        mac.enqueue(MockResponse().setBody(linkJson.encodeToString(FakeFantasiaLink.journalFixture())))
        mac.enqueue(MockResponse().setBody(linkJson.encodeToString(FakeFantasiaLink.worldFixture())))
        assertEquals(stories, connection.stories())
        assertEquals(sceneFixture(), connection.scene("story"))
        assertEquals(FakeFantasiaLink.pastSceneFixture(), connection.pastScene("story", 13))
        assertEquals(FakeFantasiaLink.journalFixture(), connection.journal("story"))
        assertEquals(FakeFantasiaLink.worldFixture(), connection.world("story"))
        assertTrue(connection.reachable.value)

        mac.close()
        val asleep = MacConnection(store, MacDiscovery { emptyList() }, "Phone", kept)
        assertEquals(stories, asleep.stories())
        assertEquals(sceneFixture(), asleep.scene("story"))
        assertEquals(FakeFantasiaLink.pastSceneFixture(), asleep.pastScene("story", 13))
        assertEquals(FakeFantasiaLink.journalFixture(), asleep.journal("story"))
        assertEquals(FakeFantasiaLink.worldFixture(), asleep.world("story"))
        assertFalse(asleep.reachable.value)
        // What was never read is not there to read.
        assertTrue(runCatching { asleep.pastScene("story", 12) }.isFailure)
    }

    // The kept copy grows only with what is played: one file per read, and a Story the Mac no longer lists is forgotten.
    @Test fun `the kept copy on disk is replaced on each read and forgets Stories no longer listed`() {
        val directory = java.nio.file.Files.createTempDirectory("kept").toFile()
        try {
            val kept = FileReadCache(directory)
            kept.write(null, "stories", "[1]")
            kept.write("night/train", "scene", "first")
            kept.write("night/train", "scene", "second")
            kept.write("coast", "journal", "tides")
            assertEquals("second", FileReadCache(directory).read("night/train", "scene"))
            kept.keepOnly(setOf("night/train"))
            assertEquals("second", kept.read("night/train", "scene"))
            assertNull(kept.read("coast", "journal"))
            assertEquals("[1]", kept.read(null, "stories"))
            assertTrue(directory.walk().none { it.name.endsWith(".writing") })
        } finally { directory.deleteRecursively() }
    }
}
