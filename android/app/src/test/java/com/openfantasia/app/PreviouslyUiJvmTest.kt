package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class PreviouslyUiJvmTest : PreviouslyUiChecks() {
    @Scenario("stories › Opening a Story returns exactly where the player left › Back after a night away")
    @Test fun nightAway() = backAfterANightAway()
    @Scenario("stories › Opening a Story returns exactly where the player left › Back to a Day View")
    @Test fun dayView() = backToADayView()

    @Scenario("stories › Opening a Story returns exactly where the player left › Dismissing the card")
    @Test fun dismiss() = dismissingTheCard()

    @Test fun shortReply() = shortReplyOpensAtTheEndWithTheCardAboveIt()

    @Test fun hostDecidesWhenToShowTheCard() = onlyTheMacDecidesWhetherACardIsDue()

}
