package com.example.open_fantasia

import android.app.Application
import android.util.Log
import com.example.open_fantasia.data.local.entity.ProfileEntity
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import com.example.open_fantasia.data.continuity.RoleplayProtocol
import com.example.open_fantasia.data.continuity.PortraitGenerationScheduler
import com.example.open_fantasia.data.continuity.ContinuityCheckpointScheduler
import com.example.open_fantasia.data.continuity.RoleplayGenerationScheduler
import com.example.open_fantasia.domain.model.ModelCatalogEntry
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
                val repairedHeads = appContainer.database.chatDao().repairDanglingBranchHeads()
                if (repairedHeads > 0) {
                    Log.w(TAG, "Recovered $repairedHeads dangling branch head pointer(s).")
                }
                val count = profileDao.getProfileCount()
                val fixedUserId = "00000000-0000-0000-0000-000000000000"
                val now = Instant.now().toString()
                if (count == 0) {
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
                val connectionDao = appContainer.database.connectionDao()
                val existing = connectionDao.getConnection(RoleplayProtocol.CONNECTION_ID)
                connectionDao.insertConnection(
                    ConnectionEntity(
                        id = RoleplayProtocol.CONNECTION_ID,
                        user_id = fixedUserId,
                        provider = RoleplayProtocol.PROVIDER,
                        label = "Antigravity (Mac)",
                        base_url = null,
                        encrypted_api_key = null,
                        enabled = true,
                        default_model_id = RoleplayProtocol.MODEL_ID,
                        model_cache = listOf(ModelCatalogEntry(RoleplayProtocol.MODEL_ID, "Gemini 3.6 Flash High", RoleplayProtocol.PROVIDER)),
                        health_status = existing?.health_status ?: "untested",
                        health_message = existing?.health_message ?: "Uses the paired Mac Host and Antigravity credits.",
                        last_checked_at = existing?.last_checked_at,
                        last_model_refresh_at = existing?.last_model_refresh_at,
                        last_synced_at = existing?.last_synced_at,
                        created_at = existing?.created_at ?: now,
                        updated_at = now
                    )
                )
                appContainer.database.characterDao().repairAllPrimaryCastSeeds()
                appContainer.portraitGenerationCoordinator.ensureAllPrimaryPortraits()
                ContinuityCheckpointScheduler.enqueue(applicationContext)
                RoleplayGenerationScheduler.enqueue(applicationContext)
                PortraitGenerationScheduler.enqueue(applicationContext)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to seed synthetic profile", e)
            }
        }
    }
}
