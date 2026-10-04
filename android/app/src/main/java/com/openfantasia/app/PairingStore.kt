package com.openfantasia.app

import kotlinx.serialization.Serializable
import kotlinx.coroutines.CancellationException
import okhttp3.HttpUrl

@Serializable data class MacAddress(val host: String, val port: Int) {
    fun url(): HttpUrl = HttpUrl.Builder().scheme("https").host(host).port(port).build()
}

@Serializable data class PairedMac(
    val hostID: String, val hostName: String, val fingerprint: String,
    val deviceToken: String, val lastAddress: MacAddress
)

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
        return (found + mac.lastAddress).distinct().filter { runCatching { it.url() }.isSuccess }
    }
}
