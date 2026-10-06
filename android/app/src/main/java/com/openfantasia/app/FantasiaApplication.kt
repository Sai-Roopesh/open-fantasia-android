package com.openfantasia.app

import android.app.Application
import android.net.nsd.NsdManager
import android.os.Build
import java.io.File

/** Holds the one link to the Mac, so the watch follows a Story through the same connection the app reads. */
class FantasiaApplication : Application(), LinkHolder {
    override val link: MacConnection by lazy {
        MacConnection(PrivatePairingStore(this), NsdMacDiscovery(getSystemService(NsdManager::class.java)),
            "${Build.MANUFACTURER} ${Build.MODEL}", FileReadCache(File(filesDir, "kept")))
    }
}
