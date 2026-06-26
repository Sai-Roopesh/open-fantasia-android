package com.example.open_fantasia.ui.persona

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.open_fantasia.data.local.entity.PersonaEntity
import com.example.open_fantasia.domain.portability.PortableJsonCodec
import com.example.open_fantasia.ui.components.PortableKind
import com.example.open_fantasia.ui.components.PromptPackPanel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonaScreen(
    viewModel: PersonaViewModel,
    modifier: Modifier = Modifier
) {
    val personas by viewModel.personas.collectAsState()
    val personaUsage by viewModel.personaUsage.collectAsState()
    // editingPersona holds a non-Parcelable PersonaEntity, so keep plain remember.
    var editingPersona by remember { mutableStateOf<PersonaEntity?>(null) }
    var isCreating by rememberSaveable { mutableStateOf(false) }

    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(viewModel.snackbarMessage) {
        viewModel.snackbarMessage.collect { message ->
            // Launch in a separate coroutine so the collector returns immediately
            // and does not back-pressure the ViewModel's emit while the snackbar shows.
            scope.launch { snackbarHostState.showSnackbar(message) }
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F13))
    ) {
        if (editingPersona != null || isCreating) {
            PersonaEditor(
                persona = editingPersona,
                onDismiss = {
                    editingPersona = null
                    isCreating = false
                },
                onSave = { id, name, identity, backstory, voice, goals, boundaries, notes, isDefault ->
                    viewModel.savePersona(id, name, identity, backstory, voice, goals, boundaries, notes, isDefault)
                    editingPersona = null
                    isCreating = false
                }
            )
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Persona Studio",
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.headlineMedium.copy(
                            brush = Brush.horizontalGradient(
                                colors = listOf(Color(0xFFFF007F), Color(0xFFFF7F00))
                            )
                        )
                    )
                    IconButton(
                        onClick = { isCreating = true },
                        colors = IconButtonDefaults.iconButtonColors(containerColor = Color(0xFF1F1F23))
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Add Persona", tint = Color.White)
                    }
                }

                if (personas.isEmpty()) {
                    Box(
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("No personas created yet.", color = Color.Gray, fontSize = 16.sp)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(personas, key = { it.id }) { persona ->
                            val usage = personaUsage[persona.id]
                            val usageText = if (usage != null) {
                                "${usage.total} threads · ${usage.active} active"
                            } else {
                                "0 threads · 0 active"
                            }
                            PersonaItem(
                                persona = persona,
                                usageText = usageText,
                                onClick = { editingPersona = persona },
                                onDelete = { viewModel.deletePersona(persona) },
                                onMakeDefault = { viewModel.makeDefault(persona.id) },
                                onDuplicate = { viewModel.duplicatePersona(persona) }
                            )
                        }
                    }
                }
            }
        }

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 16.dp)
        )
    }
}

@Composable
fun PersonaItem(
    persona: PersonaEntity,
    usageText: String,
    onClick: () -> Unit,
    onDelete: () -> Unit,
    onMakeDefault: () -> Unit,
    onDuplicate: () -> Unit
) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onMakeDefault) {
                Icon(
                    imageVector = if (persona.is_default) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                    contentDescription = "Default Persona",
                    tint = if (persona.is_default) Color(0xFFC40060) else Color.Gray
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = persona.name,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = usageText,
                    color = Color(0xFF00FBFB),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = persona.identity,
                    color = Color.Gray,
                    fontSize = 13.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            IconButton(onClick = onDuplicate) {
                Icon(Icons.Default.ContentCopy, contentDescription = "Duplicate Persona", tint = Color.Gray)
            }

            IconButton(onClick = onDelete) {
                Icon(Icons.Default.Delete, contentDescription = "Delete Persona", tint = Color.Gray)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonaEditor(
    persona: PersonaEntity?,
    onDismiss: () -> Unit,
    onSave: (
        id: String?,
        name: String,
        identity: String,
        backstory: String,
        voiceStyle: String,
        goals: String,
        boundaries: String,
        privateNotes: String,
        isDefault: Boolean
    ) -> Unit
) {
    var name by rememberSaveable { mutableStateOf(persona?.name ?: "") }
    var identity by rememberSaveable { mutableStateOf(persona?.identity ?: "") }
    var backstory by rememberSaveable { mutableStateOf(persona?.backstory ?: "") }
    var voiceStyle by rememberSaveable { mutableStateOf(persona?.voice_style ?: "") }
    var goals by rememberSaveable { mutableStateOf(persona?.goals ?: "") }
    var boundaries by rememberSaveable { mutableStateOf(persona?.boundaries ?: "") }
    var privateNotes by rememberSaveable { mutableStateOf(persona?.private_notes ?: "") }
    var isDefault by rememberSaveable { mutableStateOf(persona?.is_default ?: false) }

    val scrollState = rememberScrollState()

    // Web parity: reflect unsaved-changes state. Dirty = current field values differ
    // from the originally-loaded persona (or, for a new persona, any non-blank field).
    val isDirty = if (persona == null) {
        name.isNotBlank() || identity.isNotBlank() || backstory.isNotBlank() ||
            voiceStyle.isNotBlank() || goals.isNotBlank() || boundaries.isNotBlank() ||
            privateNotes.isNotBlank() || isDefault
    } else {
        name != persona.name || identity != persona.identity ||
            backstory != persona.backstory || voiceStyle != persona.voice_style ||
            goals != persona.goals || boundaries != persona.boundaries ||
            privateNotes != persona.private_notes || isDefault != persona.is_default
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (persona == null) "New Persona" else "Edit Persona", color = Color.White) },
                navigationIcon = {
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0F0F13))
            )
        },
        containerColor = Color(0xFF0F0F13)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            val textFieldColors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedContainerColor = Color(0xFF1F1F23),
                unfocusedContainerColor = Color(0xFF1F1F23),
                focusedBorderColor = Color(0xFFC40060),
                unfocusedBorderColor = Color(0xFF4C4354),
                cursorColor = Color(0xFFC40060)
            )

            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Name") },
                shape = RoundedCornerShape(8.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = identity,
                onValueChange = { identity = it },
                label = { Text("Identity / Role") },
                shape = RoundedCornerShape(8.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = backstory,
                onValueChange = { backstory = it },
                label = { Text("Backstory") },
                minLines = 3,
                shape = RoundedCornerShape(8.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = voiceStyle,
                onValueChange = { voiceStyle = it },
                label = { Text("Voice Style / Speech Habits") },
                shape = RoundedCornerShape(8.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = goals,
                onValueChange = { goals = it },
                label = { Text("Goals / Motivation") },
                shape = RoundedCornerShape(8.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = boundaries,
                onValueChange = { boundaries = it },
                label = { Text("Boundaries") },
                shape = RoundedCornerShape(8.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = privateNotes,
                onValueChange = { privateNotes = it },
                label = { Text("Private Notes") },
                shape = RoundedCornerShape(8.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().clickable { isDefault = !isDefault }
            ) {
                Checkbox(
                    checked = isDefault,
                    onCheckedChange = { isDefault = it },
                    colors = CheckboxDefaults.colors(checkedColor = Color(0xFFC40060))
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Set as Default Persona", color = Color.White)
            }

            // Web parity: sticky-footer save-state affordance.
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (isDirty) "Unsaved changes" else "In sync",
                        color = if (isDirty) Color(0xFF00FF87) else Color.Gray,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "Personas shape every new thread.",
                        color = Color.Gray,
                        fontSize = 11.sp
                    )
                }
            }

            Button(
                onClick = {
                    onSave(persona?.id, name, identity, backstory, voiceStyle, goals, boundaries, privateNotes, isDefault)
                },
                enabled = name.isNotBlank(),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC40060), contentColor = Color.White),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Save Persona", color = Color.White, fontWeight = FontWeight.Bold)
            }

            Spacer(modifier = Modifier.height(16.dp))

            // ── Prompt Pack Panel ──────────────────────────────────
            PromptPackPanel(
                kind = PortableKind.PERSONA,
                accentColor = Color(0xFFC40060),
                currentJson = {
                    val tempEntity = PersonaEntity(
                        id = persona?.id ?: "",
                        user_id = "",
                        name = name,
                        identity = identity,
                        backstory = backstory,
                        voice_style = voiceStyle,
                        goals = goals,
                        boundaries = boundaries,
                        private_notes = privateNotes,
                        is_default = isDefault,
                        created_at = "",
                        updated_at = ""
                    )
                    PortableJsonCodec.serializePersona(tempEntity)
                },
                onImportPersona = { data ->
                    name = data.name
                    identity = data.identity
                    backstory = data.backstory
                    voiceStyle = data.voice_style
                    goals = data.goals
                    boundaries = data.boundaries
                    privateNotes = data.private_notes
                }
            )

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}
