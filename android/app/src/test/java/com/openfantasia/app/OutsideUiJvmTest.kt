package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class OutsideUiJvmTest : OutsideUiChecks() {
    @Scenario("outside-the-scene › The Journal reads the Story back › Reading back")
    @Test fun journal() = readingBack()

    @Scenario("outside-the-scene › Backstage shows everything else, only when visited › Quirrell's nights, Backstage")
    @Test fun backstage() = quirrellsNights()

    @Scenario("long-run › Taste is short, readable and the player's › Deleting a lesson")
    @Test fun taste() = deletingALesson()

    @Scenario("outside-the-scene › Backstage shows everything else, only when visited › What the Director is building toward")
    @Test fun director() = whatTheDirectorIsBuildingToward()

    @Test fun noDirectorYet() = noDirectorBeforeHePlans()

    @Scenario("outside-the-scene › Backstage shows everything else, only when visited › A gap in the record")
    @Test fun record() = aGapInTheRecord()

    @Test fun nothingMissing() = nothingMissingFromTheRecord()

    @Test fun stretch() = theStretchBackstage()
}

