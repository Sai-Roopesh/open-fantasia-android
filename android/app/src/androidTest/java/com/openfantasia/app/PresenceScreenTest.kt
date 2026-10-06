package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class PresenceScreenTest : PresenceUiChecks() {
    @Scenario("presence › What has been seen can be read without the Mac › The Mac is asleep")
    @Test fun asleep() = theMacIsAsleep()

    @Test fun aMoveWaitsForTheMacCheck() = aMoveWaitsForTheMac()
    @Test fun aWaitingMoveMeetsAStoryThatMovedOnCheck() = aWaitingMoveMeetsAStoryThatMovedOn()
}
