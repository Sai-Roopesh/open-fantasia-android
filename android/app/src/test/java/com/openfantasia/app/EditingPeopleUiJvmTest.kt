package com.openfantasia.app

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricScenarioRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class EditingPeopleUiJvmTest : EditingPeopleUiChecks() {
    @Scenario("stories › Leads are the player's to choose › A newcomer becomes a Lead")
    @Test fun lead() = aNewcomerBecomesALead()

    @Test fun leadRow() = theLeadRowToggles()

    @Scenario("stories › Groups are the player's to arrange › Goyle starts to matter")
    @Test fun goyle() = goyleStartsToMatter()

    @Scenario("stories › Anything can be edited or created in the app › A new person is created in the app")
    @Test fun newPerson() = aNewPersonIsCreated()

    @Scenario("stories › Portraits are real images › Uploading a Portrait")
    @Test fun portrait() = uploadingAPortrait()

    @Test fun edit() = editingSomeone()
    @Test fun refusal() = aRefusalIsShownAndTheWordsKept()
}
