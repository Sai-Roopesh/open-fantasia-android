package com.openfantasia.app

import android.content.Intent
import android.os.Bundle
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory

class MainActivity : ComponentActivity() {
    private lateinit var model: FantasiaModel
    private val askPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        val scanner = GooglePairingScanner(this)
        val factory = viewModelFactory {
            initializer {
                FantasiaModel((application as LinkHolder).link, PrivatePreviouslyStore(applicationContext))
            }
        }
        model = ViewModelProvider(this, factory)[FantasiaModel::class.java]
        val asked = getSharedPreferences("notifications", MODE_PRIVATE)
        val notifications = NotificationAsk(Build.VERSION.SDK_INT,
            granted = { checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED },
            wasAsked = { asked.getBoolean("asked", false) }, markAsked = { asked.edit().putBoolean("asked", true).apply() },
            request = { askPermission.launch(Manifest.permission.POST_NOTIFICATIONS) })
        pairFromDebugIntent(intent)
        openFromNotification(intent)
        setContent { FantasiaApp(model, scanner, model::portrait, moveSent = notifications::moveSent) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        pairFromDebugIntent(intent)
        openFromNotification(intent)
    }

    // The app is back: the watch stops without a sound, and the Story is read as it stands.
    override fun onStart() {
        super.onStart()
        ReplyWatch.stop(this)
    }

    // The app goes away with a Reply under way or the World moving on: the watch follows it (openspec presence).
    override fun onStop() {
        super.onStop()
        if (isChangingConfigurations) return
        val state = model.state.value
        val scene = state.scene ?: return
        val watched = state.watched() ?: return
        ReplyWatch.start(this, scene.storyID, state.stories.firstOrNull { it.id == scene.storyID }?.title ?: scene.scene.title, watched)
    }

    private fun openFromNotification(intent: Intent?) {
        val storyID = intent?.getStringExtra(ReplyWatch.STORY) ?: return
        intent.removeExtra(ReplyWatch.STORY)
        model.openStory(storyID)
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
