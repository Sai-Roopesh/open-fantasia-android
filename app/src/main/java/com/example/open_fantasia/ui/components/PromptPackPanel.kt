package com.example.open_fantasia.ui.components

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.open_fantasia.domain.model.*
import com.example.open_fantasia.domain.portability.PortableJsonCodec

// ─── Public types ───────────────────────────────────────────────────

enum class PortableKind { CHARACTER, PERSONA, CAST }

sealed class ImportState {
    data object Idle : ImportState()
    data class Valid(val name: String, val detail: String) : ImportState()
    data class Invalid(val error: String) : ImportState()
}

// ─── Main Panel ─────────────────────────────────────────────────────

@Composable
fun PromptPackPanel(
    kind: PortableKind,
    accentColor: Color,
    currentJson: () -> String,
    onImportCharacter: ((CharacterDocumentData) -> Unit)? = null,
    onImportPersona: ((PersonaDocumentData) -> Unit)? = null,
    onImportCast: ((CastDocumentData) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    var importState by remember { mutableStateOf<ImportState>(ImportState.Idle) }
    var pastedText by remember { mutableStateOf("") }

    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    val kindLabel = when (kind) {
        PortableKind.CHARACTER -> "Character"
        PortableKind.PERSONA -> "Persona"
        PortableKind.CAST -> "Cast"
    }
    val kindVersion = when (kind) {
        PortableKind.CHARACTER -> CHARACTER_VERSION
        PortableKind.PERSONA -> PERSONA_VERSION
        PortableKind.CAST -> CAST_VERSION
    }

    // File picker launcher
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        uri?.let {
            try {
                val text = context.contentResolver.openInputStream(it)?.bufferedReader()?.readText() ?: ""
                pastedText = text
                importState = validateImport(kind, text)
            } catch (e: Exception) {
                importState = ImportState.Invalid("Failed to read file: ${e.message}")
            }
        }
    }

    Column(modifier = modifier) {
        // Toggle button
        Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Share,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Prompt Packs",
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 15.sp
                    )
                }
                Icon(
                    imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (expanded) "Collapse" else "Expand",
                    tint = Color.Gray,
                    modifier = Modifier.size(22.dp)
                )
            }
        }

        // Expandable content
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            Card(
                shape = RoundedCornerShape(bottomStart = 12.dp, bottomEnd = 12.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF16161C)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // ── EXPORT SECTION ──────────────────────────────
                    SectionHeader("EXPORT")

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        PanelActionButton(
                            icon = Icons.Default.ContentCopy,
                            label = "Copy JSON",
                            accentColor = accentColor,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                val json = currentJson()
                                clipboardManager.setText(AnnotatedString(json))
                                Toast.makeText(context, "$kindLabel JSON copied!", Toast.LENGTH_SHORT).show()
                            }
                        )
                        PanelActionButton(
                            icon = Icons.Default.Share,
                            label = "Share",
                            accentColor = accentColor,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                val json = currentJson()
                                shareText(context, json, "openfantasia-${kindLabel.lowercase()}-export.v$kindVersion.json")
                            }
                        )
                    }

                    PanelActionButton(
                        icon = Icons.Default.Description,
                        label = "Share Blank Template",
                        accentColor = accentColor,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            val template = when (kind) {
                                PortableKind.CHARACTER -> PortableJsonCodec.buildBlankCharacterTemplate()
                                PortableKind.PERSONA -> PortableJsonCodec.buildBlankPersonaTemplate()
                                PortableKind.CAST -> PortableJsonCodec.buildBlankCastTemplate()
                            }
                            shareText(context, template, "openfantasia-${kindLabel.lowercase()}-blank.json")
                        }
                    )

                    // Prompt pack variant row
                    Text(
                        text = "PROMPT PACKS",
                        color = Color.Gray,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        PromptPackVariant.entries.forEach { variant ->
                            val label = variant.name.lowercase().replaceFirstChar { it.uppercase() }
                            PromptPackChip(
                                label = label,
                                accentColor = accentColor,
                                modifier = Modifier.weight(1f),
                                onClick = {
                                    val pack = when (kind) {
                                        PortableKind.CHARACTER -> PortableJsonCodec.buildCharacterPromptPack(variant)
                                        PortableKind.PERSONA -> PortableJsonCodec.buildPersonaPromptPack(variant)
                                        PortableKind.CAST -> PortableJsonCodec.buildCastPromptPack(variant)
                                    }
                                    shareText(context, pack, "openfantasia-${kindLabel.lowercase()}-${label.lowercase()}-prompt-pack.md")
                                }
                            )
                        }
                    }

                    HorizontalDivider(color = Color(0xFF2C2C35), thickness = 1.dp)

                    // ── IMPORT SECTION ──────────────────────────────
                    SectionHeader("IMPORT")

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        PanelActionButton(
                            icon = Icons.Default.ContentPaste,
                            label = "Paste",
                            accentColor = accentColor,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                val clip = clipboardManager.getText()?.text ?: ""
                                if (clip.isBlank()) {
                                    importState = ImportState.Invalid("Clipboard is empty.")
                                } else {
                                    pastedText = clip
                                    importState = validateImport(kind, clip)
                                }
                            }
                        )
                        PanelActionButton(
                            icon = Icons.Default.UploadFile,
                            label = "From File",
                            accentColor = accentColor,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                filePickerLauncher.launch("*/*")
                            }
                        )
                    }

                    // Import feedback
                    when (val state = importState) {
                        is ImportState.Idle -> {
                            // nothing
                        }
                        is ImportState.Valid -> {
                            ImportFeedbackCard(
                                isValid = true,
                                accentColor = accentColor,
                                title = state.name,
                                detail = state.detail
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = {
                                        loadImportIntoEditor(kind, pastedText, onImportCharacter, onImportPersona, onImportCast)
                                        importState = ImportState.Idle
                                        pastedText = ""
                                        Toast.makeText(context, "$kindLabel loaded into editor!", Toast.LENGTH_SHORT).show()
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = accentColor),
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Load into Editor", color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                }
                                OutlinedButton(
                                    onClick = {
                                        importState = ImportState.Idle
                                        pastedText = ""
                                    },
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier.weight(0.5f)
                                ) {
                                    Text("Clear", color = Color.Gray, fontSize = 13.sp)
                                }
                            }
                        }
                        is ImportState.Invalid -> {
                            ImportFeedbackCard(
                                isValid = false,
                                accentColor = Color.Red,
                                title = "Validation Failed",
                                detail = state.error
                            )
                            OutlinedButton(
                                onClick = {
                                    importState = ImportState.Idle
                                    pastedText = ""
                                },
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("Clear", color = Color.Gray, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ─── Internal Composables ───────────────────────────────────────────

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        color = Color.Gray,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.sp
    )
}

@Composable
private fun PanelActionButton(
    icon: ImageVector,
    label: String,
    accentColor: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1F1F23)),
        shape = RoundedCornerShape(8.dp),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
        modifier = modifier
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = label,
            color = Color.White,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun PromptPackChip(
    label: String,
    accentColor: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, accentColor.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
            .background(accentColor.copy(alpha = 0.08f))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = accentColor,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun ImportFeedbackCard(
    isValid: Boolean,
    accentColor: Color,
    title: String,
    detail: String
) {
    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1F1F23)),
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = if (isValid) Color(0xFF00FF87) else Color.Red,
                shape = RoundedCornerShape(8.dp)
            )
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            Icon(
                imageVector = if (isValid) Icons.Default.CheckCircle else Icons.Default.Warning,
                contentDescription = null,
                tint = if (isValid) Color(0xFF00FF87) else Color.Red,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    text = title,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = detail,
                    color = Color.Gray,
                    fontSize = 12.sp,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

// ─── Pure Helpers ───────────────────────────────────────────────────

private fun validateImport(kind: PortableKind, raw: String): ImportState {
    return when (kind) {
        PortableKind.CHARACTER -> {
            val result = PortableJsonCodec.parseCharacterDocument(raw)
            if (result.isSuccess) {
                val d = result.getOrThrow().data
                ImportState.Valid(
                    name = d.name.ifBlank { "(Unnamed Character)" },
                    detail = "${d.suggested_starters.size} starters · ${d.example_conversations.size} examples"
                )
            } else {
                ImportState.Invalid(result.exceptionOrNull()?.message ?: "Unknown error")
            }
        }
        PortableKind.PERSONA -> {
            val result = PortableJsonCodec.parsePersonaDocument(raw)
            if (result.isSuccess) {
                val d = result.getOrThrow().data
                ImportState.Valid(
                    name = d.name.ifBlank { "(Unnamed Persona)" },
                    detail = "Identity: ${d.identity.take(60)}${if (d.identity.length > 60) "…" else ""}"
                )
            } else {
                ImportState.Invalid(result.exceptionOrNull()?.message ?: "Unknown error")
            }
        }
        PortableKind.CAST -> {
            val result = PortableJsonCodec.parseCastDocument(raw)
            if (result.isSuccess) {
                val d = result.getOrThrow().data
                val filled = listOf(
                    d.role_background, d.personality, d.voice_style,
                    d.appearance, d.goals, d.boundaries
                ).count { it.isNotBlank() }
                ImportState.Valid(
                    name = d.canonical_name,
                    detail = "$filled/6 fields · ${d.aliases.size} aliases"
                )
            } else {
                ImportState.Invalid(result.exceptionOrNull()?.message ?: "Unknown error")
            }
        }
    }
}

private fun loadImportIntoEditor(
    kind: PortableKind,
    raw: String,
    onImportCharacter: ((CharacterDocumentData) -> Unit)?,
    onImportPersona: ((PersonaDocumentData) -> Unit)?,
    onImportCast: ((CastDocumentData) -> Unit)?
) {
    when (kind) {
        PortableKind.CHARACTER -> {
            val doc = PortableJsonCodec.parseCharacterDocument(raw).getOrNull() ?: return
            onImportCharacter?.invoke(doc.data)
        }
        PortableKind.PERSONA -> {
            val doc = PortableJsonCodec.parsePersonaDocument(raw).getOrNull() ?: return
            onImportPersona?.invoke(doc.data)
        }
        PortableKind.CAST -> {
            val doc = PortableJsonCodec.parseCastDocument(raw).getOrNull() ?: return
            onImportCast?.invoke(doc.data)
        }
    }
}

private fun shareText(context: Context, text: String, filename: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = if (filename.endsWith(".md")) "text/markdown" else "application/json"
        putExtra(Intent.EXTRA_TEXT, text)
        putExtra(Intent.EXTRA_SUBJECT, filename)
    }
    context.startActivity(Intent.createChooser(intent, "Share $filename"))
}
