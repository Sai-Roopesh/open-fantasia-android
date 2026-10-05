package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class CopyReplyTest : DesignUiChecks() {
    @Scenario("scenes › The latest Reply has its actions in view › Copying the latest Reply")
    @Test fun copyingReply() = copyReply()
}
