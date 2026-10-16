package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class WriterUiJvmTest : WriterUiChecks() {
    @Scenario("scenes › A Scene ends when a Move leaves it or the player ends it › The player ends a Scene")
    @Test fun endScene() = playerEndsScene()
    @Test fun sceneClosedOnTheMac() = closedSceneOpensDayView()
    @Scenario("scenes › A Scene ends when a Move leaves it or the player ends it › The Story never closes a Scene")
    @Test fun landedScene() = landedSceneStaysOpen()
    @Scenario("day-view › The Day View says where and when the player is › A countdown")
    @Test fun dayCountdown() = countdown()
    @Test fun tappingPortraitSetsAndClearsFocus() = portraitSetsAndClearsFocus()
    @Scenario("scenes › Focus keeps a Scene close to one person › Focus starts and clears by itself")
    @Test fun sceneFocusStartsAndClears() = focusStartsAndClears()
    @Test fun focusEventsUpdateTheCard() = focusSetUpdatesCard()
    @Test fun lingerSendsAndReceivesOnAndOff() = lingerTogglesAndReceivesChanges()
    @Scenario("scenes › Redo, with a Direction and another model if wanted › A Direction that is not remembered")
    @Test fun redoWithoutRemembering() = directionIsNotRemembered()
    @Scenario("scenes › Redo, with a Direction and another model if wanted › Remember this")
    @Test fun redoAndRemember() = rememberDirection()
    @Test fun latestReplyEndRemainsAboveComposerWhenImeOpensAndWordsArrive() = replyEndStaysAboveComposerWithIme()
    @Test fun completedReplyRefreshesPeopleOnTheTitleCard() = replyRefreshesPeople()
    @Test fun latestReplyEndRemainsVisibleAsTheComposerGrows() = growingComposerKeepsReplyEndVisible()
    @Test fun aMoveShowsItsReplyIsComingBeforeTheFirstWord() = moveShowsItsReplyIsComing()
    @Test fun rememberThisNeedsADirection() = rememberThisWaitsForADirection()
    @Test fun redoGoneAtTheDayView() = noRedoAtTheDayView()
    @Scenario("presence › The player can always write › Typing during a Reply")
    @Test fun typingWhileReplyArrives() = typingDuringReply()
    @Test fun redoDirectionIsOptionalAndCancelKeepsTheReply() = redoWithoutDirectionAndCancelling()
    @Test fun readingBackStaysWhereThePlayerIs() = readingBackKeepsItsPlace()
}
