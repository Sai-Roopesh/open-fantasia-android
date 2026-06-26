package com.example.open_fantasia.ui.character

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.open_fantasia.data.local.entity.CharacterEntity
import com.example.open_fantasia.domain.model.ExampleConversation
import com.example.open_fantasia.domain.portability.PortableJsonCodec
import com.example.open_fantasia.ui.components.PortableKind
import com.example.open_fantasia.ui.components.PromptPackPanel
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CharacterScreen(
    viewModel: CharacterViewModel,
    modifier: Modifier = Modifier
) {
    val characters by viewModel.characters.collectAsState()
    var editingChar by remember { mutableStateOf<CharacterEntity?>(null) }
    var isCreating by remember { mutableStateOf(false) }

    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(viewModel.snackbarMessage) {
        viewModel.snackbarMessage.collect { message ->
            snackbarHostState.showSnackbar(message)
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F13))
    ) {
        if (editingChar != null || isCreating) {
            CharacterEditor(
                character = editingChar,
                onDismiss = {
                    editingChar = null
                    isCreating = false
                },
                onSave = { id, name, story, core, greeting, appearance, style, def, neg, temp, topP, starters, examples, triggerGen ->
                    viewModel.saveCharacter(id, name, story, core, greeting, appearance, style, def, neg, temp, topP, starters, examples, triggerGen)
                    editingChar = null
                    isCreating = false
                },
                onRegeneratePortrait = { characterId ->
                    viewModel.regeneratePortrait(characterId)
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
                        text = "Character Studio",
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.headlineMedium.copy(
                            brush = Brush.horizontalGradient(
                                colors = listOf(Color(0xFF00FF87), Color(0xFF00FBFB))
                            )
                        )
                    )
                    IconButton(
                        onClick = { isCreating = true },
                        colors = IconButtonDefaults.iconButtonColors(containerColor = Color(0xFF1F1F23))
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Add Character", tint = Color.White)
                    }
                }

                if (characters.isEmpty()) {
                    Box(
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("No characters created yet.", color = Color.Gray, fontSize = 16.sp)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(characters, key = { it.id }) { char ->
                            CharacterItem(
                                character = char,
                                onClick = { editingChar = char },
                                onDelete = { viewModel.deleteCharacter(char) }
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
fun CharacterItem(
    character: CharacterEntity,
    onClick: () -> Unit,
    onDelete: () -> Unit
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
            // Resolve file existence off the recomposition hot path: keyed by path so the
            // blocking exists() check runs once per item, not on every recomposition/scroll.
            val portraitPath = character.portrait_path
            val portraitFile = remember(portraitPath) {
                portraitPath?.let { File(it) }?.takeIf { it.exists() }
            }
            if (portraitFile != null) {
                AsyncImage(
                    model = portraitFile,
                    contentDescription = character.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(12.dp))
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF2C2C35)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = character.name.take(1),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 22.sp
                    )
                }
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = character.name,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = character.story,
                    color = Color.Gray,
                    fontSize = 13.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Portrait: ${character.portrait_status}",
                    color = when (character.portrait_status) {
                        "ready" -> Color(0xFF00FF87)
                        "pending" -> Color(0xFF00FBFB)
                        "failed" -> Color.Red
                        else -> Color.Gray
                    },
                    fontSize = 11.sp
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            IconButton(onClick = onDelete) {
                Icon(Icons.Default.Delete, contentDescription = "Delete Character", tint = Color.Gray)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CharacterEditor(
    character: CharacterEntity?,
    onDismiss: () -> Unit,
    onSave: (
        id: String?,
        name: String,
        story: String,
        corePersona: String,
        greeting: String,
        appearance: String,
        styleRules: String,
        definition: String,
        negativeGuidance: String,
        temperature: Double,
        topP: Double,
        starters: List<String>,
        exampleConversations: List<ExampleConversation>,
        triggerPortraitGen: Boolean
    ) -> Unit,
    onRegeneratePortrait: (characterId: String) -> Unit = {}
) {
    var name by remember { mutableStateOf(character?.name ?: "") }
    var story by remember { mutableStateOf(character?.story ?: "") }
    var corePersona by remember { mutableStateOf(character?.core_persona ?: "") }
    var definition by remember { mutableStateOf(character?.definition ?: "") }
    var greeting by remember { mutableStateOf(character?.greeting ?: "") }
    var appearance by remember { mutableStateOf(character?.appearance ?: "") }
    var styleRules by remember { mutableStateOf(character?.style_rules ?: "") }
    var negativeGuidance by remember { mutableStateOf(character?.negative_guidance ?: "") }
    var temperature by remember { mutableStateOf(character?.temperature ?: 0.92) }
    var topP by remember { mutableStateOf(character?.top_p ?: 0.94) }
    var startersInput by remember { mutableStateOf(character?.starters?.joinToString("\n") ?: "") }

    var exampleUserLine by remember { mutableStateOf("") }
    var exampleCharLine by remember { mutableStateOf("") }
    val exampleConversations = remember { mutableStateListOf<ExampleConversation>().apply {
        character?.example_conversations?.let { addAll(it) }
    } }

    val scrollState = rememberScrollState()

    // Tab state for the 4-tab editor (Story | Voice | Starters | Examples)
    var selectedTab by rememberSaveable { mutableStateOf(0) }
    val tabTitles = listOf("Story", "Voice", "Starters", "Examples")

    // Per-tab completion: each tab is "complete" when its key field(s) are non-blank.
    val startersComplete = startersInput.lines().any { it.isNotBlank() }
    val examplesComplete = exampleConversations.any { it.user_line.isNotBlank() || it.character_line.isNotBlank() } ||
        exampleUserLine.isNotBlank() || exampleCharLine.isNotBlank()
    val tabComplete = listOf(
        name.isNotBlank() && story.isNotBlank(), // Story
        styleRules.isNotBlank(),                 // Voice
        startersComplete,                        // Starters
        examplesComplete                         // Examples
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (character == null) "New Character" else "Edit Character", color = Color.White) },
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
                focusedBorderColor = Color(0xFF00FBFB),
                unfocusedBorderColor = Color(0xFF4C4354),
                cursorColor = Color(0xFF00FBFB)
            )

            // ── Tab bar with per-tab completion indicator ──────────────
            ScrollableTabRow(
                selectedTabIndex = selectedTab,
                containerColor = Color(0xFF14141A),
                contentColor = Color(0xFF00FBFB),
                edgePadding = 0.dp,
                divider = {}
            ) {
                tabTitles.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        selectedContentColor = Color(0xFF00FBFB),
                        unselectedContentColor = Color.Gray
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = title,
                                fontSize = 14.sp,
                                fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal,
                                color = if (selectedTab == index) Color.White else Color.Gray
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            // Completion dot: filled (accent) when complete, hollow otherwise.
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .then(
                                        if (tabComplete[index]) {
                                            Modifier.background(Color(0xFF00FF87))
                                        } else {
                                            Modifier.background(Color(0xFF2C2C35))
                                        }
                                    )
                            )
                        }
                    }
                }
            }

            when (selectedTab) {
                // ── Tab 1: Story ──────────────────────────────────────
                0 -> {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Name") },
                        shape = RoundedCornerShape(8.dp),
                        colors = textFieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = story,
                        onValueChange = { story = it },
                        label = { Text("Story Setting / Lore") },
                        minLines = 3,
                        shape = RoundedCornerShape(8.dp),
                        colors = textFieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = corePersona,
                        onValueChange = { corePersona = it },
                        label = { Text("Core Persona / Backstory") },
                        minLines = 3,
                        shape = RoundedCornerShape(8.dp),
                        colors = textFieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = greeting,
                        onValueChange = { greeting = it },
                        label = { Text("Greeting Message") },
                        minLines = 2,
                        shape = RoundedCornerShape(8.dp),
                        colors = textFieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = appearance,
                        onValueChange = { appearance = it },
                        label = { Text("Physical Appearance (for portrait generation)") },
                        shape = RoundedCornerShape(8.dp),
                        colors = textFieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )

                    // ── Portrait section (preview + status + regenerate) ──
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Portrait", color = Color.White, fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.height(12.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                val portraitFile = character?.portrait_path?.let { File(it) }
                                if (portraitFile != null && portraitFile.exists()) {
                                    AsyncImage(
                                        model = portraitFile,
                                        contentDescription = character.name,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .size(96.dp)
                                            .clip(RoundedCornerShape(12.dp))
                                    )
                                } else {
                                    Box(
                                        modifier = Modifier
                                            .size(96.dp)
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(Color(0xFF1E1E24)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text("No portrait", color = Color.Gray, fontSize = 12.sp)
                                    }
                                }
                                Spacer(modifier = Modifier.width(16.dp))
                                Column {
                                    val status = character?.portrait_status ?: "idle"
                                    Text(
                                        text = "Status: $status",
                                        color = when (status) {
                                            "ready" -> Color(0xFF00FF87)
                                            "pending" -> Color(0xFF00FBFB)
                                            "failed" -> Color.Red
                                            else -> Color.Gray
                                        },
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = when {
                                            appearance.isBlank() -> "Add an appearance and save to queue a portrait."
                                            character == null -> "Save first to queue portrait generation."
                                            status == "pending" -> "Generating... reopen to check."
                                            status == "ready" -> "Portrait ready."
                                            status == "failed" -> "Generation failed. Try regenerating."
                                            else -> "Use \"Save & Regenerate Portrait\" below to (re)generate."
                                        },
                                        color = Color.Gray,
                                        fontSize = 11.sp
                                    )
                                    character?.portrait_last_error?.let {
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Text("Error: $it", color = Color.Red, fontSize = 11.sp)
                                    }
                                }
                            }

                            // ── Dedicated "Regenerate portrait" action ──
                            // Web parity: re-enqueue portrait for the already-saved
                            // character without re-saving the form. Enabled only when
                            // the character is saved AND its SAVED appearance is non-blank.
                            val savedAppearance = character?.appearance?.trim() ?: ""
                            if (character != null && savedAppearance.isNotBlank()) {
                                Spacer(modifier = Modifier.height(12.dp))
                                OutlinedButton(
                                    onClick = { onRegeneratePortrait(character.id) },
                                    shape = RoundedCornerShape(8.dp),
                                    border = BorderStroke(2.dp, Color(0xFF00FBFB)),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF00FBFB))
                                ) {
                                    Text("Regenerate portrait", color = Color(0xFF00FBFB), fontWeight = FontWeight.Bold)
                                }
                                if (appearance.trim() != savedAppearance) {
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        "Unsaved appearance changes won't affect the portrait until saved.",
                                        color = Color(0xFFFFB000),
                                        fontSize = 11.sp
                                    )
                                }
                            }
                        }
                    }
                }

                // ── Tab 2: Voice ──────────────────────────────────────
                1 -> {
                    OutlinedTextField(
                        value = styleRules,
                        onValueChange = { styleRules = it },
                        label = { Text("Writing Style / Style Rules") },
                        minLines = 3,
                        shape = RoundedCornerShape(8.dp),
                        colors = textFieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = definition,
                        onValueChange = { definition = it },
                        label = { Text("Behavior Rules / Definition") },
                        minLines = 3,
                        shape = RoundedCornerShape(8.dp),
                        colors = textFieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = negativeGuidance,
                        onValueChange = { negativeGuidance = it },
                        label = { Text("Negative Guidance / Boundaries") },
                        minLines = 2,
                        shape = RoundedCornerShape(8.dp),
                        colors = textFieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Column {
                        Text("Temperature: ${"%.2f".format(temperature)}", color = Color.White, fontSize = 14.sp)
                        Slider(
                            value = temperature.toFloat(),
                            onValueChange = { temperature = it.toDouble() },
                            valueRange = 0f..2f,
                            colors = SliderDefaults.colors(
                                thumbColor = Color(0xFF00FF87),
                                activeTrackColor = Color(0xFF00FF87),
                                inactiveTrackColor = Color(0xFF2C2C35)
                            )
                        )
                    }

                    Column {
                        Text("Top P: ${"%.2f".format(topP)}", color = Color.White, fontSize = 14.sp)
                        Slider(
                            value = topP.toFloat(),
                            onValueChange = { topP = it.toDouble() },
                            valueRange = 0f..1f,
                            colors = SliderDefaults.colors(
                                thumbColor = Color(0xFF00FBFB),
                                activeTrackColor = Color(0xFF00FBFB),
                                inactiveTrackColor = Color(0xFF2C2C35)
                            )
                        )
                    }
                }

                // ── Tab 3: Starters ───────────────────────────────────
                2 -> {
                    OutlinedTextField(
                        value = startersInput,
                        onValueChange = { startersInput = it },
                        label = { Text("Conversation Starters (one per line)") },
                        minLines = 4,
                        shape = RoundedCornerShape(8.dp),
                        colors = textFieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        "Scene-openers, not generic greetings. One per line.",
                        color = Color.Gray,
                        fontSize = 12.sp
                    )
                }

                // ── Tab 4: Examples ───────────────────────────────────
                3 -> {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B1F)),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Example Conversations", color = Color.White, fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.height(12.dp))
                            exampleConversations.forEachIndexed { idx, ex ->
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("USER: ${ex.user_line}", color = Color.Gray, fontSize = 13.sp)
                                        Text("CHAR: ${ex.character_line}", color = Color.White, fontSize = 13.sp)
                                    }
                                    IconButton(onClick = { exampleConversations.removeAt(idx) }) {
                                        Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color.Gray)
                                    }
                                }
                            }
                            Spacer(modifier = Modifier.height(12.dp))
                            OutlinedTextField(
                                value = exampleUserLine,
                                onValueChange = { exampleUserLine = it },
                                label = { Text("User line") },
                                shape = RoundedCornerShape(8.dp),
                                colors = textFieldColors,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedTextField(
                                value = exampleCharLine,
                                onValueChange = { exampleCharLine = it },
                                label = { Text("Character line") },
                                shape = RoundedCornerShape(8.dp),
                                colors = textFieldColors,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(
                                onClick = {
                                    if (exampleUserLine.isNotEmpty() || exampleCharLine.isNotEmpty()) {
                                        exampleConversations.add(ExampleConversation(exampleUserLine, exampleCharLine))
                                        exampleUserLine = ""
                                        exampleCharLine = ""
                                    }
                                },
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1F1F23))
                            ) {
                                Text("Add Example", color = Color(0xFF00FBFB))
                            }
                        }
                    }
                }
            }

            // Include any example line the user typed but didn't tap "Add Example" for,
            // so unsaved in-progress input isn't silently dropped on save.
            fun collectExamples(): List<ExampleConversation> {
                val list = exampleConversations.toMutableList()
                if (exampleUserLine.isNotBlank() || exampleCharLine.isNotBlank()) {
                    list.add(ExampleConversation(exampleUserLine, exampleCharLine))
                }
                return list
            }

            // Save Buttons
            Button(
                onClick = {
                    val startersList = startersInput.lines().filter { it.isNotBlank() }
                    onSave(
                        character?.id, name, story, corePersona, greeting, appearance, styleRules,
                        definition, negativeGuidance, temperature, topP, startersList, collectExamples(),
                        false
                    )
                },
                enabled = name.isNotBlank(),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00FF87), contentColor = Color.Black),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Save Character", color = Color.Black, fontWeight = FontWeight.Bold)
            }

            Button(
                onClick = {
                    val startersList = startersInput.lines().filter { it.isNotBlank() }
                    onSave(
                        character?.id, name, story, corePersona, greeting, appearance, styleRules,
                        definition, negativeGuidance, temperature, topP, startersList, collectExamples(),
                        true
                    )
                },
                enabled = name.isNotBlank(),
                shape = RoundedCornerShape(8.dp),
                border = BorderStroke(2.dp, Color(0xFF00FBFB)),
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Save & Regenerate Portrait", color = Color.White, fontWeight = FontWeight.Bold)
            }

            Spacer(modifier = Modifier.height(16.dp))

            // ── Prompt Pack Panel ──────────────────────────────────
            PromptPackPanel(
                kind = PortableKind.CHARACTER,
                accentColor = Color(0xFF00FBFB),
                currentJson = {
                    val startersList = startersInput.lines().filter { it.isNotBlank() }
                    val tempEntity = CharacterEntity(
                        id = character?.id ?: "",
                        user_id = "",
                        name = name,
                        story = story,
                        core_persona = corePersona,
                        greeting = greeting,
                        appearance = appearance,
                        style_rules = styleRules,
                        definition = definition,
                        negative_guidance = negativeGuidance,
                        temperature = temperature,
                        top_p = topP,
                        starters = startersList,
                        example_conversations = exampleConversations.toList(),
                        portrait_status = "idle",
                        portrait_path = null,
                        portrait_prompt = null,
                        portrait_seed = null,
                        portrait_source_hash = null,
                        portrait_last_error = null,
                        portrait_generated_at = null,
                        created_at = "",
                        updated_at = ""
                    )
                    PortableJsonCodec.serializeCharacter(tempEntity)
                },
                onImportCharacter = { data ->
                    name = data.name
                    story = data.story
                    corePersona = data.core_persona
                    greeting = data.greeting
                    appearance = data.appearance
                    styleRules = data.style_rules
                    definition = data.definition
                    negativeGuidance = data.negative_guidance
                    startersInput = data.suggested_starters.joinToString("\n")
                    exampleConversations.clear()
                    exampleConversations.addAll(data.example_conversations)
                }
            )

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}
