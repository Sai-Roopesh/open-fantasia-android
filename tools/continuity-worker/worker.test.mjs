import assert from "node:assert/strict";
import test from "node:test";
import { requestRevision, validateResponse } from "./worker-lib.mjs";

/**
 * Semantic validation only.
 *
 * Under ADR-0010 the repairs that used to live beside these rules moved into the Continuity Compiler,
 * and their coverage moved with them into `compiler.test.mjs`. What remains here is the decision half:
 * given a complete snapshot, is it acceptable? These rules are deliberately unforgiving, because the
 * compiler has already had its chance to make the snapshot right and Android enforces the same rules
 * again before anything becomes continuity truth.
 */
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

test("accepts a complete, referentially whole snapshot", () => {
  const { request, response } = fixture();
  assert.doesNotThrow(() => validateResponse(request, response));
});

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

test("an oversized timeline array is still a protocol violation", () => {
  const { request, response } = fixture();
  response.timeline_events = Array.from({ length: 8 }, () => ({
    turn_id: "turn-7", title: "Beat", detail: "", importance: 3, event_type: "beat",
    affected_entity_ids: [], affected_relationship_ids: []
  }));
  assert.throws(() => validateResponse(request, response), /Too many timeline events/);
});

test("rejects a roster that changes a locked seed field", () => {
  const { request, response } = fixture();
  response.world_state.cast_roster[0].personality = "Changed";
  assert.throws(() => validateResponse(request, response), /Locked cast field changed/);
});

// The compiler makes this unreachable by construction, which is exactly why the rule stays: it is the
// independent check that the compiler did its job, not a redundant one.
test("rejects a roster that dropped a seed", () => {
  const { request, response } = fixture();
  response.world_state.cast_roster = [];
  assert.throws(() => validateResponse(request, response), /Missing Cast Roster/);
});

test("rejects the player persona in the cast roster", () => {
  const { request, response } = fixture();
  response.world_state.cast_roster[0].player_controlled = true;
  assert.throws(() => validateResponse(request, response), /Player persona cannot enter Cast Roster/);
});

test("rejects a discovered member whose lineage is not reachable", () => {
  const { request, response } = fixture();
  response.world_state.cast_roster[0].provenance = "continuity_discovered";
  response.world_state.cast_roster[0].first_seen_turn_id = "turn-99";
  assert.throws(() => validateResponse(request, response), /invalid lineage provenance/);
});
