package com.example.open_fantasia.domain

import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.reducer.PromptBuilder
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A quiet scene used to be unreachable: the turn block demanded a new element and named an intrusion as
 * one way to supply it, while the variation rules forbade staying with a feeling that had landed. These
 * assert the policies are exclusive — that choosing one does not leave the others in the prompt to argue
 * with it.
 */
class SceneIntentPromptTest {

    private fun render(intent: SceneIntent): String = PromptBuilder.render(
        RoleplayContext(
            character = PromptCharacter("Avni", "", "", "", "", "", "", emptyList()),
            persona = null, directorNotes = "", world = null, cast = emptyList(),
            activeSpeaker = null, speakerMode = "single", sceneIntent = intent,
            pins = emptyList(), timeline = emptyList(),
            currentUserMessage = "USER-PROSE", revision = null, replyLength = ReplyLength.Full, modelId = "m"
        )
    ).let { it.systemPrompt + "\n" + it.currentUserMessage }

    @Test
    fun `only escalate licenses an intrusion`() {
        assertTrue(render(SceneIntent.Escalate).contains("an event that intrudes on the scene"))
        for (quiet in listOf(SceneIntent.Dwell, SceneIntent.Develop, SceneIntent.Close)) {
            assertFalse(
                "$quiet must not carry a licence to interrupt",
                render(quiet).contains("an event that intrudes on the scene")
            )
        }
    }

    @Test
    fun `dwelling forbids what escalating requires`() {
        val dwell = render(SceneIntent.Dwell)
        assertTrue(dwell.contains("Do NOT introduce a new event"))
        assertFalse(
            "a scene told to stay put must not also be told to introduce something new",
            dwell.contains("Introduce something the user did not supply")
        )
    }

    @Test
    fun `staying with a landed feeling is forbidden while moving and required while dwelling`() {
        assertTrue(render(SceneIntent.Escalate).contains("Do NOT re-play an emotional beat already shown"))
        val dwell = render(SceneIntent.Dwell)
        assertFalse(
            "the rule against re-staging a feeling is exactly wrong in an intimate scene",
            dwell.contains("Do NOT re-play an emotional beat already shown")
        )
        assertTrue(dwell.contains("may be returned to and taken further"))
    }

    @Test
    fun `exactly one turn policy is ever rendered`() {
        for (intent in SceneIntent.entries) {
            val out = render(intent)
            val headers = Regex("THIS TURN — ").findAll(out).count()
            org.junit.Assert.assertEquals("$intent rendered $headers policies", 1, headers)
        }
    }

    @Test
    fun `open threads are framed as owed nothing under a quiet intent`() {
        val world = PromptWorldState(
            metadata = SnapshotMetadata("t", "", "continuation", 1),
            spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
            entity_state = emptyList(), relational_state = emptyList(),
            narrative_state = NarrativeState("", "", "", listOf(NarrativeThread("t1", "Find the letter", "open", emptyList())), emptyList())
        )
        fun framing(intent: SceneIntent) = PromptBuilder.render(
            RoleplayContext(
                character = PromptCharacter("Avni", "", "", "", "", "", "", emptyList()),
                persona = null, directorNotes = "", world = world, cast = emptyList(),
                activeSpeaker = null, speakerMode = "single", sceneIntent = intent,
                pins = emptyList(), timeline = emptyList(),
                currentUserMessage = "x", revision = null, replyLength = ReplyLength.Full, modelId = "m"
            )
        ).systemPrompt
        assertTrue(framing(SceneIntent.Dwell).contains("must not advance one"))
        assertTrue(framing(SceneIntent.Escalate).contains("You may advance one"))
    }
}
