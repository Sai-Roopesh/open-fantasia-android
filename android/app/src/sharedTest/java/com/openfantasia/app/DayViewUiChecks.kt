package com.openfantasia.app

import androidx.compose.ui.test.*
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.text.TextLayoutResult
import com.openfantasia.protocol.*
import org.junit.Assert.*

open class DayViewUiChecks : WorldUiChecks() {
    private val summons = Happening(id = "summons", at = "Day 3 09:00", time = "9:00 am",
        place = "McGonagall's office", what = "Your account of the troll. Hermione goes in first.",
        who = listOf("McGonagall", "Hermione", "Harry"), expected = true, pick = true)
    private val hospital = Happening(id = "hospital", at = "Day 3 11:00", time = "11:00 am",
        place = "the hospital wing", what = "Draconia is fighting Snape for her bed back.",
        who = listOf("Draconia", "Snape", "Pansy"), expected = false, pick = false)
    private val tomorrow = Skip(label = "Tomorrow", inSentence = "tomorrow", at = "Day 4 07:30", time = "Monday 7:30 am")
    private fun ready(happenings: List<Happening> = listOf(summons, hospital)) {
        link.current.value = link.current.value.copy(headEntryID = "closed", dayView = FakeFantasiaLink.dayView().copy(
            place = "Gryffindor Tower", happenings = happenings,
            meanwhile = listOf(MeanwhileItem(how = How.Seen, text = "A note under the door.")),
            choices = DayChoices(follow = listOf("Hermione", "Draconia"), places = listOf("The library"), skips = listOf(tomorrow))))
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
        compose.onNodeWithText("WHAT'S ON TODAY").performScrollTo().assertIsDisplayed()
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

    // WHEN the player taps Let the Story choose
    // THEN the next Scene opens on the Story's own pick
    fun storyChooses() {
        ready(listOf(summons.copy(at = "Day 3 07:40", time = "7:40 am")))
        tap("Let the Story choose")
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Story))
        compose.onNodeWithText("What did you do in the Gap?").assertDoesNotExist()
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("Reply being written"))
        compose.onNodeWithText("Reply being written").assertIsDisplayed()
        compose.runOnIdle {
            link.current.value = link.current.value.copy(dayView = null, seq = 5, headEntryID = "next-reply",
                scene = link.current.value.scene.copy(number = 15, title = "The accounts", at = "Day 3 07:40",
                    atLabel = "Sunday 7:40 am", place = summons.place, people = summons.who.map { PersonCard(name = it) }))
        }
        compose.onNodeWithTag("scene-passages").performScrollToNode(hasText("The accounts"))
        compose.onNodeWithText("The accounts").assertIsDisplayed()
        compose.onNodeWithText("Reply being written").assertDoesNotExist()
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
        compose.onNodeWithText("7:40 am – Monday 7:30 am, before Tomorrow").assertIsDisplayed()
        compose.onNodeWithText("11:00 am · the hospital wing.").assertIsDisplayed()
        compose.onNodeWithText("Skip to Tomorrow").performClick()
        sent(ChooseRequest(after = "closed", kind = ChooseRequestKind.Skip, at = tomorrow.at))
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
}
