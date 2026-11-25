package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import java.io.IOException

class MacConnection(
    private val store: PairingStore,
    discovery: MacDiscovery,
    private val deviceName: String,
    private val kept: ReadCache = MemoryReadCache()
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
                val mac = PairedMac(response.hostID, response.hostName, invite.fingerprint, response.deviceToken, candidate,
                    knownAddresses = (listOf(candidate) + invite.addresses.map { MacAddress(it, invite.port.toInt()) }).distinct())
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
            store.write(mac.answeredAt(address))
            connected.value = true
            Result.success(result)
        } catch (e: LinkFailure) { throw e
        } catch (e: IOException) { lastFailure = e; null }

        attempt(known)?.let { return it.getOrThrow() }
        for (address in finder.addresses(mac).filter { it != known }) attempt(address)?.let { return it.getOrThrow() }
        connected.value = false
        throw lastFailure ?: LinkFailure(UNREACHABLE)
    }

    /**
     * A read that is kept (openspec presence: What has been seen can be read without the Mac): when no address
     * answers, the copy from the last read that did is given instead, and [reachable] stays false.
     */
    private suspend inline fun <reified T> keptRead(storyID: String?, name: String, noinline action: suspend (LinkClient) -> T): T = try {
        read(action).also { kept.write(storyID, name, linkJson.encodeToString(it)) }
    } catch (e: IOException) {
        if (e is LinkFailure && e.reason != UNREACHABLE) throw e
        kept.read(storyID, name)?.let { linkJson.decodeFromString<T>(it) } ?: throw e
    }

    override suspend fun stories(): StoryList = keptRead(null, "stories") { client ->
        client.stories().also { list -> kept.keepOnly(list.stories.map { it.id }.toSet()) }
    }
    override suspend fun scene(storyID: String): SceneView = keptRead(storyID, "scene") { it.scene(storyID) }
    override suspend fun pastScene(storyID: String, number: Long): PastScene = keptRead(storyID, "scene-$number") { it.pastScene(storyID, number) }

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
    override suspend fun choose(storyID: String, request: ChooseRequest): TurnAccepted = command { it.choose(storyID, request) }
    override suspend fun retry(storyID: String, request: RetryRequest): TurnAccepted = command { it.retry(storyID, request) }
    // Read only from the Mac, never kept: a model list from before could offer what the Mac no longer has.
    override suspend fun models(): ModelsView = read { it.models() }
    override suspend fun setJobModel(job: ModelJob, request: SetJobModelRequest): ModelsView = command { it.setJobModel(job, request) }
    override suspend fun setActor(storyID: String, request: SetActorRequest): ModelsView = command { it.setActor(storyID, request) }
    override suspend fun paths(storyID: String): PathsView = read { it.paths(storyID) }
    override suspend fun tryAnotherWay(storyID: String, request: TryAnotherWayRequest): Accepted = command { it.tryAnotherWay(storyID, request) }
    override suspend fun rewind(storyID: String, request: RewindRequest): Accepted = command { it.rewind(storyID, request) }
    override suspend fun openPath(storyID: String, pathID: String): Accepted = command { it.openPath(storyID, pathID) }
    override suspend fun renamePath(storyID: String, pathID: String, request: RenamePathRequest): Accepted = command { it.renamePath(storyID, pathID, request) }
    override suspend fun deletePath(storyID: String, pathID: String): Accepted = command { it.deletePath(storyID, pathID) }
    override suspend fun clearPaths(storyID: String): Accepted = command { it.clearPaths(storyID) }
    override suspend fun edit(storyID: String, request: EditRequest): Accepted = command { it.edit(storyID, request) }
    override suspend fun journal(storyID: String): JournalView = keptRead(storyID, "journal") { it.journal(storyID) }
    override suspend fun world(storyID: String): WorldView = keptRead(storyID, "world") { it.world(storyID) }
    // Editing needs the Mac: none of it is kept.
    override suspend fun people(storyID: String): PeopleView = read { it.people(storyID) }
    override suspend fun person(storyID: String, name: String): PersonDetail = read { it.person(storyID, name) }
    override suspend fun setPerson(storyID: String, name: String, request: PersonEdit): Accepted = command { it.setPerson(storyID, name, request) }
    override suspend fun setLead(storyID: String, name: String, request: LeadRequest): Accepted = command { it.setLead(storyID, name, request) }
    override suspend fun setGroup(storyID: String, name: String, request: GroupRequest): Accepted = command { it.setGroup(storyID, name, request) }
    override suspend fun story(storyID: String): StoryView = read { it.story(storyID) }
    override suspend fun setPremise(storyID: String, request: PremiseRequest): StoryView = command { it.setPremise(storyID, request) }
    override suspend fun setStyle(storyID: String, request: StyleRequest): StoryView = command { it.setStyle(storyID, request) }
    override suspend fun setReplyLength(storyID: String, request: ReplyLengthRequest): StoryView = command { it.setReplyLength(storyID, request) }
    override suspend fun setArcs(storyID: String, request: ArcsRequest): StoryView = command { it.setArcs(storyID, request) }
    override suspend fun setLandmark(storyID: String, name: String, request: LandmarkRequest): StoryView = command { it.setLandmark(storyID, name, request) }
    override suspend fun dropLandmark(storyID: String, name: String, request: DropLandmarkRequest): StoryView = command { it.dropLandmark(storyID, name, request) }
    override suspend fun setPlace(storyID: String, name: String, request: PlaceRequest): StoryView = command { it.setPlace(storyID, name, request) }
    override suspend fun setWorld(storyID: String, request: WorldRequest): StoryView = command { it.setWorld(storyID, request) }
    override suspend fun setClock(storyID: String, request: ClockRequest): StoryView = command { it.setClock(storyID, request) }
    override suspend fun uploadPortrait(storyID: String, name: String, image: ByteArray, type: String, after: String): Accepted =
        command { it.uploadPortrait(storyID, name, image, type, after) }
    override suspend fun backstage(storyID: String): BackstageView = read { it.backstage(storyID) }
    override suspend fun removeTaste(storyID: String, request: RemoveTasteRequest) = command { it.removeTaste(storyID, request) }
    override suspend fun rewordTaste(storyID: String, request: RewordTasteRequest) = command { it.rewordTaste(storyID, request) }
    override suspend fun writeNote(storyID: String, request: SteeringNoteRequest) = command { it.writeNote(storyID, request) }
    override suspend fun deleteNote(storyID: String, noteID: String) = command { it.deleteNote(storyID, noteID) }
    override suspend fun editNote(storyID: String, noteID: String, request: SteeringNoteEditRequest) = command { it.editNote(storyID, noteID, request) }
    override suspend fun setBrief(storyID: String, request: BriefRequest): Accepted = command { it.setBrief(storyID, request) }
    override suspend fun react(storyID: String, request: ReactionRequest): Accepted = command { it.react(storyID, request) }
    override fun watch(initial: SceneView): Flow<SceneView> = StoryStream(
        onConnection = { connected.value = it; if (!it) current = null }, loadScene = { scene(it) }
    ) {
        current ?: read { it.stories(); it }
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

internal const val UNREACHABLE = "The Mac is unreachable"
