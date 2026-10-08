package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class WorldScreenUiJvmTest : WorldScreenUiChecks() {
    @Scenario("outside-the-scene › The World screen shows what the Player Character knows › A secret stays out of the World screen")
    @Test fun secret() = aSecretStaysOut()

    @Scenario("outside-the-scene › The World screen shows what the Player Character knows › What he knows grows with a Scene")
    @Test fun grows() = whatHeKnowsGrows()

    @Test fun placesAndCalendar() = placesAndTheCalendar()

    @Test fun nobodyKnown() = nobodyKnownYet()

    @Test fun headerIcons() = theHeaderIsIcons()
}
