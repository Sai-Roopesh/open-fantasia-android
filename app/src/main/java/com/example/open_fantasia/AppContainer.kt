package com.example.open_fantasia

import android.content.Context
import androidx.room.Room
import com.example.open_fantasia.data.local.db.MIGRATION_1_2
import com.example.open_fantasia.data.local.db.MIGRATION_2_3
import com.example.open_fantasia.data.local.db.OpenFantasiaDatabase
import com.example.open_fantasia.data.remote.KtorLLMClient
import com.example.open_fantasia.data.remote.LLMClient
import com.example.open_fantasia.domain.usecase.RunContinuityExtractionUseCase

interface AppContainer {
    val database: OpenFantasiaDatabase
    val llmClient: LLMClient
    val runContinuityExtractionUseCase: RunContinuityExtractionUseCase
}

class DefaultAppContainer(private val context: Context) : AppContainer {

    override val database: OpenFantasiaDatabase by lazy {
        Room.databaseBuilder(
            context.applicationContext,
            OpenFantasiaDatabase::class.java,
            "open_fantasia.db"
        ).addMigrations(MIGRATION_1_2, MIGRATION_2_3).build()
    }

    override val llmClient: LLMClient by lazy {
        KtorLLMClient()
    }

    override val runContinuityExtractionUseCase: RunContinuityExtractionUseCase by lazy {
        RunContinuityExtractionUseCase(llmClient)
    }
}
