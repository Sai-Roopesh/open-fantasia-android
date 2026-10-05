package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class SceneScreenTest : DesignUiChecks() {
    @Scenario("scenes › Every Scene opens with a title card › The title card")
    @Test fun sceneCard() = titleCard()
    @Test fun earlierSceneSummariesAndOpeningRemainReachable() = earlierScenes()
}
