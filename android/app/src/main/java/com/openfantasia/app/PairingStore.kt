package com.openfantasia.app

import kotlinx.serialization.Serializable
import kotlinx.coroutines.CancellationException
import okhttp3.HttpUrl

@Serializable data class MacAddress(val host: String, val port: Int) {
    fun url(): HttpUrl = HttpUrl.Builder().scheme("https").host(host).port(port).build()
}

@Serializable data class PairedMac(
    val hostID: String, val hostName: String, val fingerprint: String,
    val deviceToken: String, val lastAddress: MacAddress,
    /** Every address the Mac gave at pairing or answered on, newest first (openspec presence: any shared network). */
    val knownAddresses: List<MacAddress> = emptyList()
) {
    /** This Mac, having answered at [address]: tried first next time, and kept among the addresses it has had. */
    fun answeredAt(address: MacAddress) = copy(lastAddress = address, knownAddresses = (listOf(address) + knownAddresses).distinct().take(KEPT_ADDRESSES))
}

/** How many of the Mac's addresses the phone keeps. */
private const val KEPT_ADDRESSES = 8

interface PairingStore {
    fun read(): PairedMac?
    fun write(mac: PairedMac)
}

fun interface MacDiscovery { suspend fun find(hostID: String): List<MacAddress> }

class MacFinder(private val discovery: MacDiscovery) {
    suspend fun addresses(mac: PairedMac): List<MacAddress> {
        val found = try { discovery.find(mac.hostID)
        } catch (e: CancellationException) { throw e
        } catch (_: Exception) { emptyList() }
        // What discovery finds on this network first, then every address the Mac has had: a private network such as
        // Tailscale reaches it where the shared Wi-Fi keeps devices apart.
        return (found + mac.lastAddress + mac.knownAddresses).distinct().filter { runCatching { it.url() }.isSuccess }
    }
}
