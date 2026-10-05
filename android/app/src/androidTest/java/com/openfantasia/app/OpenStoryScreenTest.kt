package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class OpenStoryScreenTest : PreviouslyUiChecks() {
    @Scenario("stories › Opening a Story returns exactly where the player left › Back after a night away")
    @Test fun nightAway() = backAfterANightAway()
    @Scenario("stories › Opening a Story returns exactly where the player left › Back to a Day View")
    @Test fun dayView() = backToADayView()

    @Scenario("stories › Opening a Story returns exactly where the player left › Dismissing the card")
    @Test fun dismiss() = dismissingTheCard()

    @Test fun shortReply() = shortReplyOpensAtTheEndWithTheCardAboveIt()

    @Test fun hostDecidesWhenToShowTheCard() = onlyTheMacDecidesWhetherACardIsDue()

}
