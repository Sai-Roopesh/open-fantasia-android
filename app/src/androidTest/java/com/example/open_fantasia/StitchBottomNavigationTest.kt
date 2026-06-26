package com.example.open_fantasia

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test

class StitchBottomNavigationTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun bottomNavigation_showsAllTabs() {
        var navigatedTab = ""

        composeTestRule.setContent {
            StitchBottomNavigation(
                currentRoute = "dashboard",
                onNavigate = { route -> navigatedTab = route }
            )
        }

        // Verify tabs exist
        composeTestRule.onNodeWithText("Chat").assertExists()
        composeTestRule.onNodeWithText("Characters").assertExists()
        composeTestRule.onNodeWithText("Personas").assertExists()
        composeTestRule.onNodeWithText("Settings").assertExists()

        // Tap "Characters"
        composeTestRule.onNodeWithText("Characters").performClick()
        assert(navigatedTab == "characters")
    }
}
