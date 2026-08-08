import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeviceRegistry,
  DurableJobStore,
  MAX_DIRECT_MODEL_INPUT_BYTES,
  renderContinuityModelInput,
  requestPayloadHash,
  requireDirectModelInputSize
} from "./host-lib.mjs";

async function withTemp(testBody) {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-host-test-"));
  try { await testBody(root); } finally { await rm(root, { recursive: true, force: true }); }
}

function request(overrides = {}) {
  return {
    protocol_version: 2,
    job_type: "continuity",
    engine_id: "codex:gpt-5.6-terra:high",
    request_id: "request-1",
    thread_id: "thread-1",
    branch_id: "branch-1",
    target_turn_id: "turn-7",
    baseline_hash: "baseline",
    baseline_version: 1,
    attempt_count: 0,
    exchanges: [],
    ...overrides
  };
}

test("request hashing is independent of JSON key order", () => {
  assert.equal(requestPayloadHash({ b: 2, a: { d: 4, c: 3 } }), requestPayloadHash({ a: { c: 3, d: 4 }, b: 2 }));
});

test("both Continuity adapters receive one complete direct model input", () => {
  const evidence = request({
    exchanges: [
      { turn_id: "first", user: "FIRST-SENTINEL", assistant: "FIRST-REPLY" },
      { turn_id: "middle", user: "MIDDLE-SENTINEL", assistant: "MIDDLE-REPLY" },
      { turn_id: "last", user: "LAST-SENTINEL", assistant: "LAST-REPLY" }
    ]
  });
  const input = renderContinuityModelInput("AUTHORITATIVE-INSTRUCTIONS", evidence);

  assert.match(input, /AUTHORITATIVE-INSTRUCTIONS/);
  assert.match(input, /FIRST-SENTINEL/);
  assert.match(input, /MIDDLE-SENTINEL/);
  assert.match(input, /LAST-SENTINEL/);
  assert.match(input, /<continuity_request_json>/);
  assert.doesNotMatch(input, /request\.json|read_file/);
  assert.equal(input.split("<continuity_request_json>").length - 1, 1);
  assert.doesNotThrow(() => requireDirectModelInputSize(input, "Canonical continuity context"));
});

test("oversized Continuity input fails instead of being partially retrieved", () => {
  const input = "x".repeat(MAX_DIRECT_MODEL_INPUT_BYTES + 1);
  assert.throws(
    () => requireDirectModelInputSize(input, "Canonical continuity context"),
    /above the .*direct-delivery limit/
  );
});

test("pairing codes are single-use and credentials authenticate", async () => withTemp(async root => {
  let now = 1_000;
  const registry = new DeviceRegistry(root, () => now);
  await registry.init();
  const pairing = await registry.createPairing({ endpoint: "https://host.example.ts.net" });
  const result = await registry.redeemPairing({ code: pairing.code, deviceName: "Phone" });

  assert.equal((await registry.authenticate(result.credential))?.id, result.device_id);
  await assert.rejects(() => registry.redeemPairing({ code: pairing.code, deviceName: "Other" }), /invalid or expired/);
  assert.equal((await registry.listDevices()).length, 1);
  assert.equal(await registry.revokeDevice(result.device_id), true);
  assert.equal(await registry.authenticate(result.credential), null);
}));

test("expired pairing code is rejected", async () => withTemp(async root => {
  let now = 1_000;
  const registry = new DeviceRegistry(root, () => now);
  await registry.init();
  const pairing = await registry.createPairing({ endpoint: "https://host.example.ts.net", ttlMillis: 100 });
  now += 101;
  await assert.rejects(() => registry.redeemPairing({ code: pairing.code, deviceName: "Phone" }), /invalid or expired/);
}));

test("duplicate immutable checkpoint does not create another job", async () => withTemp(async root => {
  const store = new DurableJobStore(root);
  await store.init();
  const first = await store.createOrGet(request(), "device-1");
  const duplicate = await store.createOrGet({ ...request() }, "device-1");

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal((await store.summary()).queue_depth, 1);
}));

test("same identity with different content is rejected", async () => withTemp(async root => {
  const store = new DurableJobStore(root);
  await store.init();
  await store.createOrGet(request(), "device-1");
  await assert.rejects(() => store.createOrGet(request({ baseline_hash: "changed" }), "device-1"), /conflicts/);
  await assert.rejects(() => store.createOrGet(request(), "device-2"), /conflicts/);
}));

test("a higher explicit attempt may replace a failed job", async () => withTemp(async root => {
  const store = new DurableJobStore(root, () => 500);
  await store.init();
  const first = request({ request_id: "retryable" });
  await store.createOrGet(first, "device-1");
  await store.markFailed(first.request_id, "invalid output");

  const second = { ...first, attempt_count: 1 };
  const result = await store.createOrGet(second, "device-1");
  assert.equal(result.created, true);
  assert.equal((await store.getState(first.request_id)).status, "queued");
  assert.equal((await store.getState(first.request_id)).attempt_count, 1);
  assert.deepEqual(await store.getRequest(first.request_id), second);
}));

test("running work returns to the FIFO queue after restart", async () => withTemp(async root => {
  let now = 100;
  const store = new DurableJobStore(root, () => now++);
  await store.init();
  await store.createOrGet(request({ request_id: "first" }), "device-1");
  await store.createOrGet(request({ request_id: "second" }), "device-1");
  await store.markRunning("first");

  const restarted = new DurableJobStore(root, () => now++);
  await restarted.init();
  assert.equal((await restarted.nextQueued()).request_id, "first");
  assert.equal((await restarted.summary()).queue_depth, 2);
}));

test("read-only spool inspection never recovers work owned by a live host", async () => withTemp(async root => {
  let now = 100;
  const live = new DurableJobStore(root, () => now++);
  await live.init();
  await live.createOrGet(request({ request_id: "live" }), "device-1");
  await live.markRunning("live");

  const observer = new DurableJobStore(root, () => now++);
  await observer.init({ recoverInterrupted: false });

  assert.equal((await observer.getState("live")).status, "generating");
  assert.equal((await observer.summary()).queue_depth, 0);
  assert.equal((await observer.summary()).active_jobs[0].request_id, "live");
}));

test("FIFO order stays stable when jobs arrive in the same millisecond", async () => withTemp(async root => {
  const store = new DurableJobStore(root, () => 100);
  await store.init();
  await store.createOrGet(request({ request_id: "first" }), "device-1");
  await store.createOrGet(request({ request_id: "second" }), "device-1");
  assert.equal((await store.nextQueued()).request_id, "first");
  assert.equal(await store.queuePosition("second"), 2);
}));

test("acknowledgement removes narrative files but leaves diagnostic state", async () => withTemp(async root => {
  const store = new DurableJobStore(root);
  await store.init();
  await store.createOrGet(request(), "device-1");
  await store.markReady("request-1", { private_story: "content" });
  await store.acknowledge("request-1", "device-1");

  assert.equal((await store.getState("request-1")).status, "acknowledged");
  assert.equal(await store.getRequest("request-1"), null);
  assert.equal(await store.getResponse("request-1"), null);
}));

test("privacy cleanup removes expired prose but keeps a retryable diagnostic tombstone", async () => withTemp(async root => {
  let now = 100;
  const store = new DurableJobStore(root, () => now);
  await store.init();
  await store.createOrGet({
    ...request({ request_id: "expired-roleplay" }),
    job_type: "roleplay"
  }, "device-1", "roleplay");
  await store.markReady("expired-roleplay", { private_story: "content" });

  now += 24 * 60 * 60 * 1000 + 1;
  await store.cleanup();

  const state = await store.getState("expired-roleplay");
  assert.equal(state.status, "expired");
  assert.match(state.error, /Retry creates a new immutable job/);
  assert.equal(await store.getRequest("expired-roleplay"), null);
  assert.equal(await store.getResponse("expired-roleplay"), null);
}));
