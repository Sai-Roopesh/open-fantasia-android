package com.example.open_fantasia.data.continuity

import kotlinx.serialization.Serializable

@Serializable
data class PortraitBrief(
    val canonical_name: String,
    val aliases: List<String> = emptyList(),
    val appearance: String = "",
    val role_background: String = "",
    val personality: String = "",
    val voice_style: String = "",
    val goals: String = "",
    val boundaries: String = "",
    val visual_style: String = "",
    val evidence: List<String> = emptyList(),
    val provenance: String = "",
    val manual_locks: List<String> = emptyList(),
    val artistic_fill_policy: String = "Unspecified visual details may be chosen for this image only and must not become story canon."
)

@Serializable
data class PortraitRequestEnvelope(
    val protocol_version: Int = 2,
    val job_type: String = "portrait",
    val request_id: String,
    val subject_type: String,
    val character_id: String,
    val thread_id: String? = null,
    val branch_id: String? = null,
    val cast_id: String? = null,
    val source_hash: String,
    val prompt_version: Int,
    val model_id: String = PortraitProtocol.MODEL_ID,
    val attempt_count: Int,
    val portrait_brief: PortraitBrief
)

@Serializable
data class PortraitResponseEnvelope(
    val protocol_version: Int,
    val job_type: String,
    val request_id: String,
    val subject_type: String,
    val character_id: String,
    val thread_id: String? = null,
    val branch_id: String? = null,
    val cast_id: String? = null,
    val source_hash: String,
    val prompt_version: Int,
    val model_id: String,
    val image_base64: String,
    val mime_type: String,
    val width: Int,
    val height: Int,
    val sha256: String
)

object PortraitProtocol {
    const val MODEL_ID = "antigravity:managed-image"
    const val PROMPT_VERSION = 1
}
