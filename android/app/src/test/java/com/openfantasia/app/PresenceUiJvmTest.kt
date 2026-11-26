package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class PresenceUiJvmTest : PresenceUiChecks() {
    @Scenario("presence › What has been seen can be read without the Mac › The Mac is asleep")
    @Test fun asleep() = theMacIsAsleep()

    @Test fun aMoveWaitsForTheMacCheck() = aMoveWaitsForTheMac()
    @Test fun aWaitingMoveMeetsAStoryThatMovedOnCheck() = aWaitingMoveMeetsAStoryThatMovedOn()

    @Scenario("presence › A Reply arrives checked and whole › Watching a Reply come")
    @Test fun watchingAReply() = watchingAReplyCome()

    @Scenario("presence › A Reply arrives checked and whole › Looking something up")
    @Test fun lookingUp() = lookingSomethingUp()

    @Scenario("presence › Between Scenes is quiet, and shows progress › Rethinking a year")
    @Test fun rethinking() = rethinkingAYear()

    @Test fun editorsNote() = aReplyWithTheEditorsNote()
}
