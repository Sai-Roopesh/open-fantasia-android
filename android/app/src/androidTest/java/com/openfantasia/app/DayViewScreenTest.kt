package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class DayViewScreenTest : DayViewUiChecks() {
    @Scenario("day-view › Up to four Happenings › A summons is marked")
    @Test fun summons() = summonsIsMarked()

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
    @Test fun laterPickHasGapCheck() = laterPickHasGap()
    @Test fun unavailableOptionsAreHiddenAndOfflineDisabledCheck() = unavailableOptionsAreHiddenAndOfflineDisabled()
}
