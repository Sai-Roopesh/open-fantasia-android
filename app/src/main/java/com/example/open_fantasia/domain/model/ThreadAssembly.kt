package com.example.open_fantasia.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class ThreadAssembly(
    val thread: ThreadRecord,
    val branches: List<ChatBranchRecord>,
    val activeBranch: ChatBranchRecord,
    val turns: List<ChatTurnRecord>,
    val latestTurn: ChatTurnRecord?,
    val characterBundle: CharacterBundle?,
    val timeline: List<TimelineEventRecord>,
    val pins: List<ChatPinRecord>
)
