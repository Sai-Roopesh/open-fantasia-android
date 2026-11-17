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
    // Editing people (openspec stories: Anything can be edited or created in the app).
    suspend fun people(storyID: String): PeopleView = throw LinkFailure("Editing is not on this link")
    suspend fun person(storyID: String, name: String): PersonDetail = throw LinkFailure("Editing is not on this link")
    suspend fun setPerson(storyID: String, name: String, request: PersonEdit): Accepted = throw LinkFailure("Editing is not on this link")
    suspend fun setLead(storyID: String, name: String, request: LeadRequest): Accepted = throw LinkFailure("Editing is not on this link")
    suspend fun setGroup(storyID: String, name: String, request: GroupRequest): Accepted = throw LinkFailure("Editing is not on this link")
    // Editing the rest of the Story (editing-the-story design decision 4): each answers with The Story as it now stands.
    suspend fun story(storyID: String): StoryView = throw LinkFailure("Editing is not on this link")
    suspend fun setPremise(storyID: String, request: PremiseRequest): StoryView = throw LinkFailure("Editing is not on this link")
    suspend fun setStyle(storyID: String, request: StyleRequest): StoryView = throw LinkFailure("Editing is not on this link")
    suspend fun setReplyLength(storyID: String, request: ReplyLengthRequest): StoryView = throw LinkFailure("Editing is not on this link")
    suspend fun setArcs(storyID: String, request: ArcsRequest): StoryView = throw LinkFailure("Editing is not on this link")
    suspend fun setLandmark(storyID: String, name: String, request: LandmarkRequest): StoryView = throw LinkFailure("Editing is not on this link")
    suspend fun dropLandmark(storyID: String, name: String, request: DropLandmarkRequest): StoryView = throw LinkFailure("Editing is not on this link")
    suspend fun setPlace(storyID: String, name: String, request: PlaceRequest): StoryView = throw LinkFailure("Editing is not on this link")
    suspend fun setWorld(storyID: String, request: WorldRequest): StoryView = throw LinkFailure("Editing is not on this link")
    suspend fun setClock(storyID: String, request: ClockRequest): StoryView = throw LinkFailure("Editing is not on this link")
    suspend fun uploadPortrait(storyID: String, name: String, image: ByteArray, type: String, after: String): Accepted = throw LinkFailure("Editing is not on this link")
    suspend fun backstage(storyID: String): BackstageView = throw LinkFailure("Backstage is not on this link")
    // Taste and steering notes live beside the Story, not on a Path (docs/adr/0020): none needs the head, and what each
    // changed is read again from Backstage.
    suspend fun removeTaste(storyID: String, request: RemoveTasteRequest): Unit = throw LinkFailure("Taste is not on this link")
    suspend fun rewordTaste(storyID: String, request: RewordTasteRequest): Unit = throw LinkFailure("Taste is not on this link")
    // Steering notes (openspec the-outline: The player sees and steers the Outline).
    suspend fun writeNote(storyID: String, request: SteeringNoteRequest): Unit = throw LinkFailure("Notes are not on this link")
    suspend fun deleteNote(storyID: String, noteID: String): Unit = throw LinkFailure("Notes are not on this link")
    suspend fun editNote(storyID: String, noteID: String, request: SteeringNoteEditRequest): Unit = throw LinkFailure("Notes are not on this link")
    // The player's brief and reactions (openspec long-run: The player steers with a brief and reactions).
    suspend fun setBrief(storyID: String, request: BriefRequest): Accepted = throw LinkFailure("The brief is not on this link")
    suspend fun react(storyID: String, request: ReactionRequest): Accepted = throw LinkFailure("Reactions are not on this link")
    /** Writes a failed Reply again, or goes on with a Scene's end from the step it stopped at. */
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
