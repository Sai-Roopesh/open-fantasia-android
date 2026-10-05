package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class PathsScreenTest : PathsUiChecks() {
    @Scenario("paths › Try another way from any Reply › Following the lantern")
    @Test fun tryAnotherWay() = tryAnotherWayFromAReply()

    @Scenario("paths › Rewind sets aside, never destroys › Going back and carrying on")
    @Test fun rewind() = rewindGoingBack()

    @Scenario("paths › The Paths screen › Returning by the Paths screen")
    @Test fun returning() = returningByThePathsScreen()

    @Scenario("paths › The Paths screen › Deleting a Path")
    @Test fun deleting() = deletingAPath()

    @Scenario("paths › Rewind sets aside, never destroys › Clearing what was set aside")
    @Test fun clearing() = clearingWhatWasSetAside()

    @Scenario("paths › A Path changes only between Replies › Rewinding while a Reply is written")
    @Test fun whileWriting() = rewindingWhileAReplyIsWritten()

    @Test fun startingAgainCheck() = startingAgain()
}
