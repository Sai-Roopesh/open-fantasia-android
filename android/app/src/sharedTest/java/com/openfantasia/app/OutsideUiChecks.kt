package com.openfantasia.app

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.text.AnnotatedString
import com.openfantasia.protocol.*
import org.junit.Assert.*

open class OutsideUiChecks : WorldUiChecks() {
    /** A line of Backstage, scrolled to first: the screen is a list that only builds what it has shown. */
    private fun backstage(text: String): SemanticsNodeInteraction {
        compose.onNodeWithTag("backstage").performScrollToNode(hasText(text))
        return compose.onNodeWithText(text)
    }
    // WHEN the player opens the Journal and taps Scene 3
    // THEN Scene 3 is shown in full
    fun readingBack() {
        openScene()
        for (entry in listOf("Journal", "Paths", "Backstage")) compose.onNodeWithContentDescription(entry).assertIsDisplayed()
        compose.onNodeWithContentDescription("Journal").performClick()
        compose.onNodeWithText("FRIDAY").assertIsDisplayed()
        compose.onNodeWithText("Scene 12 · 6:10 pm · The Three Broomsticks").assertIsDisplayed()
        compose.onNodeWithText("The insult").assertIsDisplayed()
        compose.onNodeWithText("TOLD").assertIsDisplayed()
        compose.onNodeWithText("Ron says a troll got into the dungeons during the feast.").assertIsDisplayed()
        compose.onNodeWithText("Scene 14 · 9:40 pm · now").assertIsDisplayed()
        compose.preview("Journal")
        compose.onNodeWithText("The troll").performClick()
        compose.onNodeWithTag("past-scene-passages").assertIsDisplayed()
        compose.runOnIdle { assertEquals("story" to 13L, link.pastSceneRequests.last()) }
        compose.onNodeWithContentDescription("Back to Scene 14").performClick()
        compose.onNodeWithText("FRIDAY").assertIsDisplayed()
        compose.onNodeWithText("After curfew").performClick()
        compose.onNodeWithText("FRIDAY").assertDoesNotExist()
        compose.onNodeWithTag("scene-passages").assertIsDisplayed()
    }

    // WHEN the player opens Backstage for Saturday night
    // THEN it shows what Quirrell did that night
    fun quirrellsNights() {
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        compose.onNodeWithText("Everything Roopesh doesn't know. Nothing here reaches the Scene, the Day View, the World or the Journal.").assertIsDisplayed()
        backstage("OFF-SCREEN").assertIsDisplayed()
        backstage("Saturday").assertIsDisplayed()
        backstage("11:50 pm").assertIsDisplayed()
        backstage("Quirrell tests the wards on the third-floor door. Nobody sees him.").assertIsDisplayed()
        compose.onNodeWithText("Hagrid's lantern stops at the edge of the forest.").assertDoesNotExist()
        backstage("THREADS").assertIsDisplayed()
        backstage("Quirrell has tried the wards twice and scorched the door").assertIsDisplayed()
        backstage("LIVES").assertIsDisplayed()
        backstage("THE WRITER · THIS SCENE").assertIsDisplayed()
        compose.onNodeWithText("LANDING").assertIsDisplayed()
        backstage("Out: she goes up to bed, or asks him to come and look.").assertIsDisplayed()
        backstage("TASTE · WHAT THE STORY HAS LEARNED").assertIsDisplayed()
        compose.preview("Backstage")
        // Another day, from the day's chip.
        backstage("Saturday").performClick()
        compose.onNodeWithText("Friday").performClick()
        backstage("Hagrid's lantern stops at the edge of the forest.").assertIsDisplayed()
    }

    // GIVEN Taste has the line "keep Ron in the background"
    // WHEN the player deletes it
    // THEN later Scenes no longer keep Ron in the background on that account
    fun deletingALesson() {
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("Keep Ron in the background unless he's needed.").assertIsDisplayed()
        compose.onAllNodesWithContentDescription("Delete this line")[1].performClick()
        compose.runOnIdle {
            assertEquals(listOf(RemoveTasteRequest(line = "Keep Ron in the background unless he's needed.", scope = Scope.Story)), link.tasteRemovals)
            // Taste is beside the Story, not on the Path: the head does not move (docs/adr/0020).
            assertEquals("reply", link.current.value.headEntryID)
        }
        compose.onNodeWithText("Keep Ron in the background unless he's needed.").assertDoesNotExist()
        compose.onNodeWithText("Keep school procedure to a line.").assertIsDisplayed()
    }

    // GIVEN the Director's plan builds toward the flying test on Wednesday
    // WHEN the player opens Backstage
    // THEN it says the Story is building toward the flying test on Wednesday, and that rest comes after it
    fun whatTheDirectorIsBuildingToward() {
        link.backstageView = FakeFantasiaLink.backstageFixture().copy(director = DirectorLine(toward = "the flying test on Wednesday",
            phase = DirectorPhase.Build, line = "Building toward the flying test on Wednesday. This stretch builds; rest comes after it."))
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("THE DIRECTOR").assertIsDisplayed()
        backstage("Building toward the flying test on Wednesday. This stretch builds; rest comes after it.").assertIsDisplayed()
        compose.preview("BackstageDirector")
    }

    // GIVEN a Scene's record was kept with a Moment left out, because its words were not on the page
    // WHEN the player opens Backstage
    // THEN The record lists that Scene, the Moment left out, and why
    fun aGapInTheRecord() {
        link.backstageView = FakeFantasiaLink.backstageFixture().copy(record = listOf(
            RecordRow(sceneNumber = 11, sceneTitle = "Twenty-nine minutes", dropped = listOf("moments[2]: none of its words are on the page"))))
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("THE RECORD").assertIsDisplayed()
        backstage("Scene 11 · Twenty-nine minutes").assertIsDisplayed()
        compose.onNodeWithText("Recorded without one part: moments[2]: none of its words are on the page").assertIsDisplayed()
        compose.onNodeWithText("Shown only for Scenes recorded with a part left out.").assertIsDisplayed()
        compose.preview("Backstage · The record")
        compose.onNodeWithText("Retry").assertDoesNotExist()
    }

    // GIVEN ten Scenes have been played
    // WHEN the player opens Backstage
    // THEN How it's going shows how long their Scene ends took, how often a job needed its second model, how often the
    //   Editor set a Reply right, the pace of the ten Scenes, how often the Story's pick was taken, and the reactions given
    fun howItsGoing() {
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("HOW IT'S GOING").assertIsDisplayed()
        backstage("2 min 40").assertIsDisplayed()
        compose.onNodeWithText("a Scene's end, lately").assertIsDisplayed()
        backstage("7 of 10").assertIsDisplayed()
        compose.onNodeWithText("times you took the Story's pick").assertIsDisplayed()
        backstage("48 sec").assertIsDisplayed()
        compose.onNodeWithText("a Reply, lately").assertIsDisplayed()
        backstage("6 of 40").assertIsDisplayed()
        compose.onNodeWithText("Replies the Editor set right").assertIsDisplayed()
        compose.onNodeWithTag("backstage").performScrollToNode(hasTestTag("pace"))
        compose.onNodeWithTag("pace").assertIsDisplayed()
            .assert(hasContentDescription("Pace of the last ten Scenes", substring = true))
            .assert(hasContentDescription("Scene 14, Scene 14, 5 of 5", substring = true))
        backstage("The Weaver needed its second model twice; nothing failed on both. You said more like this to 3 Scenes, less to 1.").assertIsDisplayed()
        backstage("The Editor set 4 Replies right in place and had 2 written again.").assertIsDisplayed()
        compose.preview("Backstage · How it's going")
    }

    fun howItsGoingSaysWhatFailed() {
        assertEquals("No job needed its second model; the Director failed on both once. You have not said more or less like this to a Scene yet.",
            howItsGoingLine(going(jobs = listOf(JobHealth(job = ModelJob.Director, calls = 3, secondModel = 0, failed = 1)))))
        assertEquals("The Writer needed its second model once, the Weaver 3 times; nothing failed on both. You said more like this to 1 Scene, less to 0.",
            howItsGoingLine(going(more = 1, jobs = listOf(JobHealth(job = ModelJob.Writer, calls = 9, secondModel = 1, failed = 0), JobHealth(job = ModelJob.Weaver, calls = 9, secondModel = 3, failed = 0)))))
        assertEquals("The Editor has not had to set a Reply right.", editorLine(going()))
        assertEquals("The Editor set 1 Reply right in place.", editorLine(going(fixed = 1)))
        assertEquals("The Editor had 3 Replies written again.", editorLine(going(rewrote = 3)))
        assertEquals("40 sec", sayDuration(40))
        assertEquals("3 min", sayDuration(180))
        assertEquals("2 min 05", sayDuration(125))
    }

    private fun going(more: Long = 0, fixed: Long = 0, rewrote: Long = 0, jobs: List<JobHealth> = emptyList()) = HowItsGoing(sceneEndSeconds = emptyList(),
        replySeconds = emptyList(), picksOffered = 0, picksTaken = 0, more = more, less = 0, pace = emptyList(), editorFixed = fixed, editorRewrote = rewrote, jobs = jobs)

    // WHEN the player writes in the brief "more danger, more mysteries that aren't in the books"
    // THEN (the phone's part) the brief is sent to the Mac, from this moment on the Path, and Backstage shows it
    fun aBriefFromThePhone() {
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("YOUR BRIEF").assertIsDisplayed()
        compose.onNodeWithText("Nothing yet. Say what you want more of and less of, and the Director plans every Stretch from it.").assertIsDisplayed()
        compose.onNodeWithText("Edit").performClick()
        compose.onNodeWithText("Your brief").assertIsDisplayed()
        compose.onNodeWithTag("brief-more").performTextInput("More danger\nMysteries that aren't in the books")
        compose.onNodeWithTag("brief-less").performTextInput("Canon events retold")
        compose.preview("Backstage · Your brief")
        compose.onNodeWithTag("story-save").performClick()
        compose.runOnIdle {
            assertEquals(listOf(BriefRequest(more = listOf("More danger", "Mysteries that aren't in the books"),
                less = listOf("Canon events retold"))), link.briefs)
        }
        compose.onNodeWithTag("story-editor").assertDoesNotExist()
        backstage("MORE OF").assertIsDisplayed()
        backstage("Mysteries that aren't in the books").assertIsDisplayed()
        backstage("LESS OF").assertIsDisplayed()
        backstage("Canon events retold").assertIsDisplayed()
        // Edit opens on the brief as it stands.
        compose.onNodeWithText("Edit").performClick()
        compose.onNodeWithTag("brief-more").assertTextContains("More danger\nMysteries that aren't in the books")
    }

    fun nothingMissingFromTheRecord() {
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("TASTE · WHAT THE STORY HAS LEARNED").assertIsDisplayed()
        compose.onNodeWithText("THE RECORD").assertDoesNotExist()
    }

    // The Director's Stretch, as Backstage.dc.html draws it under THE DIRECTOR: its days, its Scenes that matter, and
    // what each Lead does this week (story-in-stretches design decision 7).
    fun theStretchBackstage() {
        link.backstageView = FakeFantasiaLink.backstageFixture().copy(director = DirectorLine(toward = "the flying test on Wednesday",
            phase = DirectorPhase.Build, line = "Building toward the flying test on Wednesday. This stretch builds; rest comes after it.",
            stretch = StretchView(fromLabel = "Saturday", untilLabel = "Friday",
                scenes = listOf(
                    StretchScene(time = "Sat 9:40 pm", place = "The common room", purpose = "Hermione asks for a reason", who = listOf("Hermione"), state = StretchSceneState.Played),
                    StretchScene(time = "Mon 2:00 pm", place = "Charms", purpose = "Flitwick pairs him with Draconia", who = listOf("Draconia", "Flitwick", "Pansy"), state = StretchSceneState.Ahead)),
                leads = listOf(
                    StretchLead(who = "Draconia", move = "has his name taken off the Charms seating plan", onScreen = false, label = "Off-screen, Sunday · he heard it from Neville"),
                    StretchLead(who = "Hermione", move = "lends him her flying notes, annotated", onScreen = true, label = "On screen · Charms, Monday")))))
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("THE DIRECTOR").assertIsDisplayed()
        backstage("This Stretch: Saturday to Friday").assertIsDisplayed()
        backstage("The common room: Hermione asks for a reason").assertIsDisplayed()
        backstage("✓ played").assertIsDisplayed()
        backstage("Charms: Flitwick pairs him with Draconia").assertIsDisplayed()
        backstage("Draconia · Flitwick · Pansy").assertIsDisplayed()
        backstage("THE LEADS THIS WEEK").assertIsDisplayed()
        backstage("Off-screen, Sunday · he heard it from Neville").assertIsDisplayed()
        backstage("On screen · Charms, Monday").assertIsDisplayed()
        compose.preview("Backstage · The Stretch")
    }

    fun noDirectorBeforeHePlans() {
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("TASTE · WHAT THE STORY HAS LEARNED").assertIsDisplayed()
        compose.onNodeWithText("THE DIRECTOR").assertDoesNotExist()
    }

    // The Outline, as Backstage.dc.html draws it (the-outline: The player sees and steers the Outline): the current Act's
    // question and turns with the ones done ticked, where each relationship is heading, what each person pursues, who
    // drives the World, the setups and their state, the Acts after it, how it ends, and what the Director looked up.
    fun theOutlineBackstage() {
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("THE OUTLINE").assertIsDisplayed()
        compose.onNodeWithText("Revised after Scene 13, deeply").assertIsDisplayed()
        backstage("Year One").assertIsDisplayed()
        backstage("Will Draconia choose him over the name she was raised to carry?").assertIsDisplayed()
        backstage("Builds to the Philosopher's Stone, in June.").assertIsDisplayed()
        // Each turn is said done or to come, as its tick and dot show.
        backstage("The Sorting, the slap, and the debt she bills him for").assert(
            SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Done")).assertIsDisplayed()
        backstage("Draconia's flying test, her father in the stands").assert(
            SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "To come")).assertIsDisplayed()
        backstage("BY THE END OF YEAR ONE").assertIsDisplayed()
        backstage("Draconia & Hermione").assertIsDisplayed()
        backstage("Rivals who would fight for each other.").assertIsDisplayed()
        backstage("Heading: Toward breaking with him").assertIsDisplayed()
        backstage("DRIVING THE WORLD").assertIsDisplayed()
        backstage("WAITING").assertIsDisplayed()
        backstage("Nine dementors missing from Azkaban").assertIsDisplayed()
        backstage("Scene 12 · pays off: in June, at the Stone").assertIsDisplayed()
        backstage("DROPPED").assertIsDisplayed()
        backstage("OUTLINED").assertIsDisplayed()
        backstage("Does the betrothal hold? Builds to the Chamber.").assertIsDisplayed()
        backstage("SKETCHED").assertIsDisplayed()
        backstage("LOOKED UP").assertIsDisplayed()
        backstage("The Philosopher's Stone, chapters 13 to 17: the Stone's protections").assertIsDisplayed()
        compose.preview("Backstage · The Outline")
        // Lives by tier: the close in full, the movers, and everyone else in a line.
        backstage("LIVES").assertIsDisplayed()
        backstage("CLOSE TO THE STORY").assertIsDisplayed()
        backstage("MOVING THE WORLD").assertIsDisplayed()
        backstage("Wants: The Seeker's place, with her father watching. · Heading: Toward breaking with him.").assertIsDisplayed()
        backstage("Also living their lives: Pansy Parkinson, Crabbe and Goyle.").assertIsDisplayed()
    }

    // WHEN the player writes the note "Year One ends with Draconia breaking from her father"
    // THEN after the next Scene's end, Year One in the Outline builds toward that break
    // The phone's part: the note goes to the Mac and shows as waiting; once a Scene's end has answered it, Backstage shows
    // it answered and Year One building toward the break. The Director's re-plan is the Mac's.
    fun steeringAYearsEnd() {
        val note = "Year One ends with Draconia breaking from her father"
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("YOUR DIRECTIONS").assertIsDisplayed()
        compose.onNodeWithTag("add-note").assertIsNotEnabled()
        compose.onNodeWithTag("note-field").performTextInput(note)
        compose.preview("Backstage · a note")
        compose.onNodeWithTag("add-note").assertIsEnabled().performClick()
        compose.runOnIdle {
            assertEquals(listOf(SteeringNoteRequest(text = note)), link.notes)
            assertEquals("reply", link.current.value.headEntryID)
        }
        compose.onNodeWithTag("note-field").assert(SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString("")))
        backstage(note)
        compose.onNode(hasText(note) and hasText("Active · guides future replies")).assertIsDisplayed()
        // The next Scene's end answers it: Year One now builds toward the break.
        link.backstageView = link.backstageView.let { view ->
            val outline = view.outline!!
            view.copy(notes = view.notes.map { it.copy(answered = true) }, outline = outline.copy(revised = "after Scene 14, deeply",
                current = outline.current!!.copy(buildsTo = "Draconia breaking from her father, in June",
                    turns = outline.current!!.turns.dropLast(1) + TurnRow(linkSchemaWhen = "June", what = "Draconia breaks from her father in front of the school", done = false))))
        }
        compose.onNodeWithContentDescription("Back to the Scene").performClick()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage(note)
        compose.onNode(hasText(note) and hasText("Active · guides future replies")).assertIsDisplayed()
        backstage("Builds to Draconia breaking from her father, in June.").assertIsDisplayed()
        backstage("Draconia breaks from her father in front of the school").assertIsDisplayed()
        backstage("Revised after Scene 14, deeply").assertIsDisplayed()
    }

    // A note can be taken back: ✕ deletes it.
    fun deletingANote() {
        link.backstageView = link.backstageView.copy(notes = listOf(SteeringNote(id = "rival", text = "Keep Hermione a rival this year.", writtenAt = "2026-10-14T21:00:00Z", answered = false)))
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("Keep Hermione a rival this year.")
        compose.onNodeWithText("Archive").performClick()
        compose.runOnIdle { assertEquals("rival", link.noteEdits.single().first); assertEquals(false, link.noteEdits.single().second.active) }
        compose.onNodeWithText("Keep Hermione a rival this year.").assertIsDisplayed()
        compose.onNodeWithText("Restore").performClick()
        compose.runOnIdle { assertEquals(true, link.noteEdits.last().second.active) }
    }

    // WHEN the player opens what the Story keeps of the contract in Backstage
    // THEN it shows the passage where the contract was made
    fun whereItCameFrom() {
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("WHAT THE STORY KEEPS").assertIsDisplayed()
        backstage("The contract").assertIsDisplayed()
        val made = "from Scene 8: “Nobody comes second. Saturdays are mine. Sign it.”"
        compose.onNodeWithTag("truth-The contract").assert(hasAnyDescendant(hasText(made)))
        backstage(made).assertIsDisplayed()
        backstage("· Saturdays are Hermione's.").assertIsDisplayed()
        backstage("Known to Draconia, Hermione, Roopesh").assertIsDisplayed()
        // Nothing is deleted: what ended is kept, and says when.
        backstage("Draconia is betrothed to Selwyn").assertIsDisplayed()
        compose.onNodeWithTag("truth-Draconia is betrothed to Selwyn").assert(hasAnyDescendant(hasText("Ended in Scene 13")))
            .assert(hasAnyDescendant(hasText("from Scene 4: “Father has promised me to Selwyn.”")))
        backstage("By Christmas · in 9 weeks").assertIsDisplayed()
        // Everything kept points to where it came from: who someone is now, between two people, a Rule, a Name.
        backstage("from Scene 12: “He's mine. Anyone who wants to argue can do it to my face.”").assertIsDisplayed()
        backstage("“Saturdays are mine, Malfoy. Write it down.”").assertIsDisplayed()
        backstage("from the Story File: “Hogwarts is a university; its first-years are eighteen.”").assertIsDisplayed()
        backstage("First named in Scene 11").assertIsDisplayed()
        compose.preview("Backstage · What the Story keeps")
    }

    // The player's own Taste, beside the Story's (long-run: Taste is short, readable and the player's): read, reworded
    // and deleted from Backstage, each change sent for the player's own and none moving the Story's head.
    fun thePlayersOwnTaste() {
        val line = "Don't decide what my character feels."
        val reworded = "Don't decide what my character feels or thinks."
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("YOUR OWN TASTE · EVERY STORY").assertIsDisplayed()
        backstage(line).performClick()
        compose.onNodeWithText("A lesson of yours").assertIsDisplayed()
        compose.onNodeWithText("A line of your own Taste: every Story you play reads it, this one and the next.").assertIsDisplayed()
        compose.onNodeWithTag("story-words").performTextReplacement(reworded)
        compose.onNodeWithTag("story-save").performClick()
        compose.waitUntil(5_000) { link.tasteRewords.isNotEmpty() }
        compose.runOnIdle { assertEquals(listOf(RewordTasteRequest(line = line, scope = Scope.Player, text = reworded)), link.tasteRewords) }
        compose.onNodeWithTag("story-editor").assertDoesNotExist()
        backstage(reworded).assertIsDisplayed()
        compose.onNodeWithText(line).assertDoesNotExist()
        compose.onNode(hasContentDescription("Delete this line") and hasAnyAncestor(hasTestTag("player-taste"))).performClick()
        compose.runOnIdle {
            assertEquals(listOf(RemoveTasteRequest(line = reworded, scope = Scope.Player)), link.tasteRemovals)
            assertEquals("reply", link.current.value.headEntryID)
        }
        backstage("Nothing yet. A lesson about how you like to read, learned in any Story, becomes a line here.").assertIsDisplayed()
        backstage("Keep school procedure to a line.").assertIsDisplayed()
    }
}
