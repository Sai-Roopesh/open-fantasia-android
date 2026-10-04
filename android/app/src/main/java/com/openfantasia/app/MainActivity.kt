package com.openfantasia.app

import android.content.Intent
import android.os.Bundle
import android.os.Build
import android.net.nsd.NsdManager
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory

class MainActivity : ComponentActivity() {
    private lateinit var model: FantasiaModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val scanner = GooglePairingScanner(this)
        val factory = viewModelFactory {
            initializer {
                FantasiaModel(MacConnection(PrivatePairingStore(applicationContext),
                    NsdMacDiscovery(applicationContext.getSystemService(NsdManager::class.java)),
                    "${Build.MANUFACTURER} ${Build.MODEL}"))
            }
        }
        model = ViewModelProvider(this, factory)[FantasiaModel::class.java]
        pairFromDebugIntent(intent)
        setContent { FantasiaApp(model, scanner, model::portrait) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        pairFromDebugIntent(intent)
    }

    /**
     * A debug build can be paired over adb, without a camera: `fantasia pair --adb` prints the command, which hands
     * the app the same invite the QR code holds. Release builds ignore it, so pairing there always needs the code.
     */
    private fun pairFromDebugIntent(intent: Intent?) {
        if (!BuildConfig.DEBUG) return
        val encoded = intent?.getStringExtra(DEBUG_INVITE) ?: return
        val invite = String(Base64.decode(encoded, Base64.DEFAULT), Charsets.UTF_8)
        model.pair { invite }
    }

    private companion object {
        const val DEBUG_INVITE = "invite_b64"
    }
}
