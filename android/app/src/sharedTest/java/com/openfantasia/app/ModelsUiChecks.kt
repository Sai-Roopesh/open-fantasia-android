package com.openfantasia.app

import androidx.compose.ui.test.*
import com.openfantasia.protocol.*
import org.junit.Assert.*

/** The Models screen and the model for one Reply, as drawn in Models.dc.html, Redo.dc.html and SceneFailed.dc.html. */
open class ModelsUiChecks : WorldUiChecks() {
    private fun openModels() {
        val model = FantasiaModel(link)
        compose.setContent { FantasiaApp(model, PairingScanner { error("Already paired") }) }
        compose.onNodeWithContentDescription("Models").performClick()
        compose.onNodeWithText("THE ACTOR · EACH STORY ITS OWN").assertIsDisplayed()
    }

    /** The picker's chip for [name] under the row that is open. */
    private fun chip(name: String) = compose.onNode(hasText(name) and hasAnyAncestor(hasTestTag("model-picker")))

    // WHEN the player sets the Weaver to GPT 6.1 Sol
    // THEN the next Weaver work runs on GPT 6.1 Sol
    fun movingTheWeaverToCodex() {
        openModels()
        compose.onNodeWithText("EVERY STORY").assertIsDisplayed()
        for ((job, does) in listOf("Writer" to "Plans each Reply before it starts", "Chronicler" to "Records what happened",
                "Weaver" to "Moves the World on", "Director" to "Shapes the long run")) {
            compose.onNodeWithTag("models").performScrollToNode(hasText(does))
            compose.onNodeWithText(job).assertIsDisplayed()
            compose.onNodeWithText(does).assertIsDisplayed()
        }
        compose.onNodeWithText("Weaver").performClick()
        compose.onNodeWithTag("models").performScrollToNode(hasText("CODEX"))
        compose.onNodeWithText("CLAUDE").assertIsDisplayed()
        compose.onNodeWithText("CODEX").assertIsDisplayed()
        compose.preview("Models")
        chip("GPT 6.1 Sol").performClick()
        compose.runOnIdle {
            assertEquals(listOf(ModelJob.Weaver to ModelChoice(provider = ModelProvider.Codex, model = "gpt-6.1-sol", effort = "low")), link.jobModelSets)
        }
        compose.onNodeWithTag("models").performScrollToNode(hasText("EFFORT"))
        compose.onNodeWithText("EFFORT").assertIsDisplayed()
        compose.onNodeWithTag("models").performScrollToNode(hasText("High"))
        chip("High").performClick()
        compose.runOnIdle {
            assertEquals(ModelJob.Weaver to ModelChoice(provider = ModelProvider.Codex, model = "gpt-6.1-sol", effort = "high"), link.jobModelSets.last())
        }
        compose.onNodeWithTag("models").performScrollToNode(hasText("GPT 6.1 Sol · high"))
        compose.onNodeWithText("GPT 6.1 Sol · high").assertIsDisplayed()
    }

    // WHEN the player sets the Actor for "The Malfoy Problem" to Opus 5.5
    // THEN that Story's Replies are written by Opus 5.5, whatever the other Stories use
    fun aStorysOwnActor() {
        link.modelsView = FakeFantasiaLink.modelsFixture().let { view ->
            view.copy(stories = view.stories.map { it.copy(actor = FakeFantasiaLink.chosen(ModelProvider.Claude, "claude-sonnet-5-5", "Sonnet 5.5")) })
        }
        openModels()
        compose.onNodeWithText("The coast").assertIsDisplayed()
        compose.onNodeWithText("The Malfoy Problem").performClick()
        chip("Opus 5.5").performClick()
        compose.runOnIdle {
            assertEquals(listOf("story" to ModelChoice(provider = ModelProvider.Claude, model = "claude-opus-5-5")), link.actorSets)
            assertTrue(link.jobModelSets.isEmpty())
        }
        compose.onAllNodesWithText("Opus 5.5")[0].assertIsDisplayed()
        // Back to the Stories.
        compose.onNodeWithContentDescription("Back to Stories").performClick()
        compose.onNodeWithText("Open Fantasia").assertIsDisplayed()
    }

    fun unreachableProviderSaysWhy() {
        link.modelsView = FakeFantasiaLink.modelsFixture(antigravityReason = "agy is not signed in")
        openModels()
        compose.onNodeWithText("Writer").performClick()
        compose.onNodeWithTag("models").performScrollToNode(hasText("agy is not signed in"))
        compose.onNodeWithText("agy is not signed in").assertIsDisplayed()
        chip("Gemini 3.8 Flash").assertIsNotEnabled()
    }

    // GIVEN the Story's Actor is Opus 5.5
    // WHEN the player Redoes the latest Reply on GPT 6.1 Sol
    // THEN that Reply is written by GPT 6.1 Sol, and the next Reply is written by Opus 5.5 again
    fun redoOnAnotherModel() {
        openScene()
        compose.onNodeWithText("Redo").performClick()
        compose.onNodeWithText("Written by").assertIsDisplayed()
        compose.onNodeWithText("Opus 5.5 · this Story's Actor").assertIsDisplayed().performClick()
        compose.onNodeWithText("GPT 6.1 Sol · just this Reply").performClick()
        compose.onNodeWithText("GPT 6.1 Sol · just this Reply").assertIsDisplayed()
        compose.preview("RedoModel")
        compose.onNodeWithTag("confirm-redo").performClick()
        compose.runOnIdle {
            assertEquals(RedoRequest(after = "reply", direction = null, remember = false,
                model = ModelChoice(provider = ModelProvider.Codex, model = "gpt-6.1-sol", effort = "low")), link.redos.single())
        }
    }

    // GIVEN Opus 5.5 is overloaded and the Reply failed
    // WHEN the player chooses another model, GPT 6.1 Sol
    // THEN the Reply is written by GPT 6.1 Sol
    fun anotherModelForAFailedReply() {
        link.current.value = link.current.value.copy(turn = TurnState(kind = TurnStateKind.Failed, job = ModelJob.Actor,
            reason = "Opus 5.5 is overloaded right now. Your Move is kept.", traceID = "606efe42"))
        openScene()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Another model"))
        compose.onNodeWithText("Another model").assertIsDisplayed().performClick()
        compose.onNodeWithText("Write it with another model").assertIsDisplayed()
        chip("GPT 6.1 Sol").performClick()
        compose.runOnIdle {
            assertEquals(listOf(RetryRequest(model = ModelChoice(provider = ModelProvider.Codex, model = "gpt-6.1-sol", effort = "low"))), link.retryRequests)
        }
        compose.onNodeWithText("Write it with another model").assertDoesNotExist()
    }

    // GIVEN the Weaver's model failed and the World could not move on
    // WHEN the player chooses another model, Sonnet 5.5
    // THEN the World moves on with Sonnet 5.5, and the Day View is ready
    fun anotherModelForTheWorld() {
        openScene()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(headEntryID = "closed", seq = 4, lastEventID = "4",
                dayView = FakeFantasiaLink.dayView(closedBy = ClosedBy.Player).copy(world = World.Failed,
                    failure = WorldFailure(reason = "GPT 6.1 Sol is at capacity", traceID = "world-trace")))
        }
        compose.onNodeWithText("Another model").assertIsDisplayed().performClick()
        compose.onNodeWithText("Move the World on with another model").assertIsDisplayed()
        chip("Sonnet 5.5").performClick()
        compose.runOnIdle {
            assertEquals(listOf(RetryWorldRequest(model = ModelChoice(provider = ModelProvider.Claude, model = "claude-sonnet-5-5"))), link.worldRetryRequests)
        }
    }
}
