package com.openfantasia.app

import androidx.compose.ui.test.*
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
        compose.onNodeWithText("OFF-SCREEN").assertIsDisplayed()
        compose.onNodeWithText("Saturday").assertIsDisplayed()
        compose.onNodeWithText("11:50 pm").assertIsDisplayed()
        compose.onNodeWithText("Quirrell tests the wards on the third-floor door. Nobody sees him.").assertIsDisplayed()
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
        compose.runOnIdle { assertEquals(listOf(RemoveTasteRequest(line = "Keep Ron in the background unless he's needed.", after = "reply")), link.tasteRemovals) }
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
    // THEN How it's going shows how long their Scene ends took, how often a job needed its second model, the pace of
    //   the ten Scenes, how often the Story's pick was taken, and the reactions given
    fun howItsGoing() {
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("HOW IT'S GOING").assertIsDisplayed()
        compose.onNodeWithText("2 min 40").assertIsDisplayed()
        compose.onNodeWithText("a Scene's end, lately").assertIsDisplayed()
        compose.onNodeWithText("7 of 10").assertIsDisplayed()
        compose.onNodeWithText("times you took the Story's pick").assertIsDisplayed()
        compose.onNodeWithTag("pace").assertIsDisplayed()
            .assert(hasContentDescription("Pace of the last ten Scenes", substring = true))
            .assert(hasContentDescription("Scene 14, Scene 14, 5 of 5", substring = true))
        compose.onNodeWithText("The Weaver needed its second model twice; nothing failed on both. You said more like this to 3 Scenes, less to 1.").assertIsDisplayed()
        compose.preview("Backstage · How it's going")
    }

    fun howItsGoingSaysWhatFailed() {
        assertEquals("No job needed its second model; the Director failed on both once. You have not said more or less like this to a Scene yet.",
            howItsGoingLine(HowItsGoing(sceneEndSeconds = emptyList(), picksOffered = 0, picksTaken = 0, more = 0, less = 0, pace = emptyList(),
                jobs = listOf(JobHealth(job = ModelJob.Director, calls = 3, secondModel = 0, failed = 1)))))
        assertEquals("The Writer needed its second model once, the Weaver 3 times; nothing failed on both. You said more like this to 1 Scene, less to 0.",
            howItsGoingLine(HowItsGoing(sceneEndSeconds = emptyList(), picksOffered = 0, picksTaken = 0, more = 1, less = 0, pace = emptyList(),
                jobs = listOf(JobHealth(job = ModelJob.Writer, calls = 9, secondModel = 1, failed = 0), JobHealth(job = ModelJob.Weaver, calls = 9, secondModel = 3, failed = 0)))))
        assertEquals("40 sec", sayDuration(40))
        assertEquals("3 min", sayDuration(180))
        assertEquals("2 min 05", sayDuration(125))
    }

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
            assertEquals(listOf(BriefRequest(after = "reply", more = listOf("More danger", "Mysteries that aren't in the books"),
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
                    StretchLead(who = "Hermione", move = "lends him her flying notes, annotated", onScreen = true, label = "On screen · Charms, Monday")))),
            newThings = listOf(
                NewThingRow(kind = "person", what = "Ilse Varga, a stranger in Hogsmeade asking about the night train", stretch = "This Stretch"),
                NewThingRow(kind = "mystery", what = "Someone has been in the trophy room at night", stretch = "This Stretch"),
                NewThingRow(kind = "place", what = "The duelling club's room above the Hog's Head", stretch = "Stretch 2")))
        openScene()
        compose.onNodeWithContentDescription("Backstage").performClick()
        backstage("THE DIRECTOR").assertIsDisplayed()
        backstage("This Stretch: Saturday to Friday").assertIsDisplayed()
        backstage("The common room: Hermione asks for a reason").assertIsDisplayed()
        backstage("✓ played").assertIsDisplayed()
        backstage("Charms: Flitwick pairs him with Draconia").assertIsDisplayed()
        backstage("Draconia · Flitwick · Pansy").assertIsDisplayed()
        // What each Stretch brought that was new (long-run: Something new every Stretch).
        backstage("NEW THIS STRETCH").assertIsDisplayed()
        backstage("PERSON").assertIsDisplayed()
        backstage("Ilse Varga, a stranger in Hogsmeade asking about the night train").assertIsDisplayed()
        backstage("MYSTERY").assertIsDisplayed()
        backstage("NEW IN STRETCH 2").assertIsDisplayed()
        backstage("The duelling club's room above the Hog's Head").assertIsDisplayed()
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
}

