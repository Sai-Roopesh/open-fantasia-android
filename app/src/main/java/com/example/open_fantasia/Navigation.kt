package com.example.open_fantasia

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.example.open_fantasia.theme.SpaceGrotesk
import com.example.open_fantasia.ui.ViewModelFactory
import com.example.open_fantasia.ui.character.CharacterScreen
import com.example.open_fantasia.ui.character.CharacterViewModel
import com.example.open_fantasia.ui.chat.ChatScreen
import com.example.open_fantasia.ui.chat.ChatViewModel
import com.example.open_fantasia.ui.dashboard.DashboardScreen
import com.example.open_fantasia.ui.dashboard.DashboardViewModel
import com.example.open_fantasia.ui.persona.PersonaScreen
import com.example.open_fantasia.ui.persona.PersonaViewModel
import com.example.open_fantasia.ui.settings.SettingsScreen
import com.example.open_fantasia.ui.settings.SettingsViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainNavigation() {
    val context = LocalContext.current
    val app = context.applicationContext as OpenFantasiaApplication
    val appContainer = app.appContainer

    val backStack = rememberNavBackStack(Dashboard)
    val currentKey = backStack.lastOrNull()

    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    val isRootRoute = currentKey is Dashboard || currentKey is CharacterStudio || currentKey is PersonaStudio || currentKey is Settings

    ModalNavigationDrawer(
        drawerState = drawerState,
        // Open via the menu button only; swipe is for closing once open. A content-wide
        // open-gesture on every root screen was swallowing taps and opening the drawer on
        // stray horizontal movement.
        gesturesEnabled = drawerState.isOpen,
        drawerContent = {
            if (isRootRoute) {
                ModalDrawerSheet(
                    drawerContainerColor = Color(0xFF16161C)
                ) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Open Fantasia",
                        fontWeight = FontWeight.Bold,
                        fontSize = 22.sp,
                        color = Color.White,
                        modifier = Modifier.padding(16.dp)
                    )
                    HorizontalDivider(color = Color.DarkGray)
                    Spacer(modifier = Modifier.height(8.dp))
                    NavigationDrawerItem(
                        icon = { Icon(Icons.Default.Menu, contentDescription = null) },
                        label = { Text("Dashboard") },
                        selected = currentKey is Dashboard,
                        onClick = {
                            scope.launch { drawerState.close() }
                            if (currentKey !is Dashboard) {
                                backStack.clear()
                                backStack.add(Dashboard)
                            }
                        },
                        colors = NavigationDrawerItemDefaults.colors(
                            selectedContainerColor = Color(0xFF8A2BE2),
                            selectedIconColor = Color.White,
                            selectedTextColor = Color.White,
                            unselectedIconColor = Color.Gray,
                            unselectedTextColor = Color.Gray,
                            unselectedContainerColor = Color.Transparent
                        ),
                        modifier = Modifier.padding(horizontal = 12.dp)
                    )
                    NavigationDrawerItem(
                        icon = { Icon(Icons.Default.Person, contentDescription = null) },
                        label = { Text("Characters") },
                        selected = currentKey is CharacterStudio,
                        onClick = {
                            scope.launch { drawerState.close() }
                            if (currentKey !is CharacterStudio) {
                                backStack.clear()
                                backStack.add(CharacterStudio)
                            }
                        },
                        colors = NavigationDrawerItemDefaults.colors(
                            selectedContainerColor = Color(0xFF8A2BE2),
                            selectedIconColor = Color.White,
                            selectedTextColor = Color.White,
                            unselectedIconColor = Color.Gray,
                            unselectedTextColor = Color.Gray,
                            unselectedContainerColor = Color.Transparent
                        ),
                        modifier = Modifier.padding(horizontal = 12.dp)
                    )
                    NavigationDrawerItem(
                        icon = { Icon(Icons.Default.Face, contentDescription = null) },
                        label = { Text("Personas") },
                        selected = currentKey is PersonaStudio,
                        onClick = {
                            scope.launch { drawerState.close() }
                            if (currentKey !is PersonaStudio) {
                                backStack.clear()
                                backStack.add(PersonaStudio)
                            }
                        },
                        colors = NavigationDrawerItemDefaults.colors(
                            selectedContainerColor = Color(0xFF8A2BE2),
                            selectedIconColor = Color.White,
                            selectedTextColor = Color.White,
                            unselectedIconColor = Color.Gray,
                            unselectedTextColor = Color.Gray,
                            unselectedContainerColor = Color.Transparent
                        ),
                        modifier = Modifier.padding(horizontal = 12.dp)
                    )
                    NavigationDrawerItem(
                        icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                        label = { Text("Settings") },
                        selected = currentKey is Settings,
                        onClick = {
                            scope.launch { drawerState.close() }
                            if (currentKey !is Settings) {
                                backStack.clear()
                                backStack.add(Settings)
                            }
                        },
                        colors = NavigationDrawerItemDefaults.colors(
                            selectedContainerColor = Color(0xFF8A2BE2),
                            selectedIconColor = Color.White,
                            selectedTextColor = Color.White,
                            unselectedIconColor = Color.Gray,
                            unselectedTextColor = Color.Gray,
                            unselectedContainerColor = Color.Transparent
                        ),
                        modifier = Modifier.padding(horizontal = 12.dp)
                    )
                }
            }
        }
    ) {
        Scaffold(
            topBar = {
                if (isRootRoute) {
                    TopAppBar(
                        title = {},
                        navigationIcon = {
                            IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                Icon(Icons.Default.Menu, contentDescription = "Menu", tint = Color.White)
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0F0F13))
                    )
                }
            },
            bottomBar = {
                if (isRootRoute) {
                    StitchBottomNavigation(
                        currentRoute = when (currentKey) {
                            is Dashboard -> "dashboard"
                            is CharacterStudio -> "characters"
                            is PersonaStudio -> "personas"
                            is Settings -> "settings"
                            else -> "dashboard"
                        },
                        onNavigate = { route ->
                            val targetKey = when (route) {
                                "dashboard" -> Dashboard
                                "characters" -> CharacterStudio
                                "personas" -> PersonaStudio
                                "settings" -> Settings
                                else -> Dashboard
                            }
                            if (currentKey != targetKey) {
                                backStack.clear()
                                backStack.add(targetKey)
                            }
                        }
                    )
                }
            },
            containerColor = Color(0xFF0F0F13)
        ) { paddingValues ->
            NavDisplay(
                backStack = backStack,
                onBack = { backStack.removeLastOrNull() },
                entryProvider = { key ->
                    when (key) {
                        is Dashboard -> {
                            NavEntry(key) { _ ->
                                val factory = remember { ViewModelFactory(appContainer, app) }
                                val vm = viewModel<DashboardViewModel>(factory = factory)
                                DashboardScreen(
                                    viewModel = vm,
                                    onThreadSelected = { tid -> backStack.add(Chat(tid)) },
                                    onNavigateToTab = { route ->
                                        val targetKey = when (route) {
                                            "dashboard" -> Dashboard
                                            "characters" -> CharacterStudio
                                            "personas" -> PersonaStudio
                                            "settings" -> Settings
                                            else -> Dashboard
                                        }
                                        if (currentKey != targetKey) {
                                            backStack.clear()
                                            backStack.add(targetKey)
                                        }
                                    },
                                    modifier = Modifier.padding(paddingValues)
                                )
                            }
                        }
                        is Chat -> {
                            NavEntry(key) { _ ->
                                val factory = remember(key.threadId) { ViewModelFactory(appContainer, app, key.threadId) }
                                val vm = viewModel<ChatViewModel>(key = key.threadId, factory = factory)
                                ChatScreen(
                                    viewModel = vm,
                                    onBack = { backStack.removeLastOrNull() }
                                )
                            }
                        }
                        is CharacterStudio -> {
                            NavEntry(key) { _ ->
                                val factory = remember { ViewModelFactory(appContainer, app) }
                                val vm = viewModel<CharacterViewModel>(factory = factory)
                                CharacterScreen(
                                    viewModel = vm,
                                    modifier = Modifier.padding(paddingValues)
                                )
                            }
                        }
                        is PersonaStudio -> {
                            NavEntry(key) { _ ->
                                val factory = remember { ViewModelFactory(appContainer, app) }
                                val vm = viewModel<PersonaViewModel>(factory = factory)
                                PersonaScreen(
                                    viewModel = vm,
                                    modifier = Modifier.padding(paddingValues)
                                )
                            }
                        }
                        is Settings -> {
                            NavEntry(key) { _ ->
                                val factory = remember { ViewModelFactory(appContainer, app) }
                                val vm = viewModel<SettingsViewModel>(factory = factory)
                                SettingsScreen(
                                    viewModel = vm,
                                    modifier = Modifier.padding(paddingValues)
                                )
                            }
                        }
                        else -> throw IllegalArgumentException("Unknown key: $key")
                    }
                }
            )
        }
    }
}

@Composable
fun StitchBottomNavigation(
    currentRoute: String,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val tabs = listOf(
        Triple("Chat", "dashboard", Color(0xFF8A2BE2)),
        Triple("Characters", "characters", Color(0xFF00FBFB)),
        Triple("Personas", "personas", Color(0xFFC40060)),
        Triple("Settings", "settings", Color(0xFF8A2BE2))
    )

    Surface(
        color = Color(0xFF131317),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.navigationBars)
                .height(64.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            tabs.forEach { (label, route, glowColor) ->
                val isSelected = currentRoute == route
                val icon = when (route) {
                    "dashboard" -> Icons.Default.Menu
                    "characters" -> Icons.Default.Person
                    "personas" -> Icons.Default.Face
                    "settings" -> Icons.Default.Settings
                    else -> Icons.Default.Menu
                }

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clickable { onNavigate(route) }
                        .padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .drawBehind {
                                if (isSelected) {
                                    drawCircle(
                                        brush = Brush.radialGradient(
                                            colors = listOf(
                                                glowColor.copy(alpha = 0.25f),
                                                Color.Transparent
                                            ),
                                            radius = size.width * 0.8f
                                        ),
                                        center = center
                                    )
                                }
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = icon,
                            contentDescription = label,
                            tint = if (isSelected) glowColor else Color.Gray,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = label,
                        color = if (isSelected) Color.White else Color.Gray,
                        fontSize = 10.sp,
                        fontFamily = SpaceGrotesk,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                    )
                }
            }
        }
    }
}
