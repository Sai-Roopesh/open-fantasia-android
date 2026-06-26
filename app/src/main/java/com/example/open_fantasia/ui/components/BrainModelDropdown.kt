package com.example.open_fantasia.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import com.example.open_fantasia.domain.selector.filterBrainConnections

/**
 * Single combined "HCE Brain Model" picker (web parity). Lists "Default (Inherit Chat
 * Model)" plus every eligible connection→model pair (DeepSeek excluded). Reports the
 * chosen (connectionId, modelId); both null means inherit the chat model.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrainModelDropdown(
    connections: List<ConnectionEntity>,
    selectedConnId: String?,
    selectedModelId: String?,
    onSelect: (connId: String?, modelId: String?) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    val eligible = connections.filterBrainConnections()
    // Strict: only models a discovery signal confirmed as JSON-mode capable can be the brain.
    val options = eligible.flatMap { c ->
        c.model_cache.filter { it.supportsJson }.map { m -> Triple(c.id, m.id, "${c.label} — ${m.id}") }
    }

    val currentLabel = if (selectedConnId == null || selectedModelId.isNullOrEmpty()) {
        "Default (Inherit Chat Model)"
    } else {
        val conn = eligible.find { it.id == selectedConnId }
        "${conn?.label ?: "Unknown"} — $selectedModelId"
    }

    val colors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        focusedContainerColor = Color(0xFF1F1F23),
        unfocusedContainerColor = Color(0xFF1F1F23),
        focusedBorderColor = Color(0xFF00FBFB),
        unfocusedBorderColor = Color(0xFF4C4354),
        cursorColor = Color(0xFF00FBFB)
    )

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier
    ) {
        OutlinedTextField(
            value = currentLabel,
            onValueChange = {},
            readOnly = true,
            label = { Text("HCE Brain Model") },
            shape = RoundedCornerShape(8.dp),
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            colors = colors,
            modifier = Modifier.menuAnchor().fillMaxWidth()
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.background(Color(0xFF1B1B1F))
        ) {
            DropdownMenuItem(
                text = { Text("Default (Inherit Chat Model)", color = Color.White) },
                onClick = {
                    onSelect(null, null)
                    expanded = false
                }
            )
            if (options.isEmpty()) {
                DropdownMenuItem(
                    enabled = false,
                    text = {
                        Text(
                            "Refresh models in Settings — only JSON-capable models can be the brain",
                            color = Color(0xFF7A7580),
                            fontSize = 12.sp
                        )
                    },
                    onClick = {}
                )
            }
            options.forEach { (connId, modelId, label) ->
                DropdownMenuItem(
                    text = { Text(label, color = Color.White) },
                    onClick = {
                        onSelect(connId, modelId)
                        expanded = false
                    }
                )
            }
        }
    }
}
