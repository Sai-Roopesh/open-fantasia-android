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
            each { mac.client.rewordTaste("story", RewordTasteRequest(after = "head", line = "Old.", text = "New.")) }
            assertEquals(listOf(
                "GET /stories/story/story", "PUT /stories/story/premise", "PUT /stories/story/style", "PUT /stories/story/reply-length",
                "PUT /stories/story/arcs", "PUT /stories/story/landmarks/The%20Yule%20Ball", "POST /stories/story/landmarks/The%20Yule%20Ball/drop",
                "PUT /stories/story/places/The%20owlery", "PUT /stories/story/world", "PUT /stories/story/clock", "POST /stories/story/taste/reword"
            ), sent.map { "${it.first} ${it.second}" })
            assertTrue(sent.drop(1).all { it.third.contains("\"after\":\"head\"") })
            assertTrue(sent.first { it.second.endsWith("/clock") }.third.contains("\"day_one\":null"))
            assertTrue(sent.first { it.second.endsWith("/reply-length") }.third.contains("\"length\":\"short\""))
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
