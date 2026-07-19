import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeviceRegistry, DurableJobStore, requestPayloadHash } from "./host-lib.mjs";

async function withTemp(testBody) {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-host-test-"));
  try { await testBody(root); } finally { await rm(root, { recursive: true, force: true }); }
}

function request(overrides = {}) {
  return {
    protocol_version: 1,
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
