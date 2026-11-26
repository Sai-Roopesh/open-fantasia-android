package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class EditingStoryUiJvmTest : EditingStoryUiChecks() {
    @Scenario("stories › Anything can be edited or created in the app › A Landmark is moved on one Path")
    @Test fun landmark() = aLandmarkIsMovedOnOnePath()

    @Scenario("stories › Anything can be edited or created in the app › A Landmark the World has passed")
    @Test fun passed() = aPassedLandmarkAndARefusal()

    @Scenario("long-run › Style is the player's own words › Changing the Style mid-Story")
    @Test fun style() = changingTheStyleMidStory()

    @Scenario("long-run › Style is the player's own words › Changing the reply length")
    @Test fun length() = changingTheReplyLength()

    @Scenario("long-run › Arcs are built toward, never resolved on a schedule › An Arc is dropped")
    @Test fun arc() = anArcIsDropped()

    @Scenario("stories › Anything can be edited or created in the app › A place is added mid-Story")
    @Test fun place() = aPlaceIsAddedMidStory()

    @Scenario("stories › Anything can be edited or created in the app › Moving the clock on")
    @Test fun clock() = movingTheClockOn()

    @Scenario("long-run › Taste is short, readable and the player's › Rewording a lesson")
    @Test fun taste() = rewordingALesson()
}
