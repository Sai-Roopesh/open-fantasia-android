package com.openfantasia.app

import com.openfantasia.protocol.*

// Old tests exercise Moves and Retry; an unexpected Scene command should fail their fixture.
abstract class StubFantasiaLink : FantasiaLink {
    override suspend fun endScene(storyID: String, request: EndSceneRequest): Accepted = error("Unexpected End scene")
    override suspend fun focus(storyID: String, request: FocusRequest): Accepted = error("Unexpected Focus")
    override suspend fun linger(storyID: String, request: LingerRequest): Accepted = error("Unexpected Linger")
    override suspend fun redo(storyID: String, request: RedoRequest): TurnAccepted = error("Unexpected Redo")
}
