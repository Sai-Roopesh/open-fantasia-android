package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class DesignUiJvmTest : DesignUiChecks() {
    @Scenario("stories › Home shows where every Story stands › Two Stories on the home screen")
    @Test fun home() = twoStories()
    @Scenario("mac-link › Pairing happens once, by QR code › First pairing")
    @Test fun pairing() = firstPairing()
    @Scenario("scenes › Every Scene opens with a title card › The title card")
    @Test fun sceneCard() = titleCard()
    @Scenario("scenes › The latest Reply has its actions in view › Copying the latest Reply")
    @Test fun copyingReply() = copyReply()
    @Scenario("scenes › Every Scene opens with a title card › Scrolling back")
    @Test fun earlierSceneSummariesAndOpeningRemainReachable() = earlierScenes()
    @Scenario("presence › Nothing fails silently › A model is down")
    @Test fun failedReplyHasReasonAndRetry() = failedReply()
    @Test fun italicsReadAsItalics() = italicReply()
    @Test fun withoutFocusTheCardSaysHow() = noFocus()
}
