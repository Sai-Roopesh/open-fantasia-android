package com.example.open_fantasia.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.open_fantasia.theme.Inter

@Composable
fun MarkdownText(
    text: String,
    modifier: Modifier = Modifier,
    baseColor: Color = Color(0xFFE4E1E7),
    paragraphFontSize: TextUnit = 15.sp,
    paragraphLineHeight: TextUnit = 22.sp
) {
    val blocks = parseMarkdownLiteKotlin(text)
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        blocks.forEach { block ->
            when (block.kind) {
                BlockKind.Paragraph -> {
                    Text(
                        text = parseInlineToAnnotatedString(block.text, baseColor),
                        color = baseColor,
                        fontFamily = Inter,
                        fontSize = paragraphFontSize,
                        lineHeight = paragraphLineHeight
                    )
                }
                BlockKind.Quote -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .drawBehind {
                                drawLine(
                                    color = Color(0xFF988CA0), // Sleek outline color
                                    start = Offset(0f, 0f),
                                    end = Offset(0f, size.height),
                                    strokeWidth = 3.dp.toPx()
                                )
                            }
                            .padding(start = 12.dp)
                    ) {
                        Text(
                            text = parseInlineToAnnotatedString(block.text, baseColor.copy(alpha = 0.85f)),
                            fontStyle = FontStyle.Italic,
                            fontFamily = Inter,
                            fontSize = 14.sp,
                            lineHeight = 20.sp
                        )
                    }
                }
                BlockKind.Separator -> {
                    HorizontalDivider(
                        color = Color(0xFF2A292E), // Outline-variant equivalent
                        thickness = 1.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                }
            }
        }
    }
}

fun parseInlineToAnnotatedString(line: String, baseColor: Color): AnnotatedString {
    return buildAnnotatedString {
        var cursor = 0
        while (cursor < line.length) {
            if (line.startsWith("**", cursor)) {
                val end = line.indexOf("**", cursor + 2)
                if (end > cursor + 2) {
                    val content = line.substring(cursor + 2, end)
                    withStyle(style = SpanStyle(fontWeight = FontWeight.Bold, color = baseColor)) {
                        append(content)
                    }
                    cursor = end + 2
                    continue
                }
            }
            if (line.startsWith("*", cursor)) {
                val end = line.indexOf("*", cursor + 1)
                if (end > cursor + 1) {
                    val content = line.substring(cursor + 1, end)
                    withStyle(style = SpanStyle(fontStyle = FontStyle.Italic, color = baseColor)) {
                        append(content)
                    }
                    cursor = end + 1
                    continue
                }
            }
            append(line[cursor])
            cursor++
        }
    }
}

enum class BlockKind { Paragraph, Quote, Separator }
data class MarkdownBlock(val kind: BlockKind, val text: String)

fun parseMarkdownLiteKotlin(input: String): List<MarkdownBlock> {
    val blocks = mutableListOf<MarkdownBlock>()
    val lines = input.replace("\r\n", "\n").split("\n")
    var currentKind: BlockKind? = null
    val buffer = mutableListOf<String>()

    fun flush() {
        if (currentKind == null || buffer.isEmpty()) return
        blocks.add(MarkdownBlock(currentKind!!, buffer.joinToString("\n")))
        buffer.clear()
        currentKind = null
    }

    for (rawLine in lines) {
        val trimmed = rawLine.trim()
        if (trimmed.isEmpty()) {
            flush()
            continue
        }

        // Separator check
        if (trimmed.matches(Regex("^([-*_]\\s*){3,}$"))) {
            flush()
            blocks.add(MarkdownBlock(BlockKind.Separator, ""))
            continue
        }

        // Quote check
        if (trimmed.startsWith(">")) {
            if (currentKind != null && currentKind != BlockKind.Quote) {
                flush()
            }
            currentKind = BlockKind.Quote
            buffer.add(trimmed.replace(Regex("^>\\s?"), ""))
            continue
        }

        // Paragraph
        if (currentKind != null && currentKind != BlockKind.Paragraph) {
            flush()
        }
        currentKind = BlockKind.Paragraph
        buffer.add(rawLine)
    }
    flush()

    if (blocks.isEmpty()) {
        blocks.add(MarkdownBlock(BlockKind.Paragraph, ""))
    }
    return blocks
}
