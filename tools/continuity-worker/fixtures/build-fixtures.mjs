#!/usr/bin/env node
/**
 * Generates the shared validation fixture corpus.
 *
 * The Mac Host validates a Continuity response in JavaScript and Android re-validates the same
 * invariants in Kotlin, written separately. Android is the final authority, so any rule it enforces
 * that the host does not is a guaranteed late failure: the host accepts, the phone rejects, and a
 * full engine run is lost after the fact. These fixtures are the contract both must agree on.
 *
 * Each case is deliberately one mutation away from a valid snapshot, so a disagreement names the
 * exact rule that drifted.
 */
import { mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "validation");

const TARGET = "turn-7";
const REACHABLE = ["old-turn", "turn-7"];

const entity = (id, name) => ({
  entity_id: id, canonical_name: name, entity_type: "character", aliases: [], is_present: true,
  primary_emotion: "calm", emotion_intensity: 10, emotion_catalyst: "",
  knowledge_boundary: [], traits: [], goals: [], secrets: [], abilities: [], possessions: []
});

const member = (overrides = {}) => ({
  cast_id: "primary:thread-1", entity_id: "hero", canonical_name: "Hero", aliases: [],
  role_background: "Lead", personality: "Steady", voice_style: "", appearance: "",
  goals: "", boundaries: "", provenance: "primary", first_seen_turn_id: null,
  evidence: [], status: "active", speaker_eligible: true, player_controlled: false,
  manual_locks: ["canonical_name", "personality"], ...overrides
});

const baseSeed = member();

function baseWorldState() {
  return {
    metadata: { current_turn_id: TARGET, narrative_timestamp: "now", transition_type: "continuation", version: 2 },
    spatial_state: {
      current_location: { id: "room", name: "Room", description: "", environmental_modifiers: [] },
      adjacent_locations: [],
      known_locations: [{ id: "room", name: "Room", description: "", environmental_modifiers: [] }],
      edges: [],
      entity_placements: [{ entity_id: "hero", entity_name: "Hero", location_id: "room", location_name: "Room", micro_position: "inside" }]
    },
    entity_state: [entity("hero", "Hero")],
    relational_state: [],
    narrative_state: { story_summary: "Story", scene_summary: "Scene", last_turn_beat: "Beat", active_threads: [], resolved_threads: [] },
    cast_roster: [member()]
  };
}

/** Adds a second character so cases can exercise duplicates and discovered lineage. */
function withSecond(world, overrides = {}) {
  world.entity_state.push(entity("vera", "Vera"));
  world.spatial_state.entity_placements.push({
    entity_id: "vera", entity_name: "Vera", location_id: "room", location_name: "Room", micro_position: "at the bar"
  });
  world.cast_roster.push(member({
    cast_id: "cast:vera", entity_id: "vera", canonical_name: "Vera", provenance: "continuity_discovered",
    first_seen_turn_id: "old-turn", manual_locks: [], ...overrides
  }));
  return world;
}

const cases = [];
const add = (name, expect, reason, mutate) => {
  const world = baseWorldState();
  mutate?.(world);
  cases.push({ name, expect, reason, target_turn_id: TARGET, baseline_version: 1, reachable_turn_ids: REACHABLE, seeds: [baseSeed], world_state: world });
};

add("accepts a minimal valid snapshot", "accept", "baseline");
add("accepts a discovered member with reachable lineage", "accept", "baseline", w => withSecond(w));

add("rejects a snapshot targeting the wrong exchange", "reject", "Snapshot targets the wrong exchange",
  w => { w.metadata.current_turn_id = "old-turn"; });
add("rejects a snapshot with the wrong version", "reject", "Snapshot has the wrong version",
  w => { w.metadata.version = 5; });
add("rejects an over-long story summary", "reject", "Story Summary exceeds 20,000 characters",
  w => { w.narrative_state.story_summary = "x".repeat(20_001); });
add("rejects an over-long scene summary", "reject", "Scene Summary exceeds 8,000 characters",
  w => { w.narrative_state.scene_summary = "x".repeat(8_001); });
add("rejects an over-long latest beat", "reject", "Latest Beat exceeds 4,000 characters",
  w => { w.narrative_state.last_turn_beat = "x".repeat(4_001); });
add("rejects duplicate entity ids", "reject", "Duplicate entity IDs",
  w => { w.entity_state.push(entity("hero", "Hero Twin")); });
add("rejects duplicate location ids", "reject", "Duplicate location IDs",
  w => { w.spatial_state.known_locations.push({ id: "room", name: "Room Again", description: "", environmental_modifiers: [] }); });
add("rejects an unknown current location", "reject", "Invalid current location reference",
  w => { w.spatial_state.current_location = { id: "void", name: "Void", description: "", environmental_modifiers: [] }; });
add("rejects an unknown adjacent location", "reject", "Invalid adjacent location reference",
  w => { w.spatial_state.adjacent_locations.push({ id: "void", name: "Void" }); });
add("rejects an edge to an unknown location", "reject", "Invalid location edge reference",
  w => { w.spatial_state.edges.push({ edge_id: "e1", from_location_id: "room", to_location_id: "void", is_bidirectional: true }); });
add("rejects a placement of an unknown entity", "reject", "Invalid placement reference",
  w => { w.spatial_state.entity_placements.push({ entity_id: "ghost", entity_name: "Ghost", location_id: "room", location_name: "Room", micro_position: "" }); });
add("rejects a relationship to an unknown entity", "reject", "Invalid relationship reference",
  w => {
    w.relational_state.push({
      relationship_id: "rel:1", source_entity_id: "hero", source_entity_name: "Hero",
      target_entity_id: "ghost", target_entity_name: "Ghost", relationship_type: "social", dynamic_status: ""
    });
  });
add("rejects duplicate relationship ids", "reject", "Duplicate relationship IDs",
  w => {
    withSecond(w);
    const rel = {
      relationship_id: "rel:1", source_entity_id: "hero", source_entity_name: "Hero",
      target_entity_id: "vera", target_entity_name: "Vera", relationship_type: "social", dynamic_status: ""
    };
    w.relational_state.push(rel, { ...rel });
  });
add("rejects an empty cast roster", "reject", "Cast Roster is missing",
  w => { w.cast_roster = []; });
add("rejects a cast member with a blank name", "reject", "Cast member identity is missing",
  w => { withSecond(w, { canonical_name: "   " }); });
add("rejects duplicate cast ids", "reject", "Duplicate cast IDs",
  w => { withSecond(w, { cast_id: "primary:thread-1", canonical_name: "Vera" }); });
add("rejects duplicate cast names differing only by case", "reject", "Duplicate cast names",
  w => { withSecond(w, { canonical_name: "hero" }); });
add("rejects the player persona in the roster", "reject", "Player persona cannot enter Cast Roster",
  w => { withSecond(w, { player_controlled: true }); });
add("rejects a cast member with no world entity", "reject", "Every Cast Member must reference a world entity",
  w => { w.cast_roster.push(member({ cast_id: "cast:ghost", entity_id: "ghost", canonical_name: "Ghost", manual_locks: [] })); });
add("rejects a discovered member with null lineage", "reject", "Discovered Cast Member has invalid lineage provenance",
  w => { withSecond(w, { first_seen_turn_id: null }); });
add("rejects a discovered member whose lineage is unreachable", "reject", "Discovered Cast Member has invalid lineage provenance",
  w => { withSecond(w, { first_seen_turn_id: "turn-from-another-branch" }); });
add("rejects a roster that dropped a seed", "reject", "Cast Roster dropped seed",
  w => { w.cast_roster = [member({ cast_id: "cast:other", entity_id: "hero", canonical_name: "Other", manual_locks: [] })]; });
add("rejects a changed locked seed field", "reject", "Locked cast field changed",
  w => { w.cast_roster[0].personality = "Rewritten by the engine"; });

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const [index, value] of cases.entries()) {
  const slug = value.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  await writeFile(join(outDir, `${String(index + 1).padStart(2, "0")}-${slug}.json`), `${JSON.stringify(value, null, 2)}\n`);
}
console.log(`${cases.length} fixtures written to ${outDir}`);
console.log(`${(await readdir(outDir)).length} files`);
