package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class ModelsUiJvmTest : ModelsUiChecks() {
    @Scenario("outside-the-scene › One Models screen › Moving the Weaver to Codex")
    @Test fun weaver() = movingTheWeaverToCodex()

    @Scenario("outside-the-scene › One Models screen › A Story's own Actor")
    @Test fun actor() = aStorysOwnActor()

    @Test fun unreachable() = unreachableProviderSaysWhy()

    @Scenario("scenes › Redo, with a Direction and another model if wanted › Redo on another model")
    @Test fun redo() = redoOnAnotherModel()

    @Scenario("presence › Nothing fails silently › Another model for a failed Reply")
    @Test fun failedReply() = anotherModelForAFailedReply()

    @Scenario("presence › Nothing fails silently › Another model for the World")
    @Test fun world() = anotherModelForTheWorld()
}
