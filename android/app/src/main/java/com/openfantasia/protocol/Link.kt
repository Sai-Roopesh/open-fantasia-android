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
    val id: String,

    /**
     * Where the Story stands on its current Path, as one line: "Scene 14 · After curfew".
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
    @SerialName("earlier_scenes")
    val earlierScenes: List<SceneSummaryLine>,

    val exchanges: List<Exchange>,

    /**
     * The entry a Move must follow.
     */
    @SerialName("head_entry_id")
    val headEntryID: String,

    @SerialName("path_id")
    val pathID: String,

    /**
     * The name of the person the player plays, for labelling their Moves.
     */
    @SerialName("player_character")
    val playerCharacter: String,

    val scene: SceneCard,

    /**
     * The newest entry this view reflects; the live stream resumes after it.
     */
    val seq: Long,

    @SerialName("story_id")
    val storyID: String,

    @SerialName("trace_id")
    val traceID: String,

    val turn: TurnState
)

@Serializable
data class SceneSummaryLine (
    val number: Long,
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
 * One event on a Story's live stream. Entry events (scene_opened, move, reply) are replayed
 * after a reconnect; reply_started, reply_delta and reply_failed describe the turn under
 * way.
 */
@Serializable
data class StoryEvent (
    val kind: StoryEventKind,
    val passage: Passage? = null,
    val reason: String? = null,
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
    @SerialName("move") Move("move"),
    @SerialName("reply") Reply("reply"),
    @SerialName("reply_delta") ReplyDelta("reply_delta"),
    @SerialName("reply_failed") ReplyFailed("reply_failed"),
    @SerialName("reply_started") ReplyStarted("reply_started"),
    @SerialName("scene_opened") SceneOpened("scene_opened");
}
