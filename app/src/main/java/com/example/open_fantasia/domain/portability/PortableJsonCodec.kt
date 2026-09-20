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
                example_conversations = entity.example_conversations,
                voice_samples = entity.voice_samples
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
                private_notes = entity.private_notes,
                voice_samples = entity.voice_samples
            )
        )
        return strictJson.encodeToString(PersonaDocument.serializer(), doc)
    }

    fun serializeCast(profile: CastProfile): String {
        val doc = CastDocument(
            format = CAST_FORMAT,
            version = CAST_VERSION,
            data = CastDocumentData(
                canonical_name = profile.canonical_name,
                aliases = profile.aliases,
                role_background = profile.role_background,
                personality = profile.personality,
                voice_style = profile.voice_style,
                appearance = profile.appearance,
                goals = profile.goals,
                boundaries = profile.boundaries,
                voice_samples = profile.voice_samples
            )
        )
        return strictJson.encodeToString(CastDocument.serializer(), doc)
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

    fun parseCastDocument(raw: String): Result<CastDocument> {
        return try {
            val cleaned = stripMarkdownCodeFence(raw.trim())
            val doc = strictJson.decodeFromString(CastDocument.serializer(), cleaned)

            if (doc.format != CAST_FORMAT) {
                return Result.failure(
                    IllegalArgumentException("Invalid format: expected \"$CAST_FORMAT\", got \"${doc.format}\"")
                )
            }
            if (doc.version != CAST_VERSION) {
                return Result.failure(
                    IllegalArgumentException("Invalid version: expected $CAST_VERSION, got ${doc.version}")
                )
            }
            if (doc.data.canonical_name.isBlank()) {
                return Result.failure(IllegalArgumentException("Cast member needs a canonical_name"))
            }
            Result.success(doc)
        } catch (e: Exception) {
            Result.failure(IllegalArgumentException("Malformed cast JSON: ${e.message}"))
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

    fun buildBlankCastTemplate(): String {
        val doc = CastDocument(
            format = CAST_FORMAT,
            version = CAST_VERSION,
            data = CastDocumentData(
                canonical_name = "",
                aliases = emptyList(),
                role_background = "",
                personality = "",
                voice_style = "",
                appearance = "",
                goals = "",
                boundaries = ""
            )
        )
        return strictJson.encodeToString(CastDocument.serializer(), doc)
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
            updated_at = now,
            voice_samples = d.voice_samples.map { it.trim() }.filter { it.isNotEmpty() }
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
            updated_at = now,
            voice_samples = d.voice_samples.map { it.trim() }.filter { it.isNotEmpty() }
        )
    }

    /**
     * Applies a pasted Cast Seed onto a profile. Identity, provenance, status, evidence, and
     * manual locks stay under app control so a pasted document can never promote itself to the
     * Primary Character, resurrect an archived member, or claim continuity-discovered provenance.
     */
    fun castDocumentToProfile(doc: CastDocument, existing: CastProfile?, threadId: String): CastProfile {
        val d = doc.data
        val base = existing ?: CastProfile(
            cast_id = "seed:$threadId:${UUID.randomUUID()}",
            canonical_name = d.canonical_name,
            provenance = "manual_seed"
        )
        return base.copy(
            canonical_name = d.canonical_name.trim(),
            aliases = d.aliases.map { it.trim() }.filter { it.isNotEmpty() },
            role_background = d.role_background.trim(),
            personality = d.personality.trim(),
            voice_style = d.voice_style.trim(),
            appearance = d.appearance.trim(),
            goals = d.goals.trim(),
            boundaries = d.boundaries.trim(),
            voice_samples = d.voice_samples.map { it.trim() }.filter { it.isNotEmpty() }
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
- **core_persona**: Who this person is, as prose: their history, what they want, what they're afraid of,
  the contradictions. Several paragraphs. Not a list of adjectives.
- **greeting**: The first thing they say when a new story starts, written the way they'd actually say it.
- **appearance**: What they look like. Concrete and visual; this also drives the portrait.
- **style_rules**: The author's notes on how the story should be written — pacing, what to lean into,
  what to steer around. This is about the story, not about how the character talks; the voice comes
  from `voice_samples` and `example_conversations`.
- **definition**: Extra lore: abilities, relationships, history, the world as they know it.
- **negative_guidance**: Up to five hard limits, one per line, each stated as a fact about the person
  that the story can't contradict: "Has never left the valley." "Won't say her father's name." Facts,
  not rules about writing.
- **voice_samples**: Eight to ten things they've said, in their own mouth, on different days about
  different things. This is what the roleplay model imitates most, so write them the way the person
  actually talks: contractions, a two-word one, a rambling one, one that restarts halfway, one that is
  flat and ordinary. Where they're from should be audible.
- **suggested_starters**: 3–5 scene-openers the player could pick from.
- **example_conversations**: 2–4 sample exchanges. These are played back to the model as real dialogue
  ahead of the story, so each `character_line` should run a few sentences with at least one spoken
  line, written the way they'd really say it rather than the way a novel would polish it.

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
- `data.voice_samples`: array of strings (required; 8–10 lines)
- No additional properties allowed at any level.
        """.trimIndent()
    }

    fun buildCastPromptPack(variant: PromptPackVariant): String {
        val variantNote = when (variant) {
            PromptPackVariant.GENERIC -> "Follow the JSON schema exactly. Do not add commentary."
            PromptPackVariant.CLAUDE -> "You are Claude. Return only the JSON object. No markdown fences, no preamble, no sign-off."
            PromptPackVariant.GEMINI -> "You are Gemini. Return only the JSON object. No markdown fences, no explanations."
        }
        val variantLabel = variant.name.lowercase().replaceFirstChar { it.uppercase() }

        return """
# Open-Fantasia Cast Prompt Pack ($variantLabel)

## Instructions
You are a creative writing assistant. Your task is to generate ONE supporting cast member for a thread
in the Open-Fantasia roleplay engine. This is not the thread's primary character and not the player —
it is a character the primary character shares the world with, who may be selected to speak.

**Output Rules:**
- Return exactly ONE JSON object matching the schema below, describing exactly ONE character.
- Do NOT wrap the output in markdown code fences.
- Do NOT add any commentary, explanations, or preamble.
- $variantNote

## Content Guidelines
- **canonical_name**: The name the story uses for this character. Required and non-empty.
- **aliases**: Other names, titles, or epithets they are called by. Use an empty array if none.
- **role_background**: Who they are in this world and how they relate to the story so far.
- **personality**: Temperament, values, contradictions, and how they behave under pressure.
- **voice_style**: How this person sounds when they speak. Where they're from in their vowels, what
  they say when they're stalling, the word they lean on, whether they finish sentences, how they swear
  or don't. Write it about a person talking, not about prose.
- **voice_samples**: Six to ten things they've said, in their own mouth, on different days about
  different things. Make them uneven: a two-word one, a rambling one, one that restarts, one that's
  flat and ordinary. The roleplay model imitates these directly, so they matter more than the
  description above.
- **appearance**: Physical description. Also used to generate their portrait, so be concrete and visual.
- **goals**: What they are trying to get, in and beyond the current scene.
- **boundaries**: Things that are simply true about them and the story can't contradict, stated as facts.

Write every field as prose. Leave a field as an empty string only when you genuinely have nothing
for it; blank fields simply give the model less to work with.

## Blank Template
```json
${buildBlankCastTemplate()}
```

## JSON Schema
The output must conform to:
- `format`: must be exactly `"$CAST_FORMAT"`
- `version`: must be exactly `$CAST_VERSION`
- `data.canonical_name`: string (required, non-empty)
- `data.aliases`: array of strings (required, may be empty)
- `data.role_background`: string (required)
- `data.personality`: string (required)
- `data.voice_style`: string (required)
- `data.appearance`: string (required)
- `data.goals`: string (required)
- `data.boundaries`: string (required)
- `data.voice_samples`: array of strings (required; 6–10 lines)
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
- **voice_style**: How the persona talks — dialect, formality, the habits of a person: filler words,
  how they hedge, what they say when uncomfortable.
- **voice_samples**: A few things they've said, in their own mouth, uneven on purpose. The model reads
  these to know who it's talking to.
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
- `data.voice_samples`: array of strings (required)
- No additional properties allowed at any level.
        """.trimIndent()
    }
}
