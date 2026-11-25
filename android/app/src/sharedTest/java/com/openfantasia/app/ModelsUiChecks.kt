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
        compose.onNodeWithText("STORY ACTORS").assertIsDisplayed()
    }

    /** The picker's chip for [name] under the row that is open. */
    private fun chip(name: String) = compose.onNode(hasText(name) and hasAnyAncestor(hasTestTag("model-picker")))

    // WHEN the player sets the Weaver to GPT 6.1 Sol
    // THEN the next Weaver work runs on GPT 6.1 Sol
    fun movingTheWeaverToCodex() {
        openModels()
        compose.onNodeWithText("BACKGROUND JOBS").assertIsDisplayed()
        for ((job, does) in listOf("Writer" to "Plans each Reply before it starts", "Editor" to "Checks each Reply before you read it",
                "Chronicler" to "Records what happened", "Director" to "Keeps the Outline and plans the days ahead", "Weaver" to "Moves the World on")) {
            compose.onNodeWithTag("models").performScrollToNode(hasText(does))
            compose.onNodeWithText(job).assertIsDisplayed()
            compose.onNodeWithText(does).assertIsDisplayed()
        }
        compose.onNodeWithText("Weaver").performClick()
        compose.onNodeWithTag("models").performScrollToNode(hasText("CODEX"))
        compose.onNodeWithText("CLAUDE").assertIsDisplayed()
        compose.onNodeWithText("CODEX").assertIsDisplayed().performClick()
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
        compose.onNodeWithText("ANTIGRAVITY").performClick()
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
        compose.onNodeWithText("Opus 5.5 · Story Actor").assertIsDisplayed().performClick()
        compose.onNodeWithText("CODEX").performClick()
        chip("GPT 6.1 Sol").performClick()
        compose.onNodeWithText("GPT 6.1 Sol · this reply only").assertIsDisplayed()
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
        compose.onNodeWithText("CODEX").performClick()
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
                dayView = FakeFantasiaLink.dayView().copy(sceneEnd = SceneEnd(failed = SceneEndFailure(
                    step = SceneEndStep.Weaver, reason = "GPT 6.1 Sol is at capacity.", traceID = "weaver-trace"))))
        }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Trace weaver-trace"))
        compose.onNodeWithText("The Weaver could not move the World on").assertIsDisplayed()
        compose.onNodeWithText("Another model").assertIsDisplayed().performClick()
        compose.onNodeWithText("Move the World on with another model").assertIsDisplayed()
        chip("Sonnet 5.5").performClick()
        compose.runOnIdle {
            assertEquals(listOf(RetryRequest(model = ModelChoice(provider = ModelProvider.Claude, model = "claude-sonnet-5-5"))), link.retryRequests)
        }
        compose.onNodeWithText("Move the World on with another model").assertDoesNotExist()
        step("The World moves on", "Under way")
        sceneEndAt(SceneEnd())
        compose.onNodeWithText("3 days").assertIsDisplayed()
        compose.onNodeWithTag("composer").assertIsDisplayed()
    }

    // WHEN the player sets the Folder to Haiku 4.5
    // THEN the Models screen shows the Folder on Haiku 4.5, and the next fold runs on it
    fun theFolderOnHaiku() {
        openModels()
        compose.onNodeWithTag("models").performScrollToNode(hasText("Keeps The Story So Far short"))
        compose.onNode(hasText("Folder") and hasText("Keeps The Story So Far short") and hasText("Opus 5.5")).assertIsDisplayed()
        compose.onNodeWithText("Folder").performClick()
        compose.onNodeWithTag("models").performScrollToNode(hasText("Haiku 4.5") and hasAnyAncestor(hasTestTag("model-picker")))
        chip("Haiku 4.5").performClick()
        compose.runOnIdle {
            assertEquals(listOf(ModelJob.Folder to ModelChoice(provider = ModelProvider.Claude, model = "claude-haiku-4-5-20251001")), link.jobModelSets)
        }
        compose.onNodeWithTag("models").performScrollToNode(hasText("Folder"))
        compose.onNode(hasText("Folder") and hasText("Haiku 4.5")).assertIsDisplayed()
        // Its fallback model: collapsed to one line by default, then quick picks + More… when opened.
        compose.onNodeWithTag("models").performScrollToNode(hasText("Change"))
        compose.onNodeWithText("Change").performClick()
        backup("GPT 6.1 Sol").assertIsSelected()
        backup("Opus 5.5").assertIsNotSelected()
        compose.onNodeWithTag("models").performScrollToNode(hasText("More…"))
        backup("More…").assertIsDisplayed()
        compose.preview("Models · second model")
        backup("Opus 5.5").performClick()
        compose.runOnIdle {
            assertEquals(listOf(ModelJob.Folder to ModelChoice(provider = ModelProvider.Claude, model = "claude-opus-5-5", effort = "low")), link.backupSets)
            assertEquals(1, link.jobModelSets.size)
        }
        backup("Opus 5.5").assertIsSelected()
        // More… shows every model a provider offers.
        compose.onNodeWithTag("models").performScrollToNode(hasText("More…"))
        backup("More…").performClick()
        compose.onNodeWithTag("models").performScrollToNode(hasText("Sonnet 5.5") and hasAnyAncestor(hasTestTag("backup-picker")))
        backup("Sonnet 5.5").performClick()
        compose.runOnIdle {
            assertEquals(ModelJob.Folder to ModelChoice(provider = ModelProvider.Claude, model = "claude-sonnet-5-5", effort = "low"), link.backupSets.last())
        }
    }

    // GIVEN the player has never set a model
    // THEN the Models screen shows the Director on Fable 5.1, the Editor on Sonnet 5.5, and every other job on Opus
    //   5.5, each with GPT 6.1 Sol as its second model
    fun theDefaults() {
        openModels()
        for (story in listOf("The Malfoy Problem", "The coast")) compose.onNode(hasText(story) and hasText("Opus 5.5")).assertIsDisplayed()
        compose.onNode(hasText("Actor fallback") and hasText("Used if a story's Actor fails") and hasText("GPT 6.1 Sol · low")).assertIsDisplayed()
        for ((job, model) in listOf("Writer" to "Opus 5.5", "Editor" to "Sonnet 5.5", "Chronicler" to "Opus 5.5",
                "Director" to "Fable 5.1 · high", "Weaver" to "Opus 5.5", "Folder" to "Opus 5.5")) {
            val row = hasText(job) and hasText(model)
            compose.onNodeWithTag("models").performScrollToNode(row)
            compose.onNode(row).assertIsDisplayed().performClick()
            compose.onNodeWithTag("models").performScrollToNode(hasText("Change"))
            compose.onNodeWithText("Change").performClick()
            compose.onNodeWithTag("models").performScrollToNode(hasText("GPT 6.1 Sol") and hasAnyAncestor(hasTestTag("backup-picker")))
            backup("GPT 6.1 Sol").assertIsSelected()
            if (job == "Editor") compose.preview("Models · the Editor")
            compose.onNodeWithTag("models").performScrollToNode(row)
            compose.onNode(row).performClick()
        }
        compose.runOnIdle { assertTrue(link.jobModelSets.isEmpty() && link.backupSets.isEmpty()) }
    }

    // The Actor's second model, for every Story, in the Actor's section.
    fun theActorsSecondModel() {
        openModels()
        compose.onNode(hasText("Actor fallback") and hasText("Used if a story's Actor fails") and hasText("GPT 6.1 Sol · low")).assertIsDisplayed().performClick()
        backup("GPT 6.1 Sol").assertIsSelected()
        backup("Opus 5.5").performClick()
        compose.runOnIdle {
            assertEquals(listOf(ModelJob.Actor to ModelChoice(provider = ModelProvider.Claude, model = "claude-opus-5-5", effort = "low")), link.backupSets)
            assertTrue(link.actorSets.isEmpty())
        }
        compose.onNodeWithText("Opus 5.5 · low").assertIsDisplayed()
    }

    /** The chip for [name] among a job's second models. */
    private fun backup(name: String) = compose.onNode(hasText(name) and hasAnyAncestor(hasTestTag("backup-picker")))
}
