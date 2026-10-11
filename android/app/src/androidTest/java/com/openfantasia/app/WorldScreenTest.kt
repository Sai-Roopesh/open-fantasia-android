package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class WorldScreenTest : WorldUiChecks() {
    @Scenario("presence › Between Scenes is quiet, and shows progress › The World moves on")
    @Test fun movingOn() = worldMovesOn()

    @Scenario("day-view › Meanwhile shows only what the Player Character knows › A rumour is marked as one")
    @Test fun meanwhile() = rumourIsMarked()

    @Test fun emptyMeanwhile() = emptyMeanwhileHasNoHeading()

    @Scenario("presence › Nothing fails silently › A step at a Scene's end fails")
    @Test fun stepFails() = aStepAtASceneEndFails()

    @Test fun reaction() = reactingToTheSceneThatEnded()

    @Test fun reactionOnTheDayView() = reactingOnceTheDayViewIsReady()

    @Test fun readingPlace() = worldReadyKeepsReadingPlace()
}
