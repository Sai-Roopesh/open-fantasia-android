// Generated from protocol/schemas by protocol/generate.mjs. Do not edit; change the schema and regenerate.

// To parse the JSON, install kotlin's serialization plugin and do:
//
// val json                 = Json { allowStructuredMapKeys = true }
// val errorCode            = json.parse(ErrorCode.serializer(), jsonString)
// val errorBody            = json.parse(ErrorBody.serializer(), jsonString)
// val pairingInvite        = json.parse(PairingInvite.serializer(), jsonString)
// val pairRequest          = json.parse(PairRequest.serializer(), jsonString)
// val pairResponse         = json.parse(PairResponse.serializer(), jsonString)
// val storyList            = json.parse(StoryList.serializer(), jsonString)
// val storySummary         = json.parse(StorySummary.serializer(), jsonString)
// val personCard           = json.parse(PersonCard.serializer(), jsonString)
// val sceneCard            = json.parse(SceneCard.serializer(), jsonString)
// val passage              = json.parse(Passage.serializer(), jsonString)
// val exchange             = json.parse(Exchange.serializer(), jsonString)
// val turnState            = json.parse(TurnState.serializer(), jsonString)
// val sceneView            = json.parse(SceneView.serializer(), jsonString)
// val nextScene            = json.parse(NextScene.serializer(), jsonString)
// val sceneSummaryLine     = json.parse(SceneSummaryLine.serializer(), jsonString)
// val previously           = json.parse(Previously.serializer(), jsonString)
// val moveRequest          = json.parse(MoveRequest.serializer(), jsonString)
// val turnAccepted         = json.parse(TurnAccepted.serializer(), jsonString)
// val storyEvent           = json.parse(StoryEvent.serializer(), jsonString)
// val dayView              = json.parse(DayView.serializer(), jsonString)
// val countdown            = json.parse(Countdown.serializer(), jsonString)
// val meanwhileItem        = json.parse(MeanwhileItem.serializer(), jsonString)
// val worldFailure         = json.parse(WorldFailure.serializer(), jsonString)
// val happening            = json.parse(Happening.serializer(), jsonString)
// val dayChoices           = json.parse(DayChoices.serializer(), jsonString)
// val skip                 = json.parse(Skip.serializer(), jsonString)
// val chooseRequest        = json.parse(ChooseRequest.serializer(), jsonString)
// val pathsView            = json.parse(PathsView.serializer(), jsonString)
// val pathRow              = json.parse(PathRow.serializer(), jsonString)
// val pathCard             = json.parse(PathCard.serializer(), jsonString)
// val tryAnotherWayRequest = json.parse(TryAnotherWayRequest.serializer(), jsonString)
// val rewindRequest        = json.parse(RewindRequest.serializer(), jsonString)
// val renamePathRequest    = json.parse(RenamePathRequest.serializer(), jsonString)
// val editRequest          = json.parse(EditRequest.serializer(), jsonString)
// val journalView          = json.parse(JournalView.serializer(), jsonString)
// val journalDay           = json.parse(JournalDay.serializer(), jsonString)
// val journalRow           = json.parse(JournalRow.serializer(), jsonString)
// val journalScene         = json.parse(JournalScene.serializer(), jsonString)
// val backstageView        = json.parse(BackstageView.serializer(), jsonString)
// val backstageDay         = json.parse(BackstageDay.serializer(), jsonString)
// val backstageItem        = json.parse(BackstageItem.serializer(), jsonString)
// val backstageThread      = json.parse(BackstageThread.serializer(), jsonString)
// val backstageLife        = json.parse(BackstageLife.serializer(), jsonString)
// val writerPlan           = json.parse(WriterPlan.serializer(), jsonString)
// val sceneCall            = json.parse(SceneCall.serializer(), jsonString)
// val beatStatus           = json.parse(BeatStatus.serializer(), jsonString)
// val writerBeat           = json.parse(WriterBeat.serializer(), jsonString)
// val removeTasteRequest   = json.parse(RemoveTasteRequest.serializer(), jsonString)
// val endSceneRequest      = json.parse(EndSceneRequest.serializer(), jsonString)
// val focusRequest         = json.parse(FocusRequest.serializer(), jsonString)
// val lingerRequest        = json.parse(LingerRequest.serializer(), jsonString)
// val redoRequest          = json.parse(RedoRequest.serializer(), jsonString)
// val accepted             = json.parse(Accepted.serializer(), jsonString)
// val pastScene            = json.parse(PastScene.serializer(), jsonString)
// val modelProvider        = json.parse(ModelProvider.serializer(), jsonString)
// val modelJob             = json.parse(ModelJob.serializer(), jsonString)
// val modelChoice          = json.parse(ModelChoice.serializer(), jsonString)
// val chosenModel          = json.parse(ChosenModel.serializer(), jsonString)
// val storyActor           = json.parse(StoryActor.serializer(), jsonString)
// val jobModel             = json.parse(JobModel.serializer(), jsonString)
// val modelOption          = json.parse(ModelOption.serializer(), jsonString)
// val providerModels       = json.parse(ProviderModels.serializer(), jsonString)
// val modelsView           = json.parse(ModelsView.serializer(), jsonString)
// val setJobModelRequest   = json.parse(SetJobModelRequest.serializer(), jsonString)
// val setActorRequest      = json.parse(SetActorRequest.serializer(), jsonString)
// val retryRequest         = json.parse(RetryRequest.serializer(), jsonString)
// val retryWorldRequest    = json.parse(RetryWorldRequest.serializer(), jsonString)
// val directorPhase        = json.parse(DirectorPhase.serializer(), jsonString)
// val directorLine         = json.parse(DirectorLine.serializer(), jsonString)
// val sceneRef             = json.parse(SceneRef.serializer(), jsonString)
// val worldPerson          = json.parse(WorldPerson.serializer(), jsonString)
// val worldPlace           = json.parse(WorldPlace.serializer(), jsonString)
// val calendarKind         = json.parse(CalendarKind.serializer(), jsonString)
// val calendarItem         = json.parse(CalendarItem.serializer(), jsonString)
// val worldView            = json.parse(WorldView.serializer(), jsonString)
// val groupInfo            = json.parse(GroupInfo.serializer(), jsonString)
// val personSummary        = json.parse(PersonSummary.serializer(), jsonString)
// val peopleView           = json.parse(PeopleView.serializer(), jsonString)
// val personDetail         = json.parse(PersonDetail.serializer(), jsonString)
// val personEdit           = json.parse(PersonEdit.serializer(), jsonString)
// val leadRequest          = json.parse(LeadRequest.serializer(), jsonString)
// val groupRequest         = json.parse(GroupRequest.serializer(), jsonString)
// val storyPlace           = json.parse(StoryPlace.serializer(), jsonString)
// val storyLandmark        = json.parse(StoryLandmark.serializer(), jsonString)
// val storyClock           = json.parse(StoryClock.serializer(), jsonString)
// val storyView            = json.parse(StoryView.serializer(), jsonString)
// val premiseRequest       = json.parse(PremiseRequest.serializer(), jsonString)
// val styleRequest         = json.parse(StyleRequest.serializer(), jsonString)
// val replyLengthRequest   = json.parse(ReplyLengthRequest.serializer(), jsonString)
// val arcsRequest          = json.parse(ArcsRequest.serializer(), jsonString)
// val landmarkRequest      = json.parse(LandmarkRequest.serializer(), jsonString)
// val dropLandmarkRequest  = json.parse(DropLandmarkRequest.serializer(), jsonString)
// val placeRequest         = json.parse(PlaceRequest.serializer(), jsonString)
// val worldRequest         = json.parse(WorldRequest.serializer(), jsonString)
// val clockRequest         = json.parse(ClockRequest.serializer(), jsonString)
// val rewordTasteRequest   = json.parse(RewordTasteRequest.serializer(), jsonString)
// val between              = json.parse(Between.serializer(), jsonString)
// val betweenTurn          = json.parse(BetweenTurn.serializer(), jsonString)
// val recordRow            = json.parse(RecordRow.serializer(), jsonString)
// val recordRetryRequest   = json.parse(RecordRetryRequest.serializer(), jsonString)

package com.openfantasia.protocol

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

@Serializable
data class ErrorBody (
    val error: ErrorDetail
)

@Serializable
data class ErrorDetail (
    val code: ErrorCode,

    /**
     * Why, in words the player can read.
     */
    val message: String,

    @SerialName("trace_id")
    val traceID: String
)

@Serializable
enum class ErrorCode(val value: String) {
    @SerialName("busy") Busy("busy"),
    @SerialName("internal") Internal("internal"),
    @SerialName("invalid") Invalid("invalid"),
    @SerialName("model_failed") ModelFailed("model_failed"),
    @SerialName("not_found") NotFound("not_found"),
    @SerialName("stale_head") StaleHead("stale_head"),
    @SerialName("unpaired") Unpaired("unpaired"),
    @SerialName("version_mismatch") VersionMismatch("version_mismatch");
}

/**
 * What the Mac's pairing QR code holds.
 */
@Serializable
data class PairingInvite (
    val addresses: List<String>,

    /**
     * One-time pairing code, valid for ten minutes.
     */
    val code: String,

    val contract: Long,

    /**
     * SHA-256 of the Mac's certificate, which the phone pins.
     */
    val fingerprint: String,

    @SerialName("host_id")
    val hostID: String,

    @SerialName("host_name")
    val hostName: String,

    val port: Long
)

@Serializable
data class PairRequest (
    val code: String,

    @SerialName("device_name")
    val deviceName: String
)

@Serializable
data class PairResponse (
    @SerialName("device_token")
    val deviceToken: String,

    @SerialName("host_id")
    val hostID: String,

    @SerialName("host_name")
    val hostName: String,

    @SerialName("trace_id")
    val traceID: String
)

@Serializable
data class StoryList (
    val stories: List<StorySummary>,

    @SerialName("trace_id")
    val traceID: String
)

@Serializable
data class StorySummary (
    /**
     * The line under the standing: "Friday 9:52 pm · with Hermione" mid-Scene, "3 Scenes
     * played" at the Day View.
     */
    val detail: String,

    val id: String,

    /**
     * Where the Story stands on its current Path, as one line: "Scene 14 · After curfew"
     * mid-Scene, "Sunday 7:40 am · choosing where to go" at the Day View.
     */
    val standing: String,

    val title: String,

    @SerialName("updated_at")
    val updatedAt: String
)

/**
 * The Scene screen as the Mac sees it on the Story's current Path.
 */
@Serializable
data class SceneView (
    /**
     * Present once the Scene has closed, by the Story or by End scene: the Day View, whose
     * composer takes the next Move.
     */
    @SerialName("day_view")
    val dayView: DayView? = null,

    @SerialName("earlier_scenes")
    val earlierScenes: List<SceneSummaryLine>,

    val exchanges: List<Exchange>,

    /**
     * Who the Scene is focused on, or null.
     */
    val focus: String? = null,

    /**
     * The entry a Move must follow.
     */
    @SerialName("head_entry_id")
    val headEntryID: String,

    /**
     * The id of the newest event this view reflects, including the words of a Reply under way;
     * the live stream resumes after it.
     */
    @SerialName("last_event_id")
    val lastEventID: String,

    /**
     * Whether Linger is on.
     */
    val linger: Boolean,

    /**
     * Present while a Move at the Day View is opening the next Scene and the Scene has not
     * opened yet (openspec presence: Between Scenes is quiet, and shows progress). Then there
     * is no Day View, the exchanges are that Move's, the Scene that closed is among the earlier
     * Scenes, and the phone shows this card in place of the Scene's.
     */
    val opening: NextScene? = null,

    @SerialName("path_id")
    val pathID: String,

    /**
     * The name of the person the player plays, for labelling their Moves.
     */
    @SerialName("player_character")
    val playerCharacter: String,

    /**
     * Present when the player last played this Story more than a day ago and the Scene they are
     * in, or the Scene that closed at the Day View, has a summary: the Previously card.
     */
    val previously: Previously? = null,

    val scene: SceneCard,

    /**
     * The newest entry in the Story when this view was taken.
     */
    val seq: Long,

    @SerialName("story_id")
    val storyID: String,

    @SerialName("trace_id")
    val traceID: String,

    val turn: TurnState
)

/**
 * Where and when the Player Character is between Scenes, and what he learned meanwhile
 * (openspec day-view).
 *
 * scene_closed: the Day View.
 */
@Serializable
data class DayView (
    /**
     * Story time, "Day N HH:MM".
     */
    val at: String,

    /**
     * Story time as people say it: "Sunday 7:40 am".
     */
    @SerialName("at_label")
    val atLabel: String,

    val choices: DayChoices,

    /**
     * Who closed the last Scene: the Story, whose closing Reply can be redone, or the player,
     * with End scene.
     */
    @SerialName("closed_by")
    val closedBy: ClosedBy,

    val countdowns: List<Countdown>,

    /**
     * The day as people say it: "Sunday", or "Day 3" when the Story has no weekdays.
     */
    val day: String,

    /**
     * Why the World could not move on, when world is failed; Retry is POST
     * /stories/{id}/world/retry.
     */
    val failure: WorldFailure? = null,

    /**
     * What is on today that the Player Character could go to: at most four, the Story's pick
     * first, once the World has moved on; empty before.
     */
    val happenings: List<Happening>,

    /**
     * What the Player Character learned while elsewhere, once the World has moved on; empty
     * before.
     */
    val meanwhile: List<MeanwhileItem>,

    /**
     * Where the Player Character is.
     */
    val place: String,

    /**
     * When the Scene that ended ran, as people say it: "Friday 9:40 pm – 11:05 pm".
     */
    @SerialName("scene_span")
    val sceneSpan: String,

    /**
     * The time as people say it: "7:40 am".
     */
    val time: String,

    /**
     * Whether the World has moved on to the Day View's time: moving_on while the Weaver works
     * (the phone says so in one line and takes no Move), ready, or failed (with failure).
     */
    val world: World
)

/**
 * What the Day View's other choices offer: people to follow, places to go, and times to
 * skip to.
 */
@Serializable
data class DayChoices (
    /**
     * People the Player Character could follow: the Leads and whoever was in the Scene that
     * ended.
     */
    val follow: List<String>,

    /**
     * The Story's places to go to.
     */
    val places: List<String>,

    val skips: List<Skip>
)

/**
 * A later time to skip to: this evening, tomorrow, the weekend, the next Landmark.
 */
@Serializable
data class Skip (
    val at: String,

    /**
     * The label as it reads inside a sentence: "this evening", "tomorrow", "the weekend", or
     * the Landmark's name as named.
     */
    @SerialName("in_sentence")
    val inSentence: String,

    /**
     * "This evening", "Tomorrow", "The weekend", or the Landmark's name.
     */
    val label: String,

    /**
     * As people say it: "6:00 pm" on the Day View's own day, "Saturday 7:30 am" on another.
     */
    val time: String
)

/**
 * Who closed the last Scene: the Story, whose closing Reply can be redone, or the player,
 * with End scene.
 */
@Serializable
enum class ClosedBy(val value: String) {
    @SerialName("player") Player("player"),
    @SerialName("story") Story("story");
}

@Serializable
data class Countdown (
    /**
     * "3 days to Draconia's flying test", "Tomorrow: the first match", "Today at 6:00 pm: the
     * feast".
     */
    val label: String,

    val landmark: String,

    /**
     * How long to go: "3 days", "Tomorrow", "Today at 8:30 pm".
     */
    @SerialName("when")
    val linkSchemaWhen: String
)

/**
 * The Weaver could not move the World on.
 */
@Serializable
data class WorldFailure (
    val reason: String,

    @SerialName("trace_id")
    val traceID: String
)

/**
 * Something going on in the World at a time and place the Player Character could be at
 * (openspec day-view: Up to four Happenings).
 */
@Serializable
data class Happening (
    /**
     * Story time, "Day N HH:MM".
     */
    val at: String,

    /**
     * The Player Character is expected there: shown "You're expected".
     */
    val expected: Boolean,

    val id: String,

    /**
     * The Story's own pick, which Let the Story choose goes to.
     */
    val pick: Boolean,

    val place: String,

    /**
     * When, as people say it: "9:00 am", or "Tomorrow 9:00 am".
     */
    val time: String,

    /**
     * What is going on, and why it matters now.
     */
    val what: String,

    /**
     * Who will be there, by name.
     */
    val who: List<String>
)

/**
 * One line of Meanwhile, marked by how the Player Character learned it.
 */
@Serializable
data class MeanwhileItem (
    val how: How,
    val text: String
)

@Serializable
enum class How(val value: String) {
    @SerialName("rumour") Rumour("rumour"),
    @SerialName("seen") Seen("seen"),
    @SerialName("told") Told("told");
}

/**
 * Whether the World has moved on to the Day View's time: moving_on while the Weaver works
 * (the phone says so in one line and takes no Move), ready, or failed (with failure).
 */
@Serializable
enum class World(val value: String) {
    @SerialName("failed") Failed("failed"),
    @SerialName("moving_on") MovingOn("moving_on"),
    @SerialName("ready") Ready("ready");
}

@Serializable
data class SceneSummaryLine (
    val number: Long,

    /**
     * The Chronicler's one line for the Scene, or empty until it has written one.
     */
    val summary: String,

    val title: String
)

/**
 * A Move and the Reply that answered it. The opening Scene's first Reply has no Move.
 */
@Serializable
data class Exchange (
    val move: Passage? = null,
    val reply: Passage? = null
)

/**
 * One Move or Reply, as it stands on the tree.
 */
@Serializable
data class Passage (
    @SerialName("entry_id")
    val entryID: String,

    val text: String
)

/**
 * The next Scene, being written: when it is, when the choice set a time.
 *
 * move: present when the Move is written at the Day View, the next Scene it opens. The
 * Scene is then that Move's, under this card, until scene_opened.
 */
@Serializable
data class NextScene (
    /**
     * Story time, "Day N HH:MM", or null when the choice set none.
     */
    val at: String? = null,

    /**
     * As people say it: "Friday 6:00 pm", or null.
     */
    @SerialName("at_label")
    val atLabel: String? = null
)

/**
 * The Previously card: where the Story stands, from the Chronicler's records, and when the
 * player last played.
 */
@Serializable
data class Previously (
    /**
     * When the player last played: the time the Path's head entry was written, ISO 8601.
     */
    val since: String,

    /**
     * The latest summary of the Scene the player is in (so far), or of the Scene that closed.
     */
    val summary: String
)

/**
 * A Scene's title card.
 *
 * scene_opened and reply: the Scene's card as it stands.
 */
@Serializable
data class SceneCard (
    /**
     * Story time, "Day N HH:MM".
     */
    val at: String,

    /**
     * Story time as people say it: "Friday 9:40 pm".
     */
    @SerialName("at_label")
    val atLabel: String,

    val number: Long,

    /**
     * Who is in the Scene now besides the Player Character, with their Portraits; someone a
     * Move or the Story brings in is added.
     */
    val people: List<PersonCard>,

    val place: String,
    val title: String
)

@Serializable
data class PersonCard (
    val name: String,

    @SerialName("portrait_url")
    val portraitURL: String? = null
)

/**
 * Whether a Reply is being written, has failed, or nothing is under way.
 */
@Serializable
data class TurnState (
    /**
     * When failed: the job that failed.
     */
    val job: ModelJob? = null,

    val kind: TurnStateKind,

    /**
     * When failed: why, in words the player can read.
     */
    val reason: String? = null,

    /**
     * While writing: the Reply's words so far.
     */
    @SerialName("text_so_far")
    val textSoFar: String? = null,

    /**
     * When writing or failed: the turn's trace id.
     */
    @SerialName("trace_id")
    val traceID: String? = null
)

/**
 * When failed: the job that failed.
 *
 * A job a model does (CONTEXT.md: Who writes the Story).
 */
@Serializable
enum class ModelJob(val value: String) {
    @SerialName("actor") Actor("actor"),
    @SerialName("chronicler") Chronicler("chronicler"),
    @SerialName("director") Director("director"),
    @SerialName("weaver") Weaver("weaver"),
    @SerialName("writer") Writer("writer");
}

@Serializable
enum class TurnStateKind(val value: String) {
    @SerialName("failed") Failed("failed"),
    @SerialName("idle") Idle("idle"),
    @SerialName("writing") Writing("writing");
}

@Serializable
data class MoveRequest (
    /**
     * The entry the phone saw as the head; a Move after any other is refused as stale.
     */
    val after: String,

    val text: String
)

@Serializable
data class TurnAccepted (
    @SerialName("move_entry_id")
    val moveEntryID: String,

    @SerialName("trace_id")
    val traceID: String
)

/**
 * One event on a Story's live stream. Entry events (scene_opened, move, reply,
 * scene_closed, focus_set, linger_set, redo) are replayed after a reconnect; reply_started,
 * reply_delta and reply_failed describe the turn under way; world_moved and world_failed
 * say the World has moved on, or could not, after a Scene ended. path_changed says the
 * Story is now on another Path, or its Path was moved back, or a Move or Reply on it was
 * edited. After scene_opened, scene_closed, redo, world_moved, world_failed and
 * path_changed, and after a move that opens the next Scene, the phone reads the Scene
 * again, because they change more than one part of it.
 */
@Serializable
data class StoryEvent (
    /**
     * scene_closed: the Day View.
     */
    @SerialName("day_view")
    val dayView: DayView? = null,

    /**
     * scene_opened and focus_set: who the Scene is focused on, or null.
     */
    val focus: String? = null,

    val kind: StoryEventKind,

    /**
     * linger_set: whether Linger is on.
     */
    val linger: Boolean? = null,

    /**
     * move: present when the Move is written at the Day View, the next Scene it opens. The
     * Scene is then that Move's, under this card, until scene_opened.
     */
    val opening: NextScene? = null,

    val passage: Passage? = null,
    val reason: String? = null,

    /**
     * scene_opened and reply: the Scene's card as it stands.
     */
    val scene: SceneCard? = null,

    /**
     * The newest entry this event follows.
     */
    val seq: Long,

    /**
     * reply_delta: the words that just arrived.
     */
    val text: String? = null,

    @SerialName("trace_id")
    val traceID: String? = null
)

@Serializable
enum class StoryEventKind(val value: String) {
    @SerialName("focus_set") FocusSet("focus_set"),
    @SerialName("linger_set") LingerSet("linger_set"),
    @SerialName("move") Move("move"),
    @SerialName("path_changed") PathChanged("path_changed"),
    @SerialName("redo") Redo("redo"),
    @SerialName("reply") Reply("reply"),
    @SerialName("reply_delta") ReplyDelta("reply_delta"),
    @SerialName("reply_failed") ReplyFailed("reply_failed"),
    @SerialName("reply_started") ReplyStarted("reply_started"),
    @SerialName("scene_closed") SceneClosed("scene_closed"),
    @SerialName("scene_opened") SceneOpened("scene_opened"),
    @SerialName("world_failed") WorldFailed("world_failed"),
    @SerialName("world_moved") WorldMoved("world_moved");
}

/**
 * A choice at the Day View (openspec day-view: The player chooses where to be). The Mac
 * writes it as the player's Move, the Gap first.
 */
@Serializable
data class ChooseRequest (
    /**
     * The entry the choice follows: the Day View's head.
     */
    val after: String,

    /**
     * skip: the time skipped to; left out or null for the other kinds.
     */
    val at: String? = null,

    /**
     * What the Player Character did in the Gap, in the player's words, or null: left blank, he
     * spent it quietly where he was.
     */
    val gap: String? = null,

    /**
     * go: the Happening's id; left out or null for the other kinds.
     */
    val happening: String? = null,

    val kind: ChooseRequestKind,

    /**
     * somewhere: the place; left out or null for the other kinds.
     */
    val place: String? = null,

    /**
     * follow: who; left out or null for the other kinds.
     */
    val who: String? = null
)

@Serializable
enum class ChooseRequestKind(val value: String) {
    @SerialName("follow") Follow("follow"),
    @SerialName("go") Go("go"),
    @SerialName("skip") Skip("skip"),
    @SerialName("somewhere") Somewhere("somewhere"),
    @SerialName("story") Story("story");
}

/**
 * The Paths screen (openspec paths: The Paths screen): the Story as a tree, laid out by the
 * Mac in reading order.
 */
@Serializable
data class PathsView (
    /**
     * How many Paths Clear would remove: those Rewind set aside and the player never opened.
     */
    val clearable: Long,

    val rows: List<PathRow>,

    @SerialName("story_id")
    val storyID: String,

    @SerialName("trace_id")
    val traceID: String
)

/**
 * One row of the tree: a run of Scenes the Paths below share, folded; the Scene where they
 * part; or a Path's card. Depth says how far in it is drawn.
 */
@Serializable
data class PathRow (
    val depth: Long,
    val kind: PathRowKind,

    /**
     * scenes: "Scenes 1 – 12 · Friday 6:10 pm"; fork: "Scene 13 · Friday 8:05 pm"; path: its
     * card's label.
     */
    val label: String,

    /**
     * path: the card.
     */
    val path: PathCard? = null,

    /**
     * fork: the Scene's title, "The troll"; otherwise null.
     */
    val title: String? = null
)

@Serializable
enum class PathRowKind(val value: String) {
    @SerialName("fork") Fork("fork"),
    @SerialName("path") Path("path"),
    @SerialName("scenes") Scenes("scenes");
}

/**
 * A Path on the Paths screen.
 */
@Serializable
data class PathCard (
    /**
     * False for the Path the player is on.
     */
    @SerialName("can_delete")
    val canDelete: Boolean,

    /**
     * Whether the player is on it.
     */
    val current: Boolean,

    /**
     * "3 Scenes · Saturday 1:15 am".
     */
    val detail: String,

    val id: String,

    /**
     * "MAIN · YOU ARE HERE", "FROM SCENE 13 · TRIED ANOTHER WAY", "SET ASIDE AT SCENE 14",
     * "FROM THE BEGINNING".
     */
    val label: String,

    /**
     * When it was last played, ISO 8601; the phone says how long ago.
     */
    @SerialName("played_at")
    val playedAt: String,

    /**
     * The player's name for it, or its newest Scene: "Scene 14 · After curfew".
     */
    val title: String
)

/**
 * Try another way from a Reply, or, with from null, start again from the beginning
 * (openspec paths).
 */
@Serializable
data class TryAnotherWayRequest (
    /**
     * The head the phone saw; refused as stale if the Story has moved on.
     */
    val after: String,

    /**
     * The Reply's entry, or null for the Story's opening.
     */
    val from: String? = null
)

/**
 * Rewind the Path the player is on to a Reply; what came after is set aside as a Path of
 * its own.
 */
@Serializable
data class RewindRequest (
    /**
     * The head the phone saw; refused as stale if the Story has moved on.
     */
    val after: String,

    /**
     * The Reply's entry.
     */
    val to: String
)

@Serializable
data class RenamePathRequest (
    /**
     * The Path's new name; empty to go back to its newest Scene.
     */
    val name: String
)

/**
 * Edit a Move or a Reply in the player's words (openspec scenes: Editing). The latest
 * changes in place; anything earlier carries the Story on from the edit on a new Path.
 */
@Serializable
data class EditRequest (
    /**
     * The head the phone saw; refused as stale if the Story has moved on.
     */
    val after: String,

    /**
     * The Move's or the Reply's entry, or a Scene's opening prose.
     */
    val entry: String,

    /**
     * The words it should read.
     */
    val text: String
)

/**
 * The Journal (openspec outside-the-scene: The Journal reads the Story back): the Scenes on
 * the current Path by day, and what the Player Character heard Meanwhile between them, in
 * order.
 */
@Serializable
data class JournalView (
    val days: List<JournalDay>,

    @SerialName("story_id")
    val storyID: String,

    @SerialName("trace_id")
    val traceID: String
)

@Serializable
data class JournalDay (
    /**
     * "Friday".
     */
    val day: String,

    val rows: List<JournalRow>
)

@Serializable
data class JournalRow (
    val kind: JournalRowKind,
    val meanwhile: MeanwhileItem? = null,
    val scene: JournalScene? = null
)

@Serializable
enum class JournalRowKind(val value: String) {
    @SerialName("meanwhile") Meanwhile("meanwhile"),
    @SerialName("scene") Scene("scene");
}

@Serializable
data class JournalScene (
    /**
     * "Scene 12 · 6:10 pm · The Three Broomsticks", or with "now" for the Scene the player is
     * in.
     */
    val label: String,

    /**
     * Whether it is the Scene the player is in.
     */
    val now: Boolean,

    val number: Long,

    /**
     * The Chronicler's line, or empty until it has written one.
     */
    val summary: String,

    val title: String
)

/**
 * Backstage (openspec outside-the-scene: Backstage shows everything else, only when
 * visited): what the Player Character does not know.
 */
@Serializable
data class BackstageView (
    /**
     * What the Director is building toward; null until the Director has planned on this Path.
     */
    val director: DirectorLine? = null,

    val lives: List<BackstageLife>,

    /**
     * What happened off-screen, by day, newest first, the last seven days.
     */
    val offscreen: List<BackstageDay>,

    /**
     * The record: each Scene not yet recorded, and each recorded with parts left out, newest
     * first; empty when nothing is missing.
     */
    val record: List<RecordRow>,

    @SerialName("story_id")
    val storyID: String,

    val taste: List<String>,
    val threads: List<BackstageThread>,

    @SerialName("trace_id")
    val traceID: String,

    /**
     * The Writer's plan for the Scene the player is in; null between Scenes.
     */
    val writer: WriterPlan? = null
)

/**
 * The Director's plan as Backstage shows it (Backstage.dc.html: THE DIRECTOR).
 */
@Serializable
data class DirectorLine (
    /**
     * Said for Backstage: "Building toward the flying test on Wednesday. This stretch builds;
     * rest comes after it."
     */
    val line: String,

    val phase: DirectorPhase,

    /**
     * What the stretch builds toward: "the flying test on Wednesday".
     */
    val toward: String
)

/**
 * Where a stretch of the Story is: building, at its peak, or resting after one.
 */
@Serializable
enum class DirectorPhase(val value: String) {
    @SerialName("build") Build("build"),
    @SerialName("peak") Peak("peak"),
    @SerialName("rest") REST("rest");
}

@Serializable
data class BackstageLife (
    val doing: String? = null,
    val where: String? = null,
    val who: String
)

@Serializable
data class BackstageDay (
    /**
     * "Saturday".
     */
    val day: String,

    val items: List<BackstageItem>
)

@Serializable
data class BackstageItem (
    @SerialName("known_to")
    val knownTo: List<String>,

    /**
     * "11:50 pm".
     */
    val time: String,

    val what: String
)

/**
 * A Scene in The record (lasting-records): one not yet recorded, or one recorded with parts
 * left out.
 */
@Serializable
data class RecordRow (
    /**
     * The parts of its record that were left out, and why.
     */
    val dropped: List<String>,

    /**
     * Why the last try failed; null for a recorded Scene.
     */
    val reason: String? = null,

    @SerialName("scene_number")
    val sceneNumber: Long,

    @SerialName("scene_title")
    val sceneTitle: String,

    /**
     * waiting: it will be tried again after the next Scene; given_up: three tries failed, and
     * Retry tries again; recorded: recorded, without the parts in dropped.
     */
    val state: State
)

/**
 * waiting: it will be tried again after the next Scene; given_up: three tries failed, and
 * Retry tries again; recorded: recorded, without the parts in dropped.
 */
@Serializable
enum class State(val value: String) {
    @SerialName("given_up") GivenUp("given_up"),
    @SerialName("recorded") Recorded("recorded"),
    @SerialName("waiting") Waiting("waiting");
}

@Serializable
data class BackstageThread (
    val name: String,

    /**
     * Where it stands.
     */
    val now: String
)

@Serializable
data class WriterPlan (
    val beats: List<WriterBeat>,

    /**
     * What the Writer says the next Reply does with the Scene, or null before its first plan.
     */
    val call: SceneCall? = null,

    val exit: String? = null,
    val purpose: String? = null
)

@Serializable
data class WriterBeat (
    val status: BeatStatus,
    val text: String
)

/**
 * Where a beat stands: to come, under way, done, or passed over.
 */
@Serializable
enum class BeatStatus(val value: String) {
    @SerialName("done") Done("done"),
    @SerialName("in_play") InPlay("in_play"),
    @SerialName("pending") Pending("pending"),
    @SerialName("skipped") Skipped("skipped");
}

/**
 * Go on, bring the Scene to its turn, or close it.
 */
@Serializable
enum class SceneCall(val value: String) {
    @SerialName("continue") Continue("continue"),
    @SerialName("end") End("end"),
    @SerialName("land") Land("land");
}

/**
 * Delete a lesson from Taste on the Path the player is on (openspec long-run: Taste is
 * short, readable and the player's).
 */
@Serializable
data class RemoveTasteRequest (
    /**
     * The head the phone saw; refused as stale if the Story has moved on.
     */
    val after: String,

    /**
     * The lesson to delete, as Taste reads it.
     */
    val line: String
)

@Serializable
data class EndSceneRequest (
    /**
     * The head the phone saw; refused as stale if the Story has moved on.
     */
    val after: String
)

@Serializable
data class FocusRequest (
    val after: String,

    /**
     * The person to focus on, by name, or null to clear Focus.
     */
    val on: String? = null
)

@Serializable
data class LingerRequest (
    val after: String,
    val on: Boolean
)

/**
 * Write the latest Reply again. The Direction reaches the Writer only, never the Story.
 */
@Serializable
data class RedoRequest (
    /**
     * The head the phone saw: the latest Reply, or the end of the Scene that Reply closed.
     */
    val after: String,

    val direction: String? = null,

    /**
     * The model for just this Reply; null or absent for the Story's Actor.
     */
    val model: ModelChoice? = null,

    /**
     * Keep the Direction as a line of Taste.
     */
    val remember: Boolean
)

/**
 * Which model does a job: the provider, the id it lists the model under, and the effort
 * when the model has one.
 */
@Serializable
data class ModelChoice (
    val effort: String? = null,
    val model: String,
    val provider: ModelProvider
)

/**
 * Who offers a model: each is reached through the player's own subscription (docs/adr/0005).
 */
@Serializable
enum class ModelProvider(val value: String) {
    @SerialName("antigravity") Antigravity("antigravity"),
    @SerialName("claude") Claude("claude"),
    @SerialName("codex") Codex("codex");
}

/**
 * A change to the Story that is done when it is answered.
 */
@Serializable
data class Accepted (
    @SerialName("head_entry_id")
    val headEntryID: String,

    @SerialName("trace_id")
    val traceID: String
)

/**
 * An earlier Scene on the current Path, in full, for reading back (openspec scenes:
 * Scrolling back).
 */
@Serializable
data class PastScene (
    /**
     * When the Scene began, as people say it.
     */
    @SerialName("at_label")
    val atLabel: String,

    val exchanges: List<Exchange>,
    val number: Long,
    val place: String,

    /**
     * The Chronicler's one line, or empty until it has written one.
     */
    val summary: String,

    val title: String,

    @SerialName("trace_id")
    val traceID: String
)

/**
 * The Models screen (openspec outside-the-scene: One Models screen).
 */
@Serializable
data class ModelsView (
    val jobs: List<JobModel>,
    val providers: List<ProviderModels>,
    val stories: List<StoryActor>,

    @SerialName("trace_id")
    val traceID: String
)

/**
 * One job on the Models screen, for every Story.
 */
@Serializable
data class JobModel (
    /**
     * What the job does, in one line: "Plans each Reply before it starts".
     */
    val does: String,

    val job: ModelJob,
    val model: ChosenModel,
    val title: String
)

/**
 * A model as the Models screen shows it: the choice, and its name with the effort ("GPT 6.1
 * Sol · high").
 */
@Serializable
data class ChosenModel (
    val choice: ModelChoice,
    val label: String
)

/**
 * What one provider offers, as last asked.
 */
@Serializable
data class ProviderModels (
    /**
     * "CLAUDE", "CODEX", "ANTIGRAVITY".
     */
    val label: String,

    /**
     * What it offers; when not reachable, what it last offered.
     */
    val models: List<ModelOption>,

    val provider: ModelProvider,

    /**
     * Whether the provider answered the last time it was asked.
     */
    val reachable: Boolean,

    /**
     * When not reachable: why, in words the player can read.
     */
    val reason: String? = null
)

/**
 * A model a provider offers.
 */
@Serializable
data class ModelOption (
    @SerialName("default_effort")
    val defaultEffort: String? = null,

    /**
     * The efforts it supports, lowest first; empty when it has none.
     */
    val efforts: List<String>,

    val id: String,

    /**
     * As the phone shows it: "GPT 6.1 Sol".
     */
    val name: String
)

/**
 * One Story's Actor on the Models screen.
 */
@Serializable
data class StoryActor (
    val actor: ChosenModel,

    /**
     * Set by the player for this Story; otherwise the one its Story File names.
     */
    val own: Boolean,

    @SerialName("story_id")
    val storyID: String,

    val title: String
)

/**
 * Sets the model for a job, from its next work.
 */
@Serializable
data class SetJobModelRequest (
    val model: ModelChoice
)

/**
 * Sets a Story's own Actor; null goes back to the one its Story File names.
 */
@Serializable
data class SetActorRequest (
    val model: ModelChoice? = null
)

/**
 * Writes the failed Reply again; with a model, the job that failed runs on it for this one
 * try.
 */
@Serializable
data class RetryRequest (
    val model: ModelChoice? = null
)

/**
 * Moves the World on again; with a model, the Weaver runs on it for this one try.
 */
@Serializable
data class RetryWorldRequest (
    val model: ModelChoice? = null
)

/**
 * The World screen: People, Places and the Calendar, only as the Player Character knows
 * them.
 */
@Serializable
data class WorldView (
    /**
     * Ordered by time.
     */
    val calendar: List<CalendarItem>,

    /**
     * The Leads first, in the Story's order, then everyone else he knows of, by name.
     */
    val people: List<WorldPerson>,

    val places: List<WorldPlace>,

    @SerialName("story_id")
    val storyID: String,

    @SerialName("trace_id")
    val traceID: String
)

/**
 * A Landmark, or a Happening he knows of, still ahead.
 */
@Serializable
data class CalendarItem (
    /**
     * When, as people say it: "Wednesday 9:00 am".
     */
    @SerialName("at_label")
    val atLabel: String,

    val kind: CalendarKind,
    val name: String,
    val what: String,

    /**
     * How long to go: "3 days", "Tomorrow", "Today at 8:30 pm".
     */
    @SerialName("when")
    val calendarItemWhen: String
)

@Serializable
enum class CalendarKind(val value: String) {
    @SerialName("happening") Happening("happening"),
    @SerialName("landmark") Landmark("landmark");
}

/**
 * Someone on the World screen, as the Player Character knows them (openspec
 * outside-the-scene: The World screen shows what the Player Character knows).
 */
@Serializable
data class WorldPerson (
    val aliases: List<String>,

    /**
     * Between you: their Bond; null when he has no history with them.
     */
    val between: Between? = null,

    /**
     * The Group they are in, if any.
     */
    val group: String? = null,

    /**
     * What he has heard of them, newest first.
     */
    val heard: List<MeanwhileItem>,

    /**
     * This entry is a Group, standing for members not known on their own.
     */
    @SerialName("is_group")
    val isGroup: Boolean,

    /**
     * What the Player Character knows of them; null when it is only what he has heard.
     */
    val known: String? = null,

    /**
     * The Scene that last added to what he knows; null for what he knew from the start, or was
     * set on the Mac.
     */
    @SerialName("known_from")
    val knownFrom: SceneRef? = null,

    val lead: Boolean,
    val name: String,

    @SerialName("portrait_url")
    val portraitURL: String? = null
)

/**
 * Where things stand between the Player Character and someone, and the turns that brought
 * it there, newest first (lasting-records: their Bond).
 */
@Serializable
data class Between (
    val standing: String,
    val turns: List<BetweenTurn>
)

/**
 * One turn in a Bond, with the Scene it came in; the Scene is null for a turn from before
 * the Story.
 */
@Serializable
data class BetweenTurn (
    @SerialName("scene_number")
    val sceneNumber: Long? = null,

    @SerialName("scene_title")
    val sceneTitle: String? = null,

    val text: String
)

/**
 * A Scene by its number and title.
 */
@Serializable
data class SceneRef (
    val number: Long,
    val title: String
)

/**
 * A place in the Story, as anyone there would know it.
 */
@Serializable
data class WorldPlace (
    /**
     * A Scene on this Path was there.
     */
    val been: Boolean,

    val description: String,
    val name: String
)

/**
 * Everyone in the Story, for editing (editing-people design decision 5): the Leads first,
 * then by name.
 */
@Serializable
data class PeopleView (
    val groups: List<GroupInfo>,
    val people: List<PersonSummary>,

    @SerialName("story_id")
    val storyID: String,

    @SerialName("trace_id")
    val traceID: String
)

/**
 * A Group and what it is, as anyone would know it.
 */
@Serializable
data class GroupInfo (
    val description: String,
    val name: String
)

/**
 * Someone in Everyone in the Story: no one's description, only who they are to the Story.
 */
@Serializable
data class PersonSummary (
    val group: String? = null,
    val lead: Boolean,
    val name: String,

    @SerialName("player_character")
    val playerCharacter: Boolean,

    @SerialName("portrait_url")
    val portraitURL: String? = null
)

/**
 * A person as the Story keeps them, for the person editor: shown only on Edit.
 */
@Serializable
data class PersonDetail (
    /**
     * Other names they answer to.
     */
    val aliases: List<String>,

    val appearance: String,

    /**
     * Between you: their Bond; null when he has no history with them.
     */
    val between: Between? = null,

    val group: String? = null,

    /**
     * Every Group, for the picker.
     */
    val groups: List<GroupInfo>,

    /**
     * What the Player Character knows of them.
     */
    val known: String? = null,

    /**
     * What they know, beyond their own backstory.
     */
    val knows: List<String>,

    val lead: Boolean,
    val name: String,

    @SerialName("player_character")
    val playerCharacter: Boolean,

    @SerialName("portrait_url")
    val portraitURL: String? = null,

    @SerialName("story_id")
    val storyID: String,

    @SerialName("trace_id")
    val traceID: String,

    /**
     * Lines they have said, in their own words.
     */
    val voice: List<String>,

    /**
     * What they are after.
     */
    val wants: String,

    /**
     * Who they are and the backstory they come with, what nobody knows included.
     */
    @SerialName("who_they_are")
    val whoTheyAre: String
)

/**
 * A person created or changed whole, from that moment onward on the current Path.
 */
@Serializable
data class PersonEdit (
    /**
     * The head the phone saw.
     */
    val after: String,

    /**
     * Other names they answer to.
     */
    val aliases: List<String>,

    val appearance: String,

    /**
     * A new person; false changes someone already in the Story.
     */
    val create: Boolean,

    val group: String? = null,

    /**
     * What the Player Character knows of them.
     */
    val known: String? = null,

    /**
     * What they know, beyond their own backstory.
     */
    val knows: List<String>,

    /**
     * Lines they have said, in their own words.
     */
    val voice: List<String>,

    /**
     * What they are after.
     */
    val wants: String,

    /**
     * Who they are and the backstory they come with, what nobody knows included.
     */
    @SerialName("who_they_are")
    val whoTheyAre: String
)

/**
 * Makes someone a Lead, or stops them being one.
 */
@Serializable
data class LeadRequest (
    /**
     * The head the phone saw.
     */
    val after: String,

    val lead: Boolean
)

/**
 * Creates a Group, or changes its description.
 */
@Serializable
data class GroupRequest (
    /**
     * The head the phone saw.
     */
    val after: String,

    val description: String
)

/**
 * Everything The Story screen shows, as it stands on the current Path (editing-the-story
 * design decision 4).
 */
@Serializable
data class StoryView (
    val arcs: List<String>,
    val clock: StoryClock,

    @SerialName("head_entry_id")
    val headEntryID: String,

    val institutions: List<StoryPlace>,

    /**
     * In the order of their times.
     */
    val landmarks: List<StoryLandmark>,

    val places: List<StoryPlace>,
    val premise: String,

    @SerialName("reply_length")
    val replyLength: Length,

    @SerialName("story_id")
    val storyID: String,

    val style: String,
    val title: String,

    @SerialName("trace_id")
    val traceID: String,

    @SerialName("world_history")
    val worldHistory: String,

    /**
     * Where the World stands, "Day N HH:MM": a Landmark may only be set after it, and the clock
     * only moved past the clock.
     */
    @SerialName("world_stands")
    val worldStands: String,

    @SerialName("world_summary")
    val worldSummary: String
)

/**
 * The time on the current Path.
 */
@Serializable
data class StoryClock (
    /**
     * "Day N HH:MM".
     */
    val at: String,

    /**
     * "Saturday 9:40 pm".
     */
    @SerialName("at_label")
    val atLabel: String,

    @SerialName("day_one_weekday")
    val dayOneWeekday: DayOneWeekday? = null
)

@Serializable
enum class DayOneWeekday(val value: String) {
    @SerialName("friday") Friday("friday"),
    @SerialName("monday") Monday("monday"),
    @SerialName("saturday") Saturday("saturday"),
    @SerialName("sunday") Sunday("sunday"),
    @SerialName("thursday") Thursday("thursday"),
    @SerialName("tuesday") Tuesday("tuesday"),
    @SerialName("wednesday") Wednesday("wednesday");
}

/**
 * A place or an institution: its name and what it is.
 */
@Serializable
data class StoryPlace (
    val description: String,
    val name: String
)

/**
 * A Landmark as The Story screen shows it.
 */
@Serializable
data class StoryLandmark (
    /**
     * Its time on the Story Clock, "Day N HH:MM".
     */
    val at: String,

    /**
     * Its time as the player reads it: "Wednesday 10:00 am · Day 66".
     */
    @SerialName("at_label")
    val atLabel: String,

    val name: String,

    /**
     * True when the World has reached its time on this Path: it has happened, and stays as it
     * was.
     */
    val passed: Boolean,

    val what: String,

    /**
     * How far off it is, as the Day View's countdowns say it; null once it has passed.
     */
    @SerialName("when")
    val storyLandmarkWhen: String? = null
)

@Serializable
enum class Length(val value: String) {
    @SerialName("full") Full("full"),
    @SerialName("short") LengthShort("short"),
    @SerialName("medium") Medium("medium");
}

/**
 * Sets the Premise.
 */
@Serializable
data class PremiseRequest (
    /**
     * The head the phone saw.
     */
    val after: String,

    val premise: String
)

/**
 * Sets the Style.
 */
@Serializable
data class StyleRequest (
    /**
     * The head the phone saw.
     */
    val after: String,

    val style: String
)

/**
 * Sets the reply length.
 */
@Serializable
data class ReplyLengthRequest (
    /**
     * The head the phone saw.
     */
    val after: String,

    val length: Length
)

/**
 * Sets the Arcs whole: adding, rewording and dropping are each a new list.
 */
@Serializable
data class ArcsRequest (
    /**
     * The head the phone saw.
     */
    val after: String,

    val arcs: List<String>
)

/**
 * Creates, moves or rewrites a Landmark, named in the path.
 */
@Serializable
data class LandmarkRequest (
    /**
     * The head the phone saw.
     */
    val after: String,

    /**
     * "Day N HH:MM".
     */
    val at: String,

    /**
     * True for a new Landmark; refused if one has the name.
     */
    val create: Boolean,

    val what: String
)

/**
 * Drops a Landmark, named in the path.
 */
@Serializable
data class DropLandmarkRequest (
    /**
     * The head the phone saw.
     */
    val after: String
)

/**
 * Creates or rewrites a place or an institution, named in the path.
 */
@Serializable
data class PlaceRequest (
    /**
     * The head the phone saw.
     */
    val after: String,

    val create: Boolean,
    val description: String,
    val institution: Boolean
)

/**
 * Sets what the World is, and its history.
 */
@Serializable
data class WorldRequest (
    /**
     * The head the phone saw.
     */
    val after: String,

    val history: String,
    val summary: String
)

/**
 * Moves the clock on, and says which weekday Day 1 was.
 */
@Serializable
data class ClockRequest (
    /**
     * The head the phone saw.
     */
    val after: String,

    /**
     * "Day N HH:MM", later than the clock.
     */
    val at: String,

    @SerialName("day_one_weekday")
    val dayOneWeekday: DayOneWeekday? = null
)

/**
 * Rewords a lesson in Taste, in its place.
 */
@Serializable
data class RewordTasteRequest (
    /**
     * The head the phone saw.
     */
    val after: String,

    /**
     * The lesson as Taste reads it now.
     */
    val line: String,

    val text: String
)

/**
 * Tries the record of a Scene given up after three tries once more.
 */
@Serializable
data class RecordRetryRequest (
    /**
     * The head the phone saw: the Path whose record it is.
     */
    val after: String,

    @SerialName("scene_number")
    val sceneNumber: Long
)
