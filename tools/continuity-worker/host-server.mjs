#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import {
  DeviceRegistry, DurableJobStore, HOST_PROTOCOL_VERSION, MAX_REQUEST_BYTES,
  computeContractId, createContractGuard
} from "./host-lib.mjs";
import { createCodexRunner, firstWorkingExecutable } from "./codex-runner.mjs";
import {
  createAntigravityContinuityRunner,
  createAntigravityPortraitRunner,
  createAntigravityRoleplayRunner
} from "./antigravity-runner.mjs";
import { createSchemaValidator } from "./schema-validator.mjs";
import { ensureHostAuthPepper } from "./keychain.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const CODEX_CONTINUITY_ENGINE = "codex:gpt-5.6-terra:high";
export const ANTIGRAVITY_CONTINUITY_ENGINE = "antigravity:gemini-3.6-flash:high";
export const ANTIGRAVITY_ROLEPLAY_MODEL = "antigravity:gemini-3.6-flash:high";
export const ANTIGRAVITY_PORTRAIT_MODEL = "antigravity:managed-image";

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
  continuityRunners,
  runRoleplay,
  runPortrait,
  now = () => Date.now(),
  authPepper = "",
  cleanupIntervalMillis = 15 * 60 * 1000
}) {
  const store = new DurableJobStore(join(root, "spool"), now);
  const devices = new DeviceRegistry(join(root, "auth"), now, authPepper);
  await store.init();
  await devices.init();
  await store.cleanup();

  let draining = false;
  const active = new Map();
  const activeRuns = new Set();
  let continuityActive = false;
  let codexActive = false;
  let antigravityActive = false;
  let pumpPromise = null;
  let pumpRequested = false;
  let submitQueue = Promise.resolve();
  let pairingQueue = Promise.resolve();
  let cleanupTimer = null;

  const serialize = (queueName, operation) => {
    const previous = queueName === "pairing" ? pairingQueue : submitQueue;
    const current = previous.then(operation, operation);
    if (queueName === "pairing") pairingQueue = current.catch(() => {});
    else submitQueue = current.catch(() => {});
    return current;
  };

  const runners = continuityRunners ?? new Map([[CODEX_CONTINUITY_ENGINE, runContinuity]]);

  const launch = (job, request, runner, lane) => {
    const isContinuity = (job.job_type ?? "continuity") === "continuity";
    if (isContinuity) continuityActive = true;
    if (lane === "codex") codexActive = true;
    if (lane === "antigravity") antigravityActive = true;
    const controller = new AbortController();
    active.set(job.request_id, { controller, lane, isContinuity });
    const execution = (async () => {
      await store.markRunning(job.request_id);
      try {
        const result = await runner(request, {
          signal: controller.signal,
          onState: async state => {
            if (state === "validating") await store.markValidating(job.request_id);
            else if (state === "generating") await store.updateState(job.request_id, { status: "generating" });
          }
        });
        const current = await store.getState(job.request_id);
        if (current?.status !== "superseded") await store.markReady(job.request_id, result);
      } catch (error) {
        const current = await store.getState(job.request_id);
        if (current?.status !== "superseded") await store.markFailed(job.request_id, error?.message);
      } finally {
        active.delete(job.request_id);
        if (isContinuity) continuityActive = false;
        if (lane === "codex") codexActive = false;
        if (lane === "antigravity") antigravityActive = false;
      }
    })();
    activeRuns.add(execution);
    execution.finally(() => { activeRuns.delete(execution); pump(); });
  };

  const pump = () => {
    if (pumpPromise) {
      pumpRequested = true;
      return pumpPromise;
    }
    if (draining) return null;
    pumpPromise = (async () => {
      if (!continuityActive) {
        const job = await store.nextQueued(["continuity"]);
        if (job) {
          const request = await store.getRequest(job.request_id);
          if (!request) await store.markFailed(job.request_id, "Continuity request content is unavailable");
          else {
            const engineId = request.engine_id;
            const lane = engineId === CODEX_CONTINUITY_ENGINE ? "codex" : "antigravity";
            const laneAvailable = lane === "codex" ? !codexActive : !antigravityActive;
            const runner = runners.get(engineId);
            if (!runner) await store.markFailed(job.request_id, `Unsupported Continuity Engine: ${engineId || "missing"}`);
            else if (laneAvailable) launch(job, request, runner, lane);
          }
        }
      }
      if (!antigravityActive) {
        const job = await store.nextQueued(["roleplay"]);
        if (job) {
          const request = await store.getRequest(job.request_id);
          if (!request) await store.markFailed(job.request_id, "Roleplay request content is unavailable");
          else if (!runRoleplay) await store.markFailed(job.request_id, "Antigravity roleplay is unavailable");
          else launch(job, request, runRoleplay, "antigravity");
        }
      }
      if (!antigravityActive) {
        const job = await store.nextQueued(["portrait"]);
        if (job) {
          const request = await store.getRequest(job.request_id);
          if (!request) await store.markFailed(job.request_id, "Portrait request content is unavailable");
          else if (!runPortrait) await store.markFailed(job.request_id, "Antigravity portrait generation is unavailable");
          else launch(job, request, runPortrait, "antigravity");
        }
      }
    })().finally(() => {
      pumpPromise = null;
      if (pumpRequested && !draining) {
        pumpRequested = false;
        pump();
      }
    });
    return pumpPromise;
  };

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (request.method === "POST" && url.pathname === "/v2/pair") {
        const body = await readJsonBody(request);
        const result = await serialize("pairing", () => devices.redeemPairing({ code: body.code ?? "", deviceName: body.device_name }));
        return jsonResponse(response, 200, result);
      }

      const device = await devices.authenticate(bearerCredential(request));
      if (!device) return jsonResponse(response, 401, { code: "unauthorized", message: "Pairing credential is missing or invalid" });

      if (request.method === "GET" && url.pathname === "/v2/health") {
        return jsonResponse(response, 200, {
          protocol_version: HOST_PROTOCOL_VERSION,
          state: draining ? "draining" : "enabled",
          ...(await store.summary())
        });
      }

      if (request.method === "POST" && url.pathname === "/v2/checkpoints") {
        if (draining) return jsonResponse(response, 503, { code: "draining", message: "Mac Host is shutting down" });
        const body = await readJsonBody(request);
        if (![CODEX_CONTINUITY_ENGINE, ANTIGRAVITY_CONTINUITY_ENGINE].includes(body.engine_id)) throw new Error("Unsupported Continuity Engine");
        const result = await serialize("submit", () => store.createOrGet(body, device.id, "continuity"));
        pump();
        return jsonResponse(response, result.created ? 202 : 200, await store.statusForDevice(body.request_id, device.id));
      }

      if (request.method === "POST" && url.pathname === "/v2/roleplay-jobs") {
        if (draining) return jsonResponse(response, 503, { code: "draining", message: "Mac Host is shutting down" });
        const body = await readJsonBody(request);
        if (body.model_id !== ANTIGRAVITY_ROLEPLAY_MODEL) throw new Error("Unsupported Roleplay Model");
        const result = await serialize("submit", () => store.createOrGet(body, device.id, "roleplay"));
        pump();
        return jsonResponse(response, result.created ? 202 : 200, await store.statusForDevice(body.request_id, device.id));
      }

      if (request.method === "POST" && url.pathname === "/v2/portrait-jobs") {
        if (draining) return jsonResponse(response, 503, { code: "draining", message: "Mac Host is shutting down" });
        const body = await readJsonBody(request);
        if (body.model_id !== ANTIGRAVITY_PORTRAIT_MODEL) throw new Error("Unsupported Portrait Model");
        if (!["primary", "cast"].includes(body.subject_type)) throw new Error("Unsupported portrait subject");
        const result = await serialize("submit", () => store.createOrGet(body, device.id, "portrait"));
        pump();
        return jsonResponse(response, result.created ? 202 : 200, await store.statusForDevice(body.request_id, device.id));
      }

      const match = url.pathname.match(/^\/v2\/(checkpoints|roleplay-jobs|portrait-jobs)\/([^/]+)(?:\/(result|ack|supersede))?$/);
      if (match) {
        const expectedJobType = match[1] === "checkpoints" ? "continuity" :
          match[1] === "roleplay-jobs" ? "roleplay" : "portrait";
        const id = decodeURIComponent(match[2]);
        const action = match[3] ?? "status";
        const ownedState = await store.getState(id);
        if (ownedState && (ownedState.job_type ?? "continuity") !== expectedJobType) return jsonResponse(response, 404, { code: "not_found" });
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
          active.get(id)?.controller.abort();
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
    cleanupTimer = setInterval(() => {
      store.cleanup().catch(() => {});
    }, cleanupIntervalMillis);
    cleanupTimer.unref?.();
    pump();
    return server.address();
  }

  async function stop({ force = false } = {}) {
    draining = true;
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    await new Promise(resolve => server.close(resolve));
    if (force) active.forEach(item => item.controller.abort());
    if (pumpPromise) await pumpPromise;
    if (activeRuns.size) await Promise.allSettled([...activeRuns]);
  }

  return {
    start,
    stop,
    store,
    devices,
    get draining() { return draining; },
    // A contract restart waits on this: an in-flight checkpoint costs minutes and its result is
    // still valid under the contract it started with.
    get busy() { return activeRuns.size > 0; }
  };
}

async function main() {
  const config = JSON.parse(await readFile(join(here, "config.json"), "utf8"));
  const root = process.env.OPEN_FANTASIA_HOST_ROOT || join(homedir(), "Library", "Application Support", "OpenFantasia", "continuity-host", "v1");
  const codex = await firstWorkingExecutable(config.codexCandidates);
  const agy = await firstWorkingExecutable(config.antigravityCandidates);
  const prompt = await readFile(join(here, "PROMPT.md"), "utf8");
  const responseSchema = join(here, "response.schema.json");
  const validateSchema = await createSchemaValidator(responseSchema);
  const runCodexContinuity = createCodexRunner({
    codex,
    model: config.codexModel,
    reasoningEffort: config.codexReasoningEffort,
    prompt,
    responseSchema,
    validateSchema,
    timeoutMillis: config.continuityTimeoutMilliseconds,
    workspaceRoot: here
  });
  const runAntigravityContinuity = createAntigravityContinuityRunner({
    agy,
    model: config.antigravityModel,
    effort: config.antigravityEffort,
    prompt,
    validateSchema,
    timeoutMillis: config.continuityTimeoutMilliseconds,
    workspaceRoot: here
  });
  const runRoleplay = createAntigravityRoleplayRunner({
    agy,
    model: config.antigravityModel,
    effort: config.antigravityEffort,
    timeoutMillis: config.roleplayTimeoutMilliseconds,
    workspaceRoot: here
  });
  const runPortrait = createAntigravityPortraitRunner({
    agy,
    model: config.antigravityModel,
    effort: config.antigravityEffort,
    timeoutMillis: config.portraitTimeoutMilliseconds,
    workspaceRoot: here
  });
  const authPepper = await ensureHostAuthPepper();
  const host = await createContinuityHost({
    root,
    bind: config.hostBind ?? "127.0.0.1",
    port: config.hostPort ?? 47831,
    continuityRunners: new Map([
      [CODEX_CONTINUITY_ENGINE, runCodexContinuity],
      [ANTIGRAVITY_CONTINUITY_ENGINE, runAntigravityContinuity]
    ]),
    runRoleplay,
    runPortrait,
    authPepper
  });
  const address = await host.start();
  const caffeine = process.platform === "darwin"
    ? spawn("/usr/bin/caffeinate", ["-dimsu", "-w", String(process.pid)], { stdio: "ignore" })
    : null;
  caffeine?.unref();
  const contractId = await computeContractId(here);
  console.log(`Open Fantasia Mac Host ready on ${address.address}:${address.port} (contract ${contractId})`);

  let stopping = false;
  const stop = force => {
    if (stopping) return;
    stopping = true;
    host.stop({ force }).then(() => process.exit(0), () => process.exit(1));
  };

  // Exit on a contract change so the launch agent restarts on current code. Without this a host
  // keeps serving the version it booted with, and every prompt or validation fix silently does
  // nothing until someone thinks to restart it.
  createContractGuard({
    dir: here,
    contractId,
    isBusy: () => host.busy,
    onStale: () => {
      console.warn("Mac Host restarting to load the updated contract");
      stop(false);
    }
  }).start();
  process.on("SIGTERM", () => stop(false));
  process.on("SIGINT", () => stop(true));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Mac Host failed to start: ${error.message}`);
    process.exit(1);
  });
}
