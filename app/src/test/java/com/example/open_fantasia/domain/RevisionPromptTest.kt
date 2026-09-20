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

    private fun render(revision: Revision?, intent: SceneIntent = SceneIntent.Develop): String = PromptBuilder.render(
        RoleplayContext(
            character = PromptCharacter("Avni", "", "", "", "", "", "", emptyList(), emptyList()),
            persona = null, directorNotes = "", world = null, cast = emptyList(),
            activeSpeaker = null, speakerMode = "single", sceneIntent = intent, storyDirection = emptyList(), recalled = emptyList(),
            pins = emptyList(), timeline = emptyList(),
            currentUserMessage = "USER-PROSE", revision = revision,
            replyLength = ReplyLength.Full, modelId = "m"
        )
    ).currentUserMessage

    @Test
    fun `the model is shown the reply it is being asked to fix`() {
        val out = render(Revision(rejected, "Don't let her leave the room."))
        assertTrue("a direction with no referent is read as the brief", out.contains(rejected))
        assertTrue(out.contains("Don't let her leave the room"))
    }

    @Test
    fun `a revision is told what must not change`() {
        val out = render(Revision(rejected, "Don't let her leave the room."))
        assertTrue("without a conservation rule the model rewrites the whole scene",
            out.contains("same scene, same people, same moment, same speaker"))
        assertTrue(out.contains("change just this"))
        assertTrue(out.contains("Everything the note doesn't touch was fine"))
    }

    @Test
    fun `the rejected reply is marked as never having happened`() {
        val out = render(Revision(rejected, "Warmer."))
        assertTrue(out.contains("never happened"))
        assertTrue(out.contains("<${RevisionRendering.REJECTED_TAG}>"))
    }

    @Test
    fun `direction never enters the player's voice`() {
        val out = render(Revision(rejected, "Make her stay."))
        val prose = out.indexOf("USER-PROSE")
        val block = out.indexOf("<${RevisionRendering.REJECTED_TAG}>")
        val whisper = out.indexOf("<${PromptBuilder.WHISPER_TAG}>")
        assertTrue("the direction must not read as something the player said", block > prose)
        assertTrue("the revision lives inside the whisper", block > whisper)
    }

    @Test
    fun `a plain regeneration still says what not to repeat`() {
        val out = render(Revision(rejected, ""))
        assertTrue("regenerating with no note must not be a blind reroll", out.contains(rejected))
        assertTrue(out.contains("different choice about what happens"))
        assertFalse("there is nothing to conserve against when nothing was named",
            out.contains("change just this"))
    }

    @Test
    fun `a discarded attempt is a brief, not a revision of nothing`() {
        val out = render(Revision(rejected = null, direction = "Slow it down."))
        assertTrue(out.contains("Fresh attempt"))
        assertTrue(out.contains("Slow it down"))
        assertTrue("an out-of-character note must never become an event in the story",
            out.contains("nobody in the story said it"))
        assertFalse(out.contains("<${RevisionRendering.REJECTED_TAG}>"))
    }

    @Test
    fun `a normal send carries no revision at all`() {
        val out = render(null)
        assertFalse(out.contains("<${RevisionRendering.REJECTED_TAG}>"))
        assertFalse(out.contains("Write it again"))
        assertFalse(out.contains("Fresh attempt"))
    }

    @Test
    fun `nothing to say produces no revision`() {
        org.junit.Assert.assertNull(Revision.of(rejected = null, direction = null))
        org.junit.Assert.assertNull(Revision.of(rejected = "   ", direction = "  "))
        org.junit.Assert.assertNotNull(Revision.of(rejected = rejected, direction = null))
    }

    @Test
    fun `a revision still obeys the scene intent`() {
        val out = render(Revision(rejected, "Warmer."), intent = SceneIntent.Dwell)
        // A revision is not an escape hatch from the scene. Dwell still forbids the intrusion that the
        // rejected reply committed, which is often why it was rejected.
        assertTrue(out.contains("Stay in this moment"))
        assertFalse(out.contains("Push."))
    }
}
