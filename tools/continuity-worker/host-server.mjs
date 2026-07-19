#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import {
  DeviceRegistry, DurableJobStore, HOST_PROTOCOL_VERSION, MAX_REQUEST_BYTES
} from "./host-lib.mjs";
import { createCodexRunner, firstWorkingExecutable } from "./codex-runner.mjs";
import { ensureHostAuthPepper } from "./keychain.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function jsonResponse(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      const error = new Error("Request body is too large");
      error.code = "TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function bearerCredential(request) {
  const value = request.headers.authorization ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function publicError(error) {
  if (error?.code === "INCOMPATIBLE") return { status: 426, code: "incompatible", message: error.message };
  if (error?.code === "CONFLICT") return { status: 409, code: "conflict", message: error.message };
  if (error?.code === "TOO_LARGE") return { status: 413, code: "too_large", message: error.message };
  if (error instanceof SyntaxError) return { status: 400, code: "invalid_json", message: "Request body is not valid JSON" };
  return { status: 400, code: "invalid_request", message: String(error?.message || "Invalid request").slice(0, 500) };
}

export async function createContinuityHost({
  root,
  bind = "127.0.0.1",
  port = 47831,
  runContinuity,
  now = () => Date.now(),
  authPepper = ""
}) {
  const store = new DurableJobStore(join(root, "spool"), now);
  const devices = new DeviceRegistry(join(root, "auth"), now, authPepper);
  await store.init();
  await devices.init();
  await store.cleanup();

  let draining = false;
  let active = null;
  let pumpPromise = null;
  let submitQueue = Promise.resolve();
  let pairingQueue = Promise.resolve();

  const serialize = (queueName, operation) => {
    const previous = queueName === "pairing" ? pairingQueue : submitQueue;
    const current = previous.then(operation, operation);
    if (queueName === "pairing") pairingQueue = current.catch(() => {});
    else submitQueue = current.catch(() => {});
    return current;
  };

  const pump = () => {
    if (pumpPromise || draining) return pumpPromise;
    pumpPromise = (async () => {
      while (!draining) {
        const job = await store.nextQueued();
        if (!job) break;
        const request = await store.getRequest(job.request_id);
        if (!request) {
          await store.markFailed(job.request_id, "Checkpoint request content is unavailable");
          continue;
        }
        const controller = new AbortController();
        active = { requestId: job.request_id, controller };
        await store.markRunning(job.request_id);
        try {
          const response = await runContinuity(request, {
            signal: controller.signal,
            onState: async state => {
              if (state === "validating") await store.markValidating(job.request_id);
              else if (state === "generating") await store.updateState(job.request_id, { status: "generating" });
            }
          });
          const current = await store.getState(job.request_id);
          if (current?.status !== "superseded") await store.markReady(job.request_id, response);
        } catch (error) {
          const current = await store.getState(job.request_id);
          if (current?.status !== "superseded") await store.markFailed(job.request_id, error?.message);
        } finally {
          active = null;
        }
      }
    })().finally(() => { pumpPromise = null; });
    return pumpPromise;
  };

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (request.method === "POST" && url.pathname === "/v1/pair") {
        const body = await readJsonBody(request);
        const result = await serialize("pairing", () => devices.redeemPairing({ code: body.code ?? "", deviceName: body.device_name }));
        return jsonResponse(response, 200, result);
      }

      const device = await devices.authenticate(bearerCredential(request));
      if (!device) return jsonResponse(response, 401, { code: "unauthorized", message: "Pairing credential is missing or invalid" });

      if (request.method === "GET" && url.pathname === "/v1/health") {
        return jsonResponse(response, 200, {
          protocol_version: HOST_PROTOCOL_VERSION,
          state: draining ? "draining" : "enabled",
          ...(await store.summary())
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/checkpoints") {
        if (draining) return jsonResponse(response, 503, { code: "draining", message: "Continuity Host is shutting down" });
        const body = await readJsonBody(request);
        const result = await serialize("submit", () => store.createOrGet(body, device.id));
        pump();
        return jsonResponse(response, result.created ? 202 : 200, await store.statusForDevice(body.request_id, device.id));
      }

      const match = url.pathname.match(/^\/v1\/checkpoints\/([^/]+)(?:\/(result|ack|supersede))?$/);
      if (match) {
        const id = decodeURIComponent(match[1]);
        const action = match[2] ?? "status";
        if (request.method === "GET" && action === "status") {
          const status = await store.statusForDevice(id, device.id);
          return status ? jsonResponse(response, 200, status) : jsonResponse(response, 404, { code: "not_found" });
        }
        if (request.method === "GET" && action === "result") {
          const status = await store.statusForDevice(id, device.id);
          if (!status) return jsonResponse(response, 404, { code: "not_found" });
          if (status.status !== "ready") return jsonResponse(response, 409, { code: "not_ready", status: status.status });
          return jsonResponse(response, 200, await store.getResponse(id));
        }
        if (request.method === "POST" && action === "ack") {
          await store.acknowledge(id, device.id);
          return jsonResponse(response, 200, { request_id: id, status: "acknowledged" });
        }
        if (request.method === "POST" && action === "supersede") {
          const body = await readJsonBody(request);
          await store.supersede(id, body.replacement_request_id, device.id);
          if (active?.requestId === id) active.controller.abort();
          return jsonResponse(response, 200, { request_id: id, status: "superseded", superseded_by: body.replacement_request_id });
        }
      }

      return jsonResponse(response, 404, { code: "not_found" });
    } catch (error) {
      const publicFailure = publicError(error);
      return jsonResponse(response, publicFailure.status, { code: publicFailure.code, message: publicFailure.message });
    }
  });

  async function start() {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, bind, resolve);
    });
    pump();
    return server.address();
  }

  async function stop({ force = false } = {}) {
    draining = true;
    await new Promise(resolve => server.close(resolve));
    if (force && active) active.controller.abort();
    if (pumpPromise) await pumpPromise;
  }

  return { start, stop, store, devices, get draining() { return draining; } };
}

async function main() {
  const config = JSON.parse(await readFile(join(here, "config.json"), "utf8"));
  const root = process.env.OPEN_FANTASIA_HOST_ROOT || join(homedir(), "Library", "Application Support", "OpenFantasia", "continuity-host", "v1");
  const codex = await firstWorkingExecutable(config.codexCandidates);
  const prompt = await readFile(join(here, "PROMPT.md"), "utf8");
  const runContinuity = createCodexRunner({
    codex,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    prompt,
    responseSchema: join(here, "response.schema.json"),
    timeoutMillis: config.jobTimeoutMilliseconds
  });
  const authPepper = await ensureHostAuthPepper();
  const host = await createContinuityHost({
    root,
    bind: config.hostBind ?? "127.0.0.1",
    port: config.hostPort ?? 47831,
    runContinuity,
    authPepper
  });
  const address = await host.start();
  const caffeine = process.platform === "darwin"
    ? spawn("/usr/bin/caffeinate", ["-dimsu", "-w", String(process.pid)], { stdio: "ignore" })
    : null;
  caffeine?.unref();
  console.log(`Continuity Host ready on ${address.address}:${address.port}`);

  let stopping = false;
  const stop = force => {
    if (stopping) return;
    stopping = true;
    host.stop({ force }).then(() => process.exit(0), () => process.exit(1));
  };
  process.on("SIGTERM", () => stop(false));
  process.on("SIGINT", () => stop(true));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Continuity Host failed to start: ${error.message}`);
    process.exit(1);
  });
}
