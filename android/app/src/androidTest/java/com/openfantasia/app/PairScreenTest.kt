package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class PairScreenTest : DesignUiChecks() {
    @Scenario("mac-link › Pairing happens once, by QR code › First pairing")
    @Test fun pairing() = firstPairing()
}
