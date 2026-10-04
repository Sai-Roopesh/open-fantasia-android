package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(ScenarioRunner::class)
class WriterScreenTest : WriterUiChecks() {
    @Scenario("scenes › A Scene ends in one of three ways › The player ends a Scene")
    @Test fun endScene() = playerEndsScene()
    @Scenario("scenes › A Scene ends in one of three ways › The Story closes a Scene")
    @Test fun sceneClosed() = storyClosesScene()
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
    @Test fun redoIsOfferedOnlyWhereTheStoryClosedTheScene() = redoOnlyWhereTheStoryClosedTheScene()
}
