package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class FailureScreenTest : DesignUiChecks() {
    @Scenario("presence › Nothing fails silently › A model is down")
    @Test fun failedReplyHasReasonAndRetry() = failedReply()
}
