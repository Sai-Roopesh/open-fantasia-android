package com.example.open_fantasia.data.continuity

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

sealed interface ContinuityHostState {
    data object Unpaired : ContinuityHostState
    data object Checking : ContinuityHostState
    data class Available(val queueDepth: Int = 0, val activeRequestId: String? = null) : ContinuityHostState
    data class Unavailable(val detail: String = "Mac Host is off or unreachable") : ContinuityHostState
    data class Incompatible(val detail: String) : ContinuityHostState
}

@Serializable data class PairHostRequest(val code: String, val device_name: String = "Open Fantasia Android")
@Serializable data class PairHostResponse(val protocol_version: Int, val endpoint: String, val device_id: String, val credential: String)
@Serializable data class ActiveHostJob(val request_id: String, val job_type: String, val status: String, val started_at: Long? = null)
@Serializable data class HostHealth(
    val protocol_version: Int,
    val state: String,
    val queue_depth: Int = 0,
    val active_jobs: List<ActiveHostJob> = emptyList(),
    val continuity_engines: List<String> = emptyList(),
    val continuity_engines_unavailable: Map<String, String> = emptyMap()
)

/**
 * Which Continuity Engines the paired Mac Host can actually run, and why it cannot run the others.
 *
 * A Continuity Engine is frozen into a checkpoint when the checkpoint is created, and the host
 * refuses a checkpoint naming an engine that failed its preflight. Codex and Antigravity are
 * required Mac setup, so that refusal was mostly theoretical; Claude Code is optional, and a phone
 * that cannot see which engines exist will happily freeze one the Mac has never had.
 *
 * Nothing is known before the first successful health check, and unknown must never read as
 * unavailable. An engine is put out of reach only when the host has positively said it cannot run
 * it, and only while some other engine can: a Mac that can run none of them leaves every choice
 * open, because a refused checkpoint that explains itself beats a dialog with nothing to press.
 */
data class ContinuityEngineAvailability(
    val runnable: Set<String> = emptySet(),
    val unavailable: Map<String, String> = emptyMap()
) {
    fun unavailableReason(engineId: String): String? = when {
        runnable.isEmpty() && unavailable.isEmpty() -> null
        engineId in runnable -> null
        else -> unavailable[engineId] ?: "This Mac Host does not offer this engine"
    }

    fun isSelectable(engineId: String): Boolean =
        runnable.isEmpty() || unavailableReason(engineId) == null
}
@Serializable data class HostJobStatus(
    val protocol_version: Int = 2,
    val job_type: String = "continuity",
    val request_id: String,
    val status: String,
    val queue_position: Int? = null,
    val error: String? = null,
    val attempt_count: Int = 0
)
@Serializable data class HostSupersedeRequest(val replacement_request_id: String)
@Serializable data class ContinuityHostError(val code: String = "unknown", val message: String = "")

class ContinuityHostHttpException(val status: Int, message: String) : Exception(message)

class ContinuityHostClient(private val preferences: ContinuityHostPreferences) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json(json) }
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            requestTimeoutMillis = 30_000
            socketTimeoutMillis = 30_000
        }
    }
    private val _state = MutableStateFlow<ContinuityHostState>(
        if (preferences.pairing() == null) ContinuityHostState.Unpaired else ContinuityHostState.Checking
    )
    val state: StateFlow<ContinuityHostState> = _state.asStateFlow()
    private val _continuityEngines = MutableStateFlow(ContinuityEngineAvailability())
    val continuityEngines: StateFlow<ContinuityEngineAvailability> = _continuityEngines.asStateFlow()

    suspend fun pair(endpoint: String, code: String): ContinuityHostPairing {
        val normalized = ContinuityHostPreferences.normalizeEndpoint(endpoint)
        val response = client.post("$normalized/v2/pair") {
            contentType(ContentType.Application.Json)
            setBody(PairHostRequest(code.trim()))
        }
        requireSuccess(response)
        val body = response.body<PairHostResponse>()
        if (body.protocol_version != 2) {
            _state.value = ContinuityHostState.Incompatible("Host protocol ${body.protocol_version} is not supported")
            error("Mac Host protocol is incompatible")
        }
        val pairing = ContinuityHostPairing(normalized, body.device_id, body.credential)
        preferences.save(pairing)
        checkHealth()
        return pairing
    }

    suspend fun checkHealth(): HostHealth {
        val response = authenticatedGet("/v2/health")
        requireSuccess(response)
        val health = response.body<HostHealth>()
        if (health.protocol_version != 2) {
            _state.value = ContinuityHostState.Incompatible("Host protocol ${health.protocol_version} is not supported")
        } else {
            _state.value = ContinuityHostState.Available(health.queue_depth, health.active_jobs.firstOrNull()?.request_id)
        }
        _continuityEngines.value = ContinuityEngineAvailability(
            runnable = health.continuity_engines.toSet(),
            unavailable = health.continuity_engines_unavailable
        )
        return health
    }

    suspend fun submit(request: ContinuityRequestEnvelope): HostJobStatus {
        val response = authenticatedPost("/v2/checkpoints", request)
        requireSuccess(response)
        markAvailable()
        return response.body()
    }

    suspend fun status(requestId: String): HostJobStatus? {
        val response = authenticatedGet("/v2/checkpoints/${encode(requestId)}")
        if (response.status == HttpStatusCode.NotFound) return null
        requireSuccess(response)
        markAvailable()
        return response.body()
    }

    suspend fun result(requestId: String): ContinuityResponseEnvelope {
        val response = authenticatedGet("/v2/checkpoints/${encode(requestId)}/result")
        requireSuccess(response)
        markAvailable()
        return response.body()
    }

    suspend fun acknowledge(requestId: String) {
        val response = authenticatedPost("/v2/checkpoints/${encode(requestId)}/ack")
        requireSuccess(response)
    }

    suspend fun supersede(requestId: String, replacementRequestId: String) {
        val response = authenticatedPost(
            "/v2/checkpoints/${encode(requestId)}/supersede",
            HostSupersedeRequest(replacementRequestId)
        )
        if (response.status != HttpStatusCode.NotFound) requireSuccess(response)
    }

    suspend fun submitRoleplay(request: RoleplayRequestEnvelope): HostJobStatus {
        val response = authenticatedPost("/v2/roleplay-jobs", request)
        requireSuccess(response)
        markAvailable()
        return response.body()
    }

    suspend fun roleplayStatus(requestId: String): HostJobStatus? {
        val response = authenticatedGet("/v2/roleplay-jobs/${encode(requestId)}")
        if (response.status == HttpStatusCode.NotFound) return null
        requireSuccess(response)
        markAvailable()
        return response.body()
    }

    suspend fun roleplayResult(requestId: String): RoleplayResponseEnvelope {
        val response = authenticatedGet("/v2/roleplay-jobs/${encode(requestId)}/result")
        requireSuccess(response)
        markAvailable()
        return response.body()
    }

    suspend fun acknowledgeRoleplay(requestId: String) {
        requireSuccess(authenticatedPost("/v2/roleplay-jobs/${encode(requestId)}/ack"))
    }

    suspend fun supersedeRoleplay(requestId: String, replacementRequestId: String) {
        val response = authenticatedPost(
            "/v2/roleplay-jobs/${encode(requestId)}/supersede",
            HostSupersedeRequest(replacementRequestId)
        )
        if (response.status != HttpStatusCode.NotFound) requireSuccess(response)
    }

    suspend fun submitPortrait(request: PortraitRequestEnvelope): HostJobStatus {
        val response = authenticatedPost("/v2/portrait-jobs", request)
        requireSuccess(response)
        markAvailable()
        return response.body()
    }

    suspend fun portraitStatus(requestId: String): HostJobStatus? {
        val response = authenticatedGet("/v2/portrait-jobs/${encode(requestId)}")
        if (response.status == HttpStatusCode.NotFound) return null
        requireSuccess(response)
        markAvailable()
        return response.body()
    }

    suspend fun portraitResult(requestId: String): PortraitResponseEnvelope {
        val response = authenticatedGet("/v2/portrait-jobs/${encode(requestId)}/result")
        requireSuccess(response)
        markAvailable()
        return response.body()
    }

    suspend fun acknowledgePortrait(requestId: String) {
        requireSuccess(authenticatedPost("/v2/portrait-jobs/${encode(requestId)}/ack"))
    }

    suspend fun supersedePortrait(requestId: String, replacementRequestId: String) {
        val response = authenticatedPost(
            "/v2/portrait-jobs/${encode(requestId)}/supersede",
            HostSupersedeRequest(replacementRequestId)
        )
        if (response.status != HttpStatusCode.NotFound) requireSuccess(response)
    }

    fun forget() {
        preferences.clearPairing()
        _state.value = ContinuityHostState.Unpaired
        // What the previous Mac could run says nothing about the next one.
        _continuityEngines.value = ContinuityEngineAvailability()
    }

    fun markUnavailable(error: Throwable) {
        if (_state.value !is ContinuityHostState.Incompatible && preferences.pairing() != null) {
            _state.value = ContinuityHostState.Unavailable(error.message ?: "Mac Host is unreachable")
        }
    }

    private fun markAvailable() { _state.value = ContinuityHostState.Available() }

    private suspend fun authenticatedGet(path: String): HttpResponse {
        val pairing = preferences.pairing() ?: throw IllegalStateException("Mac Host is not paired")
        return client.get(pairing.endpoint + path) { bearerAuth(pairing.credential) }
    }

    private suspend inline fun <reified T> authenticatedPost(path: String, body: T): HttpResponse {
        val pairing = preferences.pairing() ?: throw IllegalStateException("Mac Host is not paired")
        return client.post(pairing.endpoint + path) {
            bearerAuth(pairing.credential)
            contentType(ContentType.Application.Json)
            setBody(body)
        }
    }

    private suspend fun authenticatedPost(path: String): HttpResponse {
        val pairing = preferences.pairing() ?: throw IllegalStateException("Mac Host is not paired")
        return client.post(pairing.endpoint + path) { bearerAuth(pairing.credential) }
    }

    private suspend fun requireSuccess(response: HttpResponse) {
        if (response.status == HttpStatusCode.UpgradeRequired) {
            _state.value = ContinuityHostState.Incompatible("Mac Host protocol is incompatible")
        }
        if (!response.status.isSuccess()) {
            val detail = try { response.body<ContinuityHostError>().message } catch (_: Throwable) { "" }
            throw ContinuityHostHttpException(
                response.status.value,
                detail.ifBlank { "Mac Host returned ${response.status.value}" }
            )
        }
    }

    private fun encode(value: String) = java.net.URLEncoder.encode(value, Charsets.UTF_8.name())
}
