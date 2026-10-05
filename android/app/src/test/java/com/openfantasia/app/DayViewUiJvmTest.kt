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

    @Scenario("day-view › The player chooses where to be › Letting the Story choose")
    @Test fun story() = storyChooses()

    @Scenario("day-view › The player chooses where to be › Following someone")
    @Test fun follow() = followingSomeone()

    @Scenario("day-view › The Gap is the player's, and everything in it goes on without them › Filling the Gap")
    @Test fun gap() = fillingTheGap()

    @Test fun backDiscardsGapAndBlankSendsNullCheck() = backDiscardsGapAndBlankSendsNull()
    @Test fun somewhereIsNowCheck() = somewhereIsNow()
    @Test fun skipHasGapAcrossDaysCheck() = skipHasGapAcrossDays()
    @Test fun laterPickHasGapCheck() = laterPickHasGap()
    @Test fun unavailableOptionsAreHiddenAndOfflineDisabledCheck() = unavailableOptionsAreHiddenAndOfflineDisabled()
}
