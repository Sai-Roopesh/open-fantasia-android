package com.openfantasia.app

import androidx.compose.ui.test.*
import com.openfantasia.protocol.*
import org.junit.Assert.*

/** The World screen and a person's page, as drawn in World.dc.html and Person.dc.html. */
open class WorldScreenUiChecks : WorldUiChecks() {
    private fun openWorld() {
        openScene()
        compose.onNodeWithText("World").performClick()
        compose.onNodeWithText("The World").assertIsDisplayed()
    }

    // GIVEN Quirrell serves Voldemort, and the Player Character does not know it
    // THEN Quirrell's entry on the World screen says nothing of it
    fun aSecretStaysOut() {
        openWorld()
        compose.onNodeWithText("LEADS").assertIsDisplayed()
        compose.onNodeWithText("EVERYONE ELSE").assertIsDisplayed()
        compose.onNodeWithTag("world-people").performScrollToNode(hasText("Quirinus Quirrell"))
        compose.onNodeWithText("Quirinus Quirrell").performClick()
        compose.onNodeWithText("WHAT YOU KNOW").assertIsDisplayed()
        compose.onNodeWithText("The nervous Defence teacher. He stammers, and smells of garlic.").assertIsDisplayed()
        compose.onAllNodesWithText("Voldemort", substring = true).assertCountEquals(0)
    }

    // GIVEN all Roopesh knows of Hermione is that she is a Gryffindor first-year
    // WHEN a Scene ends in which she noticed the inkwell and asked him for a reason
    // THEN her entry on the World screen says she noticed the inkwell, from that Scene
    fun whatHeKnowsGrows() {
        openWorld()
        compose.onNodeWithText("Gryffindor. Noticed the inkwell. Wants a reason, not circumstances.").assertIsDisplayed()
        compose.preview("World")
        compose.onNodeWithText("Hermione Granger").performClick()
        compose.onNodeWithText("Gryffindor. Noticed the inkwell. Wants a reason, not circumstances.").assertIsDisplayed()
        compose.onNodeWithText("From Scene 14 · After curfew").assertIsDisplayed()
        compose.onNodeWithText("WHAT YOU'VE HEARD").assertIsDisplayed()
        compose.onNodeWithText("RUMOUR").assertIsDisplayed()
        compose.onNodeWithText("Lavender says she cried in the girls' bathroom after Charms.").assertIsDisplayed()
        compose.onNodeWithText("Lead").assertIsDisplayed()
        compose.preview("Person")
        compose.onNodeWithContentDescription("Back to the World").performClick()
        compose.onNodeWithText("LEADS").assertIsDisplayed()
    }

    fun placesAndTheCalendar() {
        openWorld()
        compose.onNodeWithText("Places").performClick()
        compose.onNodeWithText("The Gryffindor common room").assertIsDisplayed()
        compose.onNodeWithText("Red and gold, a fire that never goes out.").assertIsDisplayed()
        compose.onNodeWithText("You've been here").assertIsDisplayed()
        compose.onNodeWithText("Calendar").performClick()
        compose.onNodeWithText("Draconia's flying test").assertIsDisplayed()
        compose.onNodeWithText("Wednesday 10:00 am · 3 days").assertIsDisplayed()
        compose.onNodeWithContentDescription("Back to the Scene").performClick()
        compose.onNodeWithTag("scene-passages").assertIsDisplayed()
        compose.runOnIdle { assertEquals(1, link.worldRequests) }
    }
}
