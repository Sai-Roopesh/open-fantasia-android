package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class EditingScreenTest : EditingUiChecks() {
    @Scenario("scenes › The latest Reply has its actions in view › Holding an earlier Move")
    @Test fun holdingAMove() = holdingAnEarlierMove()

    @Scenario("scenes › Editing › Fixing a typo in the latest Reply")
    @Test fun fixingATypo() = fixingATypoInTheLatestReply()

    @Scenario("scenes › Editing › Editing an earlier Move")
    @Test fun earlierMove() = editingAnEarlierMove()

    @Test fun editingWaitsForTheReplyCheck() = editingWaitsForTheReply()
    @Test fun editSheetStaysWhileItsWordsScrollCheck() = editSheetStaysWhileItsWordsScroll()
}
