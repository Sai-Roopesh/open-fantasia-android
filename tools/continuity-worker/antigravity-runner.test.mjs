import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createAntigravityContinuityRunner,
  createAntigravityRoleplayRunner,
  MAX_ANTIGRAVITY_ROLEPLAY_PROMPT_BYTES,
  renderRoleplayTask,
  validatePortraitImage,
  validateRoleplayOutput
} from "./antigravity-runner.mjs";

function generationRequest() {
  return {
    contract_version: 1,
    system_prompt: "SYSTEM-RULE: Speak only as Yunxi.\n<durable_state>\n{\"story\":\"continuity\"}\n</durable_state>",
    messages: [
      { role: "user", content: "First user beat." },
      { role: "assistant", content: "Earlier assistant beat." },
      { role: "user", content: "<reply_control>Yunxi</reply_control>\\nLatest user beat." }
    ],
    requested_speaker_id: "cast-yunxi",
    speaker_mode: "single",
    settings: {
      temperature: 0.9,
      top_p: 0.95,
      max_tokens: 2048,
      presence_penalty: 0.4,
      frequency_penalty: 0.4
    }
  };
}

test("roleplay task preserves authoritative prompt and ordered roles without transport metadata", () => {
  const task = renderRoleplayTask(generationRequest());
  assert.match(task, /SYSTEM-RULE: Speak only as Yunxi\./);
  assert.ok(task.indexOf("First user beat.") < task.indexOf("Earlier assistant beat."));
  assert.ok(task.indexOf("Earlier assistant beat.") < task.indexOf("Latest user beat."));
  assert.match(task, /role="user"/);
  assert.match(task, /role="assistant"/);
  assert.doesNotMatch(task, /request_id|thread_id|Tailscale|queue/);
});

test("roleplay task preserves every sentinel across a full fifteen-exchange window", () => {
  const request = generationRequest();
  request.messages = [];
  for (let index = 1; index <= 15; index++) {
    request.messages.push({
      role: "user",
      content: `USER-SENTINEL-${index} ${"u".repeat(2048)}`
    });
    request.messages.push({
      role: "assistant",
      content: `ASSISTANT-SENTINEL-${index} ${"a".repeat(2048)}`
    });
  }
  request.messages.push({
    role: "user",
    content: "<reply_control>Yunxi</reply_control>\\nCURRENT-USER-SENTINEL"
  });

  const task = renderRoleplayTask(request);
  for (let index = 1; index <= 15; index++) {
    assert.match(task, new RegExp(`USER-SENTINEL-${index}`));
    assert.match(task, new RegExp(`ASSISTANT-SENTINEL-${index}`));
  }
  assert.match(task, /CURRENT-USER-SENTINEL/);
  assert.equal(task.split("<durable_state>").length - 1, 1);
  const conversation = task.split("<conversation>")[1].split("</conversation>")[0];
  assert.equal(conversation.split("<reply_control>").length - 1, 1);
});

test("roleplay runner gives Antigravity the complete canonical task as direct model input", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-roleplay-runner-test-"));
  let task = "";
  let args = [];
  const request = generationRequest();
  const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const runner = createAntigravityRoleplayRunner({
    agy: "agy",
    model: "gemini-3.6-flash-high",
    effort: "high",
    timeoutMillis: 1000,
    workspaceRoot: root,
    runProcess: async (_agy, actualArgs, options) => {
      args = actualArgs;
      task = actualArgs[actualArgs.indexOf("--print") + 1];
      await assert.rejects(readFile(join(options.cwd, "roleplay-task.md"), "utf8"));
      return "Yunxi answers in character.";
    }
  });
  try {
    const result = await runner({
      protocol_version: 2,
      request_id: "transport-only-id",
      thread_id: "transport-only-thread",
      branch_id: "transport-only-branch",
      turn_id: "transport-only-turn",
      requested_speaker_id: "cast-yunxi",
      speaker_mode: "single",
      model_id: "antigravity:gemini-3.6-flash:high",
      request_hash: requestHash,
      generation_request: request
    });
    assert.equal(result.reply_text, "Yunxi answers in character.");
    assert.equal(args[0], "--print");
    assert.doesNotMatch(args.join(" "), /roleplay-task\.md|read_file/);
    assert.match(task, /Open Fantasia Roleplay Generation Contract/);
    assert.doesNotMatch(task, /transport-only/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("roleplay runner rejects oversized canonical context instead of letting an agent skip it", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-roleplay-runner-size-test-"));
  const request = generationRequest();
  request.messages[0].content = "x".repeat(MAX_ANTIGRAVITY_ROLEPLAY_PROMPT_BYTES);
  const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  let invoked = false;
  const runner = createAntigravityRoleplayRunner({
    agy: "agy",
    model: "gemini-3.6-flash-high",
    effort: "high",
    timeoutMillis: 1000,
    workspaceRoot: root,
    runProcess: async () => {
      invoked = true;
      return "must not run";
    }
  });
  try {
    await assert.rejects(
      runner({
        protocol_version: 2,
        request_id: "oversized-id",
        thread_id: "thread",
        branch_id: "branch",
        turn_id: "turn",
        requested_speaker_id: "cast-yunxi",
        speaker_mode: "single",
        model_id: "antigravity:gemini-3.6-flash:high",
        request_hash: requestHash,
        generation_request: request
      }),
      /above the .*direct-delivery limit/
    );
    assert.equal(invoked, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("roleplay output validation rejects agent wrappers", () => {
  assert.equal(validateRoleplayOutput("  Yunxi answers.  "), "Yunxi answers.");
  assert.throws(() => validateRoleplayOutput("```\\nYunxi answers.\\n```"), /Markdown fence/);
  assert.throws(() => validateRoleplayOutput('{"reply":"Yunxi answers."}'), /JSON/);
  assert.throws(() => validateRoleplayOutput("Here is the reply: Yunxi answers."), /commentary/);
});

function jpeg(width, height, size = 20 * 1024) {
  const buffer = Buffer.alloc(size);
  buffer.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  buffer[11] = 3;
  buffer[buffer.length - 2] = 0xff;
  buffer[buffer.length - 1] = 0xd9;
  return buffer;
}

test("portrait validation accepts a sufficiently large vertical JPEG", () => {
  const metadata = validatePortraitImage(jpeg(768, 1376));
  assert.equal(metadata.mime_type, "image/jpeg");
  assert.equal(metadata.width, 768);
  assert.equal(metadata.height, 1376);
  assert.match(metadata.sha256, /^[0-9a-f]{64}$/);
});

test("portrait validation rejects landscape and tiny artifacts", () => {
  assert.throws(() => validatePortraitImage(jpeg(1376, 768)), /resolution|vertical/);
  assert.throws(() => validatePortraitImage(jpeg(768, 1376, 100)), /too small/);
});

// The failure this adapter exists to survive: headless mode auto-denies a tool the agent reached for,
// the CLI exits 0 having produced nothing, and the run is lost. That throw used to escape the attempt
// loop entirely — no second attempt, and the raw CLI text went to the phone as the failure reason.
const DENIED = 'jetski: no output produced — a tool required the "read_file" permission that headless ' +
  'mode cannot prompt for, so it was auto-denied. Add an allow-rule under permissions.allow in settings.json.';

function continuityRequest() {
  return {
    protocol_version: 2, request_id: "agy-1", thread_id: "t", branch_id: "b",
    target_turn_id: "turn-1", baseline_version: 0, baseline_hash: "h", attempt_count: 0,
    trigger_reason: "cadence", discarded_exchange_count: 0,
    character: { name: "Hero", story: "", core_persona: "", appearance: "", definition: "", style_rules: "", negative_guidance: "" },
    persona: null, director_notes: "", pins: [],
    // A snapshot with an empty Cast Roster is rejected, so the request carries the Primary Character
    // the compiler will project — the same shape a real thread always has.
    cast_seeds: [{
      cast_id: "primary:t", entity_id: null, canonical_name: "Hero", aliases: [],
      role_background: "Lead", personality: "Steady", voice_style: "", appearance: "", goals: "",
      boundaries: "", provenance: "primary", first_seen_turn_id: null, evidence: [], status: "active",
      speaker_eligible: true, player_controlled: false, manual_locks: ["canonical_name"]
    }],
    current_cast_roster: [],
    baseline_snapshot: null,
    exchanges: [{ turn_id: "turn-1", parent_turn_id: null, user: "Hello", assistant: "Hi", created_at: "1" }],
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

test("an auto-denied tool permission is retried, not surfaced raw", async () => {
  const calls = [];
  const runner = createAntigravityContinuityRunner({
    agy: "agy", model: "m", effort: "high", prompt: "INSTRUCTIONS",
    validateSchema: () => {}, timeoutMillis: 1000, workspaceRoot: tmpdir(),
    runProcess: async () => {
      calls.push(1);
      if (calls.length === 1) throw new Error(`Antigravity continuity exited with status 0: ${DENIED}`);
      return VALID_DRAFT;
    }
  });

  const response = await runner(continuityRequest());
  assert.equal(calls.length, 2, "the denied attempt is retried rather than ending the run");
  assert.equal(response.request_id, "agy-1");
  assert.equal(response.world_state.narrative_state.story_summary, "A complete causal account.");
});

test("a permission failure on both attempts explains itself instead of quoting the CLI", async () => {
  const runner = createAntigravityContinuityRunner({
    agy: "agy", model: "m", effort: "high", prompt: "INSTRUCTIONS",
    validateSchema: () => {}, timeoutMillis: 1000, workspaceRoot: tmpdir(),
    runProcess: async () => { throw new Error(`Antigravity continuity exited with status 0: ${DENIED}`); }
  });

  await assert.rejects(() => runner(continuityRequest()), error => {
    assert.match(error.message, /tried to use a tool that headless mode auto-denies/);
    assert.doesNotMatch(error.message, /permissions\.allow|jetski/, "no raw CLI remediation reaches the phone");
    return true;
  });
});

test("the no-tools instruction reaches the model with the task", async () => {
  let seen = "";
  const runner = createAntigravityContinuityRunner({
    agy: "agy", model: "m", effort: "high", prompt: "INSTRUCTIONS",
    validateSchema: () => {}, timeoutMillis: 1000, workspaceRoot: tmpdir(),
    runProcess: async (_bin, args) => { seen = args[1]; return VALID_DRAFT; }
  });
  await runner(continuityRequest());
  assert.match(seen, /running headless with no tool access/);
  assert.match(seen, /INSTRUCTIONS/);
});
