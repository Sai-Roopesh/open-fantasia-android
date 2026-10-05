package com.openfantasia.app

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.withStyle

/** Words between asterisks, within one paragraph: how the Actor and the player mark italics ("*chai, chai garam*"). */
private val ITALIC = Regex("""\*{1,2}(?=[^\s*])([^\n]*?[^\s*])\*{1,2}""")
/** An asterisk that opens italics whose closing one has not arrived yet. */
private val OPENING = Regex("""\*{1,2}(?=[^\s*])|\*{1,2}$""")

/**
 * A passage of the Story as it reads: italics in italics, never as asterisks. While a Reply is [arriving], italics
 * already opened run to the end of what has come, so an asterisk never shows for the moment before its closing one.
 */
fun prose(text: String, arriving: Boolean = false): AnnotatedString = buildAnnotatedString {
    var from = 0
    for (match in ITALIC.findAll(text)) {
        append(text, from, match.range.first)
        withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(match.groupValues[1]) }
        from = match.range.last + 1
    }
    val opening = if (arriving) OPENING.find(text, from) else null
    if (opening == null) {
        append(text, from, text.length)
    } else {
        append(text, from, opening.range.first)
        withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(text.substring(opening.range.last + 1)) }
    }
}
