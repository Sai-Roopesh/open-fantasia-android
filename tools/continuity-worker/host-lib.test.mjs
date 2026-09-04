import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeviceRegistry,
  DurableJobStore,
  MAX_DIRECT_MODEL_INPUT_BYTES,
  computeContractId,
  createContractGuard,
  renderContinuityModelInput,
  renderContinuityRepairInput,
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

// ─── Contract staleness guard ───────────────────────────────────────

test("contract id changes when a contract file changes, and ignores unrelated files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "contract-"));
  await writeFile(join(dir, "PROMPT.md"), "rule one");
  await writeFile(join(dir, "worker-lib.mjs"), "export const a = 1;");

  const files = ["PROMPT.md", "worker-lib.mjs"];
  const before = await computeContractId(dir, files);

  await writeFile(join(dir, "unrelated.md"), "notes");
  assert.equal(await computeContractId(dir, files), before, "unrelated file must not change the id");

  await writeFile(join(dir, "PROMPT.md"), "rule one, amended");
  assert.notEqual(await computeContractId(dir, files), before);
});

test("rewriting a contract file with identical bytes is not a change", async () => {
  const dir = await mkdtemp(join(tmpdir(), "contract-"));
  await writeFile(join(dir, "PROMPT.md"), "rule one");
  const files = ["PROMPT.md"];
  const before = await computeContractId(dir, files);

  await writeFile(join(dir, "PROMPT.md"), "rule one");

  assert.equal(await computeContractId(dir, files), before);
});

test("guard restarts the host once the contract changes and the host is idle", async () => {
  let current = "same";
  let restarts = 0;
  const guard = createContractGuard({
    dir: "/unused",
    contractId: "same",
    isBusy: () => false,
    onStale: async () => { restarts++; },
    setIntervalFn: () => null,
    clearIntervalFn: () => {},
    compute: async () => current
  });

  await guard.check();
  assert.equal(restarts, 0, "unchanged contract must not restart");

  current = "different";
  await guard.check();
  assert.equal(restarts, 1);
  assert.equal(guard.stale, true);
});

test("guard never interrupts an in-flight job", async () => {
  let busy = true;
  let restarts = 0;
  const guard = createContractGuard({
    dir: "/unused",
    contractId: "same",
    isBusy: () => busy,
    onStale: async () => { restarts++; },
    setIntervalFn: () => null,
    clearIntervalFn: () => {},
    compute: async () => "different"
  });

  await guard.check();
  assert.equal(restarts, 0, "must wait for the running checkpoint");
  assert.equal(guard.stale, true, "but must already know it is stale");

  busy = false;
  await guard.check();
  assert.equal(restarts, 1);
});

test("a transient read failure never takes the host down", async () => {
  let restarts = 0;
  const guard = createContractGuard({
    dir: "/unused",
    contractId: "same",
    onStale: async () => { restarts++; },
    setIntervalFn: () => null,
    clearIntervalFn: () => {},
    compute: async () => { throw new Error("EIO"); }
  });

  await guard.check();
  assert.equal(restarts, 0);
  assert.equal(guard.stale, false);
});

// A corrective run used to regenerate the whole state transition from nothing, discarding every
// correct sentence alongside the one operation that failed. The draft is durable so repair can be
// section-scoped, and so a host restarted mid-checkpoint resumes work already paid for.
test("a Continuity Draft survives to the corrective run and is deleted on acknowledgement", async () => withTemp(async root => {
  const store = new DurableJobStore(root);
  await store.init();
  await store.createOrGet(request({ request_id: "draft-job" }), "device-1");

  await store.saveDraft("draft-job", { narrative: { story_summary: "expensive prose" } }, [
    { severity: "fatal", code: "handle_exists", message: "vera already exists", operation_index: 3 }
  ]);

  const stored = await store.getDraft("draft-job");
  assert.equal(stored.draft.narrative.story_summary, "expensive prose");
  assert.equal(stored.defects[0].operation_index, 3, "the defect names the operation to repair");

  await store.markReady("draft-job", { world_state: {} });
  await store.acknowledge("draft-job", "device-1");
  assert.equal(await store.getDraft("draft-job"), null, "story prose never outlives acknowledgement");
}));

test("a draft is discarded with the request when privacy retention expires", async () => withTemp(async root => {
  let now = 1_000;
  const store = new DurableJobStore(root, () => now);
  await store.init();
  await store.createOrGet(request({ request_id: "draft-expiry" }), "device-1");
  await store.saveDraft("draft-expiry", { narrative: { story_summary: "prose" } });

  now += 31 * 24 * 60 * 60 * 1000;
  await store.cleanup();

  assert.equal((await store.getState("draft-expiry")).status, "expired");
  assert.equal(await store.getDraft("draft-expiry"), null);
}));

test("repair input carries the previous draft and refuses to exceed the delivery limit", () => {
  const evidence = request({ exchanges: [{ turn_id: "t", user: "SENTINEL", assistant: "reply" }] });
  const small = renderContinuityRepairInput("INSTRUCTIONS", evidence, { narrative: { story_summary: "PRIOR-DRAFT" } }, "fatal handle_exists in operation 3");

  assert.match(small, /PRIOR-DRAFT/);
  assert.match(small, /fatal handle_exists in operation 3/);
  assert.match(small, /<previous_continuity_draft>/);
  assert.match(small, /SENTINEL/, "the complete request is still delivered alongside the repair");

  const huge = renderContinuityRepairInput("INSTRUCTIONS", evidence, { blob: "x".repeat(MAX_DIRECT_MODEL_INPUT_BYTES) }, "too big");
  assert.equal(huge, null, "a partially delivered draft is worse than a clean regeneration");
});

// An adapter whose CLI cannot enforce the Continuity Draft schema appends the schema to whatever it
// sends. Deciding the limit on the prefix and then appending eight more kilobytes would put the
// oversized repair on the wire anyway, which is the case the limit exists to prevent.
test("an adapter's own trailer counts toward the repair delivery limit", () => {
  const evidence = request({ exchanges: [{ turn_id: "t", user: "u", assistant: "a" }] });
  const draft = { narrative: { story_summary: "PRIOR-DRAFT" } };
  const withoutSuffix = renderContinuityRepairInput("INSTRUCTIONS", evidence, draft, "defect");
  const headroom = MAX_DIRECT_MODEL_INPUT_BYTES - Buffer.byteLength(withoutSuffix, "utf8");

  const fits = renderContinuityRepairInput("INSTRUCTIONS", evidence, draft, "defect", "S".repeat(headroom));
  assert.ok(fits.endsWith("S"), "a trailer that fits is delivered with the repair");
  assert.ok(Buffer.byteLength(fits, "utf8") <= MAX_DIRECT_MODEL_INPUT_BYTES);

  const overflows = renderContinuityRepairInput("INSTRUCTIONS", evidence, draft, "defect", "S".repeat(headroom + 1));
  assert.equal(overflows, null, "a trailer that does not fit refuses the repair rather than shipping it");
});
