package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class SceneScreenTest : DesignUiChecks() {
    @Scenario("scenes › Every Scene opens with a title card › The title card")
    @Test fun sceneCard() = titleCard()
    @Scenario("scenes › Every Scene opens with a title card › Scrolling back")
    @Test fun earlierSceneSummariesAndOpeningRemainReachable() = earlierScenes()
    @Test fun italicsReadAsItalics() = italicReply()
    @Test fun withoutFocusTheCardSaysHow() = noFocus()
}
