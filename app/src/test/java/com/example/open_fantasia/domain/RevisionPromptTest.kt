package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.PromptBuilder
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regeneration used to send the direction and nothing else, so the model was asked to fix a reply it
 * could not see. An instruction with no referent is not read as a correction, it is read as the brief —
 * which is exactly what "it overfits on the regenerate" describes. These pin the two things that stop it.
 */
class RevisionPromptTest {

    private val rejected =
        "Her phone lit up on the nightstand. She took the call, already reaching for her coat, and was " +
            "gone before he could answer."

    private fun render(revision: Revision?): String = PromptBuilder.render(
        RoleplayContext(
            character = PromptCharacter("Avni", "", "", "", "", "", "", emptyList()),
            persona = null, directorNotes = "", world = null, cast = emptyList(),
            activeSpeaker = null, speakerMode = "single", sceneIntent = SceneIntent.Develop, storyDirection = StoryDirection.Empty, recalled = emptyList(),
            pins = emptyList(), timeline = emptyList(),
            currentUserMessage = "USER-PROSE", revision = revision,
            replyLength = ReplyLength.Full, modelId = "m"
        )
    ).currentUserMessage

    @Test
    fun `the model is shown the reply it is being asked to fix`() {
        val out = render(Revision(rejected, "Don't let her leave the room."))
        assertTrue("a direction with no referent is read as the brief", out.contains(rejected))
        assertTrue(out.contains("Don't let her leave the room."))
    }

    @Test
    fun `a revision is told what must not change`() {
        val out = render(Revision(rejected, "Don't let her leave the room."))
        assertTrue("without a conservation rule the model rewrites the whole scene",
            out.contains("KEEP EVERYTHING ELSE"))
        assertTrue(out.contains("not a new idea for the same turn"))
    }

    @Test
    fun `the rejected reply is marked as never having happened`() {
        val out = render(Revision(rejected, "Warmer."))
        assertTrue(out.contains("NOT part of the story"))
        assertTrue(out.contains("nothing you write may refer to it"))
    }

    @Test
    fun `direction never enters the player's voice`() {
        val out = render(Revision(rejected, "Make her stay."))
        val prose = out.indexOf("USER-PROSE")
        val block = out.indexOf("<${RevisionRendering.TAG}>")
        assertTrue("the direction must not read as something the player said", block > prose)
    }

    @Test
    fun `a plain regeneration still says what not to repeat`() {
        val out = render(Revision(rejected, ""))
        assertTrue("regenerating with no note must not be a blind reroll", out.contains(rejected))
        assertTrue(out.contains("genuinely different reply"))
        assertFalse("there is nothing to conserve against when nothing was named",
            out.contains("changing this and only this"))
    }

    @Test
    fun `a discarded attempt is a brief, not a revision of nothing`() {
        val out = render(Revision(rejected = null, direction = "Slow it down."))
        assertTrue(out.contains("nothing to revise"))
        assertTrue(out.contains("Slow it down."))
        assertTrue("an out-of-character note must never become an event in the story",
            out.contains("not an event in the story"))
    }

    @Test
    fun `a normal send carries no revision block at all`() {
        assertFalse(render(null).contains("<${RevisionRendering.TAG}>"))
    }

    @Test
    fun `nothing to say produces no revision`() {
        org.junit.Assert.assertNull(Revision.of(rejected = null, direction = null))
        org.junit.Assert.assertNull(Revision.of(rejected = "   ", direction = "  "))
        org.junit.Assert.assertNotNull(Revision.of(rejected = rejected, direction = null))
    }

    @Test
    fun `a revision still obeys the scene intent`() {
        val out = PromptBuilder.render(
            RoleplayContext(
                character = PromptCharacter("Avni", "", "", "", "", "", "", emptyList()),
                persona = null, directorNotes = "", world = null, cast = emptyList(),
                activeSpeaker = null, speakerMode = "single", sceneIntent = SceneIntent.Dwell, storyDirection = StoryDirection.Empty, recalled = emptyList(),
                pins = emptyList(), timeline = emptyList(),
                currentUserMessage = "USER-PROSE", revision = Revision(rejected, "Warmer."),
                replyLength = ReplyLength.Full, modelId = "m"
            )
        ).currentUserMessage
        // A revision is not an escape hatch from the scene. Dwell still forbids the intrusion that the
        // rejected reply committed, which is often why it was rejected.
        assertTrue(out.contains("Do NOT introduce a new event"))
        assertFalse(out.contains("an event that intrudes on the scene"))
    }
}
