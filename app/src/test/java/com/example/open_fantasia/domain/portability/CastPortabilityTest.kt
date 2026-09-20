package com.example.open_fantasia.domain.portability

import com.example.open_fantasia.domain.model.CastProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CastPortabilityTest {

    private val seed = CastProfile(
        cast_id = "seed:thread-1:abc",
        canonical_name = "Vera Ashgrove",
        aliases = listOf("The Innkeeper", "Ash"),
        role_background = "Runs the last inn before the pass.",
        personality = "Blunt, watchful, generous in ways she refuses to name.",
        voice_style = "Short sentences. Dry. Never raises her voice.",
        appearance = "Broad-shouldered, greying braid, burn scar across the left forearm.",
        goals = "Keep the inn solvent through winter.",
        boundaries = "Never discusses what happened to her brother.",
        provenance = "manual_seed"
    )

    @Test
    fun roundTrip_preservesEveryAuthorableField() {
        val json = PortableJsonCodec.serializeCast(seed)
        val doc = PortableJsonCodec.parseCastDocument(json).getOrThrow()
        val restored = PortableJsonCodec.castDocumentToProfile(doc, existing = null, threadId = "thread-2")

        assertEquals(seed.canonical_name, restored.canonical_name)
        assertEquals(seed.aliases, restored.aliases)
        assertEquals(seed.role_background, restored.role_background)
        assertEquals(seed.personality, restored.personality)
        assertEquals(seed.voice_style, restored.voice_style)
        assertEquals(seed.appearance, restored.appearance)
        assertEquals(seed.goals, restored.goals)
        assertEquals(seed.boundaries, restored.boundaries)
    }

    @Test
    fun exportedSeed_carriesNoIdentityOrProvenance() {
        val json = PortableJsonCodec.serializeCast(seed)
        assertTrue("cast_id must not travel in the document", !json.contains("seed:thread-1:abc"))
        assertTrue("provenance must not travel in the document", !json.contains("manual_seed"))
    }

    @Test
    fun pastingIntoNewThread_getsFreshIdentityScopedToThatThread() {
        val doc = PortableJsonCodec.parseCastDocument(PortableJsonCodec.serializeCast(seed)).getOrThrow()
        val restored = PortableJsonCodec.castDocumentToProfile(doc, existing = null, threadId = "thread-2")

        assertNotEquals(seed.cast_id, restored.cast_id)
        assertTrue(restored.cast_id.startsWith("seed:thread-2:"))
        assertEquals("manual_seed", restored.provenance)
    }

    @Test
    fun pastingOverExistingMember_keepsItsIdentityAndProvenance() {
        val discovered = seed.copy(
            cast_id = "discovered:xyz",
            provenance = "continuity_discovered",
            status = "archived"
        )
        val doc = PortableJsonCodec.parseCastDocument(PortableJsonCodec.serializeCast(seed)).getOrThrow()
        val merged = PortableJsonCodec.castDocumentToProfile(doc, existing = discovered, threadId = "thread-1")

        assertEquals("discovered:xyz", merged.cast_id)
        assertEquals("continuity_discovered", merged.provenance)
        assertEquals("archived", merged.status)
    }

    @Test
    fun parse_rejectsWrongFormatAndVersion() {
        val wrongFormat = """{"format":"openfantasia.character","version":1,"data":{"canonical_name":"X","aliases":[],"role_background":"","personality":"","voice_style":"","appearance":"","goals":"","boundaries":""}}"""
        val wrongVersion = """{"format":"openfantasia.cast","version":99,"data":{"canonical_name":"X","aliases":[],"role_background":"","personality":"","voice_style":"","appearance":"","goals":"","boundaries":""}}"""

        assertTrue(PortableJsonCodec.parseCastDocument(wrongFormat).isFailure)
        assertTrue(PortableJsonCodec.parseCastDocument(wrongVersion).isFailure)
    }

    @Test
    fun parse_rejectsNamelessMember() {
        val nameless = """{"format":"openfantasia.cast","version":1,"data":{"canonical_name":"   ","aliases":[],"role_background":"","personality":"","voice_style":"","appearance":"","goals":"","boundaries":""}}"""
        assertTrue(PortableJsonCodec.parseCastDocument(nameless).isFailure)
    }

    @Test
    fun parse_acceptsMarkdownFencedOutput() {
        val fenced = "```json\n" + PortableJsonCodec.serializeCast(seed) + "\n```"
        assertEquals("Vera Ashgrove", PortableJsonCodec.parseCastDocument(fenced).getOrThrow().data.canonical_name)
    }

    @Test
    fun parse_trimsAndDropsEmptyAliases() {
        val padded = """{"format":"openfantasia.cast","version":1,"data":{"canonical_name":"  Vera  ","aliases":["  Ash  ","","   "],"role_background":" innkeeper ","personality":"","voice_style":"","appearance":"","goals":"","boundaries":""}}"""
        val doc = PortableJsonCodec.parseCastDocument(padded).getOrThrow()
        val profile = PortableJsonCodec.castDocumentToProfile(doc, existing = null, threadId = "t")

        assertEquals("Vera", profile.canonical_name)
        assertEquals(listOf("Ash"), profile.aliases)
        assertEquals("innkeeper", profile.role_background)
    }

    @Test
    fun blankTemplate_parsesAsShapeButFailsValidationUntilNamed() {
        val blank = PortableJsonCodec.buildBlankCastTemplate()
        assertTrue(blank.contains("\"openfantasia.cast\""))
        assertTrue(PortableJsonCodec.parseCastDocument(blank).isFailure)
    }

    @Test
    fun promptPack_documentsTheSchemaItActuallyAccepts() {
        val pack = PortableJsonCodec.buildCastPromptPack(com.example.open_fantasia.domain.model.PromptPackVariant.CLAUDE)
        listOf(
            "openfantasia.cast", "canonical_name", "aliases", "role_background",
            "personality", "voice_style", "voice_samples", "appearance", "goals", "boundaries"
        ).forEach { assertTrue("prompt pack omits $it", pack.contains(it)) }
        // Naming what to avoid names the thing. The pack asks for speech habits and sample lines instead.
        assertFalse(pack.contains("Avoid \"concise\""))
    }

    @Test
    fun voiceSamplesRoundTripAndOldDocumentsStillParse() {
        val profile = CastProfile(
            cast_id = "seed:thread-1:abc", canonical_name = "Tunde", provenance = "manual_seed",
            voice_samples = listOf("Mm.", "No, hang on \u2014 say that again.")
        )
        val json = PortableJsonCodec.serializeCast(profile)
        assertTrue(json.contains("voice_samples"))
        val parsed = PortableJsonCodec.parseCastDocument(json).getOrThrow()
        assertEquals(profile.voice_samples, parsed.data.voice_samples)
        val restored = PortableJsonCodec.castDocumentToProfile(parsed, existing = profile, threadId = "thread-1")
        assertEquals(profile.voice_samples, restored.voice_samples)

        val old = """{"format":"openfantasia.cast","version":1,"data":{"canonical_name":"Tunde","aliases":[],
            "role_background":"","personality":"","voice_style":"","appearance":"","goals":"","boundaries":""}}"""
        assertTrue("a document written before voice_samples existed must still import", PortableJsonCodec.parseCastDocument(old).isSuccess)
    }
}
