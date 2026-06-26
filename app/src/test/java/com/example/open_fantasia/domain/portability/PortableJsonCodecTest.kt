package com.example.open_fantasia.domain.portability

import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.PersonaEntity
import com.example.open_fantasia.domain.model.*
import org.junit.Assert.*
import org.junit.Test

class PortableJsonCodecTest {

    private val testCharEntity = CharacterEntity(
        id = "char-test",
        user_id = "user-1",
        name = "Mara Vale",
        story = "Alchemy World",
        core_persona = "Brilliant alchemist with a dark secret",
        greeting = "Welcome to my laboratory.",
        appearance = "Cloaked figure with glowing green eyes",
        style_rules = "Speaks in measured, scientific tones",
        definition = "Master of transmutation",
        negative_guidance = "Never breaks character",
        temperature = 0.92,
        top_p = 0.94,
        starters = listOf("Tell me about alchemy", "What are you working on?"),
        example_conversations = listOf(
            ExampleConversation("What do you study?", "The transmutation of base metals, of course.")
        ),
        portrait_status = "idle",
        portrait_path = null,
        portrait_prompt = null,
        portrait_seed = null,
        portrait_source_hash = null,
        portrait_last_error = null,
        portrait_generated_at = null,
        created_at = "2026-01-01",
        updated_at = "2026-01-01"
    )

    private val testPersonaEntity = PersonaEntity(
        id = "persona-test",
        user_id = "user-1",
        name = "The Wanderer",
        identity = "A drifting scholar",
        backstory = "Left the academy years ago",
        voice_style = "Poetic and contemplative",
        goals = "Seek forbidden knowledge",
        boundaries = "Avoids violence",
        private_notes = "Prefers indirect dialogue",
        is_default = true,
        created_at = "2026-01-01",
        updated_at = "2026-01-01"
    )

    // ─── Character Serialization / Round-Trip ───────────────────────

    @Test
    fun serializeCharacter_producesValidV4Document() {
        val json = PortableJsonCodec.serializeCharacter(testCharEntity)
        val result = PortableJsonCodec.parseCharacterDocument(json)
        assertTrue("Round-trip should succeed", result.isSuccess)
        val doc = result.getOrThrow()
        assertEquals(CHARACTER_FORMAT, doc.format)
        assertEquals(CHARACTER_VERSION, doc.version)
        assertEquals("Mara Vale", doc.data.name)
        assertEquals("Alchemy World", doc.data.story)
        assertEquals(2, doc.data.suggested_starters.size)
        assertEquals(1, doc.data.example_conversations.size)
        assertEquals("What do you study?", doc.data.example_conversations[0].user_line)
    }

    // ─── Character Validation: Wrong Format ─────────────────────────

    @Test
    fun parseCharacterDocument_rejectsWrongFormat() {
        val json = """
        {
            "format": "openfantasia.persona",
            "version": 4,
            "data": {
                "name": "X", "story": "", "core_persona": "", "greeting": "",
                "appearance": "", "style_rules": "", "definition": "",
                "negative_guidance": "", "suggested_starters": [],
                "example_conversations": []
            }
        }
        """.trimIndent()
        val result = PortableJsonCodec.parseCharacterDocument(json)
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()!!.message!!.contains("format"))
    }

    // ─── Character Validation: Wrong Version ────────────────────────

    @Test
    fun parseCharacterDocument_rejectsWrongVersion() {
        val json = """
        {
            "format": "openfantasia.character",
            "version": 3,
            "data": {
                "name": "X", "story": "", "core_persona": "", "greeting": "",
                "appearance": "", "style_rules": "", "definition": "",
                "negative_guidance": "", "suggested_starters": [],
                "example_conversations": []
            }
        }
        """.trimIndent()
        val result = PortableJsonCodec.parseCharacterDocument(json)
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()!!.message!!.contains("version"))
    }

    // ─── Character Validation: Missing Fields ───────────────────────

    @Test
    fun parseCharacterDocument_rejectsMissingFields() {
        val json = """
        {
            "format": "openfantasia.character",
            "version": 4,
            "data": {
                "name": "X", "story": ""
            }
        }
        """.trimIndent()
        val result = PortableJsonCodec.parseCharacterDocument(json)
        assertTrue(result.isFailure)
    }

    // ─── Character Validation: Extra Fields ─────────────────────────

    @Test
    fun parseCharacterDocument_rejectsExtraFields() {
        val json = """
        {
            "format": "openfantasia.character",
            "version": 4,
            "data": {
                "name": "X", "story": "", "core_persona": "", "greeting": "",
                "appearance": "", "style_rules": "", "definition": "",
                "negative_guidance": "", "suggested_starters": [],
                "example_conversations": [],
                "extra_field": "not allowed"
            }
        }
        """.trimIndent()
        val result = PortableJsonCodec.parseCharacterDocument(json)
        assertTrue("Extra fields should be rejected", result.isFailure)
    }

    // ─── Character Validation: Markdown Fence Stripping ─────────────

    @Test
    fun parseCharacterDocument_stripsMarkdownFences() {
        val innerJson = PortableJsonCodec.serializeCharacter(testCharEntity)
        val fenced = "```json\n$innerJson\n```"
        val result = PortableJsonCodec.parseCharacterDocument(fenced)
        assertTrue("Fenced JSON should parse successfully", result.isSuccess)
        assertEquals("Mara Vale", result.getOrThrow().data.name)
    }

    // ─── Persona Serialization / Round-Trip ─────────────────────────

    @Test
    fun serializePersona_producesValidV1Document() {
        val json = PortableJsonCodec.serializePersona(testPersonaEntity)
        val result = PortableJsonCodec.parsePersonaDocument(json)
        assertTrue("Round-trip should succeed", result.isSuccess)
        val doc = result.getOrThrow()
        assertEquals(PERSONA_FORMAT, doc.format)
        assertEquals(PERSONA_VERSION, doc.version)
        assertEquals("The Wanderer", doc.data.name)
        assertEquals("A drifting scholar", doc.data.identity)
    }

    // ─── Persona Validation: Wrong Format ───────────────────────────

    @Test
    fun parsePersonaDocument_rejectsWrongFormat() {
        val json = """
        {
            "format": "openfantasia.character",
            "version": 1,
            "data": {
                "name": "X", "identity": "", "backstory": "",
                "voice_style": "", "goals": "", "boundaries": "", "private_notes": ""
            }
        }
        """.trimIndent()
        val result = PortableJsonCodec.parsePersonaDocument(json)
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()!!.message!!.contains("format"))
    }

    // ─── Persona Validation: Wrong Version ──────────────────────────

    @Test
    fun parsePersonaDocument_rejectsWrongVersion() {
        val json = """
        {
            "format": "openfantasia.persona",
            "version": 2,
            "data": {
                "name": "X", "identity": "", "backstory": "",
                "voice_style": "", "goals": "", "boundaries": "", "private_notes": ""
            }
        }
        """.trimIndent()
        val result = PortableJsonCodec.parsePersonaDocument(json)
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()!!.message!!.contains("version"))
    }

    // ─── Persona Validation: Valid Round-Trip ────────────────────────

    @Test
    fun parsePersonaDocument_validRoundTrip() {
        val json = PortableJsonCodec.serializePersona(testPersonaEntity)
        val result = PortableJsonCodec.parsePersonaDocument(json)
        assertTrue(result.isSuccess)
        val doc = result.getOrThrow()
        assertEquals("The Wanderer", doc.data.name)
        assertEquals("Poetic and contemplative", doc.data.voice_style)
        assertEquals("Seek forbidden knowledge", doc.data.goals)
    }

    // ─── Blank Templates ────────────────────────────────────────────

    @Test
    fun buildBlankCharacterTemplate_isValidDocument() {
        val template = PortableJsonCodec.buildBlankCharacterTemplate()
        val result = PortableJsonCodec.parseCharacterDocument(template)
        assertTrue("Blank character template should be valid", result.isSuccess)
        assertEquals("", result.getOrThrow().data.name)
    }

    @Test
    fun buildBlankPersonaTemplate_isValidDocument() {
        val template = PortableJsonCodec.buildBlankPersonaTemplate()
        val result = PortableJsonCodec.parsePersonaDocument(template)
        assertTrue("Blank persona template should be valid", result.isSuccess)
        assertEquals("", result.getOrThrow().data.name)
    }

    // ─── Prompt Pack Content ────────────────────────────────────────

    @Test
    fun buildCharacterPromptPack_containsSchemaAndTemplate() {
        val pack = PortableJsonCodec.buildCharacterPromptPack(PromptPackVariant.CLAUDE)
        assertTrue("Should contain format reference", pack.contains("openfantasia.character"))
        assertTrue("Should contain version reference", pack.contains("version"))
        assertTrue("Should contain template", pack.contains("suggested_starters"))
        assertTrue("Should contain Claude note", pack.contains("Claude"))
    }

    @Test
    fun buildPersonaPromptPack_containsSchemaAndTemplate() {
        val pack = PortableJsonCodec.buildPersonaPromptPack(PromptPackVariant.GEMINI)
        assertTrue("Should contain format reference", pack.contains("openfantasia.persona"))
        assertTrue("Should contain template", pack.contains("voice_style"))
        assertTrue("Should contain Gemini note", pack.contains("Gemini"))
    }

    // ─── Entity Mapping ─────────────────────────────────────────────

    @Test
    fun characterDocumentToEntity_mapsAllFields() {
        val json = PortableJsonCodec.serializeCharacter(testCharEntity)
        val doc = PortableJsonCodec.parseCharacterDocument(json).getOrThrow()
        val entity = PortableJsonCodec.characterDocumentToEntity(doc, "user-2", "char-new")

        assertEquals("char-new", entity.id)
        assertEquals("user-2", entity.user_id)
        assertEquals("Mara Vale", entity.name)
        assertEquals("Alchemy World", entity.story)
        assertEquals("Brilliant alchemist with a dark secret", entity.core_persona)
        assertEquals("Welcome to my laboratory.", entity.greeting)
        assertEquals("Cloaked figure with glowing green eyes", entity.appearance)
        assertEquals("Speaks in measured, scientific tones", entity.style_rules)
        assertEquals("Master of transmutation", entity.definition)
        assertEquals("Never breaks character", entity.negative_guidance)
        assertEquals(2, entity.starters.size)
        assertEquals(1, entity.example_conversations.size)
        // temperature/top_p should be defaults, not from JSON
        assertEquals(0.92, entity.temperature, 0.001)
        assertEquals(0.94, entity.top_p, 0.001)
        // portrait fields should be reset
        assertEquals("idle", entity.portrait_status)
        assertNull(entity.portrait_path)
    }

    @Test
    fun personaDocumentToEntity_preservesIsDefault() {
        val json = PortableJsonCodec.serializePersona(testPersonaEntity)
        val doc = PortableJsonCodec.parsePersonaDocument(json).getOrThrow()

        val entityDefault = PortableJsonCodec.personaDocumentToEntity(doc, "user-2", "p-new", isDefault = true)
        assertTrue("isDefault should be true from argument", entityDefault.is_default)

        val entityNotDefault = PortableJsonCodec.personaDocumentToEntity(doc, "user-2", "p-new2", isDefault = false)
        assertFalse("isDefault should be false from argument", entityNotDefault.is_default)
    }

    // ─── Markdown Fence Edge Cases ──────────────────────────────────

    @Test
    fun stripMarkdownCodeFence_handlesPlainText() {
        val plain = """{"format": "test"}"""
        assertEquals(plain, PortableJsonCodec.stripMarkdownCodeFence(plain))
    }

    @Test
    fun stripMarkdownCodeFence_handlesFenceWithoutLanguage() {
        val fenced = "```\n{\"format\": \"test\"}\n```"
        assertEquals("{\"format\": \"test\"}", PortableJsonCodec.stripMarkdownCodeFence(fenced))
    }

    @Test
    fun stripMarkdownCodeFence_handlesJsonFence() {
        val fenced = "```json\n{\"format\": \"test\"}\n```"
        assertEquals("{\"format\": \"test\"}", PortableJsonCodec.stripMarkdownCodeFence(fenced))
    }
}
