package com.openfantasia.app

import com.openfantasia.protocol.*

fun sceneFixture() = SceneView(
    earlierScenes = emptyList(),
    exchanges = listOf(Exchange(reply = Passage("opening", "Hermione looks up."))),
    headEntryID = "opening", pathID = "path", playerCharacter = "Roopesh Gantasala", seq = 1,
    storyID = "story", traceID = "view",
    scene = SceneCard("Day 1 21:40", "Friday · 9:40 pm", 14,
        listOf(PersonCard("Hermione", null)), "Common room", "After curfew"),
    turn = TurnState(TurnStateKind.Idle)
)
