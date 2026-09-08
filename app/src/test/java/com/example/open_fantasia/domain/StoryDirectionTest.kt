package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.PromptBuilder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Direction is the player's. These pin what follows from that: it reaches the model as direction rather
 * than as hedged material, it never outranks what the player actually just wrote, and — the part that
 * was missing — a want that has already happened reaches the model as the past instead of vanishing.
 */
class StoryDirectionTest {

    /** A branch of committed exchanges, oldest first, as the Transcript Window resolves one. */
    private fun lineage(count: Int) = (1..count).map {
        RoleplayLineageEntry(
            id = "turn-%03d".format(it), parent_id = if (it == 1) null else "turn-%03d".format(it - 1),
            user_text = "u$it", assistant_text = "a$it",
            generation_status = "committed", starter_seed = false
        )
    }

    private fun render(
        direction: StoryDirection,
        lineage: List<RoleplayLineageEntry> = emptyList(),
        intent: SceneIntent = SceneIntent.Develop
    ): String = PromptBuilder.render(
        RoleplayContext(
            character = PromptCharacter("Avni", "", "", "", "", "", "", emptyList()),
            persona = null, directorNotes = "", world = null, cast = emptyList(),
            activeSpeaker = null, speakerMode = "single", sceneIntent = intent,
            storyDirection = StoryDirectionRendering.place(direction, lineage), recalled = emptyList(),
            pins = emptyList(), timeline = emptyList(),
            currentUserMessage = "USER-PROSE", revision = null,
            replyLength = ReplyLength.Full, modelId = "m"
        )
    ).let { it.systemPrompt + "\n" + it.currentUserMessage }

    private fun want(body: String, done: Boolean = false, asked: String? = null, reached: String? = null) =
        StoryWant(body, body, done, askedAtTurnId = asked, reachedAtTurnId = reached)

    @Test
    fun `an empty direction adds nothing to the prompt`() {
        assertFalse(render(StoryDirection.Empty).contains("<${StoryDirectionRendering.TAG}>"))
    }

    @Test
    fun `the player's wants reach the model`() {
        val out = render(StoryDirection(listOf(want("they get to the cottage"))))
        assertTrue(out.contains("they get to the cottage"))
        assertTrue(out.contains("Still ahead"))
    }

    @Test
    fun `a want that has happened is sent as the past, not deleted`() {
        // It used to be filtered out entirely, so a model could not tell a wedding that had happened
        // from one nobody ever wanted, and nothing stopped it building toward the wedding again.
        val out = render(StoryDirection(listOf(want("the wedding", done = true), want("the cottage"))))
        assertTrue(out.contains("the cottage"))
        assertTrue("a reached want must still reach the model", out.contains("the wedding"))
        assertTrue(out.contains("Already reached"))
        assertTrue(out.contains("Do not stage it a second time"))
    }

    @Test
    fun `a want carries how long ago it was asked for or reached`() {
        val turns = lineage(40)
        val out = render(
            StoryDirection(listOf(
                want("the cottage", asked = "turn-010"),
                want("the wedding", done = true, asked = "turn-005", reached = "turn-032")
            )),
            turns
        )
        // Head is turn-040, so turn-010 is thirty exchanges back and turn-032 is eight.
        assertTrue("an open want states how long it has gone unserved", out.contains("(asked for 30 exchanges ago)"))
        assertTrue("a reached want states when it landed", out.contains("(reached 8 exchanges ago)"))
    }

    @Test
    fun `a want written before a rewind states no distance rather than a wrong one`() {
        val out = render(StoryDirection(listOf(want("the cottage", asked = "turn-from-a-dead-branch"))), lineage(10))
        assertTrue(out.contains("the cottage"))
        assertFalse("an unresolvable stamp must not invent a number", out.contains("exchanges ago"))
    }

    @Test
    fun `the past is bounded`() {
        val turns = lineage(60)
        val direction = StoryDirection((1..12).map {
            want("reached $it", done = true, reached = "turn-%03d".format(it * 4))
        })
        val placed = StoryDirectionRendering.place(direction, turns)
        assertEquals(StoryDirectionRendering.MAX_REACHED, placed.size)
        assertTrue("the most recently reached are the ones a reply could still contradict",
            placed.all { it.body.removePrefix("reached ").toInt() > 6 })
    }

    @Test
    fun `the model is told a long-open want is not a one-reply job`() {
        val out = render(StoryDirection(listOf(want("the cottage"))))
        assertTrue(out.contains("not one to resolve in a single reply"))
        assertTrue("the story may have arrived without the player ticking it off",
            out.contains("already arrived at something listed as still ahead"))
    }

    @Test
    fun `direction never outranks what the player just wrote`() {
        val out = render(StoryDirection(listOf(want("they get to the cottage"))))
        assertTrue(out.contains("their prose this turn outranks anything here"))
        assertTrue(out.contains("Do not force one into this reply if the moment is wrong"))
    }

    @Test
    fun `direction does not override the scene intent`() {
        val out = render(StoryDirection(listOf(want("they get to the cottage"))), intent = SceneIntent.Dwell)
        assertTrue(out.contains("Do NOT introduce a new event"))
        assertTrue(out.contains("still decides whether this reply moves the story at all"))
    }

    @Test
    fun `ticking, removing and adding are all round trips`() {
        val d = StoryDirection.Empty.plus("first", "a", "turn-001").plus("second", "b", "turn-002")
        assertEquals(2, d.open.size)
        assertEquals(1, d.toggled("a", "turn-009").open.size)
        assertEquals("turn-009", d.toggled("a", "turn-009").wants.first { it.id == "a" }.reachedAtTurnId)
        assertEquals(1, d.without("a").wants.size)
        assertEquals(d, StoryDirection.decode(StoryDirection.encode(d)))
    }

    @Test
    fun `un-ticking clears the stamp`() {
        // A want that is open again has not been reached. Carrying both states would make the prompt
        // say a thing has happened and is still ahead.
        val reached = StoryDirection.Empty.plus("first", "a").toggled("a", "turn-004")
        val reopened = reached.toggled("a", "turn-009")
        assertEquals(null, reopened.wants.single().reachedAtTurnId)
        assertFalse(reopened.wants.single().done)
    }

    @Test
    fun `blank input is not a want, and unreadable storage is not a crash`() {
        assertEquals(0, StoryDirection.Empty.plus("   ", "a").wants.size)
        assertEquals(StoryDirection.Empty, StoryDirection.decode(null))
        assertEquals(StoryDirection.Empty, StoryDirection.decode("not json"))
    }

    @Test
    fun `a want stored before stamps existed still decodes`() {
        val old = """{"wants":[{"id":"a","body":"the cottage","done":false}]}"""
        val decoded = StoryDirection.decode(old)
        assertEquals("the cottage", decoded.wants.single().body)
        assertEquals(null, decoded.wants.single().askedAtTurnId)
    }
}
