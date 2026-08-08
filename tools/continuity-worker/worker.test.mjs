import assert from "node:assert/strict";
import test from "node:test";
import { applyAuthoritativeCastLocks, canonicalizeResponse, requestRevision, resolveExchangeReferences, toModelFacingRequest, validateResponse } from "./worker-lib.mjs";

function fixture() {
  const request = {
    protocol_version: 2,
    request_id: "request-1",
    thread_id: "thread-1",
    branch_id: "branch-1",
    target_turn_id: "turn-7",
    baseline_hash: "baseline-hash",
    baseline_version: 1,
    attempt_count: 0,
    exchanges: [
      { turn_id: "old-turn", parent_turn_id: null, user: "Earlier", assistant: "Earlier reply", created_at: "before" },
      { turn_id: "turn-7", parent_turn_id: "old-turn", user: "Hello", assistant: "Hi", created_at: "now" }
    ],
    checkpoint_turn_ids: ["turn-7"],
    cast_seeds: [{
      cast_id: "primary:thread-1", entity_id: "hero", canonical_name: "Hero", aliases: [],
      role_background: "Lead", personality: "Steady", voice_style: "", appearance: "",
      goals: "", boundaries: "", provenance: "primary", first_seen_turn_id: null,
      evidence: [], status: "active", speaker_eligible: true, player_controlled: false,
      manual_locks: ["canonical_name", "personality"]
    }]
  };
  const response = {
    protocol_version: 2,
    request_id: request.request_id,
    attempt_count: request.attempt_count,
    thread_id: request.thread_id,
    branch_id: request.branch_id,
    target_turn_id: request.target_turn_id,
    baseline_hash: request.baseline_hash,
    world_state: {
      metadata: { current_turn_id: request.target_turn_id, narrative_timestamp: "now", transition_type: "continuation", version: 2 },
      spatial_state: {
        current_location: { id: "room", name: "Room", description: "", environmental_modifiers: [] },
        adjacent_locations: [],
        known_locations: [{ id: "room", name: "Room", description: "", environmental_modifiers: [] }],
        edges: [],
        entity_placements: [{ entity_id: "hero", entity_name: "Hero", location_id: "room", location_name: "Room", micro_position: "inside" }]
      },
      entity_state: [{
        entity_id: "hero", canonical_name: "Hero", entity_type: "character", aliases: [], is_present: true,
        primary_emotion: "calm", emotion_intensity: 1, emotion_catalyst: "",
        knowledge_boundary: [], traits: [], goals: [], secrets: [], abilities: [], possessions: []
      }],
      relational_state: [],
      narrative_state: { story_summary: "Story", scene_summary: "Scene", last_turn_beat: "Beat", active_threads: [], resolved_threads: [] },
      cast_roster: [{
        cast_id: "primary:thread-1", entity_id: "hero", canonical_name: "Hero", aliases: [],
        role_background: "Lead", personality: "Steady", voice_style: "", appearance: "",
        goals: "", boundaries: "", provenance: "primary", first_seen_turn_id: null,
        evidence: [], status: "active", speaker_eligible: true, player_controlled: false,
        manual_locks: ["canonical_name", "personality"]
      }]
    },
    timeline_events: []
  };
  return { request, response };
}

test("rejects a placement that references a missing entity", () => {
  const { request, response } = fixture();
  response.world_state.spatial_state.entity_placements[0].entity_id = "missing";
  assert.throws(() => validateResponse(request, response), /Invalid placement reference/);
});

test("a retry has a distinct worker revision", () => {
  const { request } = fixture();
  assert.notEqual(requestRevision(request), requestRevision({ ...request, attempt_count: 1 }));
});

test("rejects a response from a stale retry attempt", () => {
  const { request, response } = fixture();
  response.attempt_count = request.attempt_count + 1;
  assert.throws(() => validateResponse(request, response), /attempt mismatch/);
});

test("rejects timeline events that reference a turn outside the checkpoint window", () => {
  const { request, response } = fixture();
  response.timeline_events = [{
    turn_id: "old-turn",
    title: "Reveal",
    detail: "A truth emerged.",
    importance: 5,
    event_type: "reveal",
    affected_entity_ids: ["hero"],
    affected_relationship_ids: []
  }];
  assert.throws(() => validateResponse(request, response), /Invalid timeline turn reference/);
});

test("rejects a roster that changes a locked seed field", () => {
  const { request, response } = fixture();
  response.world_state.cast_roster[0].personality = "Changed";
  assert.throws(() => validateResponse(request, response), /Locked cast field changed/);
});

test("restores locked cast fields from the authoritative seed before validation", () => {
  const { request, response } = fixture();
  response.world_state.cast_roster[0].canonical_name = "Rewritten Hero";
  response.world_state.cast_roster[0].personality = "Rewritten personality";
  response.world_state.cast_roster[0].provenance = "manual_seed";
  response.world_state.cast_roster[0].first_seen_turn_id = "turn-7";
  response.world_state.cast_roster[0].manual_locks = [];

  const canonical = applyAuthoritativeCastLocks(request, response);

  assert.equal(canonical.world_state.cast_roster[0].canonical_name, "Hero");
  assert.equal(canonical.world_state.cast_roster[0].personality, "Steady");
  assert.equal(canonical.world_state.cast_roster[0].provenance, "primary");
  assert.equal(canonical.world_state.cast_roster[0].first_seen_turn_id, null);
  assert.deepEqual(canonical.world_state.cast_roster[0].manual_locks, ["canonical_name", "personality"]);
  assert.doesNotThrow(() => validateResponse(request, canonical));
});

test("authoritative projection never recreates a cast seed the model dropped", () => {
  const { request, response } = fixture();
  response.world_state.cast_roster = [];

  const canonical = applyAuthoritativeCastLocks(request, response);

  assert.throws(() => validateResponse(request, canonical), /Missing Cast Roster/);
});

test("rejects the player persona in the cast roster", () => {
  const { request, response } = fixture();
  response.world_state.cast_roster[0].player_controlled = true;
  assert.throws(() => validateResponse(request, response), /Player persona/);
});

// ─── Discovered cast lineage repair ─────────────────────────────────

/** Adds a discovered member whose introducing exchange is `old-turn`. */
function withDiscovered({ request, response }, firstSeen) {
  request.exchanges[0].assistant = "Earlier reply where Vera pours the wine";
  response.world_state.entity_state.push({
    entity_id: "vera", canonical_name: "Vera", entity_type: "character", aliases: [], is_present: true,
    primary_emotion: "wary", emotion_intensity: 40, emotion_catalyst: "",
    knowledge_boundary: [], traits: [], goals: [], secrets: [], abilities: [], possessions: []
  });
  response.world_state.spatial_state.entity_placements.push({
    entity_id: "vera", entity_name: "Vera", location_id: "room", location_name: "Room", micro_position: "at the bar"
  });
  response.world_state.cast_roster.push({
    cast_id: "cast:vera:abc", entity_id: "vera", canonical_name: "Vera", aliases: [],
    role_background: "Innkeeper", personality: "Blunt", voice_style: "", appearance: "",
    goals: "", boundaries: "", provenance: "continuity_discovered", first_seen_turn_id: firstSeen,
    evidence: [], status: "active", speaker_eligible: true, player_controlled: false, manual_locks: []
  });
  return { request, response };
}

test("dates a discovered member from the earliest exchange naming them", () => {
  const { request, response } = withDiscovered(fixture(), null);

  const canonical = canonicalizeResponse(request, response);

  const vera = canonical.world_state.cast_roster.find(m => m.cast_id === "cast:vera:abc");
  assert.equal(vera.first_seen_turn_id, "old-turn");
  assert.doesNotThrow(() => validateResponse(request, canonical));
});

test("repairs a hallucinated turn id instead of failing the whole checkpoint", () => {
  const { request, response } = withDiscovered(fixture(), "turn-7-b4d-uuid-the-model-invented");

  const canonical = canonicalizeResponse(request, response);

  const vera = canonical.world_state.cast_roster.find(m => m.cast_id === "cast:vera:abc");
  assert.equal(vera.first_seen_turn_id, "old-turn");
  assert.doesNotThrow(() => validateResponse(request, canonical));
});

test("keeps a correct turn id the engine supplied", () => {
  const { request, response } = withDiscovered(fixture(), "turn-7");

  const canonical = canonicalizeResponse(request, response);

  assert.equal(canonical.world_state.cast_roster.find(m => m.cast_id === "cast:vera:abc").first_seen_turn_id, "turn-7");
});

test("carries forward the established first-seen exchange for an existing discovered member", () => {
  const { request, response } = withDiscovered(fixture(), null);
  request.current_cast_roster = [{ cast_id: "cast:vera:abc", canonical_name: "Vera", first_seen_turn_id: "turn-7" }];

  const canonical = canonicalizeResponse(request, response);

  assert.equal(canonical.world_state.cast_roster.find(m => m.cast_id === "cast:vera:abc").first_seen_turn_id, "turn-7");
});

test("falls back to the first checkpoint exchange when no exchange names the member", () => {
  const { request, response } = withDiscovered(fixture(), null);
  request.exchanges[0].assistant = "Earlier reply";

  const canonical = canonicalizeResponse(request, response);

  assert.equal(canonical.world_state.cast_roster.find(m => m.cast_id === "cast:vera:abc").first_seen_turn_id, "turn-7");
  assert.doesNotThrow(() => validateResponse(request, canonical));
});

test("matches a member by alias, and only on a whole word", () => {
  const { request, response } = withDiscovered(fixture(), null);
  request.exchanges[0].assistant = "Earlier reply mentioning silverware but no innkeeper";
  request.exchanges[1].assistant = "Hi, says Ash";
  const vera = response.world_state.cast_roster.find(m => m.cast_id === "cast:vera:abc");
  vera.aliases = ["Ash"];

  const canonical = canonicalizeResponse(request, response);

  // "Ash" must not match inside "silverware"-style prose on the earlier exchange.
  assert.equal(canonical.world_state.cast_roster.find(m => m.cast_id === "cast:vera:abc").first_seen_turn_id, "turn-7");
});

test("repair still cannot ground a member with no reachable exchanges at all", () => {
  const { request, response } = withDiscovered(fixture(), null);
  request.exchanges = [];

  const canonical = canonicalizeResponse(request, response);

  assert.throws(() => validateResponse(request, canonical), /invalid lineage provenance/);
});

// ─── Timeline event grounding ───────────────────────────────────────

function withTimelineEvent({ request, response }, overrides) {
  response.timeline_events = [{
    turn_id: "turn-7", title: "A reveal", detail: "Something changed", importance: 3,
    event_type: "plot", affected_entity_ids: [], affected_relationship_ids: [],
    ...overrides
  }];
  return { request, response };
}

test("drops a timeline event whose turn id was mistranscribed, keeping the snapshot", () => {
  const { request, response } = withTimelineEvent(fixture(), { turn_id: "turn-7-invented-by-model" });

  const canonical = canonicalizeResponse(request, response);

  assert.deepEqual(canonical.timeline_events, []);
  assert.equal(canonical.world_state.narrative_state.story_summary, "Story");
  assert.doesNotThrow(() => validateResponse(request, canonical));
});

test("keeps a grounded timeline event untouched", () => {
  const { request, response } = withTimelineEvent(fixture(), {});

  const canonical = canonicalizeResponse(request, response);

  assert.equal(canonical.timeline_events.length, 1);
  assert.equal(canonical.timeline_events[0].title, "A reveal");
});

test("drops a timeline event referencing an entity absent from the snapshot", () => {
  const { request, response } = withTimelineEvent(fixture(), { affected_entity_ids: ["ghost"] });

  const canonical = canonicalizeResponse(request, response);

  assert.deepEqual(canonical.timeline_events, []);
  assert.doesNotThrow(() => validateResponse(request, canonical));
});

test("clamps timeline importance rather than dropping the event", () => {
  const { request, response } = withTimelineEvent(fixture(), { importance: 9 });

  const canonical = canonicalizeResponse(request, response);

  assert.equal(canonical.timeline_events.length, 1);
  assert.equal(canonical.timeline_events[0].importance, 5);
  assert.doesNotThrow(() => validateResponse(request, canonical));
});

test("an oversized timeline array is still a protocol violation", () => {
  const { request, response } = fixture();
  response.timeline_events = Array.from({ length: 8 }, () => ({
    turn_id: "turn-7", title: "Beat", detail: "", importance: 3, event_type: "plot",
    affected_entity_ids: [], affected_relationship_ids: []
  }));

  const canonical = canonicalizeResponse(request, response);

  assert.throws(() => validateResponse(request, canonical), /Too many timeline events/);
});

// ─── Ordinal exchange references ────────────────────────────────────

test("model-facing request numbers exchanges and flags checkpoint ordinals", () => {
  const { request } = fixture();

  const view = toModelFacingRequest(request);

  assert.deepEqual(view.exchanges.map(e => e.exchange_index), [1, 2]);
  assert.deepEqual(view.checkpoint_exchange_indexes, [2]);
  assert.equal(view.exchanges[1].turn_id, "turn-7");
  // The stored request must stay untouched — it is what validation runs against.
  assert.equal(request.exchanges[0].exchange_index, undefined);
});

test("resolves an ordinal cast reference to its turn id", () => {
  const { request, response } = withDiscovered(fixture(), "#1");

  const canonical = canonicalizeResponse(request, response);

  assert.equal(canonical.world_state.cast_roster.find(m => m.cast_id === "cast:vera:abc").first_seen_turn_id, "old-turn");
  assert.doesNotThrow(() => validateResponse(request, canonical));
});

test("accepts every ordinal spelling an engine might emit", () => {
  for (const spelling of ["#2", "2", "exchange 2", "exchange:2", "  #2  "]) {
    const { request, response } = withDiscovered(fixture(), spelling);
    const canonical = canonicalizeResponse(request, response);
    assert.equal(
      canonical.world_state.cast_roster.find(m => m.cast_id === "cast:vera:abc").first_seen_turn_id,
      "turn-7",
      `spelling ${spelling}`
    );
  }
});

test("resolves an ordinal timeline reference", () => {
  const { request, response } = fixture();
  response.timeline_events = [{
    turn_id: "#2", title: "A reveal", detail: "", importance: 3, event_type: "plot",
    affected_entity_ids: [], affected_relationship_ids: []
  }];

  const canonical = canonicalizeResponse(request, response);

  assert.equal(canonical.timeline_events.length, 1);
  assert.equal(canonical.timeline_events[0].turn_id, "turn-7");
  assert.doesNotThrow(() => validateResponse(request, canonical));
});

test("an out-of-range ordinal is not invented into a real exchange", () => {
  const { request, response } = withDiscovered(fixture(), "#99");

  const canonical = canonicalizeResponse(request, response);

  // Unresolvable, so lineage repair dates it from the transcript instead of fabricating turn 99.
  assert.equal(canonical.world_state.cast_roster.find(m => m.cast_id === "cast:vera:abc").first_seen_turn_id, "old-turn");
  assert.doesNotThrow(() => validateResponse(request, canonical));
});

test("a correctly transcribed turn id is still honoured", () => {
  const { request, response } = withDiscovered(fixture(), "old-turn");

  const canonical = canonicalizeResponse(request, response);

  assert.equal(canonical.world_state.cast_roster.find(m => m.cast_id === "cast:vera:abc").first_seen_turn_id, "old-turn");
});
