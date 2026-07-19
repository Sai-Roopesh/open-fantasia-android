import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContinuityHost } from "./host-server.mjs";

async function waitForReady(base, credential, id) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await fetch(`${base}/v1/checkpoints/${id}`, { headers: { authorization: `Bearer ${credential}` } });
    const status = await response.json();
    if (status.status === "ready") return status;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Checkpoint did not become ready");
}

function request(id, hash = "baseline") {
  return {
    protocol_version: 1,
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

async function withHost(runContinuity, body) {
  const root = await mkdtemp(join(tmpdir(), "open-fantasia-server-test-"));
  const host = await createContinuityHost({ root, port: 0, runContinuity });
  const address = await host.start();
  const base = `http://127.0.0.1:${address.port}`;
  try { await body({ host, base }); } finally { await host.stop({ force: true }); await rm(root, { recursive: true, force: true }); }
}

async function pair(host, base) {
  const pairing = await host.devices.createPairing({ endpoint: base });
  const response = await fetch(`${base}/v1/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: pairing.code, device_name: "Test phone" })
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("private API pairs, runs one idempotent job, returns and acknowledges result", async () => {
  await withHost(async input => ({ request_id: input.request_id, answer: "complete" }), async ({ host, base }) => {
    assert.equal((await fetch(`${base}/v1/health`)).status, 401);
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };

    const submitted = await fetch(`${base}/v1/checkpoints`, { method: "POST", headers, body: JSON.stringify(request("one")) });
    assert.equal(submitted.status, 202);
    await waitForReady(base, paired.credential, "one");

    const duplicate = await fetch(`${base}/v1/checkpoints`, { method: "POST", headers, body: JSON.stringify(request("one")) });
    assert.equal(duplicate.status, 200);
    const result = await (await fetch(`${base}/v1/checkpoints/one/result`, { headers })).json();
    assert.equal(result.answer, "complete");

    const ack = await fetch(`${base}/v1/checkpoints/one/ack`, { method: "POST", headers });
    assert.equal(ack.status, 200);
    assert.equal((await host.store.getState("one")).status, "acknowledged");
    assert.equal(await host.store.getRequest("one"), null);
  });
});

test("same request identity with changed evidence returns conflict", async () => {
  await withHost(async input => input, async ({ host, base }) => {
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
    await fetch(`${base}/v1/checkpoints`, { method: "POST", headers, body: JSON.stringify(request("same")) });
    const conflict = await fetch(`${base}/v1/checkpoints`, { method: "POST", headers, body: JSON.stringify(request("same", "changed")) });
    assert.equal(conflict.status, 409);
  });
});

test("concurrent duplicate submissions create one durable job", async () => {
  await withHost(async input => ({ request_id: input.request_id }), async ({ host, base }) => {
    const paired = await pair(host, base);
    const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
    const responses = await Promise.all(Array.from({ length: 8 }, () => fetch(`${base}/v1/checkpoints`, {
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
    await Promise.all(["first", "second"].map(id => fetch(`${base}/v1/checkpoints`, {
      method: "POST", headers, body: JSON.stringify(request(id))
    })));
    await Promise.all(["first", "second"].map(id => waitForReady(base, paired.credential, id)));
    assert.equal(maximum, 1);
  });
});
