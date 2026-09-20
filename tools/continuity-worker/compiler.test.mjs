import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPACTION_THRESHOLD_CHARS,
  selectCompactionCandidates,
  ContinuityCompileError,
  assertSatisfiableRequest,
  compileContinuityDraft,
  projectContinuityEvidence,
  mergeVoiceSamples, MAX_VOICE_SAMPLES
} from "./compiler.mjs";
import { validateResponse } from "./worker-lib.mjs";

/**
 * The Continuity Compiler is the module ADR-0010 makes responsible for everything a model was
 * previously asked to reproduce. It has no model in it, so it is tested directly: every case below is
 * a complete Continuity Update, and the compiled result is put through the same `validateResponse` the
 * Mac Host runs before the phone ever sees it.
 */

const EXCHANGES = [
  { turn_id: "turn-1", parent_turn_id: null, user: "We reach the ballroom.", assistant: "Vera waits by the pillar.", created_at: "1" },
  { turn_id: "turn-2", parent_turn_id: "turn-1", user: "I greet her.", assistant: "Silas steps out of the crowd.", created_at: "2" },
  { turn_id: "turn-3", parent_turn_id: "turn-2", user: "Who are you?", assistant: "Silas draws a blade.", created_at: "3" }
];

const fact = (id, body) => ({ id, body });

function entity(id, name, overrides = {}) {
  return {
    entity_id: id, canonical_name: name, entity_type: "character", aliases: [], is_present: true,
    primary_emotion: "calm", emotion_intensity: 10, emotion_catalyst: "",
    knowledge_boundary: [], traits: [], goals: [], secrets: [], abilities: [], possessions: [],
    ...overrides
  };
}

function seedProfile(overrides = {}) {
  return {
    cast_id: "primary:thread-1", entity_id: "hero", canonical_name: "Hero", aliases: [],
    role_background: "The lead, written by hand over many hours.", personality: "Steady",
    voice_style: "Dry", appearance: "Tall", goals: "Survive", boundaries: "No cruelty",
    provenance: "primary", first_seen_turn_id: null, evidence: [], status: "active",
    speaker_eligible: true, player_controlled: false,
    manual_locks: ["canonical_name", "personality", "role_background"],
    ...overrides
  };
}

function baselineSnapshot() {
  return {
    metadata: { current_turn_id: "turn-1", narrative_timestamp: "midnight", transition_type: "continuation", version: 4 },
    spatial_state: {
      current_location: { id: "location:ballroom", name: "Ballroom", description: "Gilded", environmental_modifiers: ["loud"] },
      adjacent_locations: [{ id: "location:terrace", name: "Terrace" }],
      known_locations: [
        { id: "location:ballroom", name: "Ballroom", description: "Gilded", environmental_modifiers: ["loud"] },
        { id: "location:terrace", name: "Terrace", description: "Cold", environmental_modifiers: [] }
      ],
      edges: [{ edge_id: "edge:ballroom-terrace", from_location_id: "location:ballroom", to_location_id: "location:terrace", is_bidirectional: true }],
      entity_placements: [
        { entity_id: "hero", entity_name: "Hero", location_id: "location:ballroom", location_name: "Ballroom", micro_position: "by the door" },
        { entity_id: "vera", entity_name: "Vera", location_id: "location:ballroom", location_name: "Ballroom", micro_position: "at the pillar" }
      ]
    },
    entity_state: [
      entity("hero", "Hero", { traits: [fact("fact:hero:1", "Patient")] }),
      entity("vera", "Vera", { secrets: [fact("fact:vera:1", "Works for the Duchess")], traits: [fact("fact:vera:2", "Watchful")] })
    ],
    relational_state: [{
      relationship_id: "relationship:hero-vera", source_entity_id: "hero", source_entity_name: "Hero",
      target_entity_id: "vera", target_entity_name: "Vera", relationship_type: "wary allies", dynamic_status: "testing each other"
    }],
    narrative_state: {
      story_summary: "The old account.", scene_summary: "The old scene.", last_turn_beat: "The old beat.",
      active_threads: [{ thread_id: "thread:find-the-letter", objective: "Find the letter", status: "active", dependencies: [] }],
    },
    cast_roster: [
      seedProfile(),
      {
        cast_id: "cast:vera:aaaa", entity_id: "vera", canonical_name: "Vera", aliases: [],
        role_background: "Broker", personality: "Guarded", voice_style: "Clipped", appearance: "Grey coat",
        goals: "Leverage", boundaries: "", provenance: "continuity_discovered", first_seen_turn_id: "turn-1",
        evidence: ["Waits by the pillar"], status: "active", speaker_eligible: true,
        player_controlled: false, manual_locks: []
      }
    ]
  };
}

function makeRequest(overrides = {}) {
  return {
    protocol_version: 2,
    request_id: "request-1",
    thread_id: "thread-1",
    branch_id: "branch-1",
    target_turn_id: "turn-3",
    baseline_version: 4,
    baseline_hash: "baseline-hash",
    attempt_count: 0,
    trigger_reason: "cadence",
    discarded_exchange_count: 0,
    character: { name: "Hero", story: "", core_persona: "", appearance: "", definition: "", style_rules: "", negative_guidance: "" },
    persona: null,
    director_notes: "",
    pins: [],
    cast_seeds: [seedProfile()],
    current_cast_roster: [],
    baseline_snapshot: baselineSnapshot(),
    exchanges: EXCHANGES,
    ...overrides
  };
}

const NARRATIVE = {
  story_summary: "A rewritten causal account of everything so far.",
  scene_summary: "Silas has drawn a blade in the ballroom.",
  last_turn_beat: "Silas drew a blade.",
  narrative_timestamp: "past midnight",
  transition_type: "escalation"
};

/** A draft that changes nothing but the prose and the scene. */
function makeDraft(overrides = {}) {
  return {
    narrative: NARRATIVE,
    scene: {
      current_location: "ballroom",
      adjacent_locations: ["terrace"],
      present: [
        { entity: "hero", location: "ballroom", micro_position: "by the door", primary_emotion: "alarm", emotion_intensity: 70, emotion_catalyst: "the blade" },
        { entity: "vera", location: "ballroom", micro_position: "at the pillar", primary_emotion: "calm", emotion_intensity: 20, emotion_catalyst: "" }
      ]
    },
    operations: [],
    timeline_events: [],
    ...overrides
  };
}

const op = (values) => ({
  op: null, handle: null, entity: null, bucket: null, from: null, to: null, name: null, kind: null,
  body: null, status: null, aliases: null, modifiers: null, bidirectional: null, profile: null,
  evidence: null, first_seen_exchange: null, dependencies: null, reason: null, ...values
});

function compile(requestOverrides = {}, draftOverrides = {}) {
  const request = makeRequest(requestOverrides);
  const result = compileContinuityDraft(request, makeDraft(draftOverrides));
  return { request, ...result };
}

const castById = (response, id) => response.world_state.cast_roster.find(member => member.cast_id === id);
/** The readable handle the engine would be shown for an entity in this baseline. */
function slugOf(baseline, entityId) {
  const evidence = projectContinuityEvidence(makeRequest({ baseline_snapshot: baseline }));
  return evidence.baseline.entities.find(e => e.name === (baseline.entity_state.find(x => x.entity_id === entityId)?.canonical_name))?.handle;
}

/** Every fact handle an entity owns, as the engine sees them. */
function FACT_HANDLES(baseline, entityId) {
  const handle = slugOf(baseline, entityId);
  const entity = baseline.entity_state.find(x => x.entity_id === entityId);
  const out = [];
  for (const bucket of ["knowledge_boundary","traits","goals","secrets","abilities","possessions"]) {
    (entity?.[bucket] ?? []).forEach((_, i) => out.push(`${handle}.${bucket}.${i + 1}`));
  }
  return out;
}

const entityById = (response, id) => response.world_state.entity_state.find(item => item.entity_id === id);
const codes = defects => defects.map(defect => defect.code);

test("a compiled snapshot passes the shared validation contract", () => {
  const { request, response } = compile();
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("the Host writes envelope identity, version and current turn", () => {
  const { response } = compile();
  assert.equal(response.request_id, "request-1");
  assert.equal(response.baseline_hash, "baseline-hash");
  assert.equal(response.world_state.metadata.current_turn_id, "turn-3");
  assert.equal(response.world_state.metadata.version, 5);
});

test("narrative prose is replaced completely", () => {
  const { response } = compile();
  assert.equal(response.world_state.narrative_state.story_summary, NARRATIVE.story_summary);
  assert.equal(response.world_state.narrative_state.last_turn_beat, "Silas drew a blade.");
});

// The failure this architecture exists to remove: nine minutes of correct work discarded because a
// roster came back one member short. The engine no longer emits the roster at all.
test("a draft that never mentions a Cast Seed still preserves it byte-for-byte", () => {
  const { request, response, defects } = compile();
  const hero = castById(response, "primary:thread-1");
  assert.ok(hero, "the Cast Seed survives a draft that says nothing about it");
  assert.equal(hero.role_background, "The lead, written by hand over many hours.");
  assert.equal(hero.provenance, "primary");
  assert.deepEqual(hero.manual_locks, ["canonical_name", "personality", "role_background"]);
  assert.equal(defects.length, 0);
  assert.doesNotThrow(() => validateResponse(request, response));
});

// The stronger form of the same guarantee: even when the Cast Seed is absent from the baseline roster
// as well as from the draft, it is reinstated from authoritative input rather than lost.
test("a Cast Seed missing from the baseline roster is reinstated with its world entity", () => {
  const baseline = baselineSnapshot();
  baseline.cast_roster = baseline.cast_roster.filter(member => member.cast_id !== "primary:thread-1");
  baseline.entity_state = baseline.entity_state.filter(item => item.entity_id !== "hero");
  baseline.spatial_state.entity_placements = baseline.spatial_state.entity_placements
    .filter(item => item.entity_id !== "hero");
  baseline.relational_state = [];
  const { request, response } = compile({ baseline_snapshot: baseline }, {
    scene: {
      current_location: "ballroom",
      adjacent_locations: [],
      present: [{ entity: "vera", location: "ballroom", micro_position: "at the pillar", primary_emotion: "calm", emotion_intensity: 20, emotion_catalyst: "" }]
    }
  });
  const hero = castById(response, "primary:thread-1");
  assert.ok(hero, "the seed is reinstated from authoritative input");
  assert.equal(hero.entity_id, "hero");
  assert.ok(entityById(response, "hero"), "and its world entity is rebuilt so the roster stays referentially whole");
  assert.doesNotThrow(() => validateResponse(request, response));
});

// `manual_locks` is the control, not the seed's whole record: a locked field is authoritative and an
// unlocked one is free to develop as the story earns it.
test("a locked Cast Seed field is restored and the refusal is reported", () => {
  const { request, response, defects } = compile({}, {
    operations: [op({
      op: "describe_cast_member", handle: "hero", name: "Rewritten Hero",
      profile: { role_background: "Rewritten", personality: "Rewritten", voice_style: null, appearance: null, goals: null, boundaries: null, speaker_eligible: null }
    })]
  });
  const hero = castById(response, "primary:thread-1");
  assert.equal(hero.canonical_name, "Hero");
  assert.equal(hero.personality, "Steady");
  assert.equal(hero.role_background, "The lead, written by hand over many hours.");
  assert.deepEqual(codes(defects), ["locked_cast_field"]);
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("an unlocked Cast Seed field develops with the story", () => {
  const { request, response, defects } = compile({}, {
    operations: [op({
      op: "describe_cast_member", handle: "hero",
      profile: { role_background: null, personality: null, voice_style: null, appearance: "Coat torn at the shoulder", goals: null, boundaries: null, speaker_eligible: null }
    })]
  });
  const hero = castById(response, "primary:thread-1");
  assert.equal(hero.appearance, "Coat torn at the shoulder", "appearance is not locked, so evidence may change it");
  assert.equal(hero.personality, "Steady", "the locked field is untouched alongside it");
  assert.deepEqual(hero.manual_locks, ["canonical_name", "personality", "role_background"]);
  assert.equal(defects.length, 0);
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("untouched state is preserved without the engine restating it", () => {
  const { response } = compile();
  assert.equal(response.world_state.known_locations, undefined);
  assert.equal(response.world_state.spatial_state.known_locations.length, 2);
  assert.equal(response.world_state.relational_state.length, 1);
  assert.deepEqual(entityById(response, "vera").secrets.map(item => item.body), ["Works for the Duchess"]);
});

test("a new entity, Cast Member, fact and relationship are created with Host-assigned identity", () => {
  const { request, response, defects } = compile({}, {
    scene: {
      current_location: "ballroom",
      adjacent_locations: [],
      present: [
        { entity: "hero", location: "ballroom", micro_position: "by the door", primary_emotion: "alarm", emotion_intensity: 70, emotion_catalyst: "the blade" },
        { entity: "new:silas", location: "ballroom", micro_position: "in the crowd", primary_emotion: "cold", emotion_intensity: 60, emotion_catalyst: "the confrontation" }
      ]
    },
    operations: [
      op({ op: "describe_entity", handle: "new:silas", name: "Silas", kind: "character" }),
      op({ op: "assert_fact", entity: "new:silas", bucket: "traits", body: "Carries a blade" }),
      op({ op: "relate", handle: "new:hero-silas", from: "hero", to: "new:silas", kind: "enemies", status: "open hostility" }),
      op({
        op: "describe_cast_member", handle: "new:silas", entity: "new:silas", name: "Silas",
        first_seen_exchange: "#2", evidence: ["Steps out of the crowd"],
        profile: { role_background: "Duellist", personality: "Cold", voice_style: null, appearance: null, goals: null, boundaries: null, speaker_eligible: true }
      })
    ]
  });
  assert.equal(defects.length, 0, JSON.stringify(defects));
  const silas = response.world_state.cast_roster.find(member => member.canonical_name === "Silas");
  assert.ok(silas.cast_id.startsWith("cast:silas:"), silas.cast_id);
  assert.equal(silas.provenance, "continuity_discovered");
  assert.equal(silas.first_seen_turn_id, "turn-2", "the cited ordinal is compiled into a turn id");
  assert.equal(silas.first_seen_exchange, undefined, "no draft-only field leaks into the snapshot");
  const silasEntity = entityById(response, silas.entity_id);
  assert.deepEqual(silasEntity.traits.map(item => item.body), ["Carries a blade"]);
  assert.equal(response.world_state.relational_state.length, 2);
  assert.doesNotThrow(() => validateResponse(request, response));
});

// Observed on the first real checkpoint: the engine rediscovered someone already on the roster under a
// fresh handle, the handles did not collide, and the update died on `Duplicate or missing cast name`.
test("rediscovering an existing character under a new handle keeps one profile, not two", () => {
  const { request, response, defects } = compile({}, {
    operations: [
      op({ op: "describe_entity", handle: "new:the-watcher", name: "Vera", kind: "character" }),
      op({
        op: "describe_cast_member", handle: "new:the-watcher", entity: "new:the-watcher", name: "Vera",
        first_seen_exchange: "#2",
        profile: { role_background: "A watcher", personality: null, voice_style: null, appearance: null, goals: null, boundaries: null, speaker_eligible: true }
      })
    ]
  });
  const veras = response.world_state.cast_roster.filter(member => member.canonical_name === "Vera");
  assert.equal(veras.length, 1);
  assert.equal(veras[0].cast_id, "cast:vera:aaaa", "the established profile is the one that survives");
  assert.ok(codes(defects).includes("duplicate_cast_name"));
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("a duplicate of a Cast Seed's name never displaces the seed", () => {
  const { request, response } = compile({}, {
    operations: [
      op({ op: "describe_entity", handle: "new:other-hero", name: "Hero", kind: "character" }),
      op({
        op: "describe_cast_member", handle: "new:other-hero", entity: "new:other-hero", name: "Hero",
        profile: { role_background: "Impostor", personality: null, voice_style: null, appearance: null, goals: null, boundaries: null, speaker_eligible: true }
      })
    ]
  });
  const hero = castById(response, "primary:thread-1");
  assert.ok(hero, "the Cast Seed wins the name");
  assert.equal(hero.role_background, "The lead, written by hand over many hours.");
  assert.equal(response.world_state.cast_roster.filter(member => member.canonical_name === "Hero").length, 1);
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("a Cast Member left with no name is removed rather than failing the update", () => {
  const baseline = baselineSnapshot();
  baseline.cast_roster[1].canonical_name = "   ";
  const { request, response, defects } = compile({ baseline_snapshot: baseline });
  assert.equal(castById(response, "cast:vera:aaaa"), undefined);
  assert.ok(codes(defects).includes("unnamed_cast_member"));
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("asserting the same fact body twice still yields distinct addressable facts", () => {
  const { request, response } = compile({}, {
    operations: [
      op({ op: "assert_fact", entity: "vera", bucket: "traits", body: "Watchful" }),
      op({ op: "assert_fact", entity: "hero", bucket: "traits", body: "Watchful" })
    ]
  });
  const ids = response.world_state.entity_state.flatMap(item => item.traits.map(trait => trait.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("identity assignment is deterministic across identical compiles", () => {
  const draft = {
    operations: [op({ op: "describe_entity", handle: "new:silas", name: "Silas", kind: "character" })]
  };
  const first = compile({}, draft).response;
  const second = compile({}, draft).response;
  assert.deepEqual(first.world_state.entity_state.map(item => item.entity_id),
    second.world_state.entity_state.map(item => item.entity_id));
});

test("declaring an existing object as new is fatal rather than a second Vera", () => {
  assert.throws(
    () => compile({}, { operations: [op({ op: "describe_entity", handle: "new:vera", name: "Vera" })] }),
    error => error instanceof ContinuityCompileError && error.defects.at(-1).code === "handle_exists"
  );
});

/**
 * The defect that made a thread's prompt half duplicates. A Cast Seed's world entity used to be derived
 * from `request_id`, so a seed with no written-back `entity_id` was given a different person at every
 * checkpoint. These four cases pin the whole repair: identity is stable, a rediscovery binds instead of
 * duplicating, a colliding handle still fails loudly, and a baseline that already carries duplicates
 * heals itself.
 */
test("a Cast Seed keeps one world entity across checkpoints", () => {
  const seed = seedProfile({ cast_id: "seed:avni", entity_id: null, canonical_name: "Avni", manual_locks: [] });
  const idOf = requestId => compile({ request_id: requestId, cast_seeds: [seed] }, {})
    .response.world_state.cast_roster.find(member => member.cast_id === "seed:avni").entity_id;
  assert.equal(idOf("request-A"), idOf("request-B"), "the same seed compiled to two different people");
  const { response } = compile({ cast_seeds: [seed] }, {});
  assert.equal(response.world_state.entity_state.filter(item => item.canonical_name === "Avni").length, 1);
});

test("a seed renamed after its first checkpoint stays the same person", () => {
  const before = seedProfile({ cast_id: "seed:avni", entity_id: null, canonical_name: "Avni", manual_locks: [] });
  const after = { ...before, canonical_name: "Avni Mehra" };
  const idOf = seed => compile({ cast_seeds: [seed] }, {})
    .response.world_state.cast_roster.find(member => member.cast_id === "seed:avni").entity_id;
  assert.equal(idOf(before), idOf(after));
});

test("rediscovering a known name under a fresh handle binds rather than duplicating", () => {
  const { response, defects } = compile({}, {
    operations: [op({ op: "describe_entity", handle: "new:the-watcher", name: "Vera", kind: "character" })]
  });
  assert.equal(response.world_state.entity_state.filter(item => item.canonical_name === "Vera").length, 1);
  assert.ok(codes(defects).includes("rediscovered_entity"));
  assert.deepEqual(entityById(response, "vera").secrets.map(item => item.body), ["Works for the Duchess"]);
});

test("a baseline already holding duplicate names heals at the next update", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state.push(
    entity("vera-copy-1", "Vera", { traits: [fact("fact:copy:1", "Left-handed")], is_present: false }),
    entity("vera-copy-2", "Vera", { is_present: false, primary_emotion: "" })
  );
  const { response, defects } = compile({ baseline_snapshot: baseline }, {});
  const veras = response.world_state.entity_state.filter(item => item.canonical_name === "Vera");
  assert.equal(veras.length, 1, "duplicate records survived the update");
  const traits = veras[0].traits.map(item => item.body);
  assert.ok(traits.includes("Left-handed"), "a duplicate's facts were lost");
  assert.ok(traits.includes("Watchful"));
  assert.ok(codes(defects).includes("merged_duplicate_entities"));
  assert.ok(!response.world_state.entity_state.some(item => item.entity_id === "vera-copy-1"));
});

test("an entity kind outside the vocabulary becomes a character", () => {
  const { response } = compile({}, {
    operations: [op({ op: "describe_entity", handle: "new:silas", name: "Silas", kind: "person" })]
  });
  const silas = response.world_state.entity_state.find(item => item.canonical_name === "Silas");
  assert.equal(silas.entity_type, "character");
});

/**
 * Salience is the fifth rule in ADR-0010's algebra: the one that lets state settle. These pin the parts
 * a later Stage will make decisions on, especially the exemption that answers the obvious fear — a
 * character written by hand does not fade for being off-screen.
 */
test("a record the update touched is current, and one it ignored keeps its age", () => {
  const baseline = baselineSnapshot();
  baseline.salience = { hero: 1, vera: 1, "relationship:hero-vera": 1 };
  const { response } = compile({ baseline_snapshot: baseline }, {
    operations: [op({ op: "assert_fact", entity: "vera", bucket: "traits", body: "Newly observed" })],
    scene: { current_location: "ballroom", adjacent_locations: [], present: [] }
  });
  const salience = response.world_state.salience;
  assert.equal(salience.vera, 5, "a touched record did not become current");
  assert.equal(salience["relationship:hero-vera"], 1, "an untouched relationship was aged wrongly");
});

test("a Cast Member never ages, however long they stay off-screen", () => {
  const baseline = baselineSnapshot();
  baseline.salience = { hero: 1, vera: 1 };
  const { response } = compile({ baseline_snapshot: baseline }, {
    scene: { current_location: "ballroom", adjacent_locations: [], present: [] },
    narrative: { ...NARRATIVE, story_summary: "Nothing at all happened.", scene_summary: "An empty room.", last_turn_beat: "Silence." }
  });
  // Both are on the roster, so both stay current even with no operation, no presence and no mention.
  assert.equal(response.world_state.salience.hero, 5);
  assert.equal(response.world_state.salience.vera, 5);
});

test("prose keeps a character current when no operation names them", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state.push(entity("silas", "Silas", { is_present: false }));
  baseline.salience = { hero: 1, vera: 1, silas: 1 };
  const { response } = compile({ baseline_snapshot: baseline }, {
    scene: { current_location: "ballroom", adjacent_locations: [], present: [] },
    narrative: { ...NARRATIVE, story_summary: "Silas is still hunting the letter." }
  });
  assert.equal(response.world_state.salience.silas, 5, "a character the summary still discusses was aged");
});

test("a snapshot written before salience existed ages nothing", () => {
  const { response } = compile({}, {});
  const salience = response.world_state.salience;
  assert.ok(Object.values(salience).every(version => version === 5),
    "records from a salience-free baseline should start current, not stale");
});

/**
 * Compaction is the only operation that asks the engine to reconsider what an earlier update wrote.
 * Every test here is a way it could lose something it was supposed to keep. See
 * docs/plans/memory-hierarchy.md.
 */
function bulky(id, name, factCount) {
  const long = " ".padEnd(400, "x");
  return entity(id, name, {
    traits: Array.from({ length: factCount }, (_, i) => fact(`fact:${id}:${i}`, `trait ${i}${long}`))
  });
}

test("an account replaces the facts it names and nothing else", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state = [bulky("vera", "Vera", 20), entity("hero", "Hero")];
  const { response, defects } = compile({ baseline_snapshot: baseline }, {
    operations: [op({
      op: "compact_entity", handle: "vera",
      account: "Vera is watchful and has been for a long time.",
      retire: ["vera.traits.1", "vera.traits.2", "vera.traits.3"]
    })]
  });
  const vera = entityById(response, "vera");
  assert.equal(vera.traits.length, 17, "exactly the named facts should go");
  assert.match(vera.account, /watchful/);
  assert.equal(entityById(response, "hero").account, "", "no other entity is touched");
  assert.ok(codes(defects).includes("entity_compacted"));
});

test("facts are never retired into nothing", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state = [bulky("vera", "Vera", 20)];
  const { response, defects } = compile({ baseline_snapshot: baseline }, {
    operations: [op({ op: "compact_entity", handle: "vera", account: "   ", retire: ["vera.traits.1"] })]
  });
  assert.equal(entityById(response, "vera").traits.length, 20, "an empty account must retire nothing");
  assert.ok(codes(defects).includes("empty_account"));
});

test("a compaction cannot retire another entity's facts", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state = [bulky("vera", "Vera", 20), entity("hero", "Hero", { traits: [fact("fact:hero:1", "Patient")] })];
  const { response, defects } = compile({ baseline_snapshot: baseline }, {
    operations: [op({ op: "compact_entity", handle: "vera", account: "Vera is watchful.", retire: ["hero.traits.1"] })]
  });
  assert.equal(entityById(response, "hero").traits.length, 1, "a foreign fact must survive");
  assert.ok(codes(defects).includes("foreign_fact_retired"));
});

test("an unknown entity leaves the world untouched", () => {
  const before = compile({}, {}).response.world_state.entity_state;
  const { response, defects } = compile({}, {
    operations: [op({ op: "compact_entity", handle: "nobody", account: "x", retire: [] })]
  });
  assert.deepEqual(response.world_state.entity_state, before);
  assert.ok(codes(defects).includes("unknown_handle"));
});

test("an account is cut at its ceiling rather than accepted whole", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state = [bulky("vera", "Vera", 5)];
  const { response, defects } = compile({ baseline_snapshot: baseline }, {
    operations: [op({ op: "compact_entity", handle: "vera", account: "y".repeat(9000), retire: [] })]
  });
  assert.equal(entityById(response, "vera").account.length, 4000);
  assert.ok(codes(defects).includes("account_truncated"));
});

test("compaction is idempotent", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state = [bulky("vera", "Vera", 20)];
  const draft = { operations: [op({
    op: "compact_entity", handle: "vera", account: "Vera is watchful.", retire: ["vera.traits.1"]
  })] };
  const first = compile({ baseline_snapshot: baseline }, draft).response.world_state;
  const second = compile({ baseline_snapshot: baseline }, draft).response.world_state;
  assert.deepEqual(first, second);
});

test("candidates are the oversized entities, largest first", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state = [
    bulky("big", "Big", 40), bulky("mid", "Mid", 20), entity("small", "Small")
  ];
  baseline.metadata.version = 10;
  const picked = selectCompactionCandidates(baseline).map(e => e.entity_id);
  assert.deepEqual(picked, ["big", "mid"], "a small entity is never a candidate");
  assert.ok(JSON.stringify(baseline.entity_state[2]).length < COMPACTION_THRESHOLD_CHARS);
});

test("salience breaks a tie between equally large entities", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state = [bulky("fresh", "Fresh", 20), bulky("stale", "Stale", 20)];
  baseline.metadata.version = 10;
  baseline.salience = { fresh: 10, stale: 1 };
  assert.equal(selectCompactionCandidates(baseline, 1)[0].entity_id, "stale");
});

test("selection is capped and deterministic", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state = [bulky("a","A",40), bulky("b","B",30), bulky("c","C",20), bulky("d","D",15)];
  const once = selectCompactionCandidates(baseline).map(e => e.entity_id);
  assert.equal(once.length, 3, "at most three per update");
  assert.deepEqual(once, selectCompactionCandidates(baseline).map(e => e.entity_id));
});

test("the engine is shown its shortlist and every account", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state = [bulky("vera", "Vera", 20), entity("hero", "Hero", { account: "Known." })];
  const evidence = projectContinuityEvidence(makeRequest({ baseline_snapshot: baseline }));
  assert.deepEqual(evidence.compaction_candidates, ["vera"]);
  assert.equal(evidence.baseline.entities.find(e => e.handle === "hero").account, "Known.");
});

/**
 * The acceptance criterion this whole mechanism exists for.
 *
 * A story runs for an unbounded number of exchanges and a context window does not grow, so any part of
 * a Snapshot that only accumulates is a leak with a date on it. Measured before compaction existed, one
 * thread gained ~11,700 characters per Continuity Update with no ceiling in sight.
 *
 * This drives twenty updates that each add facts at that observed rate and asserts the size settles.
 * The engine is modelled at its worst: every account is written to the full 4,000-character ceiling, so
 * a real engine writing tighter prose can only do better than this.
 */
test("a snapshot of a story that never ends still stops growing", () => {
  let baseline = baselineSnapshot();
  baseline.entity_state = [entity("vera", "Vera"), entity("hero", "Hero")];
  const sizes = [];

  for (let update = 1; update <= 20; update++) {
    // What every update adds: new facts about whoever appeared, at the rate measured in production.
    const additions = ["vera", "hero"].flatMap(who =>
      Array.from({ length: 7 }, (_, i) =>
        op({ op: "assert_fact", entity: who, bucket: "traits",
             body: `update ${update} observation ${i} ${"detail ".repeat(50)}` })));

    // What the host would name, and what an engine would return for each.
    const compactions = selectCompactionCandidates(baseline).map(candidate => {
      const handle = slugOf(baseline, candidate.entity_id);
      const retire = FACT_HANDLES(baseline, candidate.entity_id);
      return op({ op: "compact_entity", handle, account: "a".repeat(4000), retire });
    });

    const request = makeRequest({ baseline_snapshot: baseline, baseline_version: baseline.metadata.version });
    const { response } = compileContinuityDraft(request, makeDraft({ operations: [...additions, ...compactions] }));
    baseline = response.world_state;
    sizes.push(JSON.stringify(baseline.entity_state).length);
  }

  const tail = sizes.slice(-5);
  const worstGrowth = Math.max(...tail.slice(1).map((n, i) => (n - tail[i]) / tail[i]));
  assert.ok(worstGrowth < 0.02,
    `entity_state must plateau; last five updates grew up to ${(worstGrowth * 100).toFixed(1)}% each: ${tail}`);
  assert.ok(sizes.at(-1) < sizes[2] * 3,
    `entity_state ran away: ${sizes[2]} -> ${sizes.at(-1)}`);
});

test("an unrecognized handle never silently creates an object", () => {
  const { response, defects } = compile({}, {
    operations: [op({ op: "describe_entity", handle: "silas", name: "Silas" })]
  });
  assert.equal(response.world_state.entity_state.length, 2);
  assert.deepEqual(codes(defects), ["unknown_handle"]);
});

test("a fact is retracted only when the removal cites its evidence", () => {
  const { response, defects } = compile({}, {
    operations: [op({ op: "retract_fact", handle: "vera.secrets.1", reason: "#3" })]
  });
  assert.deepEqual(entityById(response, "vera").secrets, []);
  assert.deepEqual(entityById(response, "vera").traits.map(item => item.body), ["Watchful"]);
  assert.equal(defects.length, 0);
});

test("an ungrounded removal is dropped and reported rather than failing the update", () => {
  const { response, defects } = compile({}, {
    operations: [op({ op: "retract_fact", handle: "vera.secrets.1", reason: null })]
  });
  assert.equal(entityById(response, "vera").secrets.length, 1, "the fact survives");
  assert.deepEqual(codes(defects), ["ungrounded_removal"]);
});

test("a Rewind grounds removals of state that belonged to discarded prose", () => {
  const { response, defects } = compile(
    { trigger_reason: "rewind", discarded_exchange_count: 4 },
    { operations: [op({ op: "retract_fact", handle: "vera.secrets.1", reason: "rewind" })] }
  );
  assert.deepEqual(entityById(response, "vera").secrets, []);
  assert.equal(defects.length, 0);
});

test("retiring an entity cascades to its relationships, placements and Cast Member", () => {
  const { request, response, defects } = compile({}, {
    scene: {
      current_location: "ballroom",
      adjacent_locations: [],
      present: [{ entity: "hero", location: "ballroom", micro_position: "alone", primary_emotion: "grief", emotion_intensity: 80, emotion_catalyst: "the loss" }]
    },
    operations: [op({ op: "retire_entity", handle: "vera", reason: "#3" })]
  });
  assert.equal(entityById(response, "vera"), undefined);
  assert.equal(response.world_state.relational_state.length, 0, "the relationship that lost an endpoint is gone");
  assert.equal(response.world_state.spatial_state.entity_placements.length, 1);
  assert.equal(castById(response, "cast:vera:aaaa"), undefined, "a Cast Member without an entity cannot remain");
  assert.ok(codes(defects).includes("dangling_reference"));
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("retiring an entity a Cast Seed depends on is fatal", () => {
  assert.throws(
    () => compile({}, { operations: [op({ op: "retire_entity", handle: "hero", reason: "#3" })] }),
    error => error instanceof ContinuityCompileError && error.defects.at(-1).code === "seed_entity_retired"
  );
});

test("archiving a Cast Seed is fatal, archiving a discovered member is not", () => {
  assert.throws(
    () => compile({}, { operations: [op({ op: "archive_cast_member", handle: "hero", reason: "#3" })] }),
    error => error instanceof ContinuityCompileError && error.defects.at(-1).code === "seed_archived"
  );
  const { response } = compile({}, {
    operations: [op({ op: "archive_cast_member", handle: "vera", reason: "#3" })]
  });
  assert.equal(castById(response, "cast:vera:aaaa").status, "archived");
});

test("a write whose endpoint cannot be resolved loses one relationship, not the run", () => {
  const { request, response, defects } = compile({}, {
    operations: [op({ op: "relate", handle: "new:hero-ghost", from: "hero", to: "ghost", kind: "haunted by" })]
  });
  assert.equal(response.world_state.relational_state.length, 1);
  assert.deepEqual(codes(defects), ["unknown_handle"]);
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("forgetting a location removes the edges that depended on it", () => {
  const { request, response } = compile({}, {
    scene: {
      current_location: "ballroom",
      adjacent_locations: [],
      present: [{ entity: "hero", location: "ballroom", micro_position: "by the door", primary_emotion: "calm", emotion_intensity: 10, emotion_catalyst: "" }]
    },
    operations: [op({ op: "forget_location", handle: "terrace", reason: "#3" })]
  });
  assert.equal(response.world_state.spatial_state.known_locations.length, 1);
  assert.equal(response.world_state.spatial_state.edges.length, 0);
  assert.doesNotThrow(() => validateResponse(request, response));
});

// Presence is the one category that keeps full-rewrite semantics, because a merge would leave every
// character who ever entered a scene standing in it forever.
test("the scene is a replace-set: anyone the draft omits becomes absent and unplaced", () => {
  const { response } = compile({}, {
    scene: {
      current_location: "terrace",
      adjacent_locations: ["ballroom"],
      present: [{ entity: "hero", location: "terrace", micro_position: "at the rail", primary_emotion: "cold", emotion_intensity: 30, emotion_catalyst: "the night air" }]
    }
  });
  assert.equal(entityById(response, "hero").is_present, true);
  assert.equal(entityById(response, "vera").is_present, false);
  assert.equal(response.world_state.spatial_state.entity_placements.length, 1);
  assert.equal(response.world_state.spatial_state.current_location.name, "Terrace");
  assert.equal(entityById(response, "vera").primary_emotion, "calm", "an absent character keeps their last recorded emotion");
});

test("a first Continuity Snapshot mints the world its Cast Seeds need", () => {
  const { request, response, defects } = compile(
    { baseline_snapshot: null, baseline_version: 0, cast_seeds: [seedProfile({ entity_id: null })] },
    {
      scene: { current_location: "new:ballroom", adjacent_locations: [], present: [] },
      operations: [op({ op: "describe_location", handle: "new:ballroom", name: "Ballroom", body: "Gilded" })]
    }
  );
  const hero = castById(response, "primary:thread-1");
  assert.ok(hero, "the seed is present in the very first snapshot");
  assert.ok(hero.entity_id, "and the Host minted the world entity it requires");
  assert.ok(entityById(response, hero.entity_id));
  assert.equal(response.world_state.metadata.version, 1);
  assert.equal(defects.length, 0, JSON.stringify(defects));
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("legacy facts with colliding identifiers are corrected on the way through", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state[0].traits = [fact("dup", "Patient"), fact("dup", "Stubborn")];
  baseline.entity_state[1].traits = [fact("dup", "Watchful")];
  const { request, response } = compile({ baseline_snapshot: baseline });
  const ids = response.world_state.entity_state.flatMap(item => item.traits.map(trait => trait.id));
  assert.equal(new Set(ids).size, ids.length, "every fact ends up uniquely addressable");
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("timeline events are grounded in the evidence window and clamped", () => {
  const { request, response, defects } = compile({}, {
    timeline_events: [
      { exchange: "#3", title: "The blade", detail: "Silas draws.", importance: 9, event_type: "threat", entities: ["hero"], relationships: [] },
      { exchange: "#9", title: "Outside the window", detail: "No such exchange.", importance: 3, event_type: "beat", entities: [], relationships: [] },
      { exchange: "#3", title: "Phantom", detail: "Names nobody real.", importance: 3, event_type: "beat", entities: ["ghost"], relationships: [] }
    ]
  });
  assert.equal(response.timeline_events.length, 1);
  assert.equal(response.timeline_events[0].turn_id, "turn-3");
  assert.equal(response.timeline_events[0].importance, 5, "importance is clamped, never dropped");
  assert.deepEqual(codes(defects), ["unknown_exchange", "dangling_reference"]);
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("a draft with no usable prose fails rather than erasing the story", () => {
  assert.throws(
    () => compileContinuityDraft(makeRequest(), makeDraft({ narrative: { ...NARRATIVE, story_summary: "  " } })),
    error => error instanceof ContinuityCompileError && error.defects.at(-1).code === "unusable_draft"
  );
});

// All three of the following were found on the first real checkpoint, and all three were invisible to
// the fixtures above because those always start from a populated baseline.

test("two Cast Seeds sharing a name are refused before an engine run is spent", () => {
  const duplicate = { ...seedProfile(), cast_id: "seed:other", entity_id: null };
  const request = makeRequest({ cast_seeds: [seedProfile(), duplicate] });
  assert.throws(() => assertSatisfiableRequest(request), /Two Cast Seeds share the name "Hero"/);
  assert.throws(() => projectContinuityEvidence(request), ContinuityCompileError);
  assert.throws(() => compileContinuityDraft(request, makeDraft()), ContinuityCompileError);
});

test("a Cast Seed with no name is refused with an actionable message", () => {
  const request = makeRequest({ cast_seeds: [seedProfile({ canonical_name: "   " })] });
  assert.throws(() => assertSatisfiableRequest(request), /has no name/);
});

// A first snapshot and a post-Rewind checkpoint both arrive with an empty baseline roster and a full
// set of Cast Seeds. Before this, the engine could read the catalogue and address nobody in it.
test("every Cast Seed is addressable when the baseline roster is empty", () => {
  const seeds = ["Ayushi", "Aditya", "Arjun"].map((name, index) => seedProfile({
    cast_id: `seed:${index}`, entity_id: null, canonical_name: name,
    provenance: index === 0 ? "primary" : "manual_seed", manual_locks: ["canonical_name"]
  }));
  const request = makeRequest({ baseline_snapshot: null, baseline_version: 0, cast_seeds: seeds });
  const projection = projectContinuityEvidence(request);
  const handles = projection.baseline.cast.map(member => member.handle);

  assert.equal(handles.length, 3);
  assert.equal(new Set(handles).size, 3, "handles must be unique or the engine cannot tell them apart");
  assert.ok(projection.baseline.cast.every(member => member.handle && member.entity),
    "every seed needs a handle and a world entity the engine can place in a scene");

  // The handle the engine was shown must be the handle the compiler resolves.
  const { response, defects } = compileContinuityDraft(request, makeDraft({
    scene: {
      current_location: "new:ward",
      adjacent_locations: [],
      present: [{ entity: "aditya", location: "new:ward", micro_position: "at the desk", primary_emotion: "tired", emotion_intensity: 40, emotion_catalyst: "the shift" }]
    },
    operations: [
      op({ op: "describe_location", handle: "new:ward", name: "Ward", body: "Fluorescent" }),
      op({ op: "describe_cast_member", handle: "arjun", profile: { role_background: null, personality: null, voice_style: null, appearance: "Scrubs, no coat", goals: null, boundaries: null, speaker_eligible: null } })
    ]
  }));
  assert.ok(codes(defects).every(code => code === "thin_world_state"),
    `no handle failures; only thinness advisories: ${JSON.stringify(defects)}`);
  assert.equal(response.world_state.cast_roster.length, 3);
  assert.equal(response.world_state.spatial_state.entity_placements.length, 1, "a seeded character can be placed");
  assert.equal(response.world_state.cast_roster.find(member => member.canonical_name === "Arjun").appearance, "Scrubs, no coat");
  assert.doesNotThrow(() => validateResponse(request, response));
});

test("retiring the entity of a seed that had none yet is still fatal", () => {
  const request = makeRequest({
    baseline_snapshot: null, baseline_version: 0,
    cast_seeds: [seedProfile({ entity_id: null, canonical_name: "Ayushi" })]
  });
  assert.throws(
    () => compileContinuityDraft(request, makeDraft({
      scene: { current_location: null, adjacent_locations: [], present: [] },
      operations: [op({ op: "retire_entity", handle: "ayushi", reason: "#3" })]
    })),
    error => error instanceof ContinuityCompileError && error.defects.at(-1).code === "seed_entity_retired"
  );
});

// Observed on the first real engine run: a valid snapshot of fifteen named people holding no facts and
// no relationships. Legal under merge semantics, useless as continuity, so it is reported.
test("a world of named people with nothing known about them is reported as thin", () => {
  const baseline = baselineSnapshot();
  baseline.entity_state = baseline.entity_state.map(item => ({ ...item, traits: [], secrets: [] }));
  baseline.entity_state.push(entity("silas", "Silas", { traits: [] }));
  baseline.relational_state = [];
  const { response, defects } = compile({ baseline_snapshot: baseline });
  assert.ok(codes(defects).includes("thin_world_state"));
  assert.equal(response.world_state.entity_state.length, 3, "the snapshot is still produced, not failed");
});

test("a world carrying facts or relationships is not reported as thin", () => {
  const { defects } = compile();
  assert.ok(!codes(defects).includes("thin_world_state"));
});

test("the evidence projection contains no stored identifier and no duplicated roster", () => {
  const projection = projectContinuityEvidence(makeRequest());
  const serialized = JSON.stringify(projection);
  for (const identifier of ["turn-1", "turn-3", "location:ballroom", "relationship:hero-vera", "primary:thread-1", "cast:vera:aaaa"]) {
    assert.ok(!serialized.includes(identifier), `${identifier} must not reach the engine`);
  }
  assert.equal(projection.exchanges.length, 3);
  assert.ok(projection.exchanges.every(exchange => !("checkpoint" in exchange)),
    "every exchange in the request is evidence, so nothing is marked");
  assert.equal(projection.baseline.cast.length, 2, "one catalogue, not a seed list plus an overlapping roster");
  assert.equal(projection.baseline.cast.filter(member => member.authoritative).length, 1);
  assert.deepEqual(projection.baseline.cast.find(member => member.authoritative).locked_fields,
    ["canonical_name", "personality", "role_background"]);
});

test("the evidence projection is smaller than the request it replaces", () => {
  const request = makeRequest();
  const projected = Buffer.byteLength(JSON.stringify(projectContinuityEvidence(request)));
  const raw = Buffer.byteLength(JSON.stringify(request));
  assert.ok(projected < raw, `projection ${projected} should undercut the raw request ${raw}`);
});

test("voice samples merge without duplicates, strip quotes, and keep the newest ten", () => {
  const merged = mergeVoiceSamples(
    ["Mm.", "\u201CRight. Okay.\u201D"],
    ["right. okay.", "  ", "\"No, hang on.\"", null]
  );
  assert.deepEqual(merged, ["Mm.", "Right. Okay.", "No, hang on."]);
  const many = mergeVoiceSamples([], Array.from({ length: 14 }, (_, i) => `line ${i + 1}`));
  assert.equal(many.length, MAX_VOICE_SAMPLES);
  assert.equal(many[0], "line 5");
  assert.deepEqual(mergeVoiceSamples(undefined, undefined), []);
});

test("describe_cast_member accumulates voice samples and the roster always carries a bounded array", () => {
  const { request, response } = compile({}, {
    operations: [op({
      op: "describe_cast_member", handle: "hero",
      profile: { role_background: null, personality: null, voice_style: null, appearance: null, goals: null, boundaries: null, speaker_eligible: null, voice_samples: ["I didn't say that.", "Mm."] }
    })]
  });
  const hero = castById(response, "primary:thread-1");
  assert.deepEqual(hero.voice_samples, ["I didn't say that.", "Mm."]);
  for (const member of response.world_state.cast_roster) {
    assert.ok(Array.isArray(member.voice_samples));
    assert.ok(member.voice_samples.length <= MAX_VOICE_SAMPLES);
  }
  assert.doesNotThrow(() => validateResponse(request, response));
});
