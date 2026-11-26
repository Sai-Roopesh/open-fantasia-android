package com.openfantasia.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openfantasia.protocol.*
import kotlinx.coroutines.launch

private val RumourGround = Color(0xFF30261A)
private val ToldGround = Color(0xFF1E2A3A)
private val SeenGround = Color(0xFF1A2E2A)

/** A person's page, from the World screen (what the Player Character knows) or from Everyone in the Story. */
data class PersonPageData(
    val name: String, val aliases: List<String>, val portraitURL: String?, val lead: Boolean, val group: String?,
    val known: String?, val knownFrom: SceneRef?, val heard: List<MeanwhileItem>, val playerCharacter: Boolean,
    /** Between you: their Bond with the Player Character, the newest turn first; null with no history (lasting-records). */
    val between: Between? = null
)

internal fun WorldPerson.page() = PersonPageData(name, aliases, portraitURL, lead, group, known, knownFrom, heard, playerCharacter = false, between = between)
internal fun PersonDetail.page() = PersonPageData(name, aliases, portraitURL, lead, group, known, null, emptyList(), playerCharacter, between = between)

/**
 * What the person page can change (openspec stories; editing-people design decision 7), all off while a Reply is
 * written or the Mac is away.
 */
class PersonActions(
    val enabled: Boolean,
    val groups: List<GroupInfo>?,
    val loadGroups: () -> Unit,
    val edit: (String) -> Unit,
    val setLead: (String, Boolean) -> Unit,
    val setGroup: (String, String?) -> Unit,
    val newGroup: (group: String, description: String, person: String?) -> Unit,
    val replacePortrait: (String) -> Unit
)

/** A person's page, as drawn in Person.dc.html: Edit, Replace Portrait, the Lead switch and the Group. */
@Composable internal fun PersonPage(person: PersonPageData, portrait: (String) -> PortraitSource?, actions: PersonActions, back: () -> Unit,
    backLabel: String, modifier: Modifier = Modifier) {
    var pickingGroup by remember { mutableStateOf(false) }
    Column(modifier) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back, modifier = Modifier.size(44.dp).semantics { contentDescription = backLabel }) {
                FantasiaIcon(FantasiaIconKind.Back, Modifier.size(22.dp))
            }
            Spacer(Modifier.weight(1f))
            OutlinedButton(onClick = { actions.edit(person.name) }, enabled = actions.enabled, modifier = Modifier.padding(end = 8.dp).height(40.dp),
                shape = FantasiaShapes.round, border = BorderStroke(1.dp, FantasiaStrongLine), contentPadding = PaddingValues(horizontal = 16.dp)) {
                Text("Edit", style = FantasiaType.metadata, color = if (actions.enabled) FantasiaText else FantasiaDisabled)
            }
        }
        Column(Modifier.weight(1f).testTag("person-page").verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PortraitImage(person.name, person.portraitURL?.let(portrait), Modifier.size(width = 168.dp, height = 208.dp), shape = RoundedCornerShape(24.dp),
                    letters = FantasiaType.portraitLetter.copy(fontSize = 44.sp), alignment = Alignment.BottomCenter)
                Surface(onClick = { actions.replacePortrait(person.name) }, enabled = actions.enabled, shape = FantasiaShapes.round, color = FantasiaRaised,
                    modifier = Modifier.height(36.dp)) {
                    Box(Modifier.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                        Text("Replace Portrait", style = FantasiaType.meta, color = if (actions.enabled) FantasiaSecondary else FantasiaDisabled)
                    }
                }
                Text(person.name, style = FantasiaType.sceneTitle, textAlign = TextAlign.Center)
                if (person.aliases.isNotEmpty()) Text("Also called ${person.aliases.joinToString(", ")}", style = FantasiaType.metadata, color = FantasiaSecondary, textAlign = TextAlign.Center)
            }
            if (person.playerCharacter) Text("You play them. They are no Lead, and in no Group.", style = FantasiaType.meta, color = FantasiaCaption)
            else Surface(shape = FantasiaShapes.card, color = FantasiaSurface, border = BorderStroke(1.dp, FantasiaLine)) {
                Column {
                    // The whole row is the switch, so its words toggle it too.
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag("lead-switch")
                        .toggleable(person.lead, enabled = actions.enabled, role = Role.Switch) { actions.setLead(person.name, it) }
                        .padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("Lead", style = FantasiaType.plain)
                            Text("The Story builds toward them", style = FantasiaType.small, color = FantasiaCaption)
                        }
                        Switch(checked = person.lead, onCheckedChange = null, enabled = actions.enabled,
                            colors = SwitchDefaults.colors(checkedTrackColor = FantasiaAccent, checkedThumbColor = Color.White))
                    }
                    HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = FantasiaLine)
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(enabled = actions.enabled, role = Role.Button) { actions.loadGroups(); pickingGroup = true }
                        .padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Group", style = FantasiaType.plain, modifier = Modifier.weight(1f))
                        Text(person.group ?: "None", style = FantasiaType.metadata, color = FantasiaSecondary)
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("WHAT YOU KNOW", style = FantasiaType.sectionLabel, color = FantasiaCaption)
                Text(person.known ?: "Nothing yet, beyond what you've heard.", style = FantasiaType.previously.copy(lineHeight = 23.sp), color = FantasiaProse)
                person.knownFrom?.let { Text("From Scene ${it.number} · ${it.title}", style = FantasiaType.meta, color = FantasiaLabel) }
            }
            person.between?.let { BetweenYou(it) }
            if (person.heard.isNotEmpty()) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("WHAT YOU'VE HEARD", style = FantasiaType.sectionLabel, color = FantasiaCaption)
                for (line in person.heard) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                        val (tag, ground, ink) = when (line.how) {
                            How.Rumour -> Triple("RUMOUR", RumourGround, FantasiaRumour)
                            How.Told -> Triple("TOLD", ToldGround, FantasiaTold)
                            How.Seen -> Triple("SEEN", SeenGround, FantasiaSeen)
                        }
                        Text(tag, modifier = Modifier.width(58.dp).background(ground, RoundedCornerShape(8.dp)).padding(vertical = 3.dp),
                            style = FantasiaType.meanwhileTag, color = ink, textAlign = TextAlign.Center)
                        Text(line.text, style = FantasiaType.detail, color = FantasiaProse)
                    }
                }
            }
        }
    }
    if (pickingGroup) GroupPicker(actions.groups, person.group, onDismiss = { pickingGroup = false },
        choose = { group -> pickingGroup = false; if (group != person.group) actions.setGroup(person.name, group) },
        create = { group, description -> pickingGroup = false; actions.newGroup(group, description, person.name) })
}

/**
 * Between you, as drawn in Person.dc.html (openspec outside-the-scene: The World screen shows what the Player Character
 * knows): where things stand, then the turns that brought it there, the newest first and marked, each with its Scene.
 */
@Composable private fun BetweenYou(between: Between) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("BETWEEN YOU", style = FantasiaType.sectionLabel, color = FantasiaCaption)
        Text(between.standing, style = FantasiaType.previously.copy(lineHeight = 23.sp), color = FantasiaProse,
            modifier = Modifier.fillMaxWidth().background(FantasiaSurface, RoundedCornerShape(14.dp)).border(1.dp, FantasiaLine, RoundedCornerShape(14.dp))
                .padding(horizontal = 14.dp, vertical = 12.dp))
        between.turns.forEachIndexed { index, turn ->
            val newest = index == 0
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 2.dp)) {
                Box(Modifier.padding(top = 6.dp).size(8.dp).background(if (newest) FantasiaLabel else FantasiaStrongLine, CircleShape))
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(turn.text, style = FantasiaType.detail, color = if (newest) FantasiaText else FantasiaSecondary)
                    turn.sceneNumber?.let { number -> Text("Scene $number · ${turn.sceneTitle ?: ""}".trimEnd(' ', '·'), style = FantasiaType.small, color = FantasiaLabel) }
                }
            }
        }
    }
}

/** Which Group someone is in: None, each Group, or a new one (openspec stories: Groups are the player's to arrange). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun GroupPicker(groups: List<GroupInfo>?, current: String?, onDismiss: () -> Unit, choose: (String?) -> Unit, create: (String, String) -> Unit) {
    var creating by remember { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), shape = FantasiaShapes.sheet,
        containerColor = FantasiaSurface, contentColor = FantasiaText, scrimColor = FantasiaScrim, dragHandle = null, sheetGesturesEnabled = false) {
        Column(Modifier.fillMaxWidth().testTag("group-picker").padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (creating) {
                var name by rememberSaveable { mutableStateOf("") }
                var description by rememberSaveable { mutableStateOf("") }
                Text("A new Group", style = FantasiaType.sheetTitle, modifier = Modifier.padding(bottom = 8.dp))
                Field("Name", name, Modifier.testTag("group-name")) { name = it }
                Field("What they are, as anyone would know it", description, Modifier.testTag("group-description"), lines = 2) { description = it }
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End)) {
                    TextButton(onClick = { creating = false }) { Text("Back", style = FantasiaType.plain, color = FantasiaSecondary) }
                    Button(onClick = { create(name.trim(), description.trim()) }, enabled = name.isNotBlank(), shape = FantasiaShapes.round) { Text("Add the Group", style = FantasiaType.button) }
                }
            } else {
                Text("Group", style = FantasiaType.sheetTitle, modifier = Modifier.padding(bottom = 8.dp))
                if (groups == null) Box(Modifier.fillMaxWidth().height(80.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                else {
                    PickRow("None", current == null) { choose(null) }
                    for (group in groups) PickRow(group.name, group.name == current, group.description) { choose(group.name) }
                    PickRow("New Group…", false) { creating = true }
                }
            }
        }
    }
}

@Composable private fun PickRow(label: String, chosen: Boolean, line: String? = null, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(role = Role.Button, onClick = onClick).padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            Text(label, style = FantasiaType.plain.copy(fontWeight = if (chosen) FontWeight.SemiBold else FontWeight.Normal), color = if (chosen) FantasiaPressed else FantasiaText)
            line?.takeIf { it.isNotBlank() }?.let { Text(it, style = FantasiaType.small, color = FantasiaCaption) }
        }
        if (chosen) Text("✓", color = FantasiaPressed, style = FantasiaType.plain)
    }
}

/** Everyone in the Story, for editing (the player's choice of 7 October 2026): no one's description, only their place. */
@Composable fun EveryoneScreen(people: PeopleView?, portrait: (String) -> PortraitSource?, enabled: Boolean, back: () -> Unit, add: () -> Unit,
    open: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back, modifier = Modifier.size(44.dp).semantics { contentDescription = "Back to the World" }) {
                FantasiaIcon(FantasiaIconKind.Back, Modifier.size(22.dp))
            }
            Text("Everyone in the Story", style = FantasiaType.pathsTitle, modifier = Modifier.weight(1f))
        }
        HorizontalDivider(color = FantasiaHeaderLine)
        if (people == null) { Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@Column }
        LazyColumn(Modifier.weight(1f).testTag("everyone"), contentPadding = PaddingValues(vertical = 8.dp)) {
            item(key = "add") {
                Row(Modifier.fillMaxWidth().clickable(enabled = enabled, role = Role.Button, onClick = add).padding(horizontal = 20.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Box(Modifier.size(44.dp).background(FantasiaRaised, FantasiaShapes.round), contentAlignment = Alignment.Center) {
                        FantasiaIcon(FantasiaIconKind.Add, Modifier.size(20.dp), if (enabled) FantasiaLabel else FantasiaDisabled)
                    }
                    Text("Add a person", style = FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold), color = if (enabled) FantasiaLabel else FantasiaDisabled)
                }
            }
            items(people.people, key = { it.name }) { person ->
                Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { open(person.name) }.padding(horizontal = 20.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    PortraitImage(person.name, person.portraitURL?.let(portrait), Modifier.size(44.dp), letters = FantasiaType.portraitLetter.copy(fontSize = 16.sp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(person.name, style = FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold))
                        val place = when { person.playerCharacter -> "You"; person.lead -> "Lead"; else -> person.group }
                        place?.let { Text(it, style = FantasiaType.meta, color = if (person.lead) FantasiaLabel else FantasiaSecondary) }
                    }
                }
            }
        }
    }
}

/**
 * The person editor (editing-people design decision 7): everything the Story keeps of someone, who they really are
 * included, shown only here. A new person can be given a Portrait before they are added.
 */
@Composable fun PersonEditor(editing: PersonEditing, playerCharacter: String, enabled: Boolean, pickPortrait: suspend () -> PickedImage?,
    cancel: () -> Unit, save: (name: String, edit: PersonEdit, portrait: PickedImage?) -> Unit, modifier: Modifier = Modifier) {
    val person = editing.person
    val key = person?.name ?: "new"
    var name by rememberSaveable(key) { mutableStateOf(person?.name ?: "") }
    var aliases by rememberSaveable(key) { mutableStateOf(person?.aliases?.joinToString(", ") ?: "") }
    var who by rememberSaveable(key) { mutableStateOf(person?.whoTheyAre ?: "") }
    var known by rememberSaveable(key) { mutableStateOf(person?.known ?: "") }
    var appearance by rememberSaveable(key) { mutableStateOf(person?.appearance ?: "") }
    var wants by rememberSaveable(key) { mutableStateOf(person?.wants ?: "") }
    var voice by rememberSaveable(key) { mutableStateOf(person?.voice?.joinToString("\n") ?: "") }
    var picked by remember(key) { mutableStateOf<PickedImage?>(null) }
    val scope = rememberCoroutineScope()
    BackHandler(onBack = cancel)
    val ready = name.isNotBlank() && who.isNotBlank() && enabled && !editing.saving
    Column(modifier) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = cancel) { Text("Cancel", style = FantasiaType.plain, color = FantasiaSecondary) }
            Text(person?.name ?: "A new person", style = FantasiaType.pathsTitle, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            Button(onClick = {
                save(name.trim(), PersonEdit(after = "", create = person == null, aliases = aliases.split(",").map { it.trim() }.filter { it.isNotEmpty() },
                    whoTheyAre = who.trim(), known = known.trim().ifEmpty { null }, appearance = appearance.trim(), wants = wants.trim(),
                    voice = voice.lines().map { it.trim() }.filter { it.isNotEmpty() }, knows = person?.knows ?: emptyList(), group = person?.group), picked)
            }, enabled = ready, shape = FantasiaShapes.round, contentPadding = PaddingValues(horizontal = 16.dp), modifier = Modifier.height(40.dp)) {
                Text(if (person == null) "Add to the Story" else "Save", style = FantasiaType.retryButton)
            }
        }
        HorizontalDivider(color = FantasiaHeaderLine)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            editing.problem?.let { Text(it, style = FantasiaType.detail, color = FailureAmber) }
            if (person == null) {
                Field("Name", name, Modifier.testTag("person-name")) { name = it }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { scope.launch { pickPortrait()?.let { picked = it } } }, shape = FantasiaShapes.round,
                        border = BorderStroke(1.dp, FantasiaStrongLine)) { Text("Choose a Portrait", style = FantasiaType.metadata, color = FantasiaText) }
                    if (picked != null) Text("Portrait chosen", style = FantasiaType.meta, color = FantasiaSeen)
                }
            }
            Field("Other names, with commas between", aliases, Modifier.testTag("person-aliases")) { aliases = it }
            Field("Who they are", who, Modifier.testTag("person-who"), lines = 4,
                note = "Their backstory, what nobody knows included. Only Edit shows it.") { who = it }
            Field("What ${firstName(playerCharacter)} knows of them", known, Modifier.testTag("person-known"), lines = 3,
                note = "What the World screen shows of them.") { known = it }
            Field("Appearance", appearance, Modifier.testTag("person-appearance"), lines = 2) { appearance = it }
            Field("What they're after", wants, Modifier.testTag("person-wants"), lines = 2) { wants = it }
            Field("How they talk: lines they have said, one to a line", voice, Modifier.testTag("person-voice"), lines = 3) { voice = it }
        }
    }
}

@Composable private fun Field(label: String, value: String, modifier: Modifier, lines: Int = 1, note: String? = null, change: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = FantasiaType.fieldLabel, color = FantasiaSecondary)
        note?.let { Text(it, style = FantasiaType.small, color = FantasiaCaption) }
        BasicTextField(value = value, onValueChange = change, minLines = lines, maxLines = maxOf(lines, 8), textStyle = FantasiaType.direction.copy(color = FantasiaText),
            cursorBrush = SolidColor(FantasiaLabel), modifier = modifier.fillMaxWidth().semantics { contentDescription = label }
                .background(FantasiaBackground, FantasiaShapes.field).border(1.dp, FantasiaStrongLine, FantasiaShapes.field).padding(horizontal = 15.dp, vertical = 13.dp))
    }
}
