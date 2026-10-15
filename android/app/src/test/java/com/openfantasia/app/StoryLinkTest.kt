package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.*
import kotlinx.serialization.encodeToString
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

/** The Story's edits over the link (editing-the-story task 3.1): each to its route, each from the head the phone saw. */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryLinkTest {
    private val story = linkJson.encodeToString(FakeFantasiaLink.storyFixture())

    @Test fun `each edit goes to its route with the head the phone saw, and The Story comes back`() = runBlocking {
        MacServer().use { mac ->
            val sent = mutableListOf<Triple<String, String, String>>()
            suspend fun each(call: suspend () -> StoryView) {
                mac.enqueue(MockResponse().setBody(story))
                assertEquals("The Malfoy Problem", call().title)
                mac.server.takeRequest().let { sent += Triple(it.method!!, it.path!!, it.body.readUtf8()) }
            }
            each { mac.client.story("story") }
            each { mac.client.setPremise("story", PremiseRequest(after = "head", premise = "A rivalry.")) }
            each { mac.client.setStyle("story", StyleRequest(after = "head", style = "Dry.")) }
            each { mac.client.setReplyLength("story", ReplyLengthRequest(after = "head", length = Length.LengthShort)) }
            each { mac.client.setArcs("story", ArcsRequest(after = "head", arcs = listOf("One."))) }
            each { mac.client.setLandmark("story", "The Yule Ball", LandmarkRequest(after = "head", at = "Day 100 19:00", what = "A dance.", create = true)) }
            each { mac.client.dropLandmark("story", "The Yule Ball", DropLandmarkRequest(after = "head")) }
            each { mac.client.setPlace("story", "The owlery", PlaceRequest(after = "head", description = "Cold.", institution = false, create = false)) }
            each { mac.client.setWorld("story", WorldRequest(after = "head", summary = "Hogwarts.", history = "")) }
            each { mac.client.setClock("story", ClockRequest(after = "head", at = "Day 4 09:00", dayOne = null)) }
            assertEquals(listOf(
                "GET /stories/story/story", "PUT /stories/story/premise", "PUT /stories/story/style", "PUT /stories/story/reply-length",
                "PUT /stories/story/arcs", "PUT /stories/story/landmarks/The%20Yule%20Ball", "POST /stories/story/landmarks/The%20Yule%20Ball/drop",
                "PUT /stories/story/places/The%20owlery", "PUT /stories/story/world", "PUT /stories/story/clock"
            ), sent.map { "${it.first} ${it.second}" })
            assertTrue(sent.drop(1).all { it.third.contains("\"after\":\"head\"") })
            assertTrue(sent.first { it.second.endsWith("/clock") }.third.contains("\"day_one\":null"))
            assertTrue(sent.first { it.second.endsWith("/reply-length") }.third.contains("\"length\":\"short\""))
        }
    }

    // Taste and the steering notes live beside the Story, not on a Path (docs/adr/0020): no head goes with them, and the
    // phone reads Backstage again rather than the answer.
    @Test fun `Taste and steering notes go beside the Story, with no head`() = runBlocking {
        MacServer().use { mac ->
            repeat(4) { mac.enqueue(MockResponse().setBody("""{"trace_id":"beside"}""")) }
            mac.client.removeTaste("story", RemoveTasteRequest(line = "Old.", scope = ClosedBy.Player))
            mac.client.rewordTaste("story", RewordTasteRequest(line = "Old.", scope = ClosedBy.Story, text = "New."))
            mac.client.writeNote("story", SteeringNoteRequest(text = "Year One ends with Draconia breaking from her father"))
            mac.client.deleteNote("story", "note 1")
            val sent = List(4) { mac.server.takeRequest().let { Triple(it.method!!, it.path!!, it.body.readUtf8()) } }
            assertEquals(listOf("POST /stories/story/taste/remove", "POST /stories/story/taste/reword", "POST /stories/story/notes",
                "DELETE /stories/story/notes/note%201"), sent.map { "${it.first} ${it.second}" })
            assertEquals(listOf("""{"line":"Old.","scope":"player"}""", """{"line":"Old.","scope":"story","text":"New."}""",
                """{"text":"Year One ends with Draconia breaking from her father"}""", ""), sent.map { it.third })
            // A refusal is said with its reason.
            mac.enqueue(MockResponse().setResponseCode(409).setBody("""{"error":{"code":"invalid","message":"Taste has no such line.","trace_id":"t"}}"""))
            val refused = runCatching { mac.client.removeTaste("story", RemoveTasteRequest(line = "Gone.", scope = ClosedBy.Story)) }.exceptionOrNull()
            assertEquals("Taste has no such line.", (refused as LinkFailure).reason)
        }
    }

    @Test fun `a second edit goes from the head the first one left`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val link = FakeFantasiaLink()
            val model = FantasiaModel(link)
            model.openStory("story")
            advanceUntilIdle()
            model.openStoryScreen()
            advanceUntilIdle()
            model.setReplyLength(Length.LengthShort)
            advanceUntilIdle()
            model.savePremise("A rivalry, slowly.")
            advanceUntilIdle()
            assertEquals(listOf("reply", "story-1"), link.storyEdits.map { (_, request) ->
                when (request) { is ReplyLengthRequest -> request.after; is PremiseRequest -> request.after; else -> "" } })
            assertEquals("A rivalry, slowly.", model.state.value.story?.premise)
            assertEquals("story-2", model.state.value.scene?.headEntryID)
            model.pause()
        } finally { Dispatchers.resetMain() }
    }
}
