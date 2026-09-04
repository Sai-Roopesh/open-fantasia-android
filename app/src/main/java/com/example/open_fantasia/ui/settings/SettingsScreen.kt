package com.example.open_fantasia.ui.settings

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import com.example.open_fantasia.data.continuity.ContinuityEngineAvailability
import com.example.open_fantasia.data.continuity.ContinuityHostState
import com.example.open_fantasia.data.continuity.ContinuityHostPreferences
import com.example.open_fantasia.data.continuity.RoleplayProtocol

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    modifier: Modifier = Modifier
) {
    val connections by viewModel.connections.collectAsState()
    val hostState by viewModel.continuityHostState.collectAsState()
    val continuityMessage by viewModel.continuityMessage.collectAsState()
    val continuityEngineId by viewModel.continuityEngineId.collectAsState()
    val continuityEngines by viewModel.continuityEngines.collectAsState()
    var editingConn by remember { mutableStateOf<ConnectionEntity?>(null) }
    var isCreating by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<ConnectionEntity?>(null) }
    val context = androidx.compose.ui.platform.LocalContext.current

    LaunchedEffect(continuityMessage) {
        continuityMessage?.let {
            Toast.makeText(context, it, Toast.LENGTH_LONG).show()
            viewModel.consumeContinuityMessage()
        }
    }


    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF131317))
    ) {
        if (editingConn != null || isCreating) {
            ConnectionEditor(
                connection = editingConn,
                onDismiss = {
                    editingConn = null
                    isCreating = false
                },
                onSave = { id, provider, label, baseUrl, apiKey, enabled, defaultModel ->
                    viewModel.saveConnection(id, provider, label, baseUrl, apiKey, enabled, defaultModel)
                    editingConn = null
                    isCreating = false
                }
            )
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Settings & Providers",
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium.copy(
                            color = Color(0xFF00FBFB)
                        )
                    )
                    IconButton(
                        onClick = { isCreating = true },
                        colors = IconButtonDefaults.iconButtonColors(containerColor = Color(0xFF1F1F23))
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Add Connection", tint = Color.White)
                    }
                }

                ContinuityHostCard(
                    state = hostState,
                    onPair = viewModel::pairContinuityHost,
                    onTest = viewModel::testContinuityHost,
                    onForget = viewModel::forgetContinuityHost,
                    engineId = continuityEngineId,
                    engines = continuityEngines,
                    onEngineSelected = viewModel::selectContinuityEngine
                )

                Spacer(Modifier.height(20.dp))

                Text(
                    text = "API CONNECTIONS",
                    color = Color.Gray,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 8.dp)
                )

                if (connections.isEmpty()) {
                    Box(
                        modifier = Modifier.height(100.dp).fillMaxWidth(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("No provider connections saved.", color = Color.Gray, fontSize = 14.sp)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(connections) { conn ->
                            ConnectionItem(
                                connection = conn,
                                onClick = { if (conn.provider != RoleplayProtocol.PROVIDER) editingConn = conn },
                                onDelete = { pendingDelete = conn },
                                onTest = { viewModel.testConnection(conn.id) },
                                onRefresh = { viewModel.refreshModelCache(conn.id) },
                                managed = conn.provider == RoleplayProtocol.PROVIDER
                            )
                        }
                    }
                }

            }
        }
        pendingDelete?.let { connection ->
            AlertDialog(
                onDismissRequest = { pendingDelete = null },
                title = { Text("Delete connection?") },
                text = { Text("The connection can be deleted only when no thread uses it.") },
                confirmButton = {
                    TextButton(onClick = {
                        viewModel.deleteConnection(connection)
                        pendingDelete = null
                    }) { Text("Delete") }
                },
                dismissButton = {
                    TextButton(onClick = { pendingDelete = null }) { Text("Cancel") }
                }
            )
        }
    }
}

@Composable
private fun ContinuityHostCard(
    state: ContinuityHostState,
    onPair: (String, String) -> Unit,
    onTest: () -> Unit,
    onForget: () -> Unit,
    engineId: String?,
    engines: ContinuityEngineAvailability,
    onEngineSelected: (String) -> Unit
) {
    var endpoint by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("MAC HOST", color = Color(0xFF00FBFB), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text(
                when (state) {
                    ContinuityHostState.Unpaired -> "Not paired"
                    ContinuityHostState.Checking -> "Checking your Mac…"
                    is ContinuityHostState.Available -> "Available — continuity and Antigravity replies can run"
                    is ContinuityHostState.Unavailable -> "Unavailable — chat will stay locked at a checkpoint"
                    is ContinuityHostState.Incompatible -> "App and host versions do not match"
                },
                color = when (state) {
                    is ContinuityHostState.Available -> Color(0xFF7EE2A8)
                    else -> Color(0xFFFFC2D5)
                },
                fontSize = 14.sp
            )
            if (state is ContinuityHostState.Unpaired) {
                OutlinedTextField(
                    value = endpoint,
                    onValueChange = { endpoint = it },
                    label = { Text("Mac address") },
                    placeholder = { Text("https://your-mac.tailnet.ts.net") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it },
                    label = { Text("Pairing code") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    onClick = { onPair(endpoint, code) },
                    enabled = endpoint.isNotBlank() && code.isNotBlank()
                ) { Text("Pair with Mac") }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onTest) { Text("Check now") }
                    TextButton(onClick = onForget) { Text("Remove pairing") }
                }
            }
            Text("CONTINUITY ENGINE", color = Color.Gray, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                ContinuityHostPreferences.CONTINUITY_ENGINES.forEach { engine ->
                    val blockedReason = engines.unavailableReason(engine.id)
                    val selectable = engines.isSelectable(engine.id)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = selectable) { onEngineSelected(engine.id) },
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = engineId == engine.id,
                            enabled = selectable,
                            onClick = { onEngineSelected(engine.id) }
                        )
                        Column {
                            Text(
                                engine.label,
                                color = if (selectable) Color.White else Color.Gray,
                                fontSize = 13.sp
                            )
                            Text(
                                blockedReason ?: engine.hint,
                                color = if (blockedReason == null) Color.Gray else Color(0xFFFFC857),
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }
    }
}


@Composable
fun ConnectionItem(
    connection: ConnectionEntity,
    onClick: () -> Unit,
    onDelete: () -> Unit,
    onTest: () -> Unit,
    onRefresh: () -> Unit,
    managed: Boolean = false
) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .padding(14.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = connection.label,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    val badgeColor = when (connection.health_status) {
                        "healthy" -> Color(0xFF00FBFB)
                        "failed" -> Color(0xFFC40060)
                        else -> Color.Gray
                    }
                    Box(
                        modifier = Modifier
                            .background(
                                color = badgeColor.copy(alpha = 0.15f),
                                shape = RoundedCornerShape(4.dp)
                            )
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "● " + connection.health_status.uppercase(),
                            color = badgeColor,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Provider: ${connection.provider} | Models: ${connection.model_cache.size}",
                    color = Color.Gray,
                    fontSize = 12.sp
                )
                if (connection.health_status == "failed" && connection.health_message.isNotEmpty()) {
                    Text(
                        text = connection.health_message,
                        color = Color(0xFFC40060),
                        fontSize = 11.sp,
                        maxLines = 1
                    )
                }

                // Cached model pills + refresh time (web parity): shows WHAT is available,
                // not just a count — makes an empty vs populated cache diagnosable at a glance.
                if (connection.model_cache.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        connection.model_cache.take(8).forEach { m ->
                            Text(
                                text = m.id,
                                color = Color(0xFFCFC2D7),
                                fontSize = 10.sp,
                                maxLines = 1,
                                modifier = Modifier
                                    .background(Color(0xFF2A292E), RoundedCornerShape(6.dp))
                                    .padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                        if (connection.model_cache.size > 8) {
                            Text(
                                text = "+${connection.model_cache.size - 8} more",
                                color = Color(0xFF7A7580),
                                fontSize = 10.sp,
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 3.dp)
                            )
                        }
                    }
                }
                connection.last_model_refresh_at?.substringBefore("T")?.takeIf { it.isNotEmpty() }?.let { refreshed ->
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Models refreshed $refreshed", color = Color(0xFF6B6675), fontSize = 10.sp)
                }
            }

            IconButton(onClick = onTest) {
                Icon(Icons.Default.Bolt, contentDescription = "Test connection", tint = Color(0xFF00FBFB))
            }

            if (!managed) {
                IconButton(onClick = onRefresh) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh models", tint = Color.Gray)
                }
                IconButton(onClick = onDelete) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color.Gray)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectionEditor(
    connection: ConnectionEntity?,
    onDismiss: () -> Unit,
    onSave: (
        id: String?,
        provider: String,
        label: String,
        baseUrl: String?,
        apiKey: String?,
        enabled: Boolean,
        defaultModel: String?
    ) -> Unit
) {
    val providers = listOf("google", "groq", "mistral", "openrouter", "ollama", "deepseek")
    var provider by remember { mutableStateOf(connection?.provider ?: "google") }
    var label by remember { mutableStateOf(connection?.label ?: "") }
    var baseUrl by remember { mutableStateOf(connection?.base_url ?: "") }
    var apiKey by remember { mutableStateOf("") }
    var defaultModel by remember { mutableStateOf(connection?.default_model_id ?: "") }
    var enabled by remember { mutableStateOf(connection?.enabled ?: true) }

    var providerExpanded by remember { mutableStateOf(false) }

    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (connection == null) "New Connection" else "Edit Connection", color = Color.White) },
                navigationIcon = {
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF131317))
            )
        },
        containerColor = Color(0xFF131317)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Provider select dropdown
            ExposedDropdownMenuBox(
                expanded = providerExpanded,
                onExpandedChange = { providerExpanded = it }
            ) {
                OutlinedTextField(
                    value = provider,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("API Provider") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = providerExpanded) },
                    shape = RoundedCornerShape(8.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedContainerColor = Color(0xFF1F1F23),
                        unfocusedContainerColor = Color(0xFF1F1F23),
                        focusedBorderColor = Color(0xFF00FBFB),
                        unfocusedBorderColor = Color(0xFF4C4354)
                    ),
                    modifier = Modifier.menuAnchor().fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = providerExpanded,
                    onDismissRequest = { providerExpanded = false },
                    modifier = Modifier.background(Color(0xFF1B1B1F))
                ) {
                    providers.forEach { p ->
                        DropdownMenuItem(
                            text = { Text(p, color = Color.White) },
                            onClick = {
                                provider = p
                                if (label.isEmpty()) label = p.replaceFirstChar { it.uppercase() }
                                providerExpanded = false
                            }
                        )
                    }
                }
            }

            val textFieldColors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedContainerColor = Color(0xFF1F1F23),
                unfocusedContainerColor = Color(0xFF1F1F23),
                focusedBorderColor = Color(0xFF00FBFB),
                unfocusedBorderColor = Color(0xFF4C4354),
                cursorColor = Color(0xFF00FBFB)
            )

            OutlinedTextField(
                value = label,
                onValueChange = { label = it },
                label = { Text("Connection Label (e.g. My Google)") },
                shape = RoundedCornerShape(8.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = baseUrl,
                onValueChange = { baseUrl = it },
                label = { Text("Base URL (optional for standard providers)") },
                placeholder = {
                    Text(
                        when (provider) {
                            "ollama" -> "http://10.0.2.2:11434" // Emulator host IP
                            else -> "default"
                        }
                    )
                },
                shape = RoundedCornerShape(8.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            val apiKeyError = remember(provider, apiKey) { SettingsViewModel.validateApiKeyFormat(provider, apiKey) }

            OutlinedTextField(
                value = apiKey,
                onValueChange = { apiKey = it },
                label = { Text(if (connection == null) "API Key" else "API Key (leave blank to keep existing)") },
                visualTransformation = PasswordVisualTransformation(),
                shape = RoundedCornerShape(8.dp),
                colors = textFieldColors,
                isError = apiKeyError != null,
                modifier = Modifier.fillMaxWidth()
            )

            if (apiKeyError != null) {
                Text(
                    text = apiKeyError,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(start = 4.dp, top = 2.dp)
                )
            }

            OutlinedTextField(
                value = defaultModel,
                onValueChange = { defaultModel = it },
                label = { Text("Default Model ID (optional)") },
                placeholder = {
                    Text(
                        when (provider) {
                            "google" -> "gemini-2.5-flash"
                            "deepseek" -> "deepseek-chat"
                            else -> "e.g. llama3"
                        }
                    )
                },
                shape = RoundedCornerShape(8.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().clickable { enabled = !enabled }
            ) {
                Checkbox(checked = enabled, onCheckedChange = { enabled = it })
                Spacer(modifier = Modifier.width(8.dp))
                Text("Connection Enabled", color = Color.White)
            }

            val gradient = Brush.horizontalGradient(listOf(Color(0xFF8A2BE2), Color(0xFF00FBFB)))
            Button(
                onClick = {
                    onSave(
                        connection?.id, provider, label.trim(),
                        baseUrl.trim().ifEmpty { null },
                        apiKey.ifEmpty { null },
                        enabled,
                        defaultModel.trim().ifEmpty { null }
                    )
                },
                enabled = label.isNotBlank() && apiKeyError == null,
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, disabledContainerColor = Color.Transparent),
                contentPadding = PaddingValues(),
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        brush = if (label.isNotBlank() && apiKeyError == null) gradient else Brush.linearGradient(listOf(Color.Gray, Color.Gray)),
                        shape = RoundedCornerShape(8.dp)
                    )
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("Save Provider", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
