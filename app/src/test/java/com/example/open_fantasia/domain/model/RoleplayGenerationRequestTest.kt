package com.example.open_fantasia.domain.model

import com.example.open_fantasia.data.continuity.RoleplayProtocol
import com.example.open_fantasia.data.local.entity.RoleplayGenerationJobEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class RoleplayGenerationRequestTest {

    @Test
    fun canonicalRequestIsStableAndTransportMetadataStaysOutsideIt() {
        val request = RoleplayGenerationRequest(
            system_prompt = "Stable system prompt",
            messages = listOf(
                RoleplayMessage("user", "Earlier user beat"),
                RoleplayMessage("assistant", "Earlier assistant beat"),
                RoleplayMessage("user", "<reply_control>Yunxi</reply_control>\nLatest beat")
            ),
            requested_speaker_id = "cast-yunxi",
            speaker_mode = "single",
            settings = RoleplayGenerationSettings(0.9, 0.95, 2048)
        )
        val first = request.canonicalJson()
        val second = RoleplayGenerationRequest.decode(first).canonicalJson()

        assertEquals(first, second)
        assertEquals(request.sha256(), RoleplayGenerationRequest.decode(first).sha256())
        // Cross-runtime fixture: Node's JSON.stringify + SHA-256 must produce the same value,
        // because the Mac Host verifies this hash before exposing the task to Antigravity.
        assertEquals(
            "2256db894e0e4e46356ea2a1e835fd571536d42cf7fac10a12b42e55cd3e729c",
            request.sha256()
        )
        assertTrue(first.contains("Stable system prompt"))
        assertTrue(first.contains("Latest beat"))
        assertFalse(first.contains("request-id"))
        assertFalse(first.contains("thread-id"))
        assertFalse(first.contains("tailscale"))
    }

    @Test
    fun macEnvelopeCarriesTheSameCanonicalRequestWithoutChangingItsHash() {
        val job = RoleplayGenerationJobEntity(
            id = "request-id",
            turn_id = "turn-id",
            thread_id = "thread-id",
            branch_id = "branch-id",
            expected_head_turn_id = null,
            replace_turn_id = null,
            requested_speaker_id = "cast-yunxi",
            speaker_mode = "single",
            model_id = RoleplayProtocol.MODEL_ID,
            system_prompt = "Stable system prompt",
            messages_json = RoleplayProtocol.messagesJson(
                listOf(RoleplayMessage("user", "Latest beat"))
            ),
            temperature = 0.9,
            top_p = 0.95,
            max_tokens = 2048,
            created_at = "now",
            updated_at = "now"
        )
        val canonical = RoleplayProtocol.generationRequest(job)
        val frozen = job.copy(request_hash = canonical.sha256())
        val envelope = RoleplayProtocol.request(frozen)

        assertEquals(canonical, envelope.generation_request)
        assertEquals(canonical.sha256(), envelope.request_hash)
        assertFalse(canonical.canonicalJson().contains(job.id))
        assertFalse(canonical.canonicalJson().contains(job.thread_id))
    }

    @Test
    fun roleplayOutputValidationAcceptsProseAndRejectsJsonWithoutPlatformRegexes() {
        assertEquals(
            "The rain drummed against the balcony glass.",
            RoleplayOutputValidator.validate("The rain drummed against the balcony glass.")
        )

        try {
            RoleplayOutputValidator.validate("{\"reply\":\"not prose\"}")
            fail("JSON output must be rejected")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message!!.contains("JSON"))
        }
    }
}
