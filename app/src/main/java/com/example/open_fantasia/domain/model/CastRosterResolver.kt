package com.example.open_fantasia.domain.model

/**
 * One-way bridge for snapshots created before Cast Roster existed. It derives only strong,
 * named candidates from the branch-valid snapshot. Once HCE writes cast_roster this path is
 * no longer used.
 */
fun resolveCastRoster(
    snapshot: DurableMemorySnapshot?,
    seeds: List<CastProfile>,
    overrides: List<CastProfile> = emptyList(),
    playerName: String? = null
): List<CastProfile> {
    val authoritative = snapshot?.cast_roster.orEmpty()
    val base = if (authoritative.isNotEmpty()) authoritative else legacyDiscoveredCast(snapshot, seeds, playerName)
    return buildMap {
        base.forEach { put(it.cast_id, it) }
        seeds.forEach { put(it.cast_id, it) }
        overrides.forEach { put(it.cast_id, it) }
    }.values.sortedWith(compareBy<CastProfile>({ it.provenance != "primary" }, { it.canonical_name.lowercase() }, { it.cast_id }))
}

private fun legacyDiscoveredCast(
    snapshot: DurableMemorySnapshot?,
    seeds: List<CastProfile>,
    playerName: String?
): List<CastProfile> {
    if (snapshot == null) return emptyList()
    val excludedNames = (seeds.map { it.canonical_name } + listOfNotNull(playerName)).map(::normalName).toSet()
    return snapshot.entity_state.mapNotNull { entity ->
        val name = entity.canonical_name.trim()
        val relations = snapshot.relational_state.filter {
            it.source_entity_id == entity.entity_id || it.target_entity_id == entity.entity_id
        }
        val evidenceCount = entity.traits.size + entity.goals.size + relations.size
        if (entity.entity_type !in setOf("character", "npc") ||
            !looksLikeNamedPerson(name) || normalName(name) in excludedNames || evidenceCount < 2
        ) return@mapNotNull null
        CastProfile(
            cast_id = "cast:legacy:${entity.entity_id}",
            entity_id = entity.entity_id,
            canonical_name = name.substringBefore(" (").trim(),
            aliases = entity.aliases,
            role_background = relations.joinToString(" ") { it.dynamic_status }.trim(),
            personality = entity.traits.joinToString("; ") { it.body },
            goals = entity.goals.joinToString("; ") { it.body },
            provenance = "continuity_discovered",
            evidence = (entity.traits + entity.goals).take(4).map { it.body },
            status = "active",
            speaker_eligible = true,
            player_controlled = false
        )
    }
}

private fun looksLikeNamedPerson(value: String): Boolean {
    val name = value.substringBefore(" (").trim()
    if (name.isBlank() || "'s" in name.lowercase()) return false
    val generic = setOf(
        "cashier", "server", "mother", "father", "husband", "wife", "minister",
        "representative", "assistant", "manager", "colleague", "doctor", "nurse", "guard"
    )
    val words = name.lowercase().split(Regex("[^a-z]+" )).filter { it.isNotBlank() }
    return words.isNotEmpty() && words.none { it in generic }
}

private fun normalName(value: String): String = value.lowercase().replace(Regex("[^a-z0-9]+"), "").trim()
