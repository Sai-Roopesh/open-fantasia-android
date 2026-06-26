package com.example.open_fantasia.domain.portability

import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.PersonaEntity
import com.example.open_fantasia.domain.model.*
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.UUID

/**
 * Pure codec for Open-Fantasia portable JSON documents.
 * No Android framework dependencies — all functions are pure and testable on the JVM.
 */
object PortableJsonCodec {

    private val strictJson = Json {
        ignoreUnknownKeys = false
        prettyPrint = true
        encodeDefaults = true
    }

    // ─── Serialize ──────────────────────────────────────────────────

    fun serializeCharacter(entity: CharacterEntity): String {
        val doc = CharacterDocument(
            format = CHARACTER_FORMAT,
            version = CHARACTER_VERSION,
            data = CharacterDocumentData(
                name = entity.name,
                story = entity.story,
                core_persona = entity.core_persona,
                greeting = entity.greeting,
                appearance = entity.appearance,
                style_rules = entity.style_rules,
                definition = entity.definition,
                negative_guidance = entity.negative_guidance,
                suggested_starters = entity.starters,
                example_conversations = entity.example_conversations
            )
        )
        return strictJson.encodeToString(CharacterDocument.serializer(), doc)
    }

    fun serializePersona(entity: PersonaEntity): String {
        val doc = PersonaDocument(
            format = PERSONA_FORMAT,
            version = PERSONA_VERSION,
            data = PersonaDocumentData(
                name = entity.name,
                identity = entity.identity,
                backstory = entity.backstory,
                voice_style = entity.voice_style,
                goals = entity.goals,
                boundaries = entity.boundaries,
                private_notes = entity.private_notes
            )
        )
        return strictJson.encodeToString(PersonaDocument.serializer(), doc)
    }

    // ─── Parse & Validate ───────────────────────────────────────────

    fun parseCharacterDocument(raw: String): Result<CharacterDocument> {
        return try {
            val cleaned = stripMarkdownCodeFence(raw.trim())
            val doc = strictJson.decodeFromString(CharacterDocument.serializer(), cleaned)

            if (doc.format != CHARACTER_FORMAT) {
                return Result.failure(
                    IllegalArgumentException("Invalid format: expected \"$CHARACTER_FORMAT\", got \"${doc.format}\"")
                )
            }
            if (doc.version != CHARACTER_VERSION) {
                return Result.failure(
                    IllegalArgumentException("Invalid version: expected $CHARACTER_VERSION, got ${doc.version}")
                )
            }
            Result.success(doc)
        } catch (e: Exception) {
            Result.failure(IllegalArgumentException("Malformed character JSON: ${e.message}"))
        }
    }

    fun parsePersonaDocument(raw: String): Result<PersonaDocument> {
        return try {
            val cleaned = stripMarkdownCodeFence(raw.trim())
            val doc = strictJson.decodeFromString(PersonaDocument.serializer(), cleaned)

            if (doc.format != PERSONA_FORMAT) {
                return Result.failure(
                    IllegalArgumentException("Invalid format: expected \"$PERSONA_FORMAT\", got \"${doc.format}\"")
                )
            }
            if (doc.version != PERSONA_VERSION) {
                return Result.failure(
                    IllegalArgumentException("Invalid version: expected $PERSONA_VERSION, got ${doc.version}")
                )
            }
            Result.success(doc)
        } catch (e: Exception) {
            Result.failure(IllegalArgumentException("Malformed persona JSON: ${e.message}"))
        }
    }

    // ─── Markdown Fence Stripping ───────────────────────────────────

    fun stripMarkdownCodeFence(raw: String): String {
        val trimmed = raw.trim()
        // Match ```json ... ``` or ``` ... ```
        val fenceRegex = Regex("""^```\w*\s*\n?(.*?)\n?\s*```$""", RegexOption.DOT_MATCHES_ALL)
        val match = fenceRegex.find(trimmed)
        return match?.groupValues?.get(1)?.trim() ?: trimmed
    }

    // ─── Blank Templates ────────────────────────────────────────────

    fun buildBlankCharacterTemplate(): String {
        val doc = CharacterDocument(
            format = CHARACTER_FORMAT,
            version = CHARACTER_VERSION,
            data = CharacterDocumentData(
                name = "",
                story = "",
                core_persona = "",
                greeting = "",
                appearance = "",
                style_rules = "",
                definition = "",
                negative_guidance = "",
                suggested_starters = emptyList(),
                example_conversations = emptyList()
            )
        )
        return strictJson.encodeToString(CharacterDocument.serializer(), doc)
    }

    fun buildBlankPersonaTemplate(): String {
        val doc = PersonaDocument(
            format = PERSONA_FORMAT,
            version = PERSONA_VERSION,
            data = PersonaDocumentData(
                name = "",
                identity = "",
                backstory = "",
                voice_style = "",
                goals = "",
                boundaries = "",
                private_notes = ""
            )
        )
        return strictJson.encodeToString(PersonaDocument.serializer(), doc)
    }

    // ─── Entity Mapping ─────────────────────────────────────────────

    fun characterDocumentToEntity(
        doc: CharacterDocument,
        userId: String,
        existingId: String? = null
    ): CharacterEntity {
        val now = Instant.now().toString()
        val d = doc.data
        return CharacterEntity(
            id = existingId ?: UUID.randomUUID().toString(),
            user_id = userId,
            name = d.name,
            story = d.story,
            core_persona = d.core_persona,
            greeting = d.greeting,
            appearance = d.appearance,
            style_rules = d.style_rules,
            definition = d.definition,
            negative_guidance = d.negative_guidance,
            temperature = 0.92,
            top_p = 0.94,
            starters = d.suggested_starters,
            example_conversations = d.example_conversations,
            portrait_status = "idle",
            portrait_path = null,
            portrait_prompt = null,
            portrait_seed = null,
            portrait_source_hash = null,
            portrait_last_error = null,
            portrait_generated_at = null,
            created_at = now,
            updated_at = now
        )
    }

    fun personaDocumentToEntity(
        doc: PersonaDocument,
        userId: String,
        existingId: String? = null,
        isDefault: Boolean = false
    ): PersonaEntity {
        val now = Instant.now().toString()
        val d = doc.data
        return PersonaEntity(
            id = existingId ?: UUID.randomUUID().toString(),
            user_id = userId,
            name = d.name,
            identity = d.identity,
            backstory = d.backstory,
            voice_style = d.voice_style,
            goals = d.goals,
            boundaries = d.boundaries,
            private_notes = d.private_notes,
            is_default = isDefault,
            created_at = now,
            updated_at = now
        )
    }

    // ─── Prompt Pack Builders ───────────────────────────────────────

    fun buildCharacterPromptPack(variant: PromptPackVariant): String {
        val variantNote = when (variant) {
            PromptPackVariant.GENERIC -> "Follow the JSON schema exactly. Do not add commentary."
            PromptPackVariant.CLAUDE -> "You are Claude. Return only the JSON object. No markdown fences, no preamble, no sign-off."
            PromptPackVariant.GEMINI -> "You are Gemini. Return only the JSON object. No markdown fences, no explanations."
        }
        val variantLabel = variant.name.lowercase().replaceFirstChar { it.uppercase() }

        return """
# Open-Fantasia Character Prompt Pack ($variantLabel)

## Instructions
You are a creative writing assistant. Your task is to generate a complete character definition for the Open-Fantasia roleplay engine.

**Output Rules:**
- Return exactly ONE JSON object matching the schema below.
- Do NOT wrap the output in markdown code fences.
- Do NOT add any commentary, explanations, or preamble.
- $variantNote

## Content Guidelines
- **name**: The character's full name or alias.
- **story**: The world, setting, or narrative context this character inhabits.
- **core_persona**: A rich, multi-paragraph personality and backstory description.
- **greeting**: The character's opening line when a new conversation begins.
- **appearance**: Detailed physical description (used for portrait generation).
- **style_rules**: Writing style directives — tone, vocabulary, mannerisms.
- **definition**: Additional lore, abilities, relationships, or world-building details.
- **negative_guidance**: Things the character should NEVER do or say.
- **suggested_starters**: 3–5 conversation starter prompts the user could pick from.
- **example_conversations**: 2–4 example exchanges showing the character's voice.

## Blank Template
```json
${buildBlankCharacterTemplate()}
```

## JSON Schema
The output must conform to:
- `format`: must be exactly `"openfantasia.character"`
- `version`: must be exactly `4`
- `data.name`: string (required)
- `data.story`: string (required)
- `data.core_persona`: string (required)
- `data.greeting`: string (required)
- `data.appearance`: string (required)
- `data.style_rules`: string (required)
- `data.definition`: string (required)
- `data.negative_guidance`: string (required)
- `data.suggested_starters`: array of strings (required)
- `data.example_conversations`: array of objects with `user_line` (string) and `character_line` (string) (required)
- No additional properties allowed at any level.
        """.trimIndent()
    }

    fun buildPersonaPromptPack(variant: PromptPackVariant): String {
        val variantNote = when (variant) {
            PromptPackVariant.GENERIC -> "Follow the JSON schema exactly. Do not add commentary."
            PromptPackVariant.CLAUDE -> "You are Claude. Return only the JSON object. No markdown fences, no preamble, no sign-off."
            PromptPackVariant.GEMINI -> "You are Gemini. Return only the JSON object. No markdown fences, no explanations."
        }
        val variantLabel = variant.name.lowercase().replaceFirstChar { it.uppercase() }

        return """
# Open-Fantasia Persona Prompt Pack ($variantLabel)

## Instructions
You are a creative writing assistant. Your task is to generate a complete user persona definition for the Open-Fantasia roleplay engine. A persona defines how the USER presents themselves in roleplay sessions.

**Output Rules:**
- Return exactly ONE JSON object matching the schema below.
- Do NOT wrap the output in markdown code fences.
- Do NOT add any commentary, explanations, or preamble.
- $variantNote

## Content Guidelines
- **name**: The persona's name or alias.
- **identity**: Who this persona is — their role, title, or nature.
- **backstory**: The persona's history and how they arrived at their current situation.
- **voice_style**: How the persona speaks — dialect, formality, verbal tics.
- **goals**: What the persona wants to achieve in their interactions.
- **boundaries**: Lines the persona will not cross; topics they avoid.
- **private_notes**: Out-of-character notes for the AI about how to handle this persona.

## Blank Template
```json
${buildBlankPersonaTemplate()}
```

## JSON Schema
The output must conform to:
- `format`: must be exactly `"openfantasia.persona"`
- `version`: must be exactly `1`
- `data.name`: string (required)
- `data.identity`: string (required)
- `data.backstory`: string (required)
- `data.voice_style`: string (required)
- `data.goals`: string (required)
- `data.boundaries`: string (required)
- `data.private_notes`: string (required)
- No additional properties allowed at any level.
        """.trimIndent()
    }
}
