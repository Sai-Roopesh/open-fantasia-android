package com.openfantasia.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openfantasia.protocol.*

private val RumourGround = Color(0xFF30261A)
private val ToldGround = Color(0xFF1E2A3A)
private val SeenGround = Color(0xFF1A2E2A)

private enum class WorldTab(val label: String) { People("People"), Places("Places"), Calendar("Calendar") }

/**
 * The World screen as drawn in World.dc.html (openspec outside-the-scene: The World screen shows what the Player
 * Character knows): People, the Leads first; Places; and the Calendar. Tapping someone opens their page
 * (Person.dc.html). Everything here is what the Player Character knows: the Mac sends nothing else.
 */
@Composable fun WorldScreen(world: WorldView?, portrait: (String) -> PortraitSource?, back: () -> Unit, modifier: Modifier = Modifier) {
    var tab by rememberSaveable { mutableStateOf(WorldTab.People) }
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    val person = world?.people?.firstOrNull { it.name == open }
    if (person != null) {
        BackHandler { open = null }
        PersonPage(person, portrait, back = { open = null }, modifier = modifier)
        return
    }
    Column(modifier) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            IconButton(onClick = back, modifier = Modifier.size(44.dp).semantics { contentDescription = "Back to the Scene" }) {
                FantasiaIcon(FantasiaIconKind.Back, Modifier.size(22.dp))
            }
            Text("The World", modifier = Modifier.weight(1f), style = FantasiaType.pathsTitle)
        }
        Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (each in WorldTab.entries) {
                val chosen = each == tab
                Surface(onClick = { tab = each }, shape = FantasiaShapes.round, color = if (chosen) FantasiaRaised else Color.Transparent,
                    modifier = Modifier.height(40.dp).semantics { selected = chosen }) {
                    Box(Modifier.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                        Text(each.label, style = FantasiaType.metadata.copy(fontWeight = if (chosen) FontWeight.SemiBold else FontWeight.Normal),
                            color = if (chosen) FantasiaText else FantasiaSecondary)
                    }
                }
            }
        }
        HorizontalDivider(color = FantasiaHeaderLine)
        if (world == null) { Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@Column }
        when (tab) {
            WorldTab.People -> People(world.people, portrait, Modifier.weight(1f)) { open = it }
            WorldTab.Places -> Rows(world.places.isEmpty(), "No places yet.", Modifier.weight(1f)) {
                items(world.places, key = { it.name }) { place ->
                    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(place.name, style = FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold))
                        if (place.description.isNotBlank()) Text(place.description, style = FantasiaType.meta, color = FantasiaSecondary)
                        if (place.been) Text("You've been here", style = FantasiaType.small, color = FantasiaSeen)
                    }
                }
            }
            WorldTab.Calendar -> Rows(world.calendar.isEmpty(), "Nothing ahead that you know of.", Modifier.weight(1f)) {
                items(world.calendar, key = { "${it.kind}-${it.name}-${it.atLabel}" }) { item ->
                    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(item.name, style = FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold))
                        Text(item.what, style = FantasiaType.meta, color = FantasiaSecondary)
                        Text("${item.atLabel} · ${item.calendarItemWhen}", style = FantasiaType.small,
                            color = if (item.kind == CalendarKind.Landmark) FantasiaLabel else FailureAmber)
                    }
                }
            }
        }
    }
}

@Composable private fun Rows(empty: Boolean, nothing: String, modifier: Modifier, rows: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    if (empty) Box(modifier.fillMaxWidth().padding(24.dp)) { Text(nothing, style = FantasiaType.meta, color = FantasiaCaption) }
    else LazyColumn(modifier, contentPadding = PaddingValues(vertical = 8.dp), content = rows)
}

@Composable private fun People(people: List<WorldPerson>, portrait: (String) -> PortraitSource?, modifier: Modifier, open: (String) -> Unit) {
    val leads = people.filter { it.lead }
    val others = people.filterNot { it.lead }
    LazyColumn(modifier.testTag("world-people"), contentPadding = PaddingValues(bottom = 16.dp)) {
        if (leads.isNotEmpty()) {
            item(key = "leads") { Label("LEADS", Modifier.padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 6.dp)) }
            items(leads, key = { "lead-${it.name}" }) { PersonRow(it, portrait, 52.dp, open) }
        }
        if (others.isNotEmpty()) {
            item(key = "others") { Label("EVERYONE ELSE", Modifier.padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 6.dp)) }
            items(others, key = { "other-${it.name}" }) { PersonRow(it, portrait, 44.dp, open) }
        }
    }
}

@Composable private fun Label(text: String, modifier: Modifier = Modifier) = Text(text, modifier = modifier, style = FantasiaType.sectionLabel, color = FantasiaCaption)

@Composable private fun PersonRow(person: WorldPerson, portrait: (String) -> PortraitSource?, size: androidx.compose.ui.unit.Dp, open: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(enabled = !person.isGroup, role = Role.Button) { open(person.name) }.padding(horizontal = 20.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        PortraitImage(person.name, person.portraitURL?.let(portrait), Modifier.size(size), letters = FantasiaType.portraitLetter.copy(fontSize = 18.sp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(person.name, style = FantasiaType.plain.copy(fontWeight = FontWeight.SemiBold))
                if (person.isGroup) Text(" · Group", style = FantasiaType.meta, color = FantasiaCaption)
            }
            val line = person.known ?: person.heard.firstOrNull()?.text
            line?.let { Text(it, style = FantasiaType.meta, color = FantasiaSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}

/** A person's page, as drawn in Person.dc.html, without Edit and Replace Portrait, which come with editing. */
@Composable private fun PersonPage(person: WorldPerson, portrait: (String) -> PortraitSource?, back: () -> Unit, modifier: Modifier) {
    Column(modifier) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back, modifier = Modifier.size(44.dp).semantics { contentDescription = "Back to the World" }) {
                FantasiaIcon(FantasiaIconKind.Back, Modifier.size(22.dp))
            }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PortraitImage(person.name, person.portraitURL?.let(portrait), Modifier.size(width = 168.dp, height = 208.dp), shape = RoundedCornerShape(24.dp),
                    letters = FantasiaType.portraitLetter.copy(fontSize = 44.sp), alignment = Alignment.BottomCenter)
                Text(person.name, style = FantasiaType.sceneTitle, textAlign = TextAlign.Center)
                if (person.aliases.isNotEmpty()) Text("Also called ${person.aliases.joinToString(", ")}", style = FantasiaType.metadata, color = FantasiaSecondary, textAlign = TextAlign.Center)
            }
            Surface(shape = FantasiaShapes.card, color = FantasiaSurface, border = androidx.compose.foundation.BorderStroke(1.dp, FantasiaLine)) {
                Column {
                    Fact("Lead", if (person.lead) "The Story builds toward them" else null, if (person.lead) "Yes" else "No")
                    HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = FantasiaLine)
                    Fact("Group", null, person.group ?: "None")
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Label("WHAT YOU KNOW")
                Text(person.known ?: "Nothing yet, beyond what you've heard.", style = FantasiaType.previously.copy(lineHeight = 23.sp), color = FantasiaProse)
                person.knownFrom?.let { Text("From Scene ${it.number} · ${it.title}", style = FantasiaType.meta, color = FantasiaLabel) }
            }
            if (person.heard.isNotEmpty()) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Label("WHAT YOU'VE HEARD")
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
}

@Composable private fun Fact(name: String, line: String?, value: String) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(name, style = FantasiaType.plain)
            line?.let { Text(it, style = FantasiaType.small, color = FantasiaCaption) }
        }
        Text(value, style = FantasiaType.metadata, color = FantasiaSecondary)
    }
}
