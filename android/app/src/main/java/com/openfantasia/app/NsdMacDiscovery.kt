package com.openfantasia.app

import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.withTimeoutOrNull

class NsdMacDiscovery(private val manager: NsdManager) : MacDiscovery {
    @Suppress("DEPRECATION")
    override suspend fun find(hostID: String): List<MacAddress> = withTimeoutOrNull(2500) {
        callbackFlow {
            val pending = ArrayDeque<NsdServiceInfo>()
            var resolving = false
            val lock = Any()
            fun resolveNext() {
                synchronized(lock) {
                    if (resolving || pending.isEmpty()) return
                    resolving = true
                    val info = pending.removeFirst()
                    manager.resolveService(info, object : NsdManager.ResolveListener {
                        override fun onResolveFailed(service: NsdServiceInfo, error: Int) {
                            synchronized(lock) { resolving = false; resolveNext() }
                        }
                        override fun onServiceResolved(service: NsdServiceInfo) {
                            if (service.attributes["id"]?.toString(Charsets.UTF_8) == hostID) {
                                val hosts = if (Build.VERSION.SDK_INT >= 34) service.hostAddresses
                                    else listOfNotNull(service.host)
                                val addresses = hosts.mapNotNull { it.hostAddress }.map { MacAddress(it, service.port) }
                                if (addresses.isNotEmpty()) { trySend(addresses); close() }
                            }
                            synchronized(lock) { resolving = false; resolveNext() }
                        }
                    })
                }
            }
            val listener = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(type: String) = Unit
                override fun onDiscoveryStopped(type: String) = Unit
                override fun onStartDiscoveryFailed(type: String, error: Int) { close() }
                override fun onStopDiscoveryFailed(type: String, error: Int) = Unit
                override fun onServiceLost(info: NsdServiceInfo) = Unit
                override fun onServiceFound(info: NsdServiceInfo) {
                    if (info.serviceType.trimEnd('.') == "_openfantasia._tcp") {
                        synchronized(lock) { pending.addLast(info); resolveNext() }
                    }
                }
            }
            manager.discoverServices("_openfantasia._tcp.", NsdManager.PROTOCOL_DNS_SD, listener)
            awaitClose { runCatching { manager.stopServiceDiscovery(listener) } }
        }.firstOrNull()
    } ?: emptyList()
}
