package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class OutsideScreenTest : OutsideUiChecks() {
    @Scenario("outside-the-scene › The Journal reads the Story back › Reading back")
    @Test fun journal() = readingBack()

    @Scenario("outside-the-scene › Backstage shows everything else, only when visited › Quirrell's nights, Backstage")
    @Test fun backstage() = quirrellsNights()

    @Scenario("long-run › Taste is short, readable and the player's › Deleting a lesson")
    @Test fun taste() = deletingALesson()
}
