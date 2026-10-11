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

    @Scenario("outside-the-scene › Backstage shows everything else, only when visited › What the Director is building toward")
    @Test fun director() = whatTheDirectorIsBuildingToward()

    @Test fun noDirectorYet() = noDirectorBeforeHePlans()

    @Scenario("outside-the-scene › Backstage shows everything else, only when visited › A gap in the record")
    @Test fun record() = aGapInTheRecord()

    @Test fun nothingMissing() = nothingMissingFromTheRecord()

    @Scenario("outside-the-scene › Backstage shows everything else, only when visited › How it's going")
    @Test fun going() = howItsGoing()

    @Test fun goingInWords() = howItsGoingSaysWhatFailed()

    @Scenario("long-run › The player steers with a brief and reactions › A brief from the phone")
    @Test fun brief() = aBriefFromThePhone()

    @Test fun stretch() = theStretchBackstage()
}

