package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class WorldUiJvmTest : WorldUiChecks() {
    @Scenario("presence › Between Scenes is quiet, and shows progress › The World moves on")
    @Test fun movingOn() = worldMovesOn()

    @Scenario("day-view › Meanwhile shows only what the Player Character knows › A rumour is marked as one")
    @Test fun meanwhile() = rumourIsMarked()

    @Test fun emptyMeanwhile() = emptyMeanwhileHasNoHeading()

    @Test fun failedWorld() = failedWorldCanBeRetried()

    @Test fun readingPlace() = worldReadyKeepsReadingPlace()
}
