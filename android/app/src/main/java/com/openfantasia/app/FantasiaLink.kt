package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

interface FantasiaLink {
    val isPaired: Boolean
    val hostName: String get() = "Mac"
    val reachable: StateFlow<Boolean>
    suspend fun pair(invite: PairingInvite)
    suspend fun stories(): StoryList
    suspend fun scene(storyID: String): SceneView
    suspend fun move(storyID: String, move: MoveRequest): TurnAccepted
    suspend fun retry(storyID: String): TurnAccepted
    suspend fun endScene(storyID: String, request: EndSceneRequest): Accepted
    suspend fun focus(storyID: String, request: FocusRequest): Accepted
    suspend fun linger(storyID: String, request: LingerRequest): Accepted
    suspend fun redo(storyID: String, request: RedoRequest): TurnAccepted
    fun watch(initial: SceneView): Flow<SceneView>
    fun portrait(url: String): PortraitSource? = null
}

fun interface PairingScanner { suspend fun scan(): String }
