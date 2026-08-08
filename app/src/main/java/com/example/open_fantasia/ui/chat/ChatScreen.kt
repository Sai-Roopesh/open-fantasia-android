package com.example.open_fantasia.ui.chat

import android.content.Context
import android.widget.Toast
import kotlinx.coroutines.launch
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.animation.core.*
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import com.example.open_fantasia.theme.Inter
import com.example.open_fantasia.theme.Sora
import com.example.open_fantasia.theme.SpaceGrotesk
import com.example.open_fantasia.data.local.entity.BranchEntity
import com.example.open_fantasia.data.local.entity.ConnectionEntity
import com.example.open_fantasia.data.local.entity.PersonaEntity
import com.example.open_fantasia.data.local.entity.ThreadEntity
import com.example.open_fantasia.data.local.entity.TurnEntity
import com.example.open_fantasia.data.local.entity.PinEntity
import com.example.open_fantasia.data.local.entity.TimelineEntity
import com.example.open_fantasia.data.continuity.ContinuityHostState
import com.example.open_fantasia.data.continuity.RoleplayProtocol
import com.example.open_fantasia.domain.model.CAST_FORMAT
import com.example.open_fantasia.domain.model.CAST_VERSION
import com.example.open_fantasia.domain.model.CastDocument
import com.example.open_fantasia.domain.model.CastProfile
import com.example.open_fantasia.domain.model.DurableMemorySnapshot
import com.example.open_fantasia.domain.portability.PortableJsonCodec
import com.example.open_fantasia.ui.components.PortableKind
import com.example.open_fantasia.ui.components.PromptPackPanel
import com.example.open_fantasia.domain.model.RelationalState
import com.example.open_fantasia.ui.components.MarkdownText
import kotlin.math.roundToInt
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    viewModel: ChatViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()

    when (val state = uiState) {
        ChatUiState.Loading -> {
            Box(modifier = modifier.fillMaxSize().background(Color(0xFF0F0F13)), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color(0xFF8A2BE2))
            }
        }
        ChatUiState.Error -> {
            Box(modifier = modifier.fillMaxSize().background(Color(0xFF0F0F13)), contentAlignment = Alignment.Center) {
                Text("Error loading chat workspace.", color = Color.Red)
            }
        }
        is ChatUiState.Success -> {
            ChatWorkspace(
                state = state,
                viewModel = viewModel,
                onBack = onBack,
                modifier = modifier
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatWorkspace(
    state: ChatUiState.Success,
    viewModel: ChatViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current

    var showBranchSelector by remember { mutableStateOf(false) }
    var showThreadSettings by remember { mutableStateOf(false) }
    var showSpeakerPicker by remember { mutableStateOf(false) }
    var showCastManager by remember { mutableStateOf(false) }
    var showBranchCreateDialog by remember { mutableStateOf(false) }
    var branchForkTurnId by remember { mutableStateOf<String?>(null) }

    var editingTurnId by remember { mutableStateOf<String?>(null) }
    var editingTextVal by remember { mutableStateOf("") }

    var editingAssistantTurnId by remember { mutableStateOf<String?>(null) }
    var editingAssistantText by remember { mutableStateOf("") }

    var pinTurnTarget by remember { mutableStateOf<TurnEntity?>(null) }
    var focusMode by remember { mutableStateOf(false) }

    var steerTurnGuidance by remember { mutableStateOf<TurnEntity?>(null) }
    var menuExpanded by remember { mutableStateOf(false) }

    // Surface the Deep Scan result (success/failure) as a toast. Previously the scan failed silently.
    val scanEvent by viewModel.scanEvent.collectAsState()
    LaunchedEffect(scanEvent) {
        scanEvent?.let {
            Toast.makeText(context, it, Toast.LENGTH_LONG).show()
            viewModel.consumeScanEvent()
        }
    }
    LaunchedEffect(state.activeBranch.id, state.activeBranch.active_speaker_id, state.activeBranch.speaker_mode, state.castRoster) {
        viewModel.ensureActiveSpeakerPortrait()
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        // Inspector is button-triggered (web parity). Only allow swipe-to-close when
        // already open — never a content-wide open-gesture that swallows taps/scrolls.
        gesturesEnabled = drawerState.isOpen,
        drawerContent = {
            ModalDrawerSheet(
                drawerContainerColor = Color(0xFF131317),
                modifier = Modifier.width(320.dp)
            ) {
                CognitiveStateInspector(
                    snapshot = state.currentSnapshot,
                    pins = state.pins,
                    turns = state.turns,
                    timelineEvents = state.timelineEvents,
                    activeBranch = state.activeBranch,
                    branches = state.branches,
                    isScanning = state.isScanning,
                    onRemovePin = { pinId -> viewModel.removePin(pinId) },
                    onSwitchBranch = { branchId -> viewModel.switchBranch(branchId) },
                    onTriggerDeepScan = { viewModel.runDeepScan() },
                    onClose = { scope.launch { drawerState.close() } }
                )
            }
        }
    ) {
        val castPortrait = if (state.activeBranch.speaker_mode == "single") {
            state.castPortraits.firstOrNull {
                it.cast_id == state.activeBranch.active_speaker_id && it.status == "ready"
            }?.portrait_path
        } else null
        val backgroundPath = if (state.thread.portrait_background_enabled) {
            castPortrait?.takeIf { File(it).exists() }
                ?: state.character.portrait_path?.takeIf { File(it).exists() }
        } else null

        Box(modifier = Modifier.fillMaxSize().background(Color(0xFF0F0F13))) {
            backgroundPath?.let { path ->
                AsyncImage(
                    model = File(path),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize().blur(2.dp)
                )
                Box(
                    Modifier.fillMaxSize().background(
                        Brush.verticalGradient(
                            listOf(
                                Color.Black.copy(alpha = (state.thread.portrait_background_dimness + 0.10f).coerceAtMost(0.9f)),
                                Color.Black.copy(alpha = state.thread.portrait_background_dimness),
                                Color.Black.copy(alpha = (state.thread.portrait_background_dimness + 0.16f).coerceAtMost(0.92f))
                            )
                        )
                    )
                )
            }
            Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                Box(
                                    Modifier.size(8.dp).clip(CircleShape).background(
                                        if (state.continuityHostState is ContinuityHostState.Available) Color(0xFF57D68D)
                                        else Color(0xFFFF7AA8)
                                    )
                                )
                                Text(state.thread.title, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold, fontFamily = Sora)
                            }
                            Row(
                                modifier = Modifier.clickable { showBranchSelector = true },
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Branch: ${state.activeBranch.name}", color = Color(0xFF00FBFB), fontSize = 12.sp, fontFamily = SpaceGrotesk)
                                Icon(Icons.Default.ArrowDropDown, contentDescription = "Switch Branch", tint = Color(0xFF00FBFB), modifier = Modifier.size(16.dp))
                            }
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                        }
                    },
                    actions = {
                        IconButton(onClick = { focusMode = !focusMode }) {
                            Icon(
                                imageVector = if (focusMode) Icons.Default.FullscreenExit else Icons.Default.Fullscreen,
                                contentDescription = "Focus mode",
                                tint = if (focusMode) Color(0xFFDCB8FF) else Color.White
                            )
                        }
                        IconButton(onClick = {
                            scope.launch {
                                if (drawerState.isClosed) drawerState.open() else drawerState.close()
                            }
                        }) {
                            Icon(Icons.Default.Info, contentDescription = "Inspector", tint = Color.White)
                        }
                        IconButton(onClick = { menuExpanded = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "More options", tint = Color.White)
                        }
                        DropdownMenu(
                            expanded = menuExpanded,
                            onDismissRequest = { menuExpanded = false },
                            modifier = Modifier.background(Color(0xFF1B1B1F))
                        ) {
                            DropdownMenuItem(
                                text = { Text("Copy Transcript", color = Color.White, fontFamily = SpaceGrotesk) },
                                onClick = {
                                    menuExpanded = false
                                    val transcript = state.turns
                                        .filter { !it.user_input_hidden && !it.starter_seed }
                                        .joinToString("\n\n") { turn ->
                                            "User: ${turn.user_input_text}\n${state.character.name}: ${turn.assistant_output_text ?: ""}"
                                        }
                                    clipboardManager.setText(AnnotatedString(transcript))
                                    Toast.makeText(context, "Transcript copied to clipboard!", Toast.LENGTH_SHORT).show()
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Thread Settings", color = Color.White, fontFamily = SpaceGrotesk) },
                                onClick = {
                                    menuExpanded = false
                                    showThreadSettings = true
                                }
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xC7131317))
                )
            },
            containerColor = Color.Transparent
        ) { paddingValues ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    val listState = rememberLazyListState()
                    LaunchedEffect(state.turns.size, state.isGenerating) {
                        if (state.turns.isNotEmpty()) {
                            listState.animateScrollToItem(state.turns.size - 1)
                        }
                    }

                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        if (state.turns.isEmpty()) {
                            item {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 32.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(16.dp)
                                ) {
                                    Text(
                                        text = "Choose a starter prompt to begin:",
                                        color = Color.Gray,
                                        fontSize = 14.sp,
                                        fontFamily = Sora,
                                        fontWeight = FontWeight.Medium
                                    )
                                    val starterPrompts = state.character.starters.ifEmpty {
                                        listOf(
                                            "Open on a moment of tension between us.",
                                            "Drop us into a new setting, mid-scene.",
                                            "Say the thing you've been holding back."
                                        )
                                    }
                                    starterPrompts.forEach { starter ->
                                        Card(
                                            onClick = { viewModel.sendUserMessage(starter) },
                                            shape = RoundedCornerShape(12.dp),
                                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
                                            border = BorderStroke(1.dp, Color(0xFF2A292E)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(14.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.PlayArrow,
                                                    contentDescription = null,
                                                    tint = Color(0xFF00FBFB),
                                                    modifier = Modifier.size(20.dp)
                                                )
                                                Text(
                                                    text = starter,
                                                    color = Color.White,
                                                    fontFamily = Inter,
                                                    fontSize = 13.sp,
                                                    lineHeight = 18.sp,
                                                    modifier = Modifier.weight(1f)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            val headTurnId = state.turns.lastOrNull()?.id
                            items(state.turns, key = { it.id }) { turn ->
                                val isHead = turn.id == headTurnId
                                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                    if (!turn.user_input_hidden && turn.user_input_text.isNotBlank()) {
                                        UserMessageRow(
                                            turn = turn,
                                            isHead = isHead,
                                            onEdit = {
                                                editingTurnId = turn.id
                                                editingTextVal = turn.user_input_text
                                            },
                                            onCopy = { value ->
                                                clipboardManager.setText(AnnotatedString(value))
                                                Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
                                            },
                                            focusMode = focusMode
                                        )
                                    }
                                    if (turn.generation_status == "committed" || turn.generation_status == "failed") {
                                        AssistantMessageRow(
                                            turn = turn,
                                            characterName = turn.requested_speaker_name ?: state.character.name,
                                            isPinned = state.pins.any { it.turn_id == turn.id },
                                            isHead = isHead,
                                            onEditReply = {
                                                editingAssistantTurnId = turn.id
                                                editingAssistantText = turn.assistant_output_text ?: ""
                                            },
                                            onRegenerate = { steerTurnGuidance = turn },
                                            onBranch = {
                                                branchForkTurnId = turn.id
                                                showBranchCreateDialog = true
                                            },
                                            onRewind = {
                                                if (turn.generation_status == "committed") viewModel.rewindToTurn(turn.id)
                                                else viewModel.discardPendingReply(turn.id)
                                            },
                                            onPinToggle = { pinTurnTarget = turn },
                                            onRate = { rating -> viewModel.setFeedbackRating(turn.id, rating) },
                                            onCopy = { value ->
                                                clipboardManager.setText(AnnotatedString(value))
                                                Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
                                            },
                                            onEditDraft = {
                                                editingTurnId = turn.id
                                                editingTextVal = turn.user_input_text
                                            },
                                            onSwitchModel = { showThreadSettings = true },
                                            rewindEnabled = !state.activeBranch.generation_locked && state.checkpoint == null,
                                            focusMode = focusMode
                                        )
                                    }
                                }
                            }
                        }

                        if (state.isGenerating) {
                            item {
                                val liveSpeaker = if (state.activeBranch.speaker_mode == "ensemble") "Ensemble" else
                                    state.castRoster.firstOrNull { it.cast_id == state.activeBranch.active_speaker_id }?.canonical_name
                                        ?: state.character.name
                                if (state.generatingText.isEmpty()) {
                                    TypingIndicator(characterName = liveSpeaker)
                                } else {
                                    StreamingAssistantRow(
                                        characterName = liveSpeaker,
                                        text = state.generatingText
                                    )
                                }
                            }
                        }
                    }

                    state.checkpoint?.let { checkpoint ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF2A1720)),
                            border = BorderStroke(1.dp, Color(0xFFFF7AA8)),
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
                        ) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                Text("Continuity checkpoint reached", color = Color.White, fontWeight = FontWeight.Bold, fontFamily = Sora)
                                Text(
                                    when (checkpoint.status) {
                                        "pending_export" -> if (state.continuityHostState is ContinuityHostState.Available)
                                            "Preparing the fifteen-exchange continuity package…"
                                        else "Waiting for your Mac Host. Turn it on, then this will continue automatically."
                                        "waiting_for_worker", "waiting_for_host" -> "Waiting for your Mac Host…"
                                        "processing" -> if (checkpoint.engine_id.startsWith("antigravity:"))
                                            "Gemini is rebuilding continuity…" else "Codex is rebuilding continuity…"
                                        "validating" -> "Validating and saving the complete continuity snapshot…"
                                        "failed" -> "Update failed: ${checkpoint.failure_detail ?: "The response was invalid"}. The chat remains locked until you retry."
                                        else -> "Validating the complete continuity snapshot…"
                                    },
                                    color = Color(0xFFFFC2D5), fontFamily = Inter, fontSize = 13.sp
                                )
                                if (checkpoint.status == "failed") {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        TextButton(onClick = { viewModel.retryCheckpoint() }) { Text("Retry", color = Color(0xFFFF7AA8)) }
                                        TextButton(onClick = { viewModel.replaceCheckpointEngine() }) {
                                            Text("Try other engine", color = Color(0xFFFFC857))
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (state.checkpoint == null && state.exchangesUntilCheckpoint == 1 &&
                        state.continuityHostState !is ContinuityHostState.Available) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2317)),
                            border = BorderStroke(1.dp, Color(0xFFFFC857)),
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
                        ) {
                            Text(
                                "The next reply reaches a continuity checkpoint. Turn on your Mac Host first to avoid waiting.",
                                color = Color(0xFFFFE2A8),
                                fontFamily = Inter,
                                fontSize = 13.sp,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    }
                    SpeakerControlRow(
                        state = state,
                        onClick = { showSpeakerPicker = true }
                    )
                    ChatInputBar(
                        isGenerating = state.isGenerating,
                        isBlocked = state.checkpoint != null || state.activeBranch.generation_locked ||
                            state.needsContinuityEngineChoice,
                        onSend = { text -> viewModel.sendUserMessage(text) }
                    )
                }

                if (showBranchSelector) {
                    AlertDialog(
                        onDismissRequest = { showBranchSelector = false },
                        title = { Text("Switch Branch", color = Color.White, fontFamily = Sora) },
                        containerColor = Color(0xFF16161C),
                        confirmButton = {},
                        dismissButton = {
                            TextButton(onClick = { showBranchSelector = false }) {
                                Text("Close", color = Color.Gray)
                            }
                        },
                        text = {
                            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(state.branches) { branch ->
                                    Card(
                                        onClick = {
                                            if (branch.id != state.activeBranch.id) {
                                                viewModel.switchBranch(branch.id)
                                            }
                                            showBranchSelector = false
                                        },
                                        enabled = branch.id != state.activeBranch.id,
                                        colors = CardDefaults.cardColors(
                                            containerColor = if (branch.id == state.activeBranch.id) Color(0xFF1F1F23) else Color(0xFF121217)
                                        ),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(12.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(branch.name, color = Color.White, fontWeight = FontWeight.Bold, fontFamily = SpaceGrotesk)
                                            if (branch.id == state.activeBranch.id) {
                                                Icon(Icons.Default.Check, contentDescription = "Active", tint = Color(0xFF00FBFB))
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    )
                }

                if (state.needsContinuityEngineChoice) {
                    AlertDialog(
                        onDismissRequest = viewModel::dismissContinuityEngineChoice,
                        title = { Text("Choose continuity engine", color = Color.White, fontFamily = Sora) },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text(
                                    "This choice is frozen into the next checkpoint. You can change the default later in Settings.",
                                    color = Color(0xFFCFC2D7), fontFamily = Inter, fontSize = 13.sp
                                )
                                Button(
                                    onClick = { viewModel.selectContinuityEngine("codex:gpt-5.6-terra:high") },
                                    modifier = Modifier.fillMaxWidth()
                                ) { Text("GPT-5.6 Terra High") }
                                OutlinedButton(
                                    onClick = { viewModel.selectContinuityEngine("antigravity:gemini-3.6-flash:high") },
                                    modifier = Modifier.fillMaxWidth()
                                ) { Text("Gemini 3.6 Flash High") }
                            }
                        },
                        confirmButton = {},
                        dismissButton = { TextButton(onClick = viewModel::dismissContinuityEngineChoice) { Text("Cancel") } },
                        containerColor = Color(0xFF16161C)
                    )
                }

                if (showThreadSettings) {
                    ThreadSettingsDialog(
                        thread = state.thread,
                        connections = state.connections,
                        personas = state.personas,
                        onDismiss = { showThreadSettings = false },
                        onSave = { connId, modelId, maxTokens, personaId, directorNotes, backgroundEnabled, dimness ->
                            viewModel.updateThreadSettings(connId, modelId, maxTokens, personaId, directorNotes, backgroundEnabled, dimness)
                            showThreadSettings = false
                        }
                    )
                }

                if (showSpeakerPicker) {
                    SpeakerPickerDialog(
                        state = state,
                        onSelect = { viewModel.selectSpeaker(it); showSpeakerPicker = false },
                        onEnsemble = { viewModel.selectEnsemble(); showSpeakerPicker = false },
                        onUpdateCast = { viewModel.runDeepScan(); showSpeakerPicker = false },
                        onManage = { showSpeakerPicker = false; showCastManager = true },
                        onDismiss = { showSpeakerPicker = false }
                    )
                }

                if (showCastManager) {
                    CastManagerDialog(
                        roster = state.castRoster,
                        threadId = state.thread.id,
                        onSave = viewModel::saveCastProfile,
                        onAdd = viewModel::addManualCast,
                        newSeed = viewModel::newCastSeed,
                        onDismiss = { showCastManager = false }
                    )
                }

                if (showBranchCreateDialog) {
                    var branchName by remember { mutableStateOf("") }
                    AlertDialog(
                        onDismissRequest = { showBranchCreateDialog = false },
                        title = { Text("Create New Branch", color = Color.White, fontFamily = Sora) },
                        containerColor = Color(0xFF16161C),
                        confirmButton = {
                            Button(
                                onClick = {
                                    val turnId = branchForkTurnId ?: return@Button
                                    viewModel.createBranch(turnId, branchName)
                                    showBranchCreateDialog = false
                                },
                                enabled = branchName.isNotBlank(),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8A2BE2))
                            ) {
                                Text("Fork")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { showBranchCreateDialog = false }) {
                                Text("Cancel", color = Color.Gray)
                            }
                        },
                        text = {
                            OutlinedTextField(
                                value = branchName,
                                onValueChange = { branchName = it },
                                placeholder = { Text("e.g. Alternate Ending") },
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

                if (editingTurnId != null) {
                    AlertDialog(
                        onDismissRequest = { editingTurnId = null },
                        title = { Text("Edit Message & Regenerate", color = Color.White, fontFamily = Sora) },
                        containerColor = Color(0xFF16161C),
                        confirmButton = {
                            Button(
                                onClick = {
                                    editingTurnId?.let { id ->
                                        viewModel.editTurnText(id, editingTextVal)
                                    }
                                    editingTurnId = null
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8A2BE2))
                            ) {
                                Text("Save")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { editingTurnId = null }) {
                                Text("Cancel", color = Color.Gray)
                            }
                        },
                        text = {
                            OutlinedTextField(
                                value = editingTextVal,
                                onValueChange = { editingTextVal = it },
                                minLines = 3,
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

                // Edit assistant reply in place (no regeneration)
                if (editingAssistantTurnId != null) {
                    AlertDialog(
                        onDismissRequest = { editingAssistantTurnId = null },
                        title = { Text("Edit reply", color = Color.White, fontFamily = Sora) },
                        containerColor = Color(0xFF16161C),
                        confirmButton = {
                            Button(
                                onClick = {
                                    editingAssistantTurnId?.let { id ->
                                        viewModel.editAssistantText(id, editingAssistantText)
                                    }
                                    editingAssistantTurnId = null
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8A2BE2))
                            ) {
                                Text("Save")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { editingAssistantTurnId = null }) {
                                Text("Cancel", color = Color.Gray)
                            }
                        },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    "Rewrites the saved reply directly. Continuity memory updates on your next message.",
                                    color = Color(0xFF8A8590),
                                    fontSize = 12.sp,
                                    fontFamily = Inter
                                )
                                OutlinedTextField(
                                    value = editingAssistantText,
                                    onValueChange = { editingAssistantText = it },
                                    minLines = 5,
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = Color(0xFF8A2BE2),
                                        unfocusedBorderColor = Color.Gray,
                                        focusedTextColor = Color.White,
                                        unfocusedTextColor = Color.White
                                    ),
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                    )
                }

                // Pin a fact — annotate before saving (web parity)
                pinTurnTarget?.let { turn ->
                    var pinText by remember(turn.id) { mutableStateOf(turn.assistant_output_text ?: "") }
                    AlertDialog(
                        onDismissRequest = { pinTurnTarget = null },
                        title = { Text("Pin a fact", color = Color.White, fontFamily = Sora) },
                        containerColor = Color(0xFF16161C),
                        confirmButton = {
                            Button(
                                onClick = {
                                    viewModel.addPin(turn.id, pinText)
                                    pinTurnTarget = null
                                },
                                enabled = pinText.isNotBlank(),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8A2BE2))
                            ) {
                                Text("Save pin")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { pinTurnTarget = null }) {
                                Text("Cancel", color = Color.Gray)
                            }
                        },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    "Save a branch-local memory. Trim it down to just the fact worth remembering.",
                                    color = Color(0xFF8A8590),
                                    fontSize = 12.sp,
                                    fontFamily = Inter
                                )
                                OutlinedTextField(
                                    value = pinText,
                                    onValueChange = { pinText = it },
                                    minLines = 4,
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = Color(0xFFFF7AA8),
                                        unfocusedBorderColor = Color.Gray,
                                        focusedTextColor = Color.White,
                                        unfocusedTextColor = Color.White
                                    ),
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                    )
                }

                // Steering Guidance Regenerate Dialog
                steerTurnGuidance?.let { turn ->
                    var steeringText by remember { mutableStateOf("") }
                    AlertDialog(
                        onDismissRequest = { steerTurnGuidance = null },
                        title = { Text("Regenerate Reply", color = Color.White, fontFamily = Sora) },
                        containerColor = Color(0xFF16161C),
                        confirmButton = {
                            Button(
                                onClick = {
                                    viewModel.regenerateLatestTurn(steeringText.ifBlank { null })
                                    steerTurnGuidance = null
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8A2BE2))
                            ) {
                                Text("Regenerate")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { steerTurnGuidance = null }) {
                                Text("Cancel", color = Color.Gray)
                            }
                        },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Steer this response (optional):", color = Color.Gray, fontSize = 13.sp, fontFamily = Inter)
                                OutlinedTextField(
                                    value = steeringText,
                                    onValueChange = { steeringText = it },
                                    placeholder = { Text("e.g. Focus more on Vex's reaction...") },
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = Color(0xFF8A2BE2),
                                        unfocusedBorderColor = Color.Gray,
                                        focusedTextColor = Color.White,
                                        unfocusedTextColor = Color.White
                                    ),
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                    )
                }
            }
        }
        }
    }
}

/** Small pill button used in the per-message action rail (web ActionButton parity). */
@Composable
private fun MessageActionPill(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    enabled: Boolean = true,
    tint: Color = Color(0xFFCFC2D7)
) {
    val effTint = if (enabled) tint else tint.copy(alpha = 0.35f)
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, Color(0xFF2C2C35), RoundedCornerShape(8.dp))
            .background(Color(0xC717171C))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Icon(icon, contentDescription = label, tint = effTint, modifier = Modifier.size(13.dp))
        Text(label, color = effTint, fontFamily = SpaceGrotesk, fontSize = 11.sp, fontWeight = FontWeight.Medium)
    }
}

/** Uppercase speaker label + muted metadata, mirroring the web message header. */
@Composable
private fun MessageLabelHeader(label: String, accent: Color, meta: String? = null, modifier: Modifier = Modifier) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = modifier.padding(bottom = 8.dp)
    ) {
        Text(
            text = label.uppercase(),
            color = accent,
            fontFamily = SpaceGrotesk,
            fontWeight = FontWeight.Bold,
            fontSize = 10.sp,
            letterSpacing = 1.2.sp
        )
        if (!meta.isNullOrEmpty()) {
            Text(
                text = meta,
                color = Color(0xFF7A7580),
                fontFamily = SpaceGrotesk,
                fontSize = 10.sp,
                letterSpacing = 0.4.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false)
            )
        }
    }
}

/** Right-aligned user message: content-hugging card capped at ~86% width. */
@Composable
fun UserMessageRow(
    turn: TurnEntity,
    isHead: Boolean,
    onEdit: () -> Unit,
    onCopy: (String) -> Unit,
    focusMode: Boolean = false
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = 300.dp)
                    .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomEnd = 4.dp, bottomStart = 16.dp))
                    .background(Color(0xAD1F1F23))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                MessageLabelHeader("You", Color(0xFF00FBFB))
                MarkdownText(
                    text = turn.user_input_text,
                    baseColor = Color(0xFFE4E1E7)
                )
            }
        }
        if (!focusMode) FlowRow(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            if (isHead) {
                MessageActionPill("Edit", Icons.Default.Edit, onEdit)
            }
            MessageActionPill("Copy", Icons.Default.ContentCopy, { onCopy(turn.user_input_text) })
        }
    }
}

/** Wide assistant message card with prose body, metadata, truncation notice, and action rail. */
@Composable
fun AssistantMessageRow(
    turn: TurnEntity,
    characterName: String,
    isPinned: Boolean,
    isHead: Boolean,
    onEditReply: () -> Unit,
    onRegenerate: () -> Unit,
    onBranch: () -> Unit,
    onRewind: () -> Unit,
    onPinToggle: () -> Unit,
    onRate: (Int?) -> Unit,
    onCopy: (String) -> Unit,
    onEditDraft: () -> Unit,
    onSwitchModel: () -> Unit,
    rewindEnabled: Boolean = true,
    focusMode: Boolean = false
) {
    val committed = turn.generation_status == "committed"
    val outputText = turn.assistant_output_text ?: ""

    val meta = buildString {
        if (!turn.assistant_connection_label.isNullOrEmpty()) append(turn.assistant_connection_label)
        if (!turn.assistant_model.isNullOrEmpty()) {
            if (isNotEmpty()) append(" · ")
            append(turn.assistant_model.substringAfter("/"))
        }
        val tokens = turn.total_tokens ?: 0
        if (tokens > 0) {
            if (isNotEmpty()) append(" · ")
            append("$tokens tok")
        }
        val cacheHit = Regex("\\\"prompt_cache_hit_tokens\\\":(\\d+)")
            .find(turn.assistant_output_payload.orEmpty())?.groupValues?.getOrNull(1)?.toIntOrNull()
        if (cacheHit != null) {
            if (isNotEmpty()) append(" · ")
            append("cache $cacheHit")
        }
        if (turn.assistant_output_payload.orEmpty().contains("\"usage_unavailable\":true")) {
            if (isNotEmpty()) append(" · ")
            append("usage unavailable")
            val elapsed = Regex("\"elapsed_millis\":(\\d+)")
                .find(turn.assistant_output_payload.orEmpty())?.groupValues?.getOrNull(1)?.toLongOrNull()
            if (elapsed != null) append(" · ${elapsed / 1000}s")
        }
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0x9E1B1B1F))
                .padding(horizontal = 18.dp, vertical = 14.dp)
        ) {
            MessageLabelHeader(characterName, Color(0xFFDCB8FF), meta.ifEmpty { null }, modifier = Modifier.fillMaxWidth())

            if (committed) {
                MarkdownText(
                    text = outputText,
                    baseColor = Color(0xFFE4E1E7),
                    modifier = Modifier.fillMaxWidth(),
                    paragraphFontSize = if (focusMode) 16.sp else 15.sp,
                    paragraphLineHeight = if (focusMode) 30.sp else 26.sp
                )
                if (turn.finish_reason == "length") {
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0x1AE8C547))
                            .border(1.dp, Color(0x4DE8C547), RoundedCornerShape(8.dp))
                            .padding(10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFE8C547), modifier = Modifier.size(16.dp))
                        Text(
                            "Reply was cut off at the output limit. Raise Max Output Tokens in Thread Settings, or regenerate.",
                            color = Color(0xFFE8C547),
                            fontFamily = Inter,
                            fontSize = 12.sp,
                            lineHeight = 17.sp
                        )
                    }
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0x26C40060))
                        .border(1.dp, Color(0x66C40060), RoundedCornerShape(8.dp))
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = Color(0xFFE07A9A), modifier = Modifier.size(15.dp))
                        Text("Response interrupted", color = Color(0xFFE07A9A), fontFamily = SpaceGrotesk, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                    Text(
                        text = turn.failure_message ?: "Generation failed.",
                        color = Color(0xFFCFC2D7),
                        fontFamily = Inter,
                        fontSize = 12.sp,
                        lineHeight = 17.sp
                    )
                }
            }
        }

        if (!focusMode) FlowRow(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            if (committed) {
                if (isHead) {
                    MessageActionPill("Edit reply", Icons.Default.Edit, onEditReply)
                    MessageActionPill("Regenerate", Icons.Default.Autorenew, onRegenerate)
                }
                MessageActionPill("Rewind", Icons.Default.Restore, onRewind, enabled = rewindEnabled)
                MessageActionPill("Branch", Icons.Default.AccountTree, onBranch)
                MessageActionPill("Copy", Icons.Default.ContentCopy, { onCopy(outputText) })
                MessageActionPill(
                    label = if (isPinned) "Pinned" else "Pin",
                    icon = Icons.Default.PushPin,
                    onClick = onPinToggle,
                    tint = if (isPinned) Color(0xFFFF7AA8) else Color(0xFFCFC2D7)
                )
                Spacer(modifier = Modifier.width(2.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp)
                ) {
                    (1..4).forEach { i ->
                        val selected = turn.feedback_rating != null && turn.feedback_rating!! >= i
                        Icon(
                            imageVector = Icons.Default.Star,
                            contentDescription = "Rate $i",
                            tint = if (selected) Color(0xFFFFB1C4) else Color(0xFF4C4354),
                            modifier = Modifier
                                .size(17.dp)
                                .clickable { onRate(if (turn.feedback_rating == i) null else i) }
                        )
                    }
                }
            } else if (isHead) {
                // Failed head turn — web's "Response interrupted" recovery actions
                MessageActionPill("Retry", Icons.Default.Autorenew, onRegenerate)
                MessageActionPill("Edit draft", Icons.Default.Edit, onEditDraft)
                MessageActionPill("Switch model", Icons.Default.Tune, onSwitchModel)
                MessageActionPill("Discard", Icons.Default.Delete, onRewind)
            }
        }
    }
}

/** Assistant "is writing" affordance: mirrors the assistant card with bouncing dots. */
@Composable
fun TypingIndicator(characterName: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0x9E1B1B1F))
            .padding(horizontal = 18.dp, vertical = 14.dp)
    ) {
        MessageLabelHeader(characterName, Color(0xFFDCB8FF), "is writing", modifier = Modifier.fillMaxWidth())
        val transition = rememberInfiniteTransition(label = "typing")
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.padding(vertical = 4.dp)
        ) {
            listOf(0, 160, 320).forEach { delayMs ->
                val offsetY by transition.animateFloat(
                    initialValue = 0f,
                    targetValue = -6f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(durationMillis = 420, easing = FastOutSlowInEasing),
                        repeatMode = RepeatMode.Reverse,
                        initialStartOffset = StartOffset(delayMs)
                    ),
                    label = "dot"
                )
                Box(
                    modifier = Modifier
                        .size(7.dp)
                        .graphicsLayer { translationY = offsetY }
                        .clip(CircleShape)
                        .background(Color(0xFFDCB8FF).copy(alpha = 0.75f))
                )
            }
        }
    }
}

/** Live streamed reply: assistant prose with a blinking block caret at the tail. */
@Composable
fun StreamingAssistantRow(characterName: String, text: String) {
    val caret = rememberInfiniteTransition(label = "caret")
    val caretAlpha by caret.animateFloat(
        initialValue = 1f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 600, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "caretAlpha"
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0x9E1B1B1F))
            .padding(horizontal = 18.dp, vertical = 14.dp)
    ) {
        MessageLabelHeader(characterName, Color(0xFFDCB8FF))
        Text(
            text = buildAnnotatedString {
                append(text)
                withStyle(SpanStyle(color = Color(0xFFDCB8FF).copy(alpha = caretAlpha))) {
                    append(" ▍")
                }
            },
            color = Color(0xFFE4E1E7),
            fontFamily = Inter,
            fontSize = 15.sp,
            lineHeight = 26.sp,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpeakerControlRow(
    state: ChatUiState.Success,
    onClick: () -> Unit
) {
    val selected = state.castRoster.firstOrNull { it.cast_id == state.activeBranch.active_speaker_id }
    val label = if (state.activeBranch.speaker_mode == "ensemble") "Ensemble" else selected?.canonical_name ?: state.character.name
    val presentIds = state.currentSnapshot?.entity_state?.filter { it.is_present }?.map { it.entity_id }?.toSet().orEmpty()
    val presentNames = state.currentSnapshot?.entity_state?.filter { it.is_present }?.map { it.canonical_name.lowercase() }?.toSet().orEmpty()
    val offScene = state.activeBranch.speaker_mode != "ensemble" && selected != null &&
        selected.entity_id !in presentIds && selected.canonical_name.lowercase() !in presentNames
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        AssistChip(
            onClick = onClick,
            label = { Text("Reply as $label", fontFamily = SpaceGrotesk) },
            leadingIcon = {
                Box(
                    Modifier.size(24.dp).clip(CircleShape).background(Color(0xFF8A2BE2)),
                    contentAlignment = Alignment.Center
                ) { Text(label.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp) }
            },
            trailingIcon = { Icon(Icons.Default.ArrowDropDown, null, Modifier.size(18.dp)) },
            colors = AssistChipDefaults.assistChipColors(
                containerColor = Color(0xFF1B1B1F), labelColor = Color.White,
                leadingIconContentColor = Color.White, trailingIconContentColor = Color(0xFFDCB8FF)
            ),
            border = BorderStroke(1.dp, Color(0xFF4C4354))
        )
        if (offScene) Text("Off-scene", color = Color(0xFFFFC857), fontSize = 11.sp, fontFamily = SpaceGrotesk)
    }
}

@Composable
fun SpeakerPickerDialog(
    state: ChatUiState.Success,
    onSelect: (String) -> Unit,
    onEnsemble: () -> Unit,
    onUpdateCast: () -> Unit,
    onManage: () -> Unit,
    onDismiss: () -> Unit
) {
    val eligible = state.castRoster.filter { it.status == "active" && it.speaker_eligible && !it.player_controlled }
    val presentIds = state.currentSnapshot?.entity_state?.filter { it.is_present }?.map { it.entity_id }?.toSet().orEmpty()
    val presentNames = state.currentSnapshot?.entity_state?.filter { it.is_present }?.map { it.canonical_name.lowercase() }?.toSet().orEmpty()
    val (present, elsewhere) = eligible.partition { it.entity_id in presentIds || it.canonical_name.lowercase() in presentNames }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Who replies?", color = Color.White, fontFamily = Sora) },
        containerColor = Color(0xFF16161C),
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close", color = Color.Gray) } },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.heightIn(max = 520.dp)) {
                item { SpeakerChoice("Ensemble", "Multiple present characters may reply", state.activeBranch.speaker_mode == "ensemble", onEnsemble) }
                if (present.isNotEmpty()) item { Text("Present", color = Color(0xFF00FBFB), fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                items(present, key = { it.cast_id }) { member ->
                    SpeakerChoice(member.canonical_name, member.role_background, state.activeBranch.speaker_mode == "single" && member.cast_id == state.activeBranch.active_speaker_id) { onSelect(member.cast_id) }
                }
                if (elsewhere.isNotEmpty()) item { Text("Elsewhere", color = Color(0xFFFFC857), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
                items(elsewhere, key = { it.cast_id }) { member ->
                    SpeakerChoice(member.canonical_name, member.role_background.ifBlank { "Off-scene perspective" }, state.activeBranch.speaker_mode == "single" && member.cast_id == state.activeBranch.active_speaker_id) { onSelect(member.cast_id) }
                }
                item {
                    HorizontalDivider(color = Color(0xFF2C2C35), modifier = Modifier.padding(vertical = 6.dp))
                    TextButton(onClick = onManage) { Icon(Icons.Default.People, null); Spacer(Modifier.width(8.dp)); Text("Manage cast") }
                    TextButton(onClick = onUpdateCast) { Icon(Icons.Default.AutoAwesome, null); Spacer(Modifier.width(8.dp)); Text("Update cast now") }
                }
            }
        }
    )
}

@Composable
private fun SpeakerChoice(name: String, detail: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick)
            .background(if (selected) Color(0xFF332145) else Color(0xFF1B1B1F)).padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(Color(0xFF8A2BE2)), contentAlignment = Alignment.Center) {
            Text(name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
        }
        Column(Modifier.weight(1f)) {
            Text(name, color = Color.White, fontWeight = FontWeight.Bold, fontFamily = SpaceGrotesk)
            if (detail.isNotBlank()) Text(detail, color = Color(0xFF9B95A1), maxLines = 2, overflow = TextOverflow.Ellipsis, fontSize = 11.sp)
        }
        if (selected) Icon(Icons.Default.Check, null, tint = Color(0xFF00FBFB))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatInputBar(
    isGenerating: Boolean,
    isBlocked: Boolean = false,
    onSend: (String) -> Unit
) {
    var text by remember { mutableStateOf("") }
    val maxLen = 8000

    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
    Row(
        verticalAlignment = Alignment.CenterVertically
    ) {
        OutlinedTextField(
            value = text,
            onValueChange = { if (it.length <= maxLen) text = it },
            placeholder = { Text(if (isBlocked) "Waiting for continuity update…" else "Send a message...") },
            enabled = !isBlocked,
            maxLines = 4,
            shape = RoundedCornerShape(8.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Color(0xFF8A2BE2),
                unfocusedBorderColor = Color(0xFF4C4354),
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedContainerColor = Color(0xC71F1F23),
                unfocusedContainerColor = Color(0xC71F1F23),
                cursorColor = Color(0xFF8A2BE2)
            ),
            modifier = Modifier.weight(1f)
        )

        Spacer(modifier = Modifier.width(12.dp))

        FloatingActionButton(
            onClick = {
                if (text.isNotBlank() && !isGenerating && !isBlocked) {
                    onSend(text)
                    text = ""
                }
            },
            containerColor = if (isBlocked) Color(0xFF4C4354) else Color(0xFF8A2BE2),
            contentColor = Color.White,
            shape = CircleShape,
            modifier = Modifier.size(48.dp)
        ) {
            Icon(Icons.Default.Send, contentDescription = "Send")
        }
    }
        if (text.isNotEmpty()) {
            val nearLimit = text.length >= (maxLen * 0.85).toInt()
            val atLimit = text.length >= maxLen
            Text(
                text = "${text.length}/$maxLen",
                color = when {
                    atLimit -> Color(0xFFC40060)
                    nearLimit -> Color(0xFFE8C547)
                    else -> Color(0xFF7A7580)
                },
                fontFamily = SpaceGrotesk,
                fontSize = 10.sp,
                modifier = Modifier
                    .align(Alignment.End)
                    .padding(top = 4.dp, end = 4.dp)
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CastManagerDialog(
    roster: List<CastProfile>,
    threadId: String,
    onSave: (CastProfile) -> Unit,
    onAdd: (CastProfile) -> Unit,
    newSeed: () -> CastProfile,
    onDismiss: () -> Unit
) {
    var editing by remember { mutableStateOf<CastProfile?>(null) }
    var draftSeed by remember { mutableStateOf<CastProfile?>(null) }
    val target = editing ?: draftSeed
    if (target != null) {
        CastProfileEditor(
            initial = target,
            isNew = editing == null,
            threadId = threadId,
            onSave = { profile ->
                if (editing == null) onAdd(profile) else onSave(profile)
                editing = null; draftSeed = null
            },
            onDismiss = { editing = null; draftSeed = null }
        )
        return
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cast manager", color = Color.White, fontFamily = Sora) },
        containerColor = Color(0xFF16161C),
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
        dismissButton = { TextButton(onClick = { draftSeed = newSeed() }) { Text("Add character", color = Color(0xFF00FBFB)) } },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.heightIn(max = 560.dp)) {
                items(roster, key = { it.cast_id }) { member ->
                    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)), modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(11.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(member.canonical_name, color = if (member.status == "archived") Color.Gray else Color.White, fontWeight = FontWeight.Bold)
                                    Text(
                                        when (member.provenance) {
                                            "primary" -> "Primary character"
                                            "manual_seed" -> "Manual"
                                            else -> "Discovered by continuity"
                                        }, color = Color(0xFF9B95A1), fontSize = 10.sp
                                    )
                                }
                                if (member.provenance != "primary") TextButton(onClick = { editing = member }) { Text("Edit") }
                            }
                            if (member.role_background.isNotBlank()) Text(member.role_background, color = Color(0xFFCFC2D7), fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                            if (member.provenance != "primary") TextButton(onClick = {
                                onSave(member.copy(status = if (member.status == "archived") "active" else "archived"))
                            }) { Text(if (member.status == "archived") "Restore" else "Archive", color = Color(0xFFFFC857), fontSize = 11.sp) }
                        }
                    }
                }
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CastProfileEditor(
    initial: CastProfile,
    isNew: Boolean,
    threadId: String,
    onSave: (CastProfile) -> Unit,
    onDismiss: () -> Unit
) {
    // One CastProfile draft rather than seven loose strings: a pasted Cast Seed can then fill
    // fields the form does not render (aliases) without them being dropped on save.
    var draft by remember(initial.cast_id) { mutableStateOf(initial) }
    val colors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Color.White, unfocusedTextColor = Color.White,
        focusedBorderColor = Color(0xFF8A2BE2), unfocusedBorderColor = Color(0xFF4C4354)
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isNew) "Add character" else "Edit ${initial.canonical_name}", color = Color.White) },
        containerColor = Color(0xFF16161C),
        confirmButton = {
            Button(
                onClick = {
                    onSave(
                        draft.copy(
                            canonical_name = draft.canonical_name.trim(),
                            role_background = draft.role_background.trim(),
                            personality = draft.personality.trim(),
                            voice_style = draft.voice_style.trim(),
                            appearance = draft.appearance.trim(),
                            goals = draft.goals.trim(),
                            boundaries = draft.boundaries.trim()
                        )
                    )
                },
                enabled = draft.canonical_name.isNotBlank()
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PromptPackPanel(
                    kind = PortableKind.CAST,
                    accentColor = Color(0xFF00FBFB),
                    currentJson = { PortableJsonCodec.serializeCast(draft) },
                    onImportCast = { data ->
                        draft = PortableJsonCodec.castDocumentToProfile(
                            CastDocument(CAST_FORMAT, CAST_VERSION, data),
                            existing = draft,
                            threadId = threadId
                        )
                    },
                    modifier = Modifier.fillMaxWidth()
                )
                if (draft.aliases.isNotEmpty()) {
                    Text(
                        "Aliases: ${draft.aliases.joinToString(", ")}",
                        color = Color(0xFF9B95A1), fontSize = 11.sp
                    )
                }
                listOf<Triple<String, String, (String) -> Unit>>(
                    Triple("Name", draft.canonical_name) { v -> draft = draft.copy(canonical_name = v) },
                    Triple("Role / background", draft.role_background) { v -> draft = draft.copy(role_background = v) },
                    Triple("Personality", draft.personality) { v -> draft = draft.copy(personality = v) },
                    Triple("Voice style", draft.voice_style) { v -> draft = draft.copy(voice_style = v) },
                    Triple("Appearance", draft.appearance) { v -> draft = draft.copy(appearance = v) },
                    Triple("Goals", draft.goals) { v -> draft = draft.copy(goals = v) },
                    Triple("Boundaries", draft.boundaries) { v -> draft = draft.copy(boundaries = v) }
                ).forEach { (label, value, setter) ->
                    OutlinedTextField(
                        value = value, onValueChange = setter,
                        label = { Text(label) }, minLines = if (label == "Name") 1 else 2,
                        singleLine = label == "Name", colors = colors, modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ThreadSettingsDialog(
    thread: ThreadEntity,
    connections: List<ConnectionEntity>,
    personas: List<PersonaEntity>,
    onDismiss: () -> Unit,
    onSave: (
        connectionId: String,
        modelId: String,
        maxTokens: Int,
        personaId: String?,
        directorNotes: String,
        portraitBackgroundEnabled: Boolean,
        portraitBackgroundDimness: Float
    ) -> Unit
) {
    var selectedConn by remember { mutableStateOf<ConnectionEntity?>(connections.find { it.id == thread.connection_id } ?: connections.firstOrNull()) }
    var selectedModel by remember { mutableStateOf(thread.model_id) }
    // Response length presets (web parity): label, token budget, description
    val lengthPresets = remember {
        listOf(
            Triple("Concise", 750, "Short, punchy replies"),
            Triple("Normal", 2048, "Standard roleplay length"),
            Triple("Extended", 4096, "Detailed scenes"),
            Triple("Expansive", 8192, "Long-form creative writing"),
            Triple("Unlimited", 16384, "Maximum output budget")
        )
    }
    var tokensValue by remember {
        mutableIntStateOf(thread.max_output_tokens)
    }
    var selectedPersona by remember { mutableStateOf<PersonaEntity?>(personas.find { it.id == thread.persona_id }) }
    var directorNotes by remember { mutableStateOf(thread.director_notes) }
    
    var portraitBackgroundEnabled by remember { mutableStateOf(thread.portrait_background_enabled) }
    var portraitBackgroundDimness by remember { mutableFloatStateOf(thread.portrait_background_dimness) }

    var connExpanded by remember { mutableStateOf(false) }
    var modelExpanded by remember { mutableStateOf(false) }
    var personaExpanded by remember { mutableStateOf(false) }

    // Clipboard + context for one-click paste into the text fields below.
    val clipboard = LocalClipboardManager.current
    val ctx = LocalContext.current

    val dialogTextFieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        focusedContainerColor = Color(0xFF1F1F23),
        unfocusedContainerColor = Color(0xFF1F1F23),
        focusedBorderColor = Color(0xFF8A2BE2),
        unfocusedBorderColor = Color(0xFF4C4354),
        cursorColor = Color(0xFF8A2BE2)
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Thread settings", color = Color.White, fontFamily = Sora, fontWeight = FontWeight.Bold) },
        containerColor = Color(0xFF16161C),
        shape = RoundedCornerShape(16.dp),
        confirmButton = {
            Button(
                onClick = {
                    val connId = selectedConn?.id ?: return@Button
                    val tokens = tokensValue
                    onSave(
                        connId,
                        selectedModel,
                        tokens,
                        selectedPersona?.id,
                        directorNotes,
                        portraitBackgroundEnabled,
                        portraitBackgroundDimness
                    )
                },
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8A2BE2))
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Color.Gray)
            }
        },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Connection Selector
                ExposedDropdownMenuBox(expanded = connExpanded, onExpandedChange = { connExpanded = it }) {
                    OutlinedTextField(
                        value = selectedConn?.label ?: "Select Connection",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Roleplay connection") },
                        shape = RoundedCornerShape(8.dp),
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = connExpanded) },
                        colors = dialogTextFieldColors,
                        modifier = Modifier.menuAnchor().fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = connExpanded,
                        onDismissRequest = { connExpanded = false },
                        modifier = Modifier.background(Color(0xFF1B1B1F))
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

                // Model Selector
                val models = selectedConn?.model_cache ?: emptyList()
                if (models.isNotEmpty()) {
                    ExposedDropdownMenuBox(expanded = modelExpanded, onExpandedChange = { modelExpanded = it }) {
                        OutlinedTextField(
                            value = selectedModel,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Roleplay model") },
                            shape = RoundedCornerShape(8.dp),
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = modelExpanded) },
                            colors = dialogTextFieldColors,
                            modifier = Modifier.menuAnchor().fillMaxWidth()
                        )
                        ExposedDropdownMenu(
                            expanded = modelExpanded,
                            onDismissRequest = { modelExpanded = false },
                            modifier = Modifier.background(Color(0xFF1B1B1F))
                        ) {
                            models.forEach { model ->
                                DropdownMenuItem(
                                    text = { Text(model.id, color = Color.White) },
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
                        "Antigravity uses the same roleplay prompt and history, but its CLI does not expose Temperature or Top P. Response length and variation are enforced through the prompt.",
                        color = Color(0xFFB8B8C6),
                        fontFamily = Inter,
                        fontSize = 12.sp
                    )
                }

                // Persona Selector
                ExposedDropdownMenuBox(expanded = personaExpanded, onExpandedChange = { personaExpanded = it }) {
                    OutlinedTextField(
                        value = selectedPersona?.name ?: "None (Character Sheet Only)",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Active Persona") },
                        shape = RoundedCornerShape(8.dp),
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = personaExpanded) },
                        colors = dialogTextFieldColors,
                        modifier = Modifier.menuAnchor().fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = personaExpanded,
                        onDismissRequest = { personaExpanded = false },
                        modifier = Modifier.background(Color(0xFF1B1B1F))
                    ) {
                        DropdownMenuItem(
                            text = { Text("None (Character Sheet Only)", color = Color.White) },
                            onClick = {
                                selectedPersona = null
                                personaExpanded = false
                            }
                        )
                        personas.forEach { p ->
                            DropdownMenuItem(
                                text = { Text(p.name, color = Color.White) },
                                onClick = {
                                    selectedPersona = p
                                    personaExpanded = false
                                }
                            )
                        }
                    }
                }

                // Response length — preset slider (web parity)
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    val curIdx = lengthPresets.indexOfFirst { it.second == tokensValue }.let { if (it >= 0) it else 2 }
                    val preset = lengthPresets[curIdx]
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Response length", color = Color(0xFFCFC2D7), fontFamily = SpaceGrotesk, fontSize = 12.sp)
                        Text("${preset.first} · ${preset.second} tok", color = Color(0xFFDCB8FF), fontFamily = SpaceGrotesk, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Slider(
                        value = curIdx.toFloat(),
                        onValueChange = { tokensValue = lengthPresets[it.roundToInt().coerceIn(0, lengthPresets.size - 1)].second },
                        valueRange = 0f..(lengthPresets.size - 1).toFloat(),
                        steps = lengthPresets.size - 2,
                        colors = SliderDefaults.colors(
                            thumbColor = Color(0xFF8A2BE2),
                            activeTrackColor = Color(0xFF8A2BE2),
                            inactiveTrackColor = Color(0xFF2C2C35),
                            activeTickColor = Color(0xFFDCB8FF),
                            inactiveTickColor = Color(0xFF4C4354)
                        )
                    )
                    Text(preset.third, color = Color(0xFF8A8590), fontFamily = Inter, fontSize = 11.sp)
                }

                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Portrait background", color = Color.White, fontFamily = SpaceGrotesk)
                            Text("Follow the active speaker", color = Color(0xFF8A8590), fontSize = 11.sp)
                        }
                        Switch(
                            checked = portraitBackgroundEnabled,
                            onCheckedChange = { portraitBackgroundEnabled = it }
                        )
                    }
                    if (portraitBackgroundEnabled) {
                        Text(
                            "Background darkness · ${(portraitBackgroundDimness * 100).roundToInt()}%",
                            color = Color(0xFFCFC2D7),
                            fontFamily = SpaceGrotesk,
                            fontSize = 12.sp
                        )
                        Slider(
                            value = portraitBackgroundDimness,
                            onValueChange = { portraitBackgroundDimness = it },
                            valueRange = 0.35f..0.80f
                        )
                    }
                }

                // Director's Notes — per-thread out-of-character steering
                OutlinedTextField(
                    value = directorNotes,
                    // Truncate on overflow instead of rejecting the whole change, so a long
                    // paste fills up to the cap rather than silently blanking the field.
                    onValueChange = { directorNotes = it.take(2000) },
                    label = { Text("Director's notes") },
                    placeholder = {
                        Text(
                            "Out-of-character directions for this thread: tone, pacing, length, focus…",
                            color = Color(0xFF7A7580)
                        )
                    },
                    trailingIcon = {
                        IconButton(onClick = {
                            val pasted = clipboard.getText()?.text.orEmpty()
                            if (pasted.isBlank()) {
                                Toast.makeText(ctx, "Clipboard is empty", Toast.LENGTH_SHORT).show()
                            } else {
                                directorNotes = pasted.take(2000)
                                Toast.makeText(ctx, "Pasted director's notes", Toast.LENGTH_SHORT).show()
                            }
                        }) {
                            Icon(
                                Icons.Default.ContentPaste,
                                contentDescription = "Paste director's notes from clipboard",
                                tint = Color(0xFF8A2BE2)
                            )
                        }
                    },
                    supportingText = {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Applies only to this thread", color = Color(0xFF8A8590), fontSize = 11.sp)
                            Text("${directorNotes.length}/2000", color = Color(0xFF7A7580), fontSize = 11.sp)
                        }
                    },
                    minLines = 3,
                    shape = RoundedCornerShape(8.dp),
                    colors = dialogTextFieldColors,
                    modifier = Modifier.fillMaxWidth()
                )

            }
        }
    )
}

@Composable
fun CognitiveStateInspector(
    snapshot: DurableMemorySnapshot?,
    pins: List<PinEntity>,
    turns: List<TurnEntity>,
    timelineEvents: List<TimelineEntity>,
    activeBranch: BranchEntity,
    branches: List<BranchEntity>,
    isScanning: Boolean,
    onRemovePin: (String) -> Unit,
    onSwitchBranch: (String) -> Unit,
    onTriggerDeepScan: () -> Unit,
    onClose: () -> Unit
) {
    var activeTab by remember { mutableStateOf("continuity") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF131317))
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "HCE Inspector",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp,
                fontFamily = Sora
            )
            IconButton(onClick = onClose) {
                Icon(Icons.Default.Close, contentDescription = "Close Inspector", tint = Color.Gray)
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Tab selection row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Color(0xFF1B1B1F))
                .padding(2.dp)
        ) {
            listOf(
                "continuity" to "Continuity",
                "pins" to "Pins",
                "timeline" to "Timeline",
                "branch" to "Branch"
            ).forEach { (tabId, label) ->
                val isSelected = activeTab == tabId
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isSelected) Color(0xFF2A292E) else Color.Transparent)
                        .clickable { activeTab = tabId }
                        .padding(vertical = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = label,
                        color = if (isSelected) Color.White else Color.Gray,
                        fontSize = 11.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                        fontFamily = SpaceGrotesk
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            when (activeTab) {
                "continuity" -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        if (snapshot == null) {
                            Box(modifier = Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                                Text("No world state materialized yet.", color = Color.Gray, fontSize = 13.sp, fontFamily = Inter)
                            }
                        } else {
                            // Narrative Section
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(Color(0xFF1B1B1F))
                                    .drawBehind {
                                        drawLine(
                                            color = Color(0xFF00FBFB),
                                            start = Offset(0f, 0f),
                                            end = Offset(0f, size.height),
                                            strokeWidth = 4.dp.toPx()
                                        )
                                    }
                                    .padding(start = 20.dp, top = 16.dp, bottom = 16.dp, end = 16.dp)
                            ) {
                                Column {
                                    Text(
                                        text = "NARRATIVE SUMMARY",
                                        color = Color(0xFF00FBFB),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        fontFamily = SpaceGrotesk,
                                        letterSpacing = 1.sp
                                    )
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = snapshot.narrative_state.story_summary.ifEmpty { "None" },
                                        color = Color(0xFFE4E1E7),
                                        fontSize = 13.sp,
                                        fontFamily = Inter,
                                        lineHeight = 20.sp
                                    )
                                }
                            }

                            // Scene Details Grid
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Card(
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(16.dp),
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F))
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Refresh,
                                            contentDescription = "Time",
                                            tint = Color(0xFF8A2BE2),
                                            modifier = Modifier.size(24.dp)
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Column {
                                            Text(
                                                text = "LOCAL TIME",
                                                color = Color.Gray,
                                                fontSize = 9.sp,
                                                fontFamily = SpaceGrotesk,
                                                fontWeight = FontWeight.Bold
                                            )
                                            Text(
                                                text = snapshot.metadata.narrative_timestamp.ifEmpty { "Cycle 1" },
                                                color = Color.White,
                                                fontSize = 12.sp,
                                                fontFamily = Inter,
                                                maxLines = 1
                                            )
                                        }
                                    }
                                }

                                Card(
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(16.dp),
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F))
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Place,
                                            contentDescription = "Location",
                                            tint = Color(0xFF00FBFB),
                                            modifier = Modifier.size(24.dp)
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Column {
                                            Text(
                                                text = "LOCATION",
                                                color = Color.Gray,
                                                fontSize = 9.sp,
                                                fontFamily = SpaceGrotesk,
                                                fontWeight = FontWeight.Bold
                                            )
                                            Text(
                                                text = snapshot.spatial_state.current_location?.name ?: "Unknown",
                                                color = Color.White,
                                                fontSize = 12.sp,
                                                fontFamily = Inter,
                                                maxLines = 1
                                            )
                                        }
                                    }
                                }
                            }

                            // Entities Section
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    text = "MONITORED ENTITIES",
                                    color = Color(0xFF00FBFB),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = SpaceGrotesk,
                                    letterSpacing = 1.sp
                                )
                                snapshot.entity_state.forEach { ent ->
                                    val placement = snapshot.spatial_state.entity_placements.find { it.entity_id == ent.entity_id }
                                    val locationStr = placement?.let { " @ ${it.location_name}" } ?: ""

                                    Card(
                                        shape = RoundedCornerShape(16.dp),
                                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Column(modifier = Modifier.padding(12.dp)) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                Row(verticalAlignment = Alignment.CenterVertically) {
                                                    Box(
                                                        modifier = Modifier
                                                            .size(36.dp)
                                                            .clip(RoundedCornerShape(12.dp))
                                                            .background(Color(0xFF2C2C35)),
                                                        contentAlignment = Alignment.Center
                                                    ) {
                                                        Text(
                                                            text = ent.canonical_name.take(1),
                                                            color = Color.White,
                                                            fontWeight = FontWeight.Bold,
                                                            fontSize = 16.sp
                                                        )
                                                    }
                                                    Spacer(modifier = Modifier.width(10.dp))
                                                    Column {
                                                        Text(
                                                            text = ent.canonical_name,
                                                            color = Color(0xFF00FBFB),
                                                            fontSize = 14.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            fontFamily = Sora
                                                        )
                                                        Text(
                                                            text = "${ent.entity_type}$locationStr",
                                                            color = Color.Gray,
                                                            fontSize = 11.sp,
                                                            fontFamily = Inter
                                                        )
                                                    }
                                                }
                                            }

                                            Spacer(modifier = Modifier.height(10.dp))

                                            // Emotion intensity — the snapshot's only true 0-100 metric
                                            Column(modifier = Modifier.fillMaxWidth()) {
                                                Text(
                                                    text = "${ent.primary_emotion.uppercase()} · ${ent.emotion_intensity}%",
                                                    color = Color(0xFFCFC2D7),
                                                    fontSize = 9.sp,
                                                    fontFamily = SpaceGrotesk,
                                                    letterSpacing = 0.5.sp
                                                )
                                                Spacer(modifier = Modifier.height(3.dp))
                                                LinearProgressIndicator(
                                                    progress = { ent.emotion_intensity / 100f },
                                                    color = Color(0xFF8A2BE2),
                                                    trackColor = Color(0xFF2C2C35),
                                                    modifier = Modifier.fillMaxWidth().height(4.dp)
                                                )
                                                if (ent.emotion_catalyst.isNotBlank()) {
                                                    Spacer(modifier = Modifier.height(5.dp))
                                                    Text(
                                                        text = "↳ ${ent.emotion_catalyst}",
                                                        color = Color(0xFF8A8590),
                                                        fontSize = 11.sp,
                                                        fontFamily = Inter,
                                                        lineHeight = 15.sp
                                                    )
                                                }
                                            }

                                            // Real rich-state surfaced as chips + counts (continuity completeness)
                                            if (ent.traits.isNotEmpty()) {
                                                Spacer(modifier = Modifier.height(8.dp))
                                                FlowRow(
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                    verticalArrangement = Arrangement.spacedBy(6.dp)
                                                ) {
                                                    ent.traits.take(6).forEach { t ->
                                                        Text(
                                                            text = t.body,
                                                            color = Color(0xFFDCB8FF),
                                                            fontSize = 10.sp,
                                                            fontFamily = SpaceGrotesk,
                                                            modifier = Modifier
                                                                .clip(RoundedCornerShape(6.dp))
                                                                .background(Color(0x268A2BE2))
                                                                .padding(horizontal = 8.dp, vertical = 3.dp)
                                                        )
                                                    }
                                                }
                                            }
                                            val extraCounts = buildList {
                                                if (ent.goals.isNotEmpty()) add("${ent.goals.size} goal${if (ent.goals.size > 1) "s" else ""}")
                                                if (ent.secrets.isNotEmpty()) add("${ent.secrets.size} secret${if (ent.secrets.size > 1) "s" else ""}")
                                                if (ent.knowledge_boundary.isNotEmpty()) add("knows ${ent.knowledge_boundary.size}")
                                            }
                                            if (extraCounts.isNotEmpty()) {
                                                Spacer(modifier = Modifier.height(6.dp))
                                                Text(
                                                    text = extraCounts.joinToString("   ·   "),
                                                    color = Color(0xFF7A7580),
                                                    fontSize = 10.sp,
                                                    fontFamily = SpaceGrotesk
                                                )
                                            }
                                        }
                                    }
                                }
                            }

                            // Relationships (relational_state) — previously unrendered
                            if (snapshot.relational_state.isNotEmpty()) {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(
                                        text = "RELATIONSHIPS",
                                        color = Color(0xFF00FBFB),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        fontFamily = SpaceGrotesk,
                                        letterSpacing = 1.sp
                                    )
                                    val entityNames = snapshot.entity_state.associate { it.entity_id to it.canonical_name }
                                    snapshot.relational_state.forEach { rel ->
                                        RelationshipCard(
                                            relationship = rel.copy(
                                                source_entity_name = entityNames[rel.source_entity_id] ?: rel.source_entity_name,
                                                target_entity_name = entityNames[rel.target_entity_id] ?: rel.target_entity_name
                                            ),
                                            modifier = Modifier.fillMaxWidth()
                                        )
                                    }
                                }
                            }

                            // Active Plot Threads
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    text = "ACTIVE THREADS",
                                    color = Color(0xFF00FBFB),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = SpaceGrotesk,
                                    letterSpacing = 1.sp
                                )
                                if (snapshot.narrative_state.active_threads.isEmpty()) {
                                    Text("No active plot threads.", color = Color.Gray, fontSize = 13.sp, fontFamily = Inter)
                                } else {
                                    snapshot.narrative_state.active_threads.forEach { th ->
                                        Card(
                                            shape = RoundedCornerShape(12.dp),
                                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Column(modifier = Modifier.padding(10.dp)) {
                                                Text(
                                                    text = th.objective,
                                                    color = Color.White,
                                                    fontSize = 13.sp,
                                                    fontFamily = Inter
                                                )
                                                Spacer(modifier = Modifier.height(4.dp))
                                                Text(
                                                    text = "STATUS: ${th.status.uppercase()}",
                                                    color = if (th.status == "open") Color(0xFF00FBFB) else Color.Yellow,
                                                    fontSize = 10.sp,
                                                    fontFamily = SpaceGrotesk,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        DeepScanButton(
                            isScanning = isScanning,
                            onClick = onTriggerDeepScan,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
                "pins" -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "PINNED FACTS",
                            color = Color(0xFF00FBFB),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = SpaceGrotesk,
                            letterSpacing = 1.sp
                        )
                        if (pins.isEmpty()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(150.dp)
                                    .border(BorderStroke(1.dp, Color(0xFF2C2C35)), RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "No pinned facts in this branch.",
                                    color = Color.Gray,
                                    fontSize = 12.sp,
                                    fontFamily = Inter
                                )
                            }
                        } else {
                            pins.forEach { pin ->
                                Card(
                                    shape = RoundedCornerShape(12.dp),
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(modifier = Modifier.padding(12.dp)) {
                                        Text(
                                            text = pin.body,
                                            color = Color.White,
                                            fontSize = 13.sp,
                                            fontFamily = Inter
                                        )
                                        // Source excerpt — quote of the turn this pin came from (web parity)
                                        val sourceTurn = turns.find { it.id == pin.turn_id }
                                        val excerpt = sourceTurn?.assistant_output_text?.takeIf { it.isNotBlank() }
                                            ?: sourceTurn?.user_input_text
                                        if (!excerpt.isNullOrBlank() && excerpt.trim() != pin.body.trim()) {
                                            Spacer(modifier = Modifier.height(6.dp))
                                            Text(
                                                text = "“${excerpt.take(120).trim()}${if (excerpt.length > 120) "…" else ""}”",
                                                color = Color(0xFF8A8590),
                                                fontSize = 11.sp,
                                                fontFamily = Inter,
                                                fontStyle = FontStyle.Italic,
                                                lineHeight = 15.sp
                                            )
                                        }
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                text = "Pinned from chat",
                                                color = Color.Gray,
                                                fontSize = 10.sp,
                                                fontFamily = SpaceGrotesk
                                            )
                                            Button(
                                                onClick = { onRemovePin(pin.id) },
                                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2C2C35)),
                                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                                shape = RoundedCornerShape(4.dp),
                                                modifier = Modifier.height(24.dp)
                                            ) {
                                                Text("Remove", color = Color.LightGray, fontSize = 10.sp)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                "timeline" -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "STORY TIMELINE",
                            color = Color(0xFF00FBFB),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = SpaceGrotesk,
                            letterSpacing = 1.sp
                        )
                        if (timelineEvents.isEmpty()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(150.dp)
                                    .border(BorderStroke(1.dp, Color(0xFF2C2C35)), RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "No timeline events recorded yet.",
                                    color = Color.Gray,
                                    fontSize = 12.sp,
                                    fontFamily = Inter
                                )
                            }
                        } else {
                            timelineEvents.forEach { ev ->
                                Card(
                                    shape = RoundedCornerShape(12.dp),
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(modifier = Modifier.padding(12.dp)) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                text = ev.title,
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp,
                                                fontFamily = Sora
                                            )
                                            Box(
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(4.dp))
                                                    .background(Color(0xFF8A2BE2).copy(alpha = 0.2f))
                                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                                            ) {
                                                Text(
                                                    text = "imp ${ev.importance}",
                                                    color = Color(0xFFDCB8FF),
                                                    fontSize = 9.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    fontFamily = SpaceGrotesk
                                                )
                                            }
                                        }
                                        Spacer(modifier = Modifier.height(6.dp))
                                        Text(
                                            text = ev.detail,
                                            color = Color.LightGray,
                                            fontSize = 12.sp,
                                            fontFamily = Inter,
                                            lineHeight = 16.sp
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                "branch" -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Text(
                            text = "BRANCH MANAGEMENT",
                            color = Color(0xFF00FBFB),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = SpaceGrotesk,
                            letterSpacing = 1.sp
                        )

                        // Branch stats
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("Active Branch:", color = Color.Gray, fontSize = 12.sp)
                                    Text(activeBranch.name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                }
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("Total Branches:", color = Color.Gray, fontSize = 12.sp)
                                    Text("${branches.size}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                }
                            }
                        }

                        // Git-style nested branch tree (parent → child by fork point)
                        Text(
                            text = "BRANCH TREE",
                            color = Color.Gray,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = SpaceGrotesk,
                            letterSpacing = 0.5.sp
                        )

                        val rootBranches = branches.filter { b ->
                            b.parent_branch_id == null || branches.none { it.id == b.parent_branch_id }
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            rootBranches.forEach { root ->
                                BranchTreeNode(
                                    branch = root,
                                    allBranches = branches,
                                    activeBranchId = activeBranch.id,
                                    depth = 0,
                                    onSwitch = onSwitchBranch
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun RelationshipCard(
    relationship: RelationalState,
    modifier: Modifier = Modifier
) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                RelationshipEndpoint(
                    label = "FROM",
                    name = relationship.source_entity_name,
                    modifier = Modifier.weight(1f)
                )
                Icon(
                    imageVector = Icons.Default.ArrowForward,
                    contentDescription = "relationship direction",
                    tint = Color(0xFFDCB8FF),
                    modifier = Modifier.size(18.dp)
                )
                RelationshipEndpoint(
                    label = "TO",
                    name = relationship.target_entity_name,
                    modifier = Modifier.weight(1f)
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color(0x2600FBFB))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = relationship.relationship_type.uppercase(),
                    color = Color(0xFF00FBFB),
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = SpaceGrotesk,
                    letterSpacing = 0.5.sp
                )
            }
            if (relationship.dynamic_status.isNotBlank()) {
                Text(
                    text = relationship.dynamic_status,
                    color = Color(0xFFB3ADBE),
                    fontSize = 11.sp,
                    fontFamily = Inter,
                    lineHeight = 16.sp,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
private fun RelationshipEndpoint(label: String, name: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(
            text = label,
            color = Color(0xFF7A7580),
            fontSize = 8.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = SpaceGrotesk,
            letterSpacing = 0.5.sp
        )
        Text(
            text = name,
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = Inter,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis
        )
    }
}

/** One node in the branch tree, recursively rendering its children indented underneath. */
@Composable
fun BranchTreeNode(
    branch: BranchEntity,
    allBranches: List<BranchEntity>,
    activeBranchId: String,
    depth: Int,
    onSwitch: (String) -> Unit
) {
    val isActive = branch.id == activeBranchId
    val children = allBranches.filter { it.parent_branch_id == branch.id }
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = (depth * 18).dp)
                .clip(RoundedCornerShape(8.dp))
                .background(if (isActive) Color(0xFF2A292E) else Color(0xFF1B1B1F))
                .clickable(enabled = !isActive) { onSwitch(branch.id) }
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (depth > 0) {
                Text(
                    text = "↳",
                    color = Color(0xFF6B6675),
                    fontSize = 12.sp,
                    fontFamily = SpaceGrotesk,
                    modifier = Modifier.padding(end = 6.dp)
                )
            }
            Icon(
                imageVector = Icons.Default.AccountTree,
                contentDescription = null,
                tint = if (isActive) Color(0xFF00FBFB) else Color(0xFF6B6675),
                modifier = Modifier.size(13.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = branch.name,
                color = if (isActive) Color.White else Color(0xFFCFC2D7),
                fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal,
                fontSize = 12.sp,
                fontFamily = Inter,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            if (isActive) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0x2600FBFB))
                        .padding(horizontal = 6.dp, vertical = 1.dp)
                ) {
                    Text("ACTIVE", color = Color(0xFF00FBFB), fontSize = 8.sp, fontWeight = FontWeight.Bold, fontFamily = SpaceGrotesk)
                }
            }
        }
        if (children.isNotEmpty()) {
            Spacer(modifier = Modifier.height(6.dp))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                children.forEach { child ->
                    BranchTreeNode(child, allBranches, activeBranchId, depth + 1, onSwitch)
                }
            }
        }
    }
}

@Composable
fun DeepScanButton(
    isScanning: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "glowTransition")
    val glowScale by infiniteTransition.animateFloat(
        initialValue = 0.8f,
        targetValue = 1.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glowScale"
    )

    Surface(
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(
            1.5.dp,
            Brush.horizontalGradient(
                colors = listOf(Color(0xFF8A2BE2), Color(0xFF00FBFB))
            )
        ),
        color = Color.Transparent,
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(enabled = !isScanning) { onClick() }
            .drawBehind {
                if (!isScanning) {
                    drawCircle(
                        brush = Brush.radialGradient(
                            colors = listOf(Color(0xFF8A2BE2).copy(alpha = 0.15f * glowScale), Color.Transparent),
                            radius = size.width * 0.7f
                        ),
                        center = center
                    )
                }
            }
    ) {
        Row(
            modifier = Modifier
                .background(Color(0xFF1B1B1F))
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            if (isScanning) {
                CircularProgressIndicator(
                    color = Color(0xFF00FBFB),
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "REQUESTING CONTINUITY UPDATE...",
                    fontFamily = SpaceGrotesk,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    color = Color(0xFF00FBFB)
                )
            } else {
                Text(
                    text = "UPDATE CONTINUITY NOW",
                    fontFamily = SpaceGrotesk,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    color = Color(0xFFE4E1E7),
                    letterSpacing = 1.2.sp
                )
            }
        }
    }
}
