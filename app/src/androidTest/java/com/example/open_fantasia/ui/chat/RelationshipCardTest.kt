package com.example.open_fantasia.ui.chat

import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.example.open_fantasia.domain.model.RelationalState
import org.junit.Rule
import org.junit.Test

class RelationshipCardTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun longRelationshipNamesRemainVisible() {
        val source = "Alexandria Cassandra Montgomery-Worthington"
        val target = "Bartholomew Maximilian Kensington-Smythe"
        val relationship = RelationalState(
            relationship_id = "relationship-1",
            source_entity_id = "source",
            source_entity_name = source,
            target_entity_id = "target",
            target_entity_name = target,
            relationship_type = "alliance",
            dynamic_status = "Their alliance remains complicated but durable despite a long and emotionally dense history."
        )

        composeTestRule.setContent {
            RelationshipCard(relationship = relationship, modifier = Modifier.width(320.dp))
        }

        composeTestRule.onNodeWithText(source).assertIsDisplayed()
        composeTestRule.onNodeWithText(target).assertIsDisplayed()
        composeTestRule.onNodeWithText(relationship.dynamic_status).assertIsDisplayed()
    }
}
