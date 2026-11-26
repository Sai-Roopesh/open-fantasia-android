package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class HomeScreenTest : DesignUiChecks() {
    @Scenario("stories › Home shows where every Story stands › Two Stories on the home screen")
    @Test fun home() = twoStories()
}
