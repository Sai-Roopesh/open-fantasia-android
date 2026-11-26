package com.openfantasia.app

import android.content.Context
import kotlinx.serialization.encodeToString

class PrivatePairingStore(context: Context) : PairingStore {
    private val preferences = context.getSharedPreferences("paired_mac", Context.MODE_PRIVATE)
    override fun read(): PairedMac? = preferences.getString("mac", null)?.let {
        linkJson.decodeFromString<PairedMac>(it)
    }
    override fun write(mac: PairedMac) {
        // Pairing must survive the process ending as soon as the QR code closes.
        if (!preferences.edit().putString("mac", linkJson.encodeToString(mac)).commit()) {
            throw LinkFailure("The phone could not keep its pairing with the Mac")
        }
    }
}
