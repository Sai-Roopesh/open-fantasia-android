package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class WorldScreenScreenTest : WorldScreenUiChecks() {
    @Scenario("outside-the-scene › The World screen shows what the Player Character knows › A secret stays out of the World screen")
    @Test fun secret() = aSecretStaysOut()

    @Scenario("outside-the-scene › The World screen shows what the Player Character knows › What he knows grows with a Scene")
    @Test fun grows() = whatHeKnowsGrows()

    @Test fun placesAndCalendar() = placesAndTheCalendar()

    @Scenario("outside-the-scene › The World screen shows what the Player Character knows › Between you")
    @Test fun between() = betweenYou()

    @Test fun nobodyKnown() = nobodyKnownYet()

    @Test fun headerIcons() = theHeaderIsIcons()
}
