// Generated from protocol/schemas by protocol/generate.mjs. Do not edit; change the schema and regenerate.

// To parse the JSON, install kotlin's serialization plugin and do:
//
// val json             = Json { allowStructuredMapKeys = true }
// val errorCode        = json.parse(ErrorCode.serializer(), jsonString)
// val errorBody        = json.parse(ErrorBody.serializer(), jsonString)
// val pairingInvite    = json.parse(PairingInvite.serializer(), jsonString)
// val pairRequest      = json.parse(PairRequest.serializer(), jsonString)
// val pairResponse     = json.parse(PairResponse.serializer(), jsonString)
// val storyList        = json.parse(StoryList.serializer(), jsonString)
// val storySummary     = json.parse(StorySummary.serializer(), jsonString)
// val personCard       = json.parse(PersonCard.serializer(), jsonString)
// val sceneCard        = json.parse(SceneCard.serializer(), jsonString)
// val passage          = json.parse(Passage.serializer(), jsonString)
// val exchange         = json.parse(Exchange.serializer(), jsonString)
// val turnState        = json.parse(TurnState.serializer(), jsonString)
// val sceneView        = json.parse(SceneView.serializer(), jsonString)
// val sceneSummaryLine = json.parse(SceneSummaryLine.serializer(), jsonString)
// val moveRequest      = json.parse(MoveRequest.serializer(), jsonString)
// val turnAccepted     = json.parse(TurnAccepted.serializer(), jsonString)
// val storyEvent       = json.parse(StoryEvent.serializer(), jsonString)
// val dayView          = json.parse(DayView.serializer(), jsonString)
// val countdown        = json.parse(Countdown.serializer(), jsonString)
// val endSceneRequest  = json.parse(EndSceneRequest.serializer(), jsonString)
// val focusRequest     = json.parse(FocusRequest.serializer(), jsonString)
// val lingerRequest    = json.parse(LingerRequest.serializer(), jsonString)
// val redoRequest      = json.parse(RedoRequest.serializer(), jsonString)
// val accepted         = json.parse(Accepted.serializer(), jsonString)
// val pastScene        = json.parse(PastScene.serializer(), jsonString)

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

    @SerialName("path_id")
    val pathID: String,

    /**
     * The name of the person the player plays, for labelling their Moves.
     */
    @SerialName("player_character")
    val playerCharacter: String,

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
 * Where and when the Player Character is between Scenes (openspec day-view).
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
     * Story time as people say it: "Sunday · 7:40 am".
     */
    @SerialName("at_label")
    val atLabel: String,

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
     * Where the Player Character is.
     */
    val place: String,

    /**
     * The time as people say it: "7:40 am".
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
     * Story time as people say it: "Friday · 9:40 pm".
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
 * reply_delta and reply_failed describe the turn under way. After scene_opened,
 * scene_closed and redo the phone reads the Scene again, because they change more than one
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
    @SerialName("redo") Redo("redo"),
    @SerialName("reply") Reply("reply"),
    @SerialName("reply_delta") ReplyDelta("reply_delta"),
    @SerialName("reply_failed") ReplyFailed("reply_failed"),
    @SerialName("reply_started") ReplyStarted("reply_started"),
    @SerialName("scene_closed") SceneClosed("scene_closed"),
    @SerialName("scene_opened") SceneOpened("scene_opened");
}

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
