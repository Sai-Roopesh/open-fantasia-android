package com.example.open_fantasia

import android.content.Context
import androidx.room.Room
import com.example.open_fantasia.data.local.db.MIGRATION_1_2
import com.example.open_fantasia.data.local.db.MIGRATION_2_3
import com.example.open_fantasia.data.local.db.MIGRATION_3_4
import com.example.open_fantasia.data.local.db.MIGRATION_4_5
import com.example.open_fantasia.data.local.db.MIGRATION_5_6
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.remote.KtorLLMClient
import com.example.open_fantasia.data.remote.LLMClient
import com.example.open_fantasia.domain.usecase.RunContinuityExtractionUseCase
import com.example.open_fantasia.data.continuity.ContinuityCheckpointCoordinator
import com.example.open_fantasia.data.continuity.ContinuityHostClient
import com.example.open_fantasia.data.continuity.ContinuityHostPreferences

interface AppContainer {
    val database: OpenFantasiaDatabase
    val llmClient: LLMClient
    val runContinuityExtractionUseCase: RunContinuityExtractionUseCase
    val continuityHostPreferences: ContinuityHostPreferences
    val continuityHostClient: ContinuityHostClient
    val continuityCheckpointCoordinator: ContinuityCheckpointCoordinator
}

class DefaultAppContainer(private val context: Context) : AppContainer {

    override val database: OpenFantasiaDatabase by lazy {
        Room.databaseBuilder(
            context.applicationContext,
            OpenFantasiaDatabase::class.java,
            "open_fantasia.db"
        ).addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6).build()
    }

    override val llmClient: LLMClient by lazy {
        KtorLLMClient()
    }

    override val runContinuityExtractionUseCase: RunContinuityExtractionUseCase by lazy {
        RunContinuityExtractionUseCase(llmClient)
    }

    override val continuityHostPreferences: ContinuityHostPreferences by lazy {
        ContinuityHostPreferences(context.applicationContext)
    }

    override val continuityHostClient: ContinuityHostClient by lazy {
        ContinuityHostClient(continuityHostPreferences)
    }

    override val continuityCheckpointCoordinator: ContinuityCheckpointCoordinator by lazy {
        ContinuityCheckpointCoordinator(database.chatDao(), continuityHostClient, continuityHostPreferences)
    }
}
