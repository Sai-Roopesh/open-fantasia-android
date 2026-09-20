package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.PromptBuilder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A quiet scene used to be unreachable: the turn block demanded a new element and named an intrusion as
 * one way to supply it, while the variation rules forbade staying with a feeling that had landed. These
 * assert the policies are exclusive — that choosing one does not leave the others in the prompt to argue
 * with it — and, since the rewrite, that no standing order to advance the plot survives elsewhere.
 */
class SceneIntentPromptTest {

    private fun render(intent: SceneIntent): String = PromptBuilder.render(
        RoleplayContext(
            character = PromptCharacter("Avni", "", "", "", "", "", "", emptyList(), emptyList()),
            persona = null, directorNotes = "", world = null, cast = emptyList(),
            activeSpeaker = null, speakerMode = "single", sceneIntent = intent, storyDirection = emptyList(), recalled = emptyList(),
            pins = emptyList(), timeline = emptyList(),
            currentUserMessage = "USER-PROSE", revision = null, replyLength = ReplyLength.Full, modelId = "m"
        )
    ).let { it.systemPrompt + "\n" + it.currentUserMessage }

    @Test
    fun `only escalate licenses an intrusion`() {
        assertTrue(render(SceneIntent.Escalate).contains("someone at the door"))
        for (quiet in listOf(SceneIntent.Dwell, SceneIntent.Develop, SceneIntent.Close)) {
            assertFalse(
                "$quiet must not carry a licence to interrupt",
                render(quiet).contains("someone at the door")
            )
        }
    }

    @Test
    fun `dwelling says stay and does not also say push`() {
        val dwell = render(SceneIntent.Dwell)
        assertTrue(dwell.contains("Stay in this moment"))
        assertFalse(
            "a scene told to stay put must not also be told to introduce something new",
            dwell.contains("Push.")
        )
    }

    @Test
    fun `staying with a landed feeling is licensed while dwelling and not mentioned while moving`() {
        val dwell = render(SceneIntent.Dwell)
        assertTrue(dwell.contains("can be stayed with"))
        // The moving policies no longer carry a rule against re-staging a feeling: a prohibition names
        // the thing, and the one-sentence policy is the whole of the steer.
        assertFalse(render(SceneIntent.Escalate).contains("re-play an emotional beat"))
    }

    @Test
    fun `exactly one turn policy is ever rendered, and nothing else drives the plot`() {
        val policyLines = mapOf(
            SceneIntent.Dwell to "Stay in this moment",
            SceneIntent.Develop to "Move it along",
            SceneIntent.Escalate to "Push.",
            SceneIntent.Close to "Let this scene land"
        )
        for (intent in SceneIntent.entries) {
            val out = render(intent)
            val present = policyLines.filterValues { out.contains(it) }.keys
            assertEquals("$intent rendered $present", setOf(intent), present)
            // The standing order that used to sit in the response contract and argue with every quiet
            // policy. Its absence is the point of ADR-0019 finally holding.
            assertFalse(out.contains("Advance the plot"))
            assertFalse(out.contains("NEW beat"))
        }
    }

    @Test
    fun `dwelling does not ask for a fresh opening`() {
        assertFalse(render(SceneIntent.Dwell).contains("Start somewhere other than"))
        assertTrue(render(SceneIntent.Develop).contains("Start somewhere other than"))
    }
}
