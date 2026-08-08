package com.example.open_fantasia

import android.content.Context
import androidx.room.Room
import com.example.open_fantasia.data.local.db.MIGRATION_1_2
import com.example.open_fantasia.data.local.db.MIGRATION_2_3
import com.example.open_fantasia.data.local.db.MIGRATION_3_4
import com.example.open_fantasia.data.local.db.MIGRATION_4_5
import com.example.open_fantasia.data.local.db.MIGRATION_5_6
import com.example.open_fantasia.data.local.db.MIGRATION_6_7
import com.example.open_fantasia.data.local.db.MIGRATION_7_8
import com.example.open_fantasia.data.local.db.MIGRATION_8_9
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.remote.KtorLLMClient
import com.example.open_fantasia.data.remote.LLMClient
import com.example.open_fantasia.data.continuity.ContinuityCheckpointCoordinator
import com.example.open_fantasia.data.continuity.ContinuityHostClient
import com.example.open_fantasia.data.continuity.ContinuityHostPreferences
import com.example.open_fantasia.data.continuity.RoleplayGenerationCoordinator
import com.example.open_fantasia.data.continuity.PortraitGenerationCoordinator

interface AppContainer {
    val database: OpenFantasiaDatabase
    val llmClient: LLMClient
    val continuityHostPreferences: ContinuityHostPreferences
    val continuityHostClient: ContinuityHostClient
    val continuityCheckpointCoordinator: ContinuityCheckpointCoordinator
    val roleplayGenerationCoordinator: RoleplayGenerationCoordinator
    val portraitGenerationCoordinator: PortraitGenerationCoordinator
}

class DefaultAppContainer(private val context: Context) : AppContainer {

    override val database: OpenFantasiaDatabase by lazy {
        Room.databaseBuilder(
            context.applicationContext,
            OpenFantasiaDatabase::class.java,
            "open_fantasia.db"
        ).addMigrations(
            MIGRATION_1_2,
            MIGRATION_2_3,
            MIGRATION_3_4,
            MIGRATION_4_5,
            MIGRATION_5_6,
            MIGRATION_6_7,
            MIGRATION_7_8,
            MIGRATION_8_9
        ).build()
    }

    override val llmClient: LLMClient by lazy {
        KtorLLMClient()
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

    override val roleplayGenerationCoordinator: RoleplayGenerationCoordinator by lazy {
        RoleplayGenerationCoordinator(
            chatDao = database.chatDao(),
            connectionDao = database.connectionDao(),
            llmClient = llmClient,
            client = continuityHostClient,
            preferences = continuityHostPreferences
        )
    }

    override val portraitGenerationCoordinator: PortraitGenerationCoordinator by lazy {
        PortraitGenerationCoordinator(
            context.applicationContext,
            database.characterDao(),
            database.portraitTaskDao(),
            continuityHostClient,
            continuityHostPreferences
        )
    }
}
