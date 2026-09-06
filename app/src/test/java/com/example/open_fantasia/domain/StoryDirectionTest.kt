package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.PromptBuilder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Direction is the player's. These pin the two properties that follow from that: it reaches the model as
 * direction rather than as hedged material, and it never outranks what the player actually just wrote.
 */
class StoryDirectionTest {

    private fun render(direction: StoryDirection, intent: SceneIntent = SceneIntent.Develop): String =
        PromptBuilder.render(
            RoleplayContext(
                character = PromptCharacter("Avni", "", "", "", "", "", "", emptyList()),
                persona = null, directorNotes = "", world = null, cast = emptyList(),
                activeSpeaker = null, speakerMode = "single", sceneIntent = intent,
                storyDirection = direction,
                pins = emptyList(), timeline = emptyList(),
                currentUserMessage = "USER-PROSE", revision = null,
                replyLength = ReplyLength.Full, modelId = "m"
            )
        ).let { it.systemPrompt + "\n" + it.currentUserMessage }

    private fun want(body: String, done: Boolean = false) = StoryWant(body, body, done)

    @Test
    fun `an empty direction adds nothing to the prompt`() {
        assertFalse(render(StoryDirection.Empty).contains("<${StoryDirectionRendering.TAG}>"))
    }

    @Test
    fun `the player's wants reach the model`() {
        val out = render(StoryDirection(listOf(want("they get to the cottage"))))
        assertTrue(out.contains("they get to the cottage"))
    }

    @Test
    fun `a want that has landed stops being sent`() {
        val direction = StoryDirection(listOf(want("done thing", done = true), want("open thing")))
        val out = render(direction)
        assertTrue(out.contains("open thing"))
        assertFalse("a satisfied want must leave, or the list only ever grows", out.contains("done thing"))
    }

    @Test
    fun `direction never outranks what the player just wrote`() {
        val out = render(StoryDirection(listOf(want("they get to the cottage"))))
        assertTrue(out.contains("their prose this turn outranks anything listed here"))
        assertTrue(out.contains("Do not force one into this reply if the moment is wrong"))
    }

    @Test
    fun `direction does not override the scene intent`() {
        val out = render(StoryDirection(listOf(want("they get to the cottage"))), SceneIntent.Dwell)
        assertTrue(out.contains("Do NOT introduce a new event"))
        assertTrue(out.contains("still decides whether the story moves at all"))
    }

    @Test
    fun `ticking, removing and adding are all round trips`() {
        val d = StoryDirection.Empty.plus("first", "a").plus("second", "b")
        assertEquals(2, d.open.size)
        assertEquals(1, d.toggled("a").open.size)
        assertEquals(1, d.without("a").wants.size)
        assertEquals(d, StoryDirection.decode(StoryDirection.encode(d)))
    }

    @Test
    fun `blank input is not a want, and unreadable storage is not a crash`() {
        assertEquals(0, StoryDirection.Empty.plus("   ", "a").wants.size)
        assertEquals(StoryDirection.Empty, StoryDirection.decode(null))
        assertEquals(StoryDirection.Empty, StoryDirection.decode("not json"))
    }
}
