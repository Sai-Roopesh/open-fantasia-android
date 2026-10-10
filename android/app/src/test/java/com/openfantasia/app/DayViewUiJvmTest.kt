package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class DayViewUiJvmTest : DayViewUiChecks() {
    @Scenario("day-view › Up to four Happenings › A summons is marked")
    @Test fun summons() = summonsIsMarked()

    @Scenario("day-view › Up to four Happenings › The next Scene that matters is days away")
    @Test fun daysAway() = nextSceneDaysAway()

    @Scenario("day-view › What he has arranged is on › Wednesday evenings in the library")
    @Test fun weekly() = wednesdayEvenings()

    @Scenario("day-view › The player chooses where to be › Letting the Story choose")
    @Test fun story() = storyChooses()

    @Scenario("day-view › The player chooses where to be › Following someone")
    @Test fun follow() = followingSomeone()

    @Scenario("day-view › The Gap is the player's, and everything in it goes on without them › Filling the Gap")
    @Test fun gap() = fillingTheGap()

    @Scenario("presence › Between Scenes is quiet, and shows progress › The next Scene is being written")
    @Test fun nextScene() = nextSceneOpensAtOnce()

    @Scenario("day-view › The Gap is the player's, and everything in it goes on without them › A choice that fails keeps the Gap")
    @Test fun failedChoice() = failedChoiceKeepsTheGap()

    @Test fun failedWhileOpeningKeepsTheCardCheck() = failedWhileOpeningKeepsTheCard()
    @Test fun backDiscardsGapAndBlankSendsNullCheck() = backDiscardsGapAndBlankSendsNull()
    @Test fun somewhereIsNowCheck() = somewhereIsNow()
    @Test fun skipHasGapAcrossDaysCheck() = skipHasGapAcrossDays()
    @Scenario("day-view › The player chooses where to be › A Landmark weeks away")
    @Test fun landmarkWeeksAwayCheck() = landmarkWeeksAway()
    @Scenario("day-view › The Gap is the player's, and everything in it goes on without them › What goes on without him, in time order")
    @Test fun gapInTimeOrderCheck() = gapInTimeOrder()
    @Test fun laterPickHasGapCheck() = laterPickHasGap()
    @Test fun unavailableOptionsAreHiddenAndOfflineDisabledCheck() = unavailableOptionsAreHiddenAndOfflineDisabled()
}
