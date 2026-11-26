package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class EditingUiJvmTest : EditingUiChecks() {
    @Scenario("scenes › The latest Reply has its actions in view › Holding an earlier Move")
    @Test fun holdingAMove() = holdingAnEarlierMove()

    @Scenario("scenes › Editing › Fixing a typo in the latest Reply")
    @Test fun fixingATypo() = fixingATypoInTheLatestReply()

    @Scenario("scenes › Editing › Fixing the latest Move")
    @Test fun latestMove() = fixingTheLatestMove()

    @Scenario("scenes › Editing › Editing an earlier Move")
    @Test fun earlierMove() = editingAnEarlierMove()

    @Test fun editingWaitsForTheReplyCheck() = editingWaitsForTheReply()
    @Test fun editSheetStaysWhileItsWordsScrollCheck() = editSheetStaysWhileItsWordsScroll()
}
