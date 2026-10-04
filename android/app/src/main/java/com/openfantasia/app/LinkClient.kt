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
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

const val UPDATE_REQUIRED = "This app needs updating to match your Mac"
val linkJson = Json { ignoreUnknownKeys = true }

class LinkFailure(val reason: String, val traceID: String? = null, val versionMismatch: Boolean = false) : IOException(reason)

class LinkClient(val address: HttpUrl, fingerprint: String, private val deviceToken: String?) {
    val http = CertificatePin(fingerprint).client()

    init { require(address.isHttps) { "The Mac link requires HTTPS" } }

    suspend fun pair(request: PairRequest): PairResponse = command("pair", linkJson.encodeToString(request), paired = false)
    suspend fun stories(): StoryList = command("stories")
    suspend fun scene(storyID: String): SceneView = command(listOf("stories", storyID, "scene"))
    suspend fun move(storyID: String, move: MoveRequest): TurnAccepted =
        command(listOf("stories", storyID, "moves"), linkJson.encodeToString(move))
    suspend fun retry(storyID: String): TurnAccepted = command(listOf("stories", storyID, "retry"), "{}")

    internal fun request(path: List<String>, body: String? = null, paired: Boolean = true): Request {
        val url = address.newBuilder().apply { path.forEach { addPathSegment(it) } }.build()
        return Request.Builder().url(url)
            .header("Fantasia-Contract", CONTRACT_VERSION.toString())
            .apply {
                if (paired) header("Authorization", "Bearer ${requireNotNull(deviceToken)}")
                if (body != null) post(body.toRequestBody("application/json".toMediaType()))
            }.build()
    }

    private suspend inline fun <reified T> command(path: String, body: String? = null, paired: Boolean = true): T {
        return command(listOf(path), body, paired)
    }

    private suspend inline fun <reified T> command(path: List<String>, body: String? = null, paired: Boolean = true): T {
        val response = execute(request(path, body, paired))
        return response.use {
            val text = it.body.string()
            requireContract(it, text)
            if (!it.isSuccessful || runCatching { linkJson.decodeFromString<ErrorBody>(text) }.isSuccess) throw failure(it.code, text)
            linkJson.decodeFromString<T>(text)
        }
    }

    internal suspend fun execute(request: Request): Response = suspendCancellableCoroutine { continuation ->
        val call = http.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (continuation.isActive) continuation.resumeWithException(e)
            }
            override fun onResponse(call: Call, response: Response) {
                continuation.resume(response) { _, value, _ -> value.close() }
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
