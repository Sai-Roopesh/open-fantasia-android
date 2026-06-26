package com.example.open_fantasia

import android.app.Application
import android.util.Log
import com.example.open_fantasia.data.local.entity.ProfileEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant

class OpenFantasiaApplication : Application() {

    companion object {
        private const val TAG = "OpenFantasiaApplication"
    }

    lateinit var appContainer: AppContainer

    override fun onCreate() {
        super.onCreate()
        appContainer = DefaultAppContainer(this)

        // Seed synthetic profile in background
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val profileDao = appContainer.database.profileDao()
                val count = profileDao.getProfileCount()
                if (count == 0) {
                    val fixedUserId = "00000000-0000-0000-0000-000000000000"
                    val now = Instant.now().toString()
                    profileDao.insertProfile(
                        ProfileEntity(
                            id = fixedUserId,
                            username = "LocalUser",
                            created_at = now,
                            updated_at = now
                        )
                    )
                    Log.d(TAG, "Successfully seeded synthetic profile with FIXED_USER_ID.")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to seed synthetic profile", e)
            }
        }
    }
}
