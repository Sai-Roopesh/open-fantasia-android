import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  createClaudeContinuityRunner,
  createClaudeProbe,
  createClaudeRoleplayRunner,
  subscriptionOnlyEnvironment
} from "./claude-runner.mjs";

function generationRequest() {
  return {
    contract_version: 1,
    system_prompt: "SYSTEM-SENTINEL\n<durable_state>\n{\"story\":\"continuity\"}\n</durable_state>",
    messages: [
      { role: "user", content: "Earlier user beat." },
      { role: "assistant", content: "Earlier assistant beat." },
      { role: "user", content: "<reply_control>Jean Grey</reply_control>\nLatest user beat." }
    ],
    requested_speaker_id: "cast-jean",
    speaker_mode: "single",
    settings: { temperature: 0.9, top_p: 0.95, max_tokens: 4096 }
  };
}

test("Claude roleplay receives the same complete canonical request with no tools", async () => {
  const root = await mkdtemp(`${tmpdir()}/open-fantasia-claude-runner-test-`);
  const generation = generationRequest();
  const requestHash = createHash("sha256").update(JSON.stringify(generation)).digest("hex");
  let invocation;
  const runner = createClaudeRoleplayRunner({
    claude: "claude",
    model: "sonnet",
    effort: "high",
    timeoutMillis: 1000,
    workspaceRoot: root,
    processEnvironment: {
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "must-not-leak",
      ANTHROPIC_AUTH_TOKEN: "must-not-leak",
      CLAUDE_CODE_USE_VERTEX: "1",
      CLAUDE_CODE_OAUTH_TOKEN: "subscription-token"
    },
    runProcess: async (binary, args, options) => {
      invocation = { binary, args, options };
      return JSON.stringify({ result: "Jean answers in character.", is_error: false });
    }
  });
  try {
    const result = await runner({
      protocol_version: 2,
      request_id: "claude-roleplay-1",
      thread_id: "thread-1",
      branch_id: "branch-1",
      turn_id: "turn-1",
      requested_speaker_id: "cast-jean",
      speaker_mode: "single",
      model_id: "claude-code:sonnet:high",
      request_hash: requestHash,
      generation_request: generation
    });

    assert.equal(result.reply_text, "Jean answers in character.");
    assert.equal(invocation.binary, "claude");
    assert.equal(invocation.args[0], "--safe-mode");
    const task = invocation.args[invocation.args.indexOf("-p") + 1];
    assert.match(task, /SYSTEM-SENTINEL/);
    assert.match(task, /Earlier user beat/);
    assert.match(task, /Earlier assistant beat/);
    assert.match(task, /Latest user beat/);
    assert.equal(invocation.args[invocation.args.indexOf("--tools") + 1], "");
    assert.equal(invocation.args[invocation.args.indexOf("--max-turns") + 1], "1");
    assert.equal(invocation.options.env.ANTHROPIC_API_KEY, undefined);
    assert.equal(invocation.options.env.ANTHROPIC_AUTH_TOKEN, undefined);
    assert.equal(invocation.options.env.CLAUDE_CODE_USE_VERTEX, undefined);
    assert.equal(invocation.options.env.CLAUDE_CODE_OAUTH_TOKEN, "subscription-token");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("subscription environment removes every API and cloud-provider route", () => {
  const env = subscriptionOnlyEnvironment({
    KEEP: "yes",
    ANTHROPIC_API_KEY: "api",
    ANTHROPIC_AUTH_TOKEN: "gateway",
    ANTHROPIC_BASE_URL: "https://gateway.example",
    CLAUDE_CODE_USE_BEDROCK: "1",
    CLAUDE_CODE_USE_VERTEX: "1",
    CLAUDE_CODE_USE_FOUNDRY: "1"
  });
  assert.deepEqual(env, { KEEP: "yes" });
});

test("Claude transport errors never become visible roleplay prose", async () => {
  const root = await mkdtemp(`${tmpdir()}/open-fantasia-claude-error-test-`);
  const generation = generationRequest();
  const requestHash = createHash("sha256").update(JSON.stringify(generation)).digest("hex");
  const runner = createClaudeRoleplayRunner({
    claude: "claude",
    model: "sonnet",
    effort: "high",
    timeoutMillis: 1000,
    workspaceRoot: root,
    runProcess: async () => JSON.stringify({ result: "subscription limit reached", is_error: true })
  });
  try {
    await assert.rejects(runner({
      protocol_version: 2,
      request_id: "claude-error-1",
      thread_id: "thread-1",
      branch_id: "branch-1",
      turn_id: "turn-1",
      requested_speaker_id: null,
      speaker_mode: "single",
      model_id: "claude-code:sonnet:high",
      request_hash: requestHash,
      generation_request: generation
    }), /subscription limit reached/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function continuityRequest() {
  return {
    protocol_version: 2, request_id: "claude-continuity-1", thread_id: "t", branch_id: "b",
    target_turn_id: "turn-1", baseline_version: 0, baseline_hash: "h", attempt_count: 0,
    trigger_reason: "cadence", discarded_exchange_count: 0,
    character: { name: "Hero", story: "", core_persona: "", appearance: "", definition: "", style_rules: "", negative_guidance: "" },
    persona: null, director_notes: "", pins: [],
    cast_seeds: [{
      cast_id: "primary:t", entity_id: null, canonical_name: "Hero", aliases: [],
      role_background: "Lead", personality: "Steady", voice_style: "", appearance: "", goals: "",
      boundaries: "", provenance: "primary", first_seen_turn_id: null, evidence: [], status: "active",
      speaker_eligible: true, player_controlled: false, manual_locks: ["canonical_name"]
    }],
    current_cast_roster: [],
    baseline_snapshot: null,
    exchanges: [{ turn_id: "turn-1", parent_turn_id: null, user: "Hello", assistant: "Hi", created_at: "1" }]
  };
}

const VALID_DRAFT = JSON.stringify({
  narrative: {
    story_summary: "A complete causal account.", scene_summary: "The situation now.",
    last_turn_beat: "What just changed.", narrative_timestamp: "now", transition_type: "continuation"
  },
  scene: { current_location: null, adjacent_locations: [], present: [] },
  operations: [], timeline_events: []
});

const envelope = result => JSON.stringify({ result, is_error: false });

test("Claude continuity carries the Continuity Draft schema its CLI cannot enforce", async () => {
  let invocation;
  const runner = createClaudeContinuityRunner({
    claude: "claude", model: "opus", effort: "high", prompt: "INSTRUCTIONS",
    draftSchemaJson: JSON.stringify({ title: "DRAFT-SCHEMA-SENTINEL" }),
    timeoutMillis: 1000, workspaceRoot: tmpdir(),
    processEnvironment: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "must-not-leak" },
    runProcess: async (binary, args, options) => {
      invocation = { binary, args, options };
      return envelope(VALID_DRAFT);
    }
  });

  const response = await runner(continuityRequest());
  assert.equal(response.request_id, "claude-continuity-1");
  assert.equal(response.world_state.narrative_state.story_summary, "A complete causal account.");
  const task = invocation.args[invocation.args.indexOf("-p") + 1];
  assert.match(task, /INSTRUCTIONS/);
  assert.match(task, /DRAFT-SCHEMA-SENTINEL/);
  assert.equal(invocation.args[invocation.args.indexOf("--model") + 1], "opus");
  assert.equal(invocation.args[invocation.args.indexOf("--effort") + 1], "high");
  assert.equal(invocation.args[invocation.args.indexOf("--tools") + 1], "");
  assert.equal(invocation.options.env.ANTHROPIC_API_KEY, undefined);
});

// Claude answers "return JSON" with a fenced block often enough that the fence, not the content,
// would be what failed the run.
test("a fenced Continuity Draft is accepted rather than failed on its wrapper", async () => {
  const runner = createClaudeContinuityRunner({
    claude: "claude", model: "opus", effort: "high", prompt: "INSTRUCTIONS",
    timeoutMillis: 1000, workspaceRoot: tmpdir(),
    runProcess: async () => envelope("```json\n" + VALID_DRAFT + "\n```")
  });
  const response = await runner(continuityRequest());
  assert.equal(response.world_state.narrative_state.scene_summary, "The situation now.");
});

test("an invalid draft is repaired in place on the second attempt", async () => {
  const tasks = [];
  const runner = createClaudeContinuityRunner({
    claude: "claude", model: "opus", effort: "high", prompt: "INSTRUCTIONS",
    validateSchema: draft => { if (!draft.narrative) throw new Error("narrative is required"); },
    timeoutMillis: 1000, workspaceRoot: tmpdir(),
    runProcess: async (_binary, args) => {
      tasks.push(args[args.indexOf("-p") + 1]);
      return envelope(tasks.length === 1 ? JSON.stringify({ operations: [] }) : VALID_DRAFT);
    }
  });

  const response = await runner(continuityRequest());
  assert.equal(tasks.length, 2);
  assert.match(tasks[1], /Repair a draft you already wrote/);
  assert.equal(response.request_id, "claude-continuity-1");
});

// An exhausted allowance is not a draft defect. Without translation it reaches the phone as an
// unexplained "Update failed" with Claude's own transport wording behind it.
test("an exhausted subscription explains itself and names the way out", async () => {
  const runner = createClaudeContinuityRunner({
    claude: "claude", model: "opus", effort: "high", prompt: "INSTRUCTIONS",
    timeoutMillis: 1000, workspaceRoot: tmpdir(),
    runProcess: async () => JSON.stringify({ result: "Claude usage limit reached", is_error: true })
  });
  await assert.rejects(() => runner(continuityRequest()), error => {
    assert.match(error.message, /subscription allowance is exhausted/);
    assert.match(error.message, /another engine/);
    return true;
  });
});

test("the Claude preflight proves the real invocation and rejects an unexpected answer", async () => {
  let invocation;
  const ready = createClaudeProbe({
    claude: "claude", model: "opus", effort: "high", timeoutMillis: 1000,
    processEnvironment: { PATH: "/usr/bin", CLAUDE_CODE_USE_BEDROCK: "1" },
    runProcess: async (binary, args, options) => {
      invocation = { binary, args, options };
      return envelope('{"ready": true}');
    }
  });
  await ready();
  assert.equal(invocation.args[0], "--safe-mode");
  assert.equal(invocation.args[invocation.args.indexOf("--model") + 1], "opus");
  assert.equal(invocation.options.env.CLAUDE_CODE_USE_BEDROCK, undefined);

  const notReady = createClaudeProbe({
    claude: "claude", model: "opus", effort: "high", timeoutMillis: 1000,
    runProcess: async () => envelope('{"ready": false}')
  });
  await assert.rejects(notReady, /unexpected value/);
});
