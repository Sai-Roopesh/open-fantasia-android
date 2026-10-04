package com.openfantasia.app

import com.openfantasia.protocol.*

fun sceneFixture() = SceneView(
    earlierScenes = emptyList(),
    exchanges = listOf(Exchange(reply = Passage(entryID = "opening", text = "Hermione looks up."))),
    lastEventID = "1", focus = null, linger = false, dayView = null,
    headEntryID = "opening", pathID = "path", playerCharacter = "Roopesh Gantasala", seq = 1,
    storyID = "story", traceID = "view",
    scene = SceneCard(at = "Day 1 21:40", atLabel = "Friday · 9:40 pm", number = 14,
        people = listOf(PersonCard(name = "Hermione", portraitURL = null)), place = "Common room", title = "After curfew"),
    turn = TurnState(kind = TurnStateKind.Idle)
)
