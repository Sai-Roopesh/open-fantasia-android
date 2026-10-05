package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class PastSceneScreenTest : PastSceneUiChecks() {
    @Scenario("scenes › Every Scene opens with a title card › Scrolling back")
    @Test fun scrollingBackScenario() = scrollingBack()
    @Test fun aPastSceneLoadFailureShowsItsReasonAndTrace() = loadFailureShowsReasonAndTrace()
    @Test fun anUnchronicledSceneOpensAndSystemBackReturnsToTheCurrentScene() = emptySummaryAndSystemBack()
}
