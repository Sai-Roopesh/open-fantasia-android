package com.openfantasia.app

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.withStyle

/** Words between asterisks, within one paragraph: how the Actor and the player mark italics ("*chai, chai garam*"). */
private val ITALIC = Regex("""\*{1,2}(?=[^\s*])([^\n]*?[^\s*])\*{1,2}""")

/** A passage of the Story as it reads: italics in italics, never as asterisks. */
fun prose(text: String): AnnotatedString = buildAnnotatedString {
    var from = 0
    for (match in ITALIC.findAll(text)) {
        append(text, from, match.range.first)
        withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(match.groupValues[1]) }
        from = match.range.last + 1
    }
    append(text, from, text.length)
}
