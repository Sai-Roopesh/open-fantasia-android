package com.example.open_fantasia.ui.dashboard

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.open_fantasia.data.continuity.RoleplayProtocol
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import com.example.open_fantasia.theme.SpaceGrotesk
import com.example.open_fantasia.theme.Sora
import com.example.open_fantasia.theme.Inter
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    onThreadSelected: (String) -> Unit,
    onNavigateToTab: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val items by viewModel.dashboardItems.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val connections by viewModel.connections.collectAsState()
    val onboardingState by viewModel.onboardingState.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val statusFilter by viewModel.statusFilter.collectAsState()

    var showCreateDialog by remember { mutableStateOf(false) }
    var threadToRename by remember { mutableStateOf<ThreadDashboardItem?>(null) }
    var threadToDelete by remember { mutableStateOf<ThreadDashboardItem?>(null) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F13)) // Deep dark premium background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp)
        ) {
            Spacer(modifier = Modifier.height(16.dp))
            
            // Header with vibrant gradient
            Text(
                text = "Open Fantasia",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = Sora,
                style = MaterialTheme.typography.headlineMedium.copy(
                    brush = Brush.horizontalGradient(
                        colors = listOf(Color(0xFFDCB8FF), Color(0xFF00FBFB)) // Violet to Cyan glow
                    )
                ),
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // Onboarding checklist if not complete
            if (!onboardingState.isCompleted) {
                ReadinessChecklistCard(
                    state = onboardingState,
                    onCtaClick = { route ->
                        if (route == "create_thread") {
                            showCreateDialog = true
                        } else {
                            onNavigateToTab(route)
                        }
                    }
                )
                Spacer(modifier = Modifier.height(16.dp))
            }

            // Search Bar & Filter Tabs Row
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { viewModel.setSearchQuery(it) },
                placeholder = { Text("Search threads...", color = Color.Gray) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search", tint = Color.Gray) },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { viewModel.setSearchQuery("") }) {
                            Icon(Icons.Default.Close, contentDescription = "Clear search", tint = Color.Gray)
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color(0xFF8A2BE2),
                    unfocusedBorderColor = Color(0xFF2C2C35),
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedContainerColor = Color(0xFF131317),
                    unfocusedContainerColor = Color(0xFF131317)
                ),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Segment Tabs (Active vs Archived)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF131317))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                listOf("active" to "Active", "archived" to "Archived").forEach { (status, label) ->
                    val isSelected = statusFilter == status
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (isSelected) Color(0xFF1F1F23) else Color.Transparent)
                            .clickable { viewModel.setStatusFilter(status) }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = label,
                            color = if (isSelected) Color.White else Color.Gray,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            fontFamily = SpaceGrotesk,
                            fontSize = 13.sp
                        )
                    }
                }
            }

            // Thread count context (web parity: surface how many conversations are shown)
            if (items.isNotEmpty()) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "${items.size} ${if (items.size == 1) "conversation" else "conversations"}" +
                        if (searchQuery.isNotEmpty()) " matching" else "",
                    color = Color.Gray,
                    fontSize = 12.sp,
                    fontFamily = Inter,
                    modifier = Modifier.padding(start = 2.dp)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Thread List or Empty States
            if (items.isEmpty()) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
                        Text(
                            text = if (searchQuery.isNotEmpty()) "No matching threads found." else "No threads found.",
                            color = Color.Gray,
                            fontSize = 16.sp,
                            fontFamily = Sora,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = if (statusFilter == "active") "Tap the + button to start a new roleplay adventure." else "No archived conversations.",
                            color = Color.DarkGray,
                            fontSize = 13.sp,
                            fontFamily = Inter,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(bottom = 80.dp) // padding for floating action button
                ) {
                    items(items, key = { it.thread.id }) { item ->
                        ThreadItem(
                            item = item,
                            onClick = { onThreadSelected(item.thread.id) },
                            onPinToggle = { viewModel.togglePin(item.thread.id) },
                            onArchiveToggle = { viewModel.toggleArchive(item.thread.id) },
                            onRenameClick = { threadToRename = item },
                            onDeleteClick = { threadToDelete = item }
                        )
                    }
                }
            }
        }

        // Floating Action Button
        FloatingActionButton(
            onClick = { showCreateDialog = true },
            containerColor = Color(0xFF8A2BE2),
            contentColor = Color.White,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(24.dp),
            shape = RoundedCornerShape(16.dp)
        ) {
            Icon(Icons.Default.Add, contentDescription = "Create Story")
        }

        if (showCreateDialog) {
            CreateThreadDialog(
                characters = characters,
                connections = connections,
                onDismiss = { showCreateDialog = false },
                onCreate = { charId, connId, modelId, title ->
                    viewModel.createThread(charId, connId, modelId, title) { threadId ->
                        showCreateDialog = false
                        onThreadSelected(threadId)
                    }
                },
                onRedirect = onNavigateToTab
            )
        }

        // Rename Dialog
        threadToRename?.let { item ->
            var newTitle by remember { mutableStateOf(item.thread.title) }
            AlertDialog(
                onDismissRequest = { threadToRename = null },
                title = { Text("Rename Thread", color = Color.White, fontFamily = Sora) },
                containerColor = Color(0xFF16161C),
                confirmButton = {
                    Button(
                        onClick = {
                            viewModel.renameThread(item.thread.id, newTitle.trim())
                            threadToRename = null
                        },
                        enabled = newTitle.isNotBlank(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8A2BE2))
                    ) {
                        Text("Rename")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { threadToRename = null }) {
                        Text("Cancel", color = Color.Gray)
                    }
                },
                text = {
                    OutlinedTextField(
                        value = newTitle,
                        onValueChange = { newTitle = it },
                        label = { Text("Title") },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color(0xFF8A2BE2),
                            unfocusedBorderColor = Color.Gray,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            )
        }

        // Delete Confirmation Dialog
        threadToDelete?.let { item ->
            AlertDialog(
                onDismissRequest = { threadToDelete = null },
                title = { Text("Delete Thread", color = Color.White, fontFamily = Sora) },
                containerColor = Color(0xFF16161C),
                confirmButton = {
                    Button(
                        onClick = {
                            viewModel.deleteThread(item.thread.id)
                            threadToDelete = null
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Red)
                    ) {
                        Text("Delete", color = Color.White)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { threadToDelete = null }) {
                        Text("Cancel", color = Color.Gray)
                    }
                },
                text = {
                    Text(
                        "Are you sure you want to permanently delete \"${item.thread.title}\"? This will purge all turns, snapshots, timeline events, and pins.",
                        color = Color.White,
                        fontFamily = Inter,
                        fontSize = 14.sp
                    )
                }
            )
        }
    }
}

@Composable
fun ReadinessChecklistCard(
    state: OnboardingState,
    onCtaClick: (String) -> Unit
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF16161C)),
        border = BorderStroke(1.dp, Color(0xFF2C2C35)),
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                drawLine(
                    color = Color(0xFF8A2BE2), // Premium left border glow
                    start = Offset(0f, 0f),
                    end = Offset(0f, size.height),
                    strokeWidth = 4.dp.toPx()
                )
            }
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Workspace Readiness",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontFamily = Sora,
                    fontSize = 15.sp
                )
                Text(
                    text = "${(state.progress * 100).toInt()}% Complete",
                    color = Color(0xFF00FBFB),
                    fontWeight = FontWeight.Bold,
                    fontFamily = SpaceGrotesk,
                    fontSize = 13.sp
                )
            }

            LinearProgressIndicator(
                progress = { state.progress },
                color = Color(0xFF8A2BE2),
                trackColor = Color(0xFF2C2C35),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(CircleShape)
            )

            // Step items
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                state.steps.forEach { step ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(18.dp)
                                .clip(CircleShape)
                                .background(if (step.isCompleted) Color(0xFF8A2BE2) else Color(0xFF2A292E))
                                .border(1.dp, if (step.isCompleted) Color.Transparent else Color.Gray, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            if (step.isCompleted) {
                                Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
                            }
                        }
                        Text(
                            text = step.title,
                            color = if (step.isCompleted) Color.Gray else Color(0xFFE4E1E7),
                            fontSize = 12.sp,
                            fontFamily = Inter,
                            fontWeight = if (step.isCompleted) FontWeight.Normal else FontWeight.Medium
                        )
                    }
                }
            }

            // Next step CTA Button
            val nextIncomplete = state.steps.find { !it.isCompleted }
            if (nextIncomplete != null) {
                Button(
                    onClick = { onCtaClick(nextIncomplete.ctaRoute) },
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8A2BE2)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Setup: ${nextIncomplete.title}",
                        fontFamily = SpaceGrotesk,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
            }
        }
    }
}

@Composable
fun ThreadItem(
    item: ThreadDashboardItem,
    onClick: () -> Unit,
    onPinToggle: () -> Unit,
    onArchiveToggle: () -> Unit,
    onRenameClick: () -> Unit,
    onDeleteClick: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onClick() },
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Portrait
                // Resolve file existence off the recomposition hot path: keyed by path so the
                // blocking exists() check runs once per item, not on every recomposition/scroll.
                val portraitPath = item.character?.portrait_path
                val portraitFile = remember(portraitPath) {
                    portraitPath?.let { File(it) }?.takeIf { it.exists() }
                }
                if (portraitFile != null) {
                    AsyncImage(
                        model = portraitFile,
                        contentDescription = item.character?.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(12.dp))
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFF2C2C35)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = item.character?.name?.take(1) ?: "?",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.width(14.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = item.thread.title,
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        if (item.thread.pinned_at != null) {
                            Icon(
                                imageVector = Icons.Default.Favorite,
                                contentDescription = "Pinned",
                                tint = Color(0xFF8A2BE2),
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = item.character?.name ?: "Unknown Character",
                        color = Color(0xFF00FBFB),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = SpaceGrotesk
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    val timeText = remember(item.thread.updated_at) {
                        try {
                            val instant = java.time.Instant.parse(item.thread.updated_at)
                            val formatter = java.time.format.DateTimeFormatter.ofPattern("MMM dd, yyyy HH:mm")
                                .withZone(java.time.ZoneId.systemDefault())
                            formatter.format(instant)
                        } catch (e: Exception) {
                            item.thread.updated_at
                        }
                    }
                    Text(
                        text = timeText,
                        color = Color.Gray,
                        fontSize = 11.sp,
                        fontFamily = Inter
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = Color(0xFF2A292E), thickness = 0.8.dp)
            Spacer(modifier = Modifier.height(6.dp))

            // Action Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onPinToggle) {
                    Icon(
                        imageVector = if (item.thread.pinned_at != null) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                        contentDescription = "Pin Thread",
                        tint = if (item.thread.pinned_at != null) Color(0xFF8A2BE2) else Color.LightGray,
                        modifier = Modifier.size(18.dp)
                    )
                }
                IconButton(onClick = onArchiveToggle) {
                    Icon(
                        imageVector = Icons.Default.Star,
                        contentDescription = if (item.thread.status == "archived") "Unarchive Thread" else "Archive Thread",
                        tint = if (item.thread.status == "archived") Color(0xFF00FBFB) else Color.LightGray,
                        modifier = Modifier.size(18.dp)
                    )
                }
                IconButton(onClick = onRenameClick) {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = "Rename Thread",
                        tint = Color.LightGray,
                        modifier = Modifier.size(18.dp)
                    )
                }
                IconButton(onClick = onDeleteClick) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Delete Thread",
                        tint = Color.Gray,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateThreadDialog(
    characters: List<CharacterEntity>,
    connections: List<ConnectionEntity>,
    onDismiss: () -> Unit,
    onCreate: (String, String, String, String) -> Unit,
    onRedirect: (String) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var selectedChar by remember { mutableStateOf<CharacterEntity?>(null) }
    var selectedConn by remember { mutableStateOf<ConnectionEntity?>(null) }
    var selectedModel by remember { mutableStateOf("") }

    var charExpanded by remember { mutableStateOf(false) }
    var connExpanded by remember { mutableStateOf(false) }
    var modelExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(characters, connections) {
        if (selectedChar == null && characters.isNotEmpty()) selectedChar = characters.first()
        if (selectedConn == null && connections.isNotEmpty()) {
            selectedConn = connections.first()
            selectedModel = connections.first().default_model_id ?: ""
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Start New Conversation", color = Color.White, fontFamily = Sora) },
        containerColor = Color(0xFF16161C),
        confirmButton = {
            if (characters.isNotEmpty() && connections.isNotEmpty()) {
                Button(
                    onClick = {
                        val charId = selectedChar?.id ?: return@Button
                        val connId = selectedConn?.id ?: return@Button
                        onCreate(charId, connId, selectedModel, title)
                    },
                    enabled = selectedChar != null && selectedConn != null &&
                        (selectedConn?.provider == RoleplayProtocol.PROVIDER || selectedModel.isNotBlank()),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8A2BE2))
                ) {
                    Text("Start")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Color.Gray)
            }
        },
        text = {
            if (characters.isEmpty() || connections.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "Setup Required",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontFamily = Sora,
                        fontSize = 16.sp
                    )
                    Text(
                        text = "You need at least one configured API connection and one character sheet to start a thread.",
                        color = Color.Gray,
                        fontSize = 13.sp,
                        fontFamily = Inter,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    if (connections.isEmpty()) {
                        Button(
                            onClick = {
                                onDismiss()
                                onRedirect("settings")
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8A2BE2)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Configure API Provider")
                        }
                    }
                    if (characters.isEmpty()) {
                        Button(
                            onClick = {
                                onDismiss()
                                onRedirect("characters")
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00FBFB)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Create Character Sheet", color = Color.Black)
                        }
                    }
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    OutlinedTextField(
                        value = title,
                        onValueChange = { title = it },
                        label = { Text("Title") },
                        placeholder = { Text("e.g. Whispering Woods") },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color(0xFF8A2BE2),
                            unfocusedBorderColor = Color.Gray,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    // Character Dropdown
                    ExposedDropdownMenuBox(
                        expanded = charExpanded,
                        onExpandedChange = { charExpanded = it }
                    ) {
                        OutlinedTextField(
                            value = selectedChar?.name ?: "Select Character",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Character") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = charExpanded) },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color(0xFF8A2BE2),
                                unfocusedBorderColor = Color.Gray,
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White
                            ),
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth()
                        )
                        ExposedDropdownMenu(
                            expanded = charExpanded,
                            onDismissRequest = { charExpanded = false },
                            modifier = Modifier.background(Color(0xFF1E1E24))
                        ) {
                            characters.forEach { char ->
                                DropdownMenuItem(
                                    text = { Text(char.name, color = Color.White) },
                                    onClick = {
                                        selectedChar = char
                                        charExpanded = false
                                    }
                                )
                            }
                        }
                    }

                    // Provider Connection Dropdown
                    ExposedDropdownMenuBox(
                        expanded = connExpanded,
                        onExpandedChange = { connExpanded = it }
                    ) {
                        OutlinedTextField(
                            value = selectedConn?.label ?: "Select Connection",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Roleplay connection") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = connExpanded) },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color(0xFF8A2BE2),
                                unfocusedBorderColor = Color.Gray,
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White
                            ),
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth()
                        )
                        ExposedDropdownMenu(
                            expanded = connExpanded,
                            onDismissRequest = { connExpanded = false },
                            modifier = Modifier.background(Color(0xFF1E1E24))
                        ) {
                            connections.forEach { conn ->
                                DropdownMenuItem(
                                    text = { Text(conn.label, color = Color.White) },
                                    onClick = {
                                        selectedConn = conn
                                        selectedModel = conn.default_model_id ?: ""
                                        connExpanded = false
                                    }
                                )
                            }
                        }
                    }

                    // Model Selection Dropdown
                    val models = selectedConn?.model_cache ?: emptyList()
                    if (models.isNotEmpty()) {
                        ExposedDropdownMenuBox(
                            expanded = modelExpanded,
                            onExpandedChange = { modelExpanded = it }
                        ) {
                            OutlinedTextField(
                                value = models.find { it.id == selectedModel }?.name
                                    ?: selectedModel.ifEmpty { "Select Model" },
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Model") },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = modelExpanded) },
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Color(0xFF8A2BE2),
                                    unfocusedBorderColor = Color.Gray,
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White
                                ),
                                modifier = Modifier
                                    .menuAnchor()
                                    .fillMaxWidth()
                            )
                            ExposedDropdownMenu(
                                expanded = modelExpanded,
                                onDismissRequest = { modelExpanded = false },
                                modifier = Modifier.background(Color(0xFF1E1E24))
                            ) {
                                models.forEach { model ->
                                    DropdownMenuItem(
                                        text = {
                                            Column {
                                                Text(model.name, color = Color.White)
                                                model.hint?.let { hint ->
                                                    Text(hint, color = Color(0xFFB8B8C6), fontSize = 11.sp)
                                                }
                                            }
                                        },
                                        onClick = {
                                            selectedModel = model.id
                                            modelExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                    if (selectedConn?.provider == RoleplayProtocol.PROVIDER) {
                        Text(
                            "Mac-hosted models receive the same complete prompt, Continuity Snapshot, and transcript. CLI models do not expose every sampler control.",
                            color = Color(0xFFB8B8C6),
                            fontSize = 12.sp
                        )
                    }

                }
            }
        }
    )
}
