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
// val endSceneRequest      = json.parse(EndSceneRequest.serializer(), jsonString)
// val focusRequest         = json.parse(FocusRequest.serializer(), jsonString)
// val lingerRequest        = json.parse(LingerRequest.serializer(), jsonString)
// val redoRequest          = json.parse(RedoRequest.serializer(), jsonString)
// val accepted             = json.parse(Accepted.serializer(), jsonString)
// val pastScene            = json.parse(PastScene.serializer(), jsonString)

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
 * Story is now on another Path, or its Path was moved back. After scene_opened,
 * scene_closed, redo, world_moved, world_failed and path_changed, and after a move that
 * opens the next Scene, the phone reads the Scene again, because they change more than one
 * part of it.
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
     * Keep the Direction as a line of Taste.
     */
    val remember: Boolean
)

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
