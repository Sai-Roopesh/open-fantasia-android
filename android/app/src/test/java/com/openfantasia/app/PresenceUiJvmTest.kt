package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class PresenceUiJvmTest : PresenceUiChecks() {
    @Scenario("presence › What has been seen can be read without the Mac › The Mac is asleep")
    @Test fun asleep() = theMacIsAsleep()

    @Test fun aMoveWaitsForTheMacCheck() = aMoveWaitsForTheMac()
    @Test fun aWaitingMoveMeetsAStoryThatMovedOnCheck() = aWaitingMoveMeetsAStoryThatMovedOn()
}
