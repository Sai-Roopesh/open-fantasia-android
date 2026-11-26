package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class PastSceneUiJvmTest : PastSceneUiChecks() {
    @Scenario("scenes › Every Scene opens with a title card › Scrolling back")
    @Test fun scrollingBackScenario() = scrollingBack()
    @Test fun aPastSceneLoadFailureShowsItsReasonAndTrace() = loadFailureShowsReasonAndTrace()
    @Test fun anUnchronicledSceneOpensAndSystemBackReturnsToTheCurrentScene() = emptySummaryAndSystemBack()
}
