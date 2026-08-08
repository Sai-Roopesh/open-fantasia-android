package com.example.open_fantasia.domain.model

import kotlinx.serialization.Serializable

// ─── Character Document (v4) ───────────────────────────────────────

const val CHARACTER_FORMAT = "openfantasia.character"
const val CHARACTER_VERSION = 4

@Serializable
data class CharacterDocument(
    val format: String,
    val version: Int,
    val data: CharacterDocumentData
)

@Serializable
data class CharacterDocumentData(
    val name: String,
    val story: String,
    val core_persona: String,
    val greeting: String,
    val appearance: String,
    val style_rules: String,
    val definition: String,
    val negative_guidance: String,
    val suggested_starters: List<String>,
    val example_conversations: List<ExampleConversation>
)

// ─── Persona Document (v1) ─────────────────────────────────────────

const val PERSONA_FORMAT = "openfantasia.persona"
const val PERSONA_VERSION = 1

@Serializable
data class PersonaDocument(
    val format: String,
    val version: Int,
    val data: PersonaDocumentData
)

@Serializable
data class PersonaDocumentData(
    val name: String,
    val identity: String,
    val backstory: String,
    val voice_style: String,
    val goals: String,
    val boundaries: String,
    val private_notes: String
)

// ─── Cast Seed Document (v1) ───────────────────────────────────────

const val CAST_FORMAT = "openfantasia.cast"
const val CAST_VERSION = 1

@Serializable
data class CastDocument(
    val format: String,
    val version: Int,
    val data: CastDocumentData
)

/**
 * One Cast Seed per document. Carries only the authorable Cast Profile fields: cast_id,
 * provenance, status, evidence, and manual locks are assigned by the app when the seed is
 * saved, never by a pasted document.
 */
@Serializable
data class CastDocumentData(
    val canonical_name: String,
    val aliases: List<String>,
    val role_background: String,
    val personality: String,
    val voice_style: String,
    val appearance: String,
    val goals: String,
    val boundaries: String
)

// ─── Prompt Pack Variant ────────────────────────────────────────────

enum class PromptPackVariant {
    GENERIC, CLAUDE, GEMINI
}
