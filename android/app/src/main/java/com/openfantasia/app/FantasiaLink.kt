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
    suspend fun pastScene(storyID: String, number: Long): PastScene
    suspend fun move(storyID: String, move: MoveRequest): TurnAccepted
    suspend fun choose(storyID: String, request: ChooseRequest): TurnAccepted
    // Paths (openspec paths). A link that does not reach a Mac has none.
    suspend fun paths(storyID: String): PathsView = throw LinkFailure("Paths are not on this link")
    suspend fun tryAnotherWay(storyID: String, request: TryAnotherWayRequest): Accepted = throw LinkFailure("Paths are not on this link")
    suspend fun rewind(storyID: String, request: RewindRequest): Accepted = throw LinkFailure("Paths are not on this link")
    suspend fun openPath(storyID: String, pathID: String): Accepted = throw LinkFailure("Paths are not on this link")
    suspend fun renamePath(storyID: String, pathID: String, request: RenamePathRequest): Accepted = throw LinkFailure("Paths are not on this link")
    suspend fun deletePath(storyID: String, pathID: String): Accepted = throw LinkFailure("Paths are not on this link")
    suspend fun clearPaths(storyID: String): Accepted = throw LinkFailure("Paths are not on this link")
    suspend fun edit(storyID: String, request: EditRequest): Accepted = throw LinkFailure("Editing is not on this link")
    suspend fun journal(storyID: String): JournalView = throw LinkFailure("The Journal is not on this link")
    suspend fun world(storyID: String): WorldView = throw LinkFailure("The World screen is not on this link")
    suspend fun backstage(storyID: String): BackstageView = throw LinkFailure("Backstage is not on this link")
    suspend fun removeTaste(storyID: String, request: RemoveTasteRequest): Accepted = throw LinkFailure("Taste is not on this link")
    suspend fun retryWorld(storyID: String, request: RetryWorldRequest): Accepted
    suspend fun retry(storyID: String, request: RetryRequest): TurnAccepted
    // The Models screen (openspec outside-the-scene: One Models screen). A link that does not reach a Mac has none.
    suspend fun models(): ModelsView = throw LinkFailure("Models are not on this link")
    suspend fun setJobModel(job: ModelJob, request: SetJobModelRequest): ModelsView = throw LinkFailure("Models are not on this link")
    suspend fun setActor(storyID: String, request: SetActorRequest): ModelsView = throw LinkFailure("Models are not on this link")
    suspend fun endScene(storyID: String, request: EndSceneRequest): Accepted
    suspend fun focus(storyID: String, request: FocusRequest): Accepted
    suspend fun linger(storyID: String, request: LingerRequest): Accepted
    suspend fun redo(storyID: String, request: RedoRequest): TurnAccepted
    fun watch(initial: SceneView): Flow<SceneView>
    fun portrait(url: String): PortraitSource? = null
}

fun interface PairingScanner { suspend fun scan(): String }
