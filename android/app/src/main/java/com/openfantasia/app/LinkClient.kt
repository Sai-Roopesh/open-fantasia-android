package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.sse.EventSource
import okhttp3.sse.EventSources
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

const val UPDATE_REQUIRED = "This app needs updating to match your Mac"
val linkJson = Json { ignoreUnknownKeys = true }
private val commandJson = Json { encodeDefaults = true }

class LinkFailure(val reason: String, val traceID: String? = null, val versionMismatch: Boolean = false) : IOException(reason)

class LinkClient(val address: HttpUrl, fingerprint: String, private val deviceToken: String?) {
    val http = CertificatePin(fingerprint).client()
    internal val eventSources: EventSource.Factory by lazy {
        EventSources.createFactory(http.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build())
    }

    init { require(address.isHttps) { "The Mac link requires HTTPS" } }

    suspend fun pair(request: PairRequest): PairResponse = command("pair", linkJson.encodeToString(request), paired = false)
    suspend fun stories(): StoryList = command("stories")
    suspend fun scene(storyID: String): SceneView = command(listOf("stories", storyID, "scene"))
    suspend fun pastScene(storyID: String, number: Long): PastScene = command(listOf("stories", storyID, "scenes", number.toString()))
    suspend fun move(storyID: String, move: MoveRequest): TurnAccepted =
        command(listOf("stories", storyID, "moves"), linkJson.encodeToString(move))
    suspend fun choose(storyID: String, request: ChooseRequest): TurnAccepted =
        command(listOf("stories", storyID, "choose"), commandJson.encodeToString(request))
    suspend fun retry(storyID: String, request: RetryRequest): TurnAccepted =
        command(listOf("stories", storyID, "retry"), commandJson.encodeToString(request))

    // The Models screen (openspec outside-the-scene: One Models screen): settings of the Mac, put whole.
    suspend fun models(): ModelsView = command("models")
    // Without defaults: the Mac takes `backup` only as true or absent.
    suspend fun setJobModel(job: ModelJob, request: SetJobModelRequest): ModelsView =
        command(listOf("models", "jobs", job.value), linkJson.encodeToString(request), put = true)
    suspend fun setActor(storyID: String, request: SetActorRequest): ModelsView =
        command(listOf("stories", storyID, "actor"), commandJson.encodeToString(request), put = true)

    suspend fun endScene(storyID: String, request: EndSceneRequest): Accepted =
        command(listOf("stories", storyID, "end-scene"), linkJson.encodeToString(request))

    suspend fun focus(storyID: String, request: FocusRequest): Accepted =
        command(listOf("stories", storyID, "focus"), commandJson.encodeToString(request))

    suspend fun linger(storyID: String, request: LingerRequest): Accepted =
        command(listOf("stories", storyID, "linger"), commandJson.encodeToString(request))

    suspend fun redo(storyID: String, request: RedoRequest): TurnAccepted =
        command(listOf("stories", storyID, "redo"), commandJson.encodeToString(request))

    suspend fun paths(storyID: String): PathsView = command(listOf("stories", storyID, "paths"))
    suspend fun tryAnotherWay(storyID: String, request: TryAnotherWayRequest): Accepted =
        command(listOf("stories", storyID, "paths"), commandJson.encodeToString(request))
    suspend fun rewind(storyID: String, request: RewindRequest): Accepted =
        command(listOf("stories", storyID, "rewind"), commandJson.encodeToString(request))
    suspend fun openPath(storyID: String, pathID: String): Accepted = command(listOf("stories", storyID, "paths", pathID, "open"), "{}")
    suspend fun renamePath(storyID: String, pathID: String, request: RenamePathRequest): Accepted =
        command(listOf("stories", storyID, "paths", pathID, "rename"), commandJson.encodeToString(request))
    suspend fun deletePath(storyID: String, pathID: String): Accepted = command(listOf("stories", storyID, "paths", pathID), delete = true)
    suspend fun clearPaths(storyID: String): Accepted = command(listOf("stories", storyID, "paths", "clear"), "{}")
    suspend fun journal(storyID: String): JournalView = command(listOf("stories", storyID, "journal"))
    suspend fun world(storyID: String): WorldView = command(listOf("stories", storyID, "world"))
    suspend fun people(storyID: String): PeopleView = command(listOf("stories", storyID, "people"))
    suspend fun person(storyID: String, name: String): PersonDetail = command(listOf("stories", storyID, "people", name))
    suspend fun setPerson(storyID: String, name: String, request: PersonEdit): Accepted =
        command(listOf("stories", storyID, "people", name), commandJson.encodeToString(request), put = true)
    suspend fun setLead(storyID: String, name: String, request: LeadRequest): Accepted =
        command(listOf("stories", storyID, "people", name, "lead"), commandJson.encodeToString(request), put = true)
    suspend fun setGroup(storyID: String, name: String, request: GroupRequest): Accepted =
        command(listOf("stories", storyID, "groups", name), commandJson.encodeToString(request), put = true)
    suspend fun story(storyID: String): StoryView = command(listOf("stories", storyID, "story"))
    suspend fun setPremise(storyID: String, request: PremiseRequest): StoryView =
        command(listOf("stories", storyID, "premise"), commandJson.encodeToString(request), put = true)
    suspend fun setStyle(storyID: String, request: StyleRequest): StoryView =
        command(listOf("stories", storyID, "style"), commandJson.encodeToString(request), put = true)
    suspend fun setReplyLength(storyID: String, request: ReplyLengthRequest): StoryView =
        command(listOf("stories", storyID, "reply-length"), commandJson.encodeToString(request), put = true)
    suspend fun setArcs(storyID: String, request: ArcsRequest): StoryView =
        command(listOf("stories", storyID, "arcs"), commandJson.encodeToString(request), put = true)
    suspend fun setLandmark(storyID: String, name: String, request: LandmarkRequest): StoryView =
        command(listOf("stories", storyID, "landmarks", name), commandJson.encodeToString(request), put = true)
    suspend fun dropLandmark(storyID: String, name: String, request: DropLandmarkRequest): StoryView =
        command(listOf("stories", storyID, "landmarks", name, "drop"), commandJson.encodeToString(request))
    suspend fun setPlace(storyID: String, name: String, request: PlaceRequest): StoryView =
        command(listOf("stories", storyID, "places", name), commandJson.encodeToString(request), put = true)
    suspend fun setWorld(storyID: String, request: WorldRequest): StoryView =
        command(listOf("stories", storyID, "world"), commandJson.encodeToString(request), put = true)
    suspend fun setClock(storyID: String, request: ClockRequest): StoryView =
        command(listOf("stories", storyID, "clock"), commandJson.encodeToString(request), put = true)

    /** A Portrait from the phone: the image itself, as its type, with the head the phone saw (openspec stories: Portraits). */
    suspend fun uploadPortrait(storyID: String, name: String, image: ByteArray, type: String, after: String): Accepted {
        val url = address.newBuilder().apply { listOf("stories", storyID, "people", name, "portrait").forEach { addPathSegment(it) } }
            .addQueryParameter("after", after).build()
        val request = Request.Builder().url(url)
            .header("Fantasia-Contract", CONTRACT_VERSION.toString())
            .header("Authorization", "Bearer ${requireNotNull(deviceToken)}")
            .put(image.toRequestBody(type.toMediaType())).build()
        return answer(execute(request))
    }
    suspend fun backstage(storyID: String): BackstageView = command(listOf("stories", storyID, "backstage"))
    // Taste and steering notes, beside the Story (docs/adr/0020): the phone reads Backstage again after each.
    suspend fun removeTaste(storyID: String, request: RemoveTasteRequest) =
        sent(listOf("stories", storyID, "taste", "remove"), commandJson.encodeToString(request))
    suspend fun rewordTaste(storyID: String, request: RewordTasteRequest) =
        sent(listOf("stories", storyID, "taste", "reword"), commandJson.encodeToString(request))
    suspend fun writeNote(storyID: String, request: SteeringNoteRequest) =
        sent(listOf("stories", storyID, "notes"), commandJson.encodeToString(request))
    suspend fun deleteNote(storyID: String, noteID: String) = sent(listOf("stories", storyID, "notes", noteID), delete = true)
    suspend fun editNote(storyID: String, noteID: String, request: SteeringNoteEditRequest) = sent(listOf("stories", storyID, "notes", noteID, "edit"), commandJson.encodeToString(request))
    suspend fun setBrief(storyID: String, request: BriefRequest): Accepted =
        command(listOf("stories", storyID, "brief"), commandJson.encodeToString(request))
    suspend fun react(storyID: String, request: ReactionRequest): Accepted =
        command(listOf("stories", storyID, "reaction"), commandJson.encodeToString(request))
    suspend fun edit(storyID: String, request: EditRequest): Accepted =
        command(listOf("stories", storyID, "edit"), commandJson.encodeToString(request))

    internal fun request(path: List<String>, body: String? = null, paired: Boolean = true, delete: Boolean = false, put: Boolean = false): Request {
        val url = address.newBuilder().apply { path.forEach { addPathSegment(it) } }.build()
        return Request.Builder().url(url)
            .header("Fantasia-Contract", CONTRACT_VERSION.toString())
            .apply {
                if (paired) header("Authorization", "Bearer ${requireNotNull(deviceToken)}")
                if (body != null) body.toRequestBody("application/json".toMediaType()).let { if (put) put(it) else post(it) }
                if (delete) delete()
            }.build()
    }

    private suspend inline fun <reified T> command(path: String, body: String? = null, paired: Boolean = true): T {
        return command(listOf(path), body, paired)
    }

    private suspend inline fun <reified T> command(path: List<String>, body: String? = null, paired: Boolean = true, delete: Boolean = false, put: Boolean = false): T =
        answer(execute(request(path, body, paired, delete, put)))

    /** A command whose answer the phone does not read: its contract checked, a refusal thrown with its reason. */
    private suspend fun sent(path: List<String>, body: String? = null, delete: Boolean = false) {
        val (response, text) = execute(request(path, body, delete = delete))
        requireContract(response, text)
        if (!response.isSuccessful || runCatching { linkJson.decodeFromString<ErrorBody>(text) }.isSuccess) throw failure(response.code, text)
    }

    /** Reads the Mac's answer to a request: its contract checked, a refusal thrown with its reason. */
    private inline fun <reified T> answer(sent: Pair<Response, String>): T {
        val (response, text) = sent
        requireContract(response, text)
        if (!response.isSuccessful || runCatching { linkJson.decodeFromString<ErrorBody>(text) }.isSuccess) throw failure(response.code, text)
        return linkJson.decodeFromString<T>(text)
    }

    /**
     * Sends [request] and reads its whole answer on OkHttp's own thread. A call starts on the main thread, where
     * Android forbids reading the network, and a long Scene's answer is still arriving when its headers do.
     */
    internal suspend fun execute(request: Request): Pair<Response, String> = suspendCancellableCoroutine { continuation ->
        val call = http.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (continuation.isActive) continuation.resumeWithException(e)
            }
            override fun onResponse(call: Call, response: Response) {
                val text = try { response.use { it.body.string() } } catch (e: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(e)
                    return
                }
                continuation.resume(response to text) { _, _, _ -> }
            }
        })
    }
}

internal fun requireContract(response: Response, body: String? = null) {
    response.header("Fantasia-Contract")?.let { version ->
        if (version != CONTRACT_VERSION.toString()) {
            val trace = body?.let { runCatching { linkJson.parseToJsonElement(it).jsonObject["trace_id"]?.jsonPrimitive?.content }.getOrNull() }
            throw LinkFailure(UPDATE_REQUIRED, trace ?: body?.let { failure(426, it).traceID }, true)
        }
    }
}

internal fun failure(status: Int, body: String): LinkFailure {
    val detail = runCatching { linkJson.decodeFromString<ErrorBody>(body).error }.getOrNull()
    val mismatch = status == 426 || detail?.code == ErrorCode.VersionMismatch
    return LinkFailure(if (mismatch) UPDATE_REQUIRED else detail?.message ?: "The Mac could not complete this request", detail?.traceID, mismatch)
}
