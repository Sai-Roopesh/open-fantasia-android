package com.openfantasia.app

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontStyle
import org.junit.Assert.assertEquals
import org.junit.Test

class ProseTest {
    private fun italics(text: AnnotatedString) =
        text.spanStyles.filter { it.item.fontStyle == FontStyle.Italic }.map { text.text.substring(it.start, it.end) }

    @Test fun asterisksBecomeItalics() {
        val shown = prose("She doesn't say *why* or *then why go*. *chai, chai*")
        assertEquals("She doesn't say why or then why go. chai, chai", shown.text)
        assertEquals(listOf("why", "then why go", "chai, chai"), italics(shown))
    }

    @Test fun anAsteriskThatOpensNothingStays() {
        val shown = prose("Five * three, and a star * here.\n*Not across\nparagraphs*")
        assertEquals("Five * three, and a star * here.\n*Not across\nparagraphs*", shown.text)
        assertEquals(emptyList<String>(), italics(shown))
    }

    @Test fun whileArrivingAnOpenedItalicRunsToTheEnd() {
        assertEquals("a porter shouts coolie, coo", prose("a porter shouts *coolie, coo", arriving = true).text)
        assertEquals(listOf("coolie, coo"), italics(prose("a porter shouts *coolie, coo", arriving = true)))
        assertEquals("a porter shouts ", prose("a porter shouts *", arriving = true).text)
        assertEquals("a porter shouts *coolie, coo", prose("a porter shouts *coolie, coo").text)
    }
}
