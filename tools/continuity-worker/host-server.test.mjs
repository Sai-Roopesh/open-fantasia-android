import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ANTIGRAVITY_PORTRAIT_MODEL,
  ANTIGRAVITY_ROLEPLAY_MODEL,
  CLAUDE_CODE_ROLEPLAY_MODEL,
  CLAUDE_OPUS_48_ROLEPLAY_MODEL,
  CLAUDE_OPUS_5_ROLEPLAY_MODEL,
  CLAUDE_ROLEPLAY_MODELS,
  CLAUDE_CONTINUITY_ENGINE,
  CODEX_CONTINUITY_ENGINE,
  createContinuityHost
} from "./host-server.mjs";

async function waitForReady(base, credential, id) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await fetch(`${base}/v2/checkpoints/${id}`, { headers: { authorization: `Bearer ${credential}` } });
    const status = await response.json();
    if (status.status === "ready") return status;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Checkpoint did not become ready");
}

function request(id, hash = "baseline") {
  return {
    protocol_version: 2,
    job_type: "continuity",
    engine_id: CODEX_CONTINUITY_ENGINE,
    request_id: id,
    thread_id: "thread-1",
    branch_id: "branch-1",
    target_turn_id: "turn-7",
    baseline_hash: hash,
    baseline_version: 1,
    attempt_count: 0,
    exchanges: []
  };
}

async function withHost(runContinuity, body, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-server-test-"));
  const host = await createContinuityHost({ root, port: 0, runContinuity, ...options });
  const address = await host.start();
  const base = `http://127.0.0.1:${address.port}`;
  try { await body({ host, base }); } finally { await host.stop({ force: true }); await rm(root, { recursive: true, force: true }); }
}

test("running host enforces privacy retention periodically", async () => {
  let now = 100;
  await withHost(async input => input, async ({ host }) => {
    await host.store.createOrGet({
      ...request("periodic-expiry"),
      job_type: "roleplay",
      model_id: ANTIGRAVITY_ROLEPLAY_MODEL
    }, "device-1", "roleplay");
    await host.store.markReady("periodic-expiry", { private_story: "content" });
    now += 24 * 60 * 60 * 1000 + 1;
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await host.store.getState("periodic-expiry"))?.status === "expired") break;
      await new Promise(resolve => setTimeout(resolve, 2));
    }
    assert.equal((await host.store.getState("periodic-expiry")).status, "expired");
    assert.equal(await host.store.getResponse("periodic-expiry"), null);
  }, { now: () => now, cleanupIntervalMillis: 5 });
});

async function pair(host, base) {
  const pairing = await host.devices.createPairing({ endpoint: base });
  const response = await fetch(`${base}/v2/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: pairing.code, device_name: "Test phone" })
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("private API pairs, runs one idempotent job, returns and acknowledges result", async () => {
  await withHost(async input => ({ request_id: input.request_id, answer: "complete" }), async ({ host, base }) => {
    assert.equal((await fetch(`${base}/v2/health`)).status, 401);
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };

    const submitted = await fetch(`${base}/v2/checkpoints`, { method: "POST", headers, body: JSON.stringify(request("one")) });
    assert.equal(submitted.status, 202);
    await waitForReady(base, paired.credential, "one");

    const duplicate = await fetch(`${base}/v2/checkpoints`, { method: "POST", headers, body: JSON.stringify(request("one")) });
    assert.equal(duplicate.status, 200);
    const result = await (await fetch(`${base}/v2/checkpoints/one/result`, { headers })).json();
    assert.equal(result.answer, "complete");

    const ack = await fetch(`${base}/v2/checkpoints/one/ack`, { method: "POST", headers });
    assert.equal(ack.status, 200);
    assert.equal((await host.store.getState("one")).status, "acknowledged");
    assert.equal(await host.store.getRequest("one"), null);
  });
});

test("same request identity with changed evidence returns conflict", async () => {
  await withHost(async input => input, async ({ host, base }) => {
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
    await fetch(`${base}/v2/checkpoints`, { method: "POST", headers, body: JSON.stringify(request("same")) });
    const conflict = await fetch(`${base}/v2/checkpoints`, { method: "POST", headers, body: JSON.stringify(request("same", "changed")) });
    assert.equal(conflict.status, 409);
  });
});

test("concurrent duplicate submissions create one durable job", async () => {
  await withHost(async input => ({ request_id: input.request_id }), async ({ host, base }) => {
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
    const responses = await Promise.all(Array.from({ length: 8 }, () => fetch(`${base}/v2/checkpoints`, {
      method: "POST", headers, body: JSON.stringify(request("concurrent"))
    })));
    assert.equal(responses.filter(response => response.status === 202).length, 1);
    assert.equal(responses.filter(response => response.status === 200).length, 7);
    assert.equal((await host.store.summary()).queue_depth <= 1, true);
  });
});

test("global queue never runs two Continuity jobs concurrently", async () => {
  let active = 0;
  let maximum = 0;
  await withHost(async input => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 30));
    active -= 1;
    return { request_id: input.request_id };
  }, async ({ host, base }) => {
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
    await Promise.all(["first", "second"].map(id => fetch(`${base}/v2/checkpoints`, {
      method: "POST", headers, body: JSON.stringify(request(id))
    })));
    await Promise.all(["first", "second"].map(id => waitForReady(base, paired.credential, id)));
    assert.equal(maximum, 1);
  });
});

test("roleplay jobs use the same pairing and durable acknowledgement protocol", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-roleplay-server-test-"));
  const runRoleplay = async input => ({
    protocol_version: 2,
    job_type: "roleplay",
    request_id: input.request_id,
    thread_id: input.thread_id,
    branch_id: input.branch_id,
    turn_id: input.turn_id,
    requested_speaker_id: input.requested_speaker_id,
    speaker_mode: input.speaker_mode,
    model_id: input.model_id,
    reply_text: "In-character reply",
    elapsed_millis: 12
  });
  const host = await createContinuityHost({ root, port: 0, runContinuity: async input => input, runRoleplay });
  const address = await host.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
    const requestBody = {
      protocol_version: 2,
      job_type: "roleplay",
      request_id: "roleplay-1",
      thread_id: "thread-1",
      branch_id: "branch-1",
      turn_id: "turn-1",
      requested_speaker_id: "cast-yunxi",
      speaker_mode: "single",
      model_id: ANTIGRAVITY_ROLEPLAY_MODEL,
      attempt_count: 0,
      request_hash: "canonical-hash",
      generation_request: {
        contract_version: 1,
        system_prompt: "Stable prompt",
        messages: [{ role: "user", content: "Hello" }],
        requested_speaker_id: "cast-yunxi",
        speaker_mode: "single",
        settings: {
          temperature: 0.9,
          top_p: 0.95,
          max_tokens: 2048,
          presence_penalty: 0.4,
          frequency_penalty: 0.4
        }
      }
    };
    const submitted = await fetch(`${base}/v2/roleplay-jobs`, { method: "POST", headers, body: JSON.stringify(requestBody) });
    assert.equal(submitted.status, 202);
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = await (await fetch(`${base}/v2/roleplay-jobs/roleplay-1`, { headers })).json();
      if (status.status === "ready") break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    const result = await (await fetch(`${base}/v2/roleplay-jobs/roleplay-1/result`, { headers })).json();
    assert.equal(result.reply_text, "In-character reply");
    assert.equal(result.requested_speaker_id, "cast-yunxi");
    assert.equal((await fetch(`${base}/v2/roleplay-jobs/roleplay-1/ack`, { method: "POST", headers })).status, 200);
    assert.equal(await host.store.getRequest("roleplay-1"), null);
  } finally {
    await host.stop({ force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("Claude Code roleplay uses its own runner while preserving the shared host protocol", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-claude-server-test-"));
  let invoked = false;
  const runClaude = async input => {
    invoked = true;
    return {
      protocol_version: 2,
      job_type: "roleplay",
      request_id: input.request_id,
      thread_id: input.thread_id,
      branch_id: input.branch_id,
      turn_id: input.turn_id,
      requested_speaker_id: input.requested_speaker_id,
      speaker_mode: input.speaker_mode,
      model_id: input.model_id,
      reply_text: "Claude reply",
      elapsed_millis: 8
    };
  };
  const host = await createContinuityHost({
    root,
    port: 0,
    runContinuity: async input => input,
    roleplayRunners: new Map([[CLAUDE_CODE_ROLEPLAY_MODEL, runClaude]])
  });
  const address = await host.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
    const requestBody = {
      protocol_version: 2,
      job_type: "roleplay",
      request_id: "claude-roleplay-server-1",
      thread_id: "thread-1",
      branch_id: "branch-1",
      turn_id: "turn-1",
      requested_speaker_id: null,
      speaker_mode: "single",
      model_id: CLAUDE_CODE_ROLEPLAY_MODEL,
      attempt_count: 0,
      request_hash: "hash",
      generation_request: {}
    };
    assert.equal((await fetch(`${base}/v2/roleplay-jobs`, {
      method: "POST", headers, body: JSON.stringify(requestBody)
    })).status, 202);
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = await (await fetch(`${base}/v2/roleplay-jobs/${requestBody.request_id}`, { headers })).json();
      if (status.status === "ready") break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    const result = await (await fetch(`${base}/v2/roleplay-jobs/${requestBody.request_id}/result`, { headers })).json();
    assert.equal(result.reply_text, "Claude reply");
    assert.equal(invoked, true);
  } finally {
    await host.stop({ force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("portrait jobs use the shared host and return an immutable image envelope", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-portrait-server-test-"));
  const runPortrait = async input => ({
    protocol_version: 2,
    job_type: "portrait",
    request_id: input.request_id,
    subject_type: input.subject_type,
    character_id: input.character_id,
    thread_id: input.thread_id,
    branch_id: input.branch_id,
    cast_id: input.cast_id,
    source_hash: input.source_hash,
    prompt_version: input.prompt_version,
    model_id: input.model_id,
    mime_type: "image/jpeg",
    width: 768,
    height: 1376,
    sha256: "a".repeat(64),
    image_base64: "portrait-bytes"
  });
  const host = await createContinuityHost({
    root,
    port: 0,
    runContinuity: async input => input,
    runPortrait
  });
  const address = await host.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
    const body = {
      protocol_version: 2,
      job_type: "portrait",
      request_id: "portrait-1",
      subject_type: "cast",
      character_id: "character-1",
      thread_id: "thread-1",
      branch_id: "branch-1",
      cast_id: "cast-yunxi",
      source_hash: "source",
      prompt_version: 1,
      model_id: ANTIGRAVITY_PORTRAIT_MODEL,
      attempt_count: 0,
      portrait_brief: { canonical_name: "Yunxi" }
    };
    const submitted = await fetch(`${base}/v2/portrait-jobs`, { method: "POST", headers, body: JSON.stringify(body) });
    assert.equal(submitted.status, 202);
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = await (await fetch(`${base}/v2/portrait-jobs/portrait-1`, { headers })).json();
      if (status.status === "ready") break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    const result = await (await fetch(`${base}/v2/portrait-jobs/portrait-1/result`, { headers })).json();
    assert.equal(result.subject_type, "cast");
    assert.equal(result.cast_id, "cast-yunxi");
    assert.equal(result.image_base64, "portrait-bytes");
    assert.equal((await fetch(`${base}/v2/portrait-jobs/portrait-1/ack`, { method: "POST", headers })).status, 200);
  } finally {
    await host.stop({ force: true });
    await rm(root, { recursive: true, force: true });
  }
});

// A Continuity Engine that failed its capability preflight is refused where the phone can act on it,
// not after a checkpoint has sat in the queue waiting for a run that cannot happen. Antigravity spent
// a full Continuity Update discovering a headless permission it could never have been granted.
test("a checkpoint for an engine that failed preflight is refused with the reason", async () => {
  await withHost(async input => input, async ({ host, base }) => {
    const paired = await pair(host, base);
    const response = await fetch(`${base}/v2/checkpoints`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${paired.credential}` },
      body: JSON.stringify(request("preflight-refused"))
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.message, /Continuity Engine is unavailable: read_file permission auto-denied/);
    assert.equal(await host.store.getState("preflight-refused"), null, "nothing is queued");
  }, {
    continuityRunners: new Map(),
    continuityEngineFailures: new Map([[CODEX_CONTINUITY_ENGINE, "read_file permission auto-denied"]])
  });
});

test("health reports which Continuity Engines are available and why others are not", async () => {
  await withHost(async input => input, async ({ host, base }) => {
    const paired = await pair(host, base);
    const health = await (await fetch(`${base}/v2/health`, {
      headers: { authorization: `Bearer ${paired.credential}` }
    })).json();
    assert.deepEqual(health.continuity_engines, [CODEX_CONTINUITY_ENGINE]);
    assert.deepEqual(health.continuity_engines_unavailable, { "antigravity:gemini-3.6-flash:high": "not signed in" });
  }, {
    continuityRunners: new Map([[CODEX_CONTINUITY_ENGINE, async input => input]]),
    continuityEngineFailures: new Map([["antigravity:gemini-3.6-flash:high", "not signed in"]])
  });
});

// Claude is a Continuity Engine and a Roleplay Model on one CLI and one subscription. Continuity is
// globally serialized either way, but the lane is what keeps a Claude Continuity Update from running
// beside a Claude roleplay reply — the mistake that would put two headless sessions on one account.
test("a Claude Continuity Update holds the Claude lane against a Claude roleplay reply", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-claude-lane-test-"));
  let claudeActive = 0;
  let overlapped = false;
  const occupyClaudeLane = async input => {
    claudeActive += 1;
    if (claudeActive > 1) overlapped = true;
    await new Promise(resolve => setTimeout(resolve, 40));
    claudeActive -= 1;
    return { request_id: input.request_id, reply_text: "done", model_id: input.model_id };
  };
  const host = await createContinuityHost({
    root,
    port: 0,
    continuityRunners: new Map([[CLAUDE_CONTINUITY_ENGINE, occupyClaudeLane]]),
    roleplayRunners: new Map([[CLAUDE_CODE_ROLEPLAY_MODEL, occupyClaudeLane]])
  });
  const address = await host.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
    await fetch(`${base}/v2/checkpoints`, {
      method: "POST", headers,
      body: JSON.stringify({ ...request("claude-continuity-1"), engine_id: CLAUDE_CONTINUITY_ENGINE })
    });
    await fetch(`${base}/v2/roleplay-jobs`, {
      method: "POST", headers,
      body: JSON.stringify({
        protocol_version: 2, job_type: "roleplay", request_id: "claude-roleplay-lane-1",
        thread_id: "thread-1", branch_id: "branch-1", turn_id: "turn-1",
        requested_speaker_id: null, speaker_mode: "single", model_id: CLAUDE_CODE_ROLEPLAY_MODEL,
        attempt_count: 0, request_hash: "hash", generation_request: {}
      })
    });
    await waitForReady(base, paired.credential, "claude-continuity-1");
    for (let attempt = 0; attempt < 200; attempt++) {
      const status = await (await fetch(`${base}/v2/roleplay-jobs/claude-roleplay-lane-1`, { headers })).json();
      if (status.status === "ready") break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(overlapped, false, "two Claude jobs never share the lane");
  } finally {
    await host.stop({ force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("an unknown Continuity Engine is refused at submission, and Claude Opus High is not", async () => {
  await withHost(async input => input, async ({ host, base }) => {
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
    const unknown = await fetch(`${base}/v2/checkpoints`, {
      method: "POST", headers,
      body: JSON.stringify({ ...request("unknown-engine"), engine_id: "claude-code:haiku:low" })
    });
    assert.equal(unknown.status, 400);
    assert.match((await unknown.json()).message, /Unsupported Continuity Engine/);
    const accepted = await fetch(`${base}/v2/checkpoints`, {
      method: "POST", headers,
      body: JSON.stringify({ ...request("claude-engine-accepted"), engine_id: CLAUDE_CONTINUITY_ENGINE })
    });
    assert.equal(accepted.status, 202);
  }, {
    continuityRunners: new Map([[CLAUDE_CONTINUITY_ENGINE, async input => input]])
  });
});

// Adding a second and third Claude Roleplay Model is only safe if everything that asks "is this job
// Claude's" answers yes for all of them. It used to compare against one constant, so an Opus reply
// would have been routed to the Antigravity lane and allowed to run beside a Claude job on the one
// account and the one headless session that can serve exactly one.
test("every Claude Roleplay Model shares the one Claude lane", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-opus-lane-test-"));
  let claudeActive = 0;
  let overlapped = false;
  const occupyClaudeLane = async input => {
    claudeActive += 1;
    if (claudeActive > 1) overlapped = true;
    await new Promise(resolve => setTimeout(resolve, 30));
    claudeActive -= 1;
    return { request_id: input.request_id, reply_text: "done", model_id: input.model_id };
  };
  const host = await createContinuityHost({
    root,
    port: 0,
    roleplayRunners: new Map([...CLAUDE_ROLEPLAY_MODELS.keys()].map(id => [id, occupyClaudeLane]))
  });
  const address = await host.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
    const ids = [CLAUDE_CODE_ROLEPLAY_MODEL, CLAUDE_OPUS_48_ROLEPLAY_MODEL, CLAUDE_OPUS_5_ROLEPLAY_MODEL];
    for (const [index, modelId] of ids.entries()) {
      const accepted = await fetch(`${base}/v2/roleplay-jobs`, {
        method: "POST", headers,
        body: JSON.stringify({
          protocol_version: 2, job_type: "roleplay", request_id: `opus-lane-${index}`,
          thread_id: "thread-1", branch_id: "branch-1", turn_id: `turn-${index}`,
          requested_speaker_id: null, speaker_mode: "single", model_id: modelId,
          attempt_count: 0, request_hash: `hash-${index}`, generation_request: {}
        })
      });
      assert.ok(accepted.ok, `${modelId} was refused as an unsupported Roleplay Model`);
    }
    for (const [index] of ids.entries()) {
      for (let attempt = 0; attempt < 400; attempt++) {
        const status = await (await fetch(`${base}/v2/roleplay-jobs/opus-lane-${index}`, { headers })).json();
        if (status.status === "ready") break;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
    assert.equal(overlapped, false, "two Claude replies ran at once on one subscription");
  } finally {
    await host.stop({ force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("a Roleplay Model outside the catalogue is still refused", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-unknown-model-test-"));
  const host = await createContinuityHost({ root, port: 0 });
  const address = await host.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const paired = await pair(host, base);
    const refused = await fetch(`${base}/v2/roleplay-jobs`, {
      method: "POST",
      headers: { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" },
      body: JSON.stringify({
        protocol_version: 2, job_type: "roleplay", request_id: "unknown-model-1",
        thread_id: "thread-1", branch_id: "branch-1", turn_id: "turn-1",
        requested_speaker_id: null, speaker_mode: "single", model_id: "claude-code:opus:high",
        attempt_count: 0, request_hash: "hash", generation_request: {}
      })
    });
    assert.equal(refused.ok, false, "the unpinned alias is a Continuity Engine, not a Roleplay Model");
  } finally {
    await host.stop({ force: true });
    await rm(root, { recursive: true, force: true });
  }
});
