package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.text.TextLayoutResult
import com.openfantasia.protocol.*
import org.junit.Assert.*

open class DayViewUiChecks : WorldUiChecks() {
    private val summons = Happening(id = "summons", at = "Day 3 09:00", time = "9:00 am", daysAway = 0,
        place = "McGonagall's office", what = "Your account of the troll. Hermione goes in first.",
        who = listOf("McGonagall", "Hermione", "Harry"), expected = true, pick = true)
    private val hospital = Happening(id = "hospital", at = "Day 3 11:00", time = "11:00 am", daysAway = 0,
        place = "the hospital wing", what = "Draconia is fighting Snape for her bed back.",
        who = listOf("Draconia", "Snape", "Pansy"), expected = false, pick = false)
    private val tomorrow = Skip(label = "Tomorrow", inSentence = "tomorrow", at = "Day 4 07:30", time = "Monday 7:30 am", daysAway = 1)
    private val evening = Skip(label = "This evening", inSentence = "this evening", at = "Day 3 18:00", time = "6:00 pm", daysAway = 0)
    private fun ready(happenings: List<Happening> = listOf(summons, hospital), skips: List<Skip> = listOf(evening, tomorrow)) {
        link.current.value = link.current.value.copy(headEntryID = "closed", dayView = FakeFantasiaLink.dayView().copy(
            place = "Gryffindor Tower", happenings = happenings,
            meanwhile = listOf(MeanwhileItem(how = How.Seen, text = "A note under the door.")),
            choices = DayChoices(follow = listOf("Hermione", "Draconia"), places = listOf("The library"), skips = skips)))
        openScene()
    }
    private fun tap(text: String) = compose.onNodeWithText(text).performScrollTo().performClick()
    private fun go(id: String) = compose.onNodeWithTag("go-$id").performScrollTo().performClick()
    private fun sent(request: ChooseRequest) = compose.runOnIdle {
        assertEquals(listOf(request), link.choices)
        assertTrue(link.moves.isEmpty())
    }

    // GIVEN McGonagall has summoned the Player Character to her office at 9:00
    // THEN that Happening is marked "You're expected"
    fun summonsIsMarked() {
        ready(listOf(summons, hospital, hospital.copy(id = "healer", time = "2:00 pm", at = "Day 3 14:00"),
            hospital.copy(id = "twins", time = "8:00 pm", at = "Day 3 20:00")))
        compose.onNodeWithText("WHAT'S ON").performScrollTo().assertIsDisplayed()
        val first = compose.onNodeWithTag("happening-summons").getUnclippedBoundsInRoot()
        val second = compose.onNodeWithTag("happening-hospital").getUnclippedBoundsInRoot()
        assertTrue("The pick comes first", first.top < second.top)
        compose.onNodeWithText("The Story's pick").assertIsDisplayed()
        val pill = compose.onNodeWithText("You're expected").assertIsDisplayed()
        val layouts = mutableListOf<TextLayoutResult>()
        pill.performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
        assertEquals(FailureAmber, layouts.single().layoutInput.style.color)
        compose.onNodeWithText("9:00 am · McGonagall's office").assertIsDisplayed()
        val prose = mutableListOf<TextLayoutResult>()
        compose.onNodeWithText(summons.what).performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(prose) }
        assertEquals(Literata, prose.single().layoutInput.style.fontFamily)
        compose.onNodeWithText("McGonagall · Hermione · Harry").assertIsDisplayed()
        compose.onAllNodesWithText("Go").assertCountEquals(4)
        compose.preview("DayViewToday")
        compose.onNodeWithText("OR").performScrollTo().assertIsDisplayed()
        for (text in listOf("Follow someone", "Go somewhere", "Skip to later", "Let the Story choose"))
            compose.onNodeWithText(text).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("composer").assertIsDisplayed()
    }

    // GIVEN it is Saturday morning, and the Stretch's next Scene that matters is Draconia cornering him after Charms on
    //   Thursday
    // THEN the Day View's first offer is Thursday's, labelled "Thursday 10:00 am · in 5 days"
    // WHEN the player chooses it
    // THEN the days between pass, the next Scene opens on Thursday, and Meanwhile says what he learned since Saturday
    // (The days passing are the Mac's; here, the offer and the choice.)
    fun nextSceneDaysAway() {
        val thursday = Happening(id = "thursday", at = "Day 8 10:00", time = "Thursday 10:00 am", daysAway = 5, scene = "s-thursday",
            place = "The corridor outside Charms", what = "Draconia has been waiting for Charms to end, and not for Pansy.",
            who = listOf("Draconia", "Pansy"), expected = false, pick = true)
        ready(listOf(thursday, summons.copy(pick = false)))
        compose.onNodeWithText("WHAT'S ON").performScrollTo().assertIsDisplayed()
        val first = compose.onNodeWithTag("happening-thursday").getUnclippedBoundsInRoot()
        val second = compose.onNodeWithTag("happening-summons").getUnclippedBoundsInRoot()
        assertTrue("The Story's pick comes first", first.top < second.top)
        compose.onNodeWithText("Thursday 10:00 am · in 5 days").assertIsDisplayed()
        compose.onNodeWithText("The corridor outside Charms").assertIsDisplayed()
        // Today's offers stay as they were, the time and the place on one line.
        compose.onNodeWithText("9:00 am · McGonagall's office").performScrollTo().assertIsDisplayed()
        compose.preview("DayView · days away")
        // The days between are the Gap: the player may say how he spent them.
        go("thursday")
        compose.onNodeWithText("What did you do in the Gap?").assertIsDisplayed()
        compose.onNodeWithText("Go to The corridor outside Charms").performClick()
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Go, happening = "thursday"))
    }

    // GIVEN in Sunday's Scene Draconia set Wednesday evenings at half past seven in the library, and he said he would be there
    // THEN every Day View until then offers Wednesday 7:30 pm in the library, marked "You're expected"
    // (The Day View's half, as DayView.dc.html draws a weekly Engagement.)
    fun wednesdayEvenings() {
        val library = Happening(id = "e-library", at = "Day 5 19:30", time = "7:30 pm", every = "Wednesday", daysAway = 3,
            place = "The library", what = "Draconia's hour on the Charms practical, at the end table, on her terms.",
            who = listOf("Draconia"), expected = true, pick = false)
        ready(listOf(summons, library))
        compose.onNodeWithText("Every Wednesday · 7:30 pm · The library").performScrollTo().assertIsDisplayed()
        val card = compose.onNodeWithTag("happening-e-library")
        card.assert(hasAnyDescendant(hasText("You're expected")))
        compose.onAllNodesWithText("in 3 days", substring = true).assertCountEquals(0)
        compose.preview("DayView · weekly")
        go("e-library")
        compose.onNodeWithText("Go to The library").performClick()
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Go, happening = "e-library"))
    }

    // WHEN the player taps Let the Story choose
    // THEN the next Scene opens on the Story's own pick
    fun storyChooses() {
        ready(listOf(summons.copy(at = "Day 3 07:40", time = "7:40 am")))
        tap("Let the Story choose")
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Story))
        compose.onNodeWithText("What did you do in the Gap?").assertDoesNotExist()
        // Taken, and the Mac has not yet said what the Reply is doing.
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Looking back…"))
        compose.onNodeWithText("Looking back…").assertIsDisplayed()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(dayView = null, seq = 5, headEntryID = "next-reply",
                scene = link.current.value.scene.copy(number = 15, title = "The accounts", at = "Day 3 07:40",
                    atLabel = "Sunday 7:40 am", place = summons.place, people = summons.who.map { PersonCard(name = it) }))
        }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("The accounts"))
        compose.onNodeWithText("The accounts").assertIsDisplayed()
        compose.onNodeWithTag("reply-under-way").assertDoesNotExist()
    }

    // WHEN the player chooses Follow and picks Hermione
    // THEN the next Scene opens wherever Hermione is going next, with her in it
    fun followingSomeone() {
        ready()
        tap("Follow someone")
        compose.onNodeWithTag("choice-sheet").assertIsDisplayed()
        compose.onNodeWithText("Draconia").assertIsDisplayed()
        compose.onNodeWithText("Hermione").performClick()
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Follow, who = "Hermione"))
        compose.onNodeWithText("What did you do in the Gap?").assertDoesNotExist()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(dayView = null, headEntryID = "next", seq = 5,
                scene = link.current.value.scene.copy(number = 15, title = "Among the shelves", place = "The library",
                    people = listOf(PersonCard(name = "Hermione"))))
        }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Among the shelves"))
        compose.onNodeWithText("Among the shelves").assertIsDisplayed()
        compose.onNodeWithText("Hermione").assertIsDisplayed()
    }

    // WHEN the player goes to the hospital wing at 11:00 and writes "I spent the morning in the library reading about life debts"
    // THEN that is what he did, and the Story can draw on it later
    fun fillingTheGap() {
        ready()
        go("hospital")
        compose.onNodeWithText("What did you do in the Gap?").assertIsDisplayed()
        compose.onNodeWithText("7:40 am – 11:00 am, before the hospital wing").assertIsDisplayed()
        compose.onNodeWithText("GOES ON WITHOUT YOU").assertIsDisplayed()
        compose.onNodeWithText("9:00 am · McGonagall's office. You're expected.").assertIsDisplayed()
        compose.onNodeWithText("11:00 am · the hospital wing.").assertDoesNotExist()
        compose.onNodeWithContentDescription("What Roopesh did").assertIsDisplayed()
        compose.onNodeWithText("I spent the morning in the library reading about life debts.").assertIsDisplayed()
        compose.onNodeWithText("Left blank, Roopesh spends it quietly in Gryffindor Tower.").assertIsDisplayed()
        compose.preview("Gap")
        val words = "I spent the morning in the library reading about life debts"
        compose.onNodeWithTag("gap-text").performTextInput(words)
        compose.onNodeWithText("Go to the hospital wing").performClick()
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Go, happening = "hospital", gap = words))
    }

    fun backDiscardsGapAndBlankSendsNull() {
        ready()
        go("hospital")
        compose.onNodeWithTag("gap-text").performTextInput("Discard this")
        compose.onNodeWithText("Back").performClick()
        compose.runOnIdle { assertTrue(link.choices.isEmpty()) }
        go("hospital")
        compose.onNodeWithTag("gap-text").assertTextEquals("")
        compose.onNodeWithTag("gap-text").performTextInput("  ")
        compose.onNodeWithText("Go to the hospital wing").performClick()
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Go, happening = "hospital"))
    }

    fun somewhereIsNow() {
        ready()
        tap("Go somewhere")
        compose.onNodeWithText("The library").performClick()
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Somewhere, place = "The library"))
        compose.onNodeWithText("What did you do in the Gap?").assertDoesNotExist()
    }

    fun skipHasGapAcrossDays() {
        ready()
        tap("Skip to later")
        compose.onNodeWithText(tomorrow.time).assertIsDisplayed()
        compose.onNodeWithText("Tomorrow").performClick()
        compose.onNodeWithText("7:40 am – Monday 7:30 am, before tomorrow").assertIsDisplayed()
        compose.onNodeWithText("11:00 am · the hospital wing.").assertIsDisplayed()
        compose.onNodeWithText("Skip to tomorrow").performClick()
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Skip, at = tomorrow.at))
    }

    // GIVEN it is Friday, and the next Landmark, the Halloween troll, is on a Thursday 48 days on
    // THEN Skip to later offers it as "Thursday 7:00 pm · in 48 days", and next week as "Friday 7:30 am · in 7 days"
    fun landmarkWeeksAway() {
        val nextWeek = Skip(label = "Next week", inSentence = "next week", at = "Day 10 07:30", time = "Friday 7:30 am", daysAway = 7)
        val troll = Skip(label = "The Halloween troll", inSentence = "The Halloween troll", at = "Day 51 19:00", time = "Thursday 7:00 pm", daysAway = 48)
        ready(skips = listOf(tomorrow, nextWeek, troll))
        tap("Skip to later")
        compose.onNodeWithText("Thursday 7:00 pm · in 48 days").assertIsDisplayed()
        compose.onNodeWithText("Friday 7:30 am · in 7 days").assertIsDisplayed()
        // Within the week the weekday says the day.
        compose.onNodeWithText("Monday 7:30 am").assertIsDisplayed()
        compose.preview("DayView · skip weeks away")
        // The Gap says the time it runs to, as before.
        compose.onNodeWithText("The Halloween troll").performClick()
        compose.onNodeWithText("7:40 am – Thursday 7:00 pm, before The Halloween troll").assertIsDisplayed()
    }

    // GIVEN the Story's pick is on Sunday at 2:00 pm, and he is expected in the library on Saturday at 10:00 am
    // WHEN the player skips to next week
    // THEN the Gap lists Saturday's library first, then Sunday's
    fun gapInTimeOrder() {
        val sunday = Happening(id = "sunday", at = "Day 5 14:00", time = "Sunday 2:00 pm", daysAway = 2, scene = "s-sunday",
            place = "The back tables", what = "Draconia, away from Pansy.", who = listOf("Draconia"), expected = false, pick = true)
        val saturday = Happening(id = "saturday", at = "Day 4 10:00", time = "Tomorrow 10:00 am", daysAway = 1,
            place = "the library", what = "Draconia, about the train.", who = listOf("Draconia"), expected = true, pick = false)
        val nextWeek = Skip(label = "Next week", inSentence = "next week", at = "Day 10 07:30", time = "Friday 7:30 am", daysAway = 7)
        ready(listOf(sunday, saturday), skips = listOf(tomorrow, nextWeek))
        tap("Skip to later")
        compose.onNodeWithText("Next week").performClick()
        val first = compose.onNodeWithText("Tomorrow 10:00 am · the library. You're expected.").assertIsDisplayed().getUnclippedBoundsInRoot()
        val second = compose.onNodeWithText("Sunday 2:00 pm · The back tables.").assertIsDisplayed().getUnclippedBoundsInRoot()
        assertTrue("Saturday's library comes before Sunday's", first.top < second.top)
    }

    // GIVEN he is in the Three Broomsticks on Friday night
    // WHEN the player skips to next week and leaves the Gap blank
    // THEN the Gap says he goes about his days quietly, and nowhere says he spent the week in the Three Broomsticks
    fun blankWeek() {
        val nextWeek = Skip(label = "Next week", inSentence = "next week", at = "Day 10 07:30", time = "Friday 7:30 am", daysAway = 7)
        ready(skips = listOf(tomorrow, nextWeek))
        compose.runOnIdle { link.current.value = link.current.value.copy(dayView = link.current.value.dayView!!.copy(place = "The Three Broomsticks")) }
        tap("Skip to later")
        compose.onNodeWithText("Next week").performClick()
        compose.onNodeWithText("Left blank, Roopesh goes about his days quietly.").assertIsDisplayed()
        compose.onNodeWithText("the Three Broomsticks", substring = true).assertDoesNotExist()
        compose.preview("Gap · a blank week")
    }

    fun laterPickHasGap() {
        ready()
        tap("Let the Story choose")
        compose.onNodeWithText("7:40 am – 9:00 am, before McGonagall's office").assertIsDisplayed()
        compose.onNodeWithText("9:00 am · McGonagall's office. You're expected.").assertDoesNotExist()
        compose.onNodeWithText("Go to McGonagall's office").performClick()
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Story))
    }

    fun unavailableOptionsAreHiddenAndOfflineDisabled() {
        ready(emptyList())
        compose.runOnIdle { link.current.value = link.current.value.copy(dayView = link.current.value.dayView!!.copy(
            choices = link.current.value.dayView!!.choices.copy(places = emptyList()))) }
        compose.onNodeWithText("WHAT'S ON TODAY").assertDoesNotExist()
        compose.onNodeWithText("Let the Story choose").assertDoesNotExist()
        compose.onNodeWithText("Go somewhere").assertDoesNotExist()
        compose.onNodeWithText("OR").performScrollTo().assertIsDisplayed()
        compose.runOnIdle { link.reachable.value = false }
        compose.onNodeWithText("Follow someone").assertIsNotEnabled()
        compose.onNodeWithText("Skip to later").assertIsNotEnabled()
    }

    private val ride = "I ride on to Shimla, go to the interview at eleven, and come out not sure of anything."
    private val chosenMove = Exchange(move = Passage(entryID = "move", text = "$ride I let the time pass until this evening: Sunday 6:00 pm."))
    /** What the Mac sends once it has taken the choice: the Move, under the next Scene's card, and no Day View. */
    private fun opening(turn: TurnState = TurnState(kind = TurnStateKind.Writing, traceID = "choose")) = compose.runOnIdle {
        val view = link.current.value
        link.current.value = view.copy(dayView = null, opening = NextScene(at = evening.at, atLabel = "Sunday 6:00 pm"),
            exchanges = listOf(chosenMove), headEntryID = "move", seq = 5, lastEventID = "5", turn = turn,
            earlierScenes = view.earlierScenes + SceneSummaryLine(number = 14, title = "After curfew", summary = ""))
    }

    // GIVEN the Night Train's Day View at 9:05 am
    // WHEN the player chooses Skip to later, This evening, and writes "I ride on to Shimla, go to the interview at eleven, and come out not sure of anything."
    // THEN the Scene opens at once with that Move, under a card that says Friday 6:00 pm and that the Scene is being written
    // AND the card takes the Scene's title, place and Portraits when the Scene has opened
    fun nextSceneOpensAtOnce() {
        ready()
        tap("Skip to later")
        compose.onNodeWithText("6:00 pm").assertIsDisplayed()
        compose.onNodeWithText("This evening").performClick()
        compose.onNodeWithText("7:40 am – 6:00 pm, before this evening").assertIsDisplayed()
        compose.onNodeWithTag("gap-text").performTextInput(ride)
        compose.onNodeWithText("Skip to this evening").performClick()
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Skip, at = evening.at, gap = ride))
        opening()
        compose.onNodeWithText("What did you do in the Gap?").assertDoesNotExist()
        compose.onNodeWithText("WHAT'S ON TODAY").assertDoesNotExist()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("NEXT SCENE"))
        compose.onNodeWithText("NEXT SCENE").assertIsDisplayed()
        compose.onNodeWithText("Sunday 6:00 pm").assertIsDisplayed()
        compose.onNodeWithText("Scene being written").assertIsDisplayed()
        compose.onNodeWithTag("reply-under-way").assertDoesNotExist()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText(chosenMove.move!!.text))
        compose.onNodeWithText(chosenMove.move!!.text).assertIsDisplayed()
        compose.onNodeWithContentDescription("Linger").assertIsNotEnabled()
        compose.onNodeWithText("End scene").assertIsNotEnabled()
        compose.preview("NextScene")
        compose.runOnIdle {
            link.current.value = link.current.value.copy(opening = null, seq = 7, lastEventID = "7", headEntryID = "reply-15",
                scene = link.current.value.scene.copy(number = 15, title = "Rain clock", at = evening.at, atLabel = "Sunday 6:00 pm",
                    place = "A tea stall near the bus stand", people = listOf(PersonCard(name = "Meera Kulkarni"))),
                exchanges = listOf(chosenMove.copy(reply = Passage(entryID = "reply-15", text = "The rain has been coming down since four."))),
                turn = TurnState(kind = TurnStateKind.Idle))
        }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Rain clock"))
        compose.onNodeWithText("Rain clock").assertIsDisplayed()
        compose.onNodeWithText("A tea stall near the bus stand · Sunday 6:00 pm").assertIsDisplayed()
        compose.onNodeWithText("NEXT SCENE").assertDoesNotExist()
        compose.onNodeWithText("Scene being written").assertDoesNotExist()
    }

    fun failedWhileOpeningKeepsTheCard() {
        ready()
        opening(TurnState(kind = TurnStateKind.Failed, reason = "The Reply could not be written: Sonnet is overloaded", traceID = "choose"))
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Retry"))
        compose.onNodeWithText("The Reply could not be written").assertIsDisplayed()
        compose.onNodeWithText("Retry").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(1, link.retries) }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("NEXT SCENE"))
        compose.onNodeWithText("NEXT SCENE").assertIsDisplayed()
        compose.onNodeWithText("Scene being written").assertIsDisplayed()
    }

    // GIVEN the player has written "I spent the morning in the library reading about life debts" in the Gap
    // WHEN the Mac cannot take the choice
    // THEN the Gap stays open with what he wrote, and says why
    fun failedChoiceKeepsTheGap() {
        val words = "I spent the morning in the library reading about life debts"
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        link.chooseGate = gate
        link.chooseFailure = LinkFailure("That is no longer on today.", "trace-refused")
        ready()
        go("hospital")
        compose.onNodeWithTag("gap-text").performTextInput(words)
        compose.onNodeWithText("Go to the hospital wing").performClick()
        compose.onNodeWithText("What did you do in the Gap?").assertIsDisplayed()
        compose.onNodeWithText("Go to the hospital wing").assertIsNotEnabled()
        compose.runOnIdle { gate.complete(Unit) }
        compose.onNodeWithText("What did you do in the Gap?").assertIsDisplayed()
        compose.onNodeWithTag("gap-text").assertTextEquals(words)
        compose.onNodeWithTag("gap-problem").assertTextEquals("That is no longer on today.")
        compose.runOnIdle { link.chooseGate = null; link.chooseFailure = null }
        compose.onNodeWithText("Go to the hospital wing").assertIsEnabled().performClick()
        compose.onNodeWithText("What did you do in the Gap?").assertDoesNotExist()
        compose.runOnIdle { assertEquals(2, link.choices.size); assertEquals(words, link.choices.last().gap) }
    }
}
