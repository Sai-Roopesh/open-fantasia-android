package com.example.open_fantasia.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Scene Report is the only thing in this architecture that puts a parse between a person and the
 * reply they waited for, so the cases that matter are the ways a model can get it wrong. Every one of
 * them must end with the prose intact and the report simply absent.
 */
class SceneReportTest {

    private val prose = "She set the glass down without drinking. \"Then say it properly.\""

    @Test
    fun `a well-formed report is read and removed from the prose`() {
        val raw = "$prose\n<scene_state>{\"present\":[\"Avni\",\"Ayushi\"],\"scene_ended\":false}</scene_state>"
        val reply = SceneReportCodec.split(raw)
        assertEquals(prose, reply.prose)
        assertEquals(listOf("Avni", "Ayushi"), reply.report?.present)
        assertFalse(reply.report!!.scene_ended)
    }

    @Test
    fun `a reply with no report is a reply, not a failure`() {
        val reply = SceneReportCodec.split(prose)
        assertEquals(prose, reply.prose)
        assertNull(reply.report)
    }

    @Test
    fun `unparseable JSON loses the report and keeps the story`() {
        val reply = SceneReportCodec.split("$prose\n<scene_state>{present: [broken</scene_state>")
        assertEquals(prose, reply.prose)
        assertNull("a report that cannot be read must not become one that can", reply.report)
    }

    @Test
    fun `a truncated report is still stripped from the transcript`() {
        // A reply cut off mid-block. The markup must not reach the transcript, where it would sit in the
        // next fifteen prompts as though the story contained it.
        val reply = SceneReportCodec.split("$prose\n<scene_state>{\"present\":[\"Avni\"")
        assertEquals(prose, reply.prose)
        assertNull(reply.report)
    }

    @Test
    fun `an empty report is treated as no report at all`() {
        val reply = SceneReportCodec.split("$prose\n<scene_state>{}</scene_state>")
        assertNull("an empty room is not something a model meant to say", reply.report)
    }

    @Test
    fun `a report arriving mid-stream never reaches the screen`() {
        assertEquals(prose, SceneReportCodec.visiblePrefix("$prose\n<scene_state>{\"pre"))
        assertEquals(prose, SceneReportCodec.visiblePrefix(prose))
    }

    @Test
    fun `a stored report survives the round trip`() {
        val report = SceneReport(present = listOf("Avni"), scene_ended = true)
        assertEquals(report, SceneReportCodec.decode(SceneReportCodec.encode(report)))
        assertNull(SceneReportCodec.decode(null))
        assertNull(SceneReportCodec.decode("not json"))
    }

    @Test
    fun `a reply that is only bookkeeping is refused`() {
        val onlyReport = "<scene_state>{\"present\":[\"Avni\"]}</scene_state>"
        val reply = SceneReportCodec.split(onlyReport)
        assertTrue("the prose is empty, which validation must catch", reply.prose.isBlank())
        val failure = runCatching { RoleplayOutputValidator.validate(reply.prose) }.exceptionOrNull()
        assertTrue(failure is IllegalArgumentException)
    }

    @Test
    fun `the report names the cast so a model has something exact to copy`() {
        val contract = SceneReportCodec.outputContract(listOf("Dr. Avni Mehra", "Dr. Ayushi Mehra"), playerName = "Dan")
        assertTrue(contract.contains("\"Dr. Avni Mehra\", \"Dr. Ayushi Mehra\", \"Dan\""))
        assertTrue(contract.contains("<${SceneReportCodec.TAG}>"))
        // Two lines. The codec forgives anything the model gets wrong, so the instruction no longer has
        // to say so; a paragraph about what happens if a field is missing was register, not information.
        assertTrue(contract.lines().size <= 2)
    }
}
