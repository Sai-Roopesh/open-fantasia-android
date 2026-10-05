package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.IOException

class MacConnection(
    private val store: PairingStore,
    discovery: MacDiscovery,
    private val deviceName: String
) : FantasiaLink {
    private val finder = MacFinder(discovery)
    private val connected = MutableStateFlow(false)
    override val reachable = connected.asStateFlow()
    override val hostName get() = store.read()?.hostName ?: "Mac"
    override val isPaired get() = store.read() != null
    @Volatile private var current: LinkClient? = null
    private var portraits: Pair<LinkClient, okhttp3.OkHttpClient>? = null

    override suspend fun pair(invite: PairingInvite) {
        if (invite.contract != CONTRACT_VERSION.toLong()) throw LinkFailure(UPDATE_REQUIRED, versionMismatch = true)
        require(invite.port in 1..65535) { "The pairing QR code has an invalid port" }
        var lastFailure: IOException? = null
        for (address in invite.addresses) {
            val candidate = MacAddress(address, invite.port.toInt())
            val client = LinkClient(candidate.url(), invite.fingerprint, null)
            try {
                val response = client.pair(PairRequest(code = invite.code, deviceName = deviceName))
                if (response.hostID != invite.hostID) throw LinkFailure("The QR code belongs to a different Mac", response.traceID)
                val mac = PairedMac(response.hostID, response.hostName, invite.fingerprint, response.deviceToken, candidate)
                store.write(mac)
                current = LinkClient(candidate.url(), mac.fingerprint, mac.deviceToken)
                connected.value = true
                return
            } catch (e: LinkFailure) { throw e
            } catch (e: IOException) { lastFailure = e }
        }
        throw lastFailure ?: LinkFailure("The pairing QR code has no Mac addresses")
    }

    /**
     * Runs [action] against the Mac. The address that worked last is tried first; Bonjour is searched only when it
     * no longer answers, so an ordinary request never waits on a network search.
     */
    private suspend fun <T> read(action: suspend (LinkClient) -> T): T {
        val mac = store.read() ?: throw LinkFailure("Pair with the Mac to begin")
        val known = current?.address?.let { MacAddress(it.host, it.port) } ?: mac.lastAddress
        var lastFailure: IOException? = null
        suspend fun attempt(address: MacAddress): Result<T>? = try {
            val client = current?.takeIf { it.address == address.url() }
                ?: LinkClient(address.url(), mac.fingerprint, mac.deviceToken)
            val result = action(client)
            current = client
            store.write(mac.copy(lastAddress = address))
            connected.value = true
            Result.success(result)
        } catch (e: LinkFailure) { throw e
        } catch (e: IOException) { lastFailure = e; null }

        attempt(known)?.let { return it.getOrThrow() }
        for (address in finder.addresses(mac).filter { it != known }) attempt(address)?.let { return it.getOrThrow() }
        connected.value = false
        throw lastFailure ?: LinkFailure("The Mac is unreachable")
    }

    override suspend fun stories(): StoryList = read { it.stories() }
    override suspend fun scene(storyID: String): SceneView = read { it.scene(storyID) }
    override suspend fun pastScene(storyID: String, number: Long): PastScene = read { it.pastScene(storyID, number) }

    private suspend fun <T> command(action: suspend (LinkClient) -> T): T {
        val client = current ?: read { it.stories(); it }
        try { return action(client)
        } catch (e: CancellationException) { throw e
        } catch (e: IOException) {
            if (e !is LinkFailure) connected.value = false
            // A Move may already have reached the Mac, so commands are never sent twice automatically.
            throw e
        }
    }

    override suspend fun move(storyID: String, move: MoveRequest): TurnAccepted = command { it.move(storyID, move) }
    override suspend fun endScene(storyID: String, request: EndSceneRequest): Accepted = command { it.endScene(storyID, request) }
    override suspend fun focus(storyID: String, request: FocusRequest): Accepted = command { it.focus(storyID, request) }
    override suspend fun linger(storyID: String, request: LingerRequest): Accepted = command { it.linger(storyID, request) }
    override suspend fun redo(storyID: String, request: RedoRequest): TurnAccepted = command { it.redo(storyID, request) }
    override suspend fun retry(storyID: String): TurnAccepted = command { it.retry(storyID) }
    override fun watch(initial: SceneView): Flow<SceneView> = StoryStream(
        onConnection = { connected.value = it }, loadScene = { scene(it) }
    ) {
        read { it.scene(initial.storyID); it }
    }.follow(initial)

    override fun portrait(url: String): PortraitSource? {
        val client = current ?: return null
        val address = client.address.resolve(url)?.takeIf { it.isHttps } ?: return null
        val http = portraits?.takeIf { it.first === client }?.second ?: client.http.newBuilder().addInterceptor { chain ->
            val mac = requireNotNull(store.read())
            chain.proceed(chain.request().newBuilder()
                .header("Fantasia-Contract", CONTRACT_VERSION.toString())
                .header("Authorization", "Bearer ${mac.deviceToken}").build())
        }.build().also { portraits = client to it }
        return PortraitSource(address.toString(), http)
    }
}
