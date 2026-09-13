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
import { createCodexProbe, createCodexRoleplayRunner, createCodexRunner, firstWorkingExecutable } from "./codex-runner.mjs";
import {
  createAntigravityContinuityRunner,
  createAntigravityProbe,
  createAntigravityPortraitRunner,
  createAntigravityRoleplayRunner
} from "./antigravity-runner.mjs";
import {
  createClaudeContinuityRunner,
  createClaudeProbe,
  createClaudeRoleplayRunner
} from "./claude-runner.mjs";
import { createSchemaValidator } from "./schema-validator.mjs";
import { ensureHostAuthPepper } from "./keychain.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const CODEX_CONTINUITY_ENGINE = "codex:gpt-5.6-terra:high";
export const ANTIGRAVITY_CONTINUITY_ENGINE = "antigravity:gemini-3.6-flash:high";
export const CLAUDE_CONTINUITY_ENGINE = "claude-code:opus:high";
export const ANTIGRAVITY_ROLEPLAY_MODEL = "antigravity:gemini-3.6-flash:high";
export const CLAUDE_CODE_ROLEPLAY_MODEL = "claude-code:sonnet:high";
export const CLAUDE_OPUS_48_ROLEPLAY_MODEL = "claude-code:opus-4.8:high";
export const CLAUDE_OPUS_5_ROLEPLAY_MODEL = "claude-code:opus-5:high";

/**
 * Every Roleplay Model that runs on the Claude Code lane, and the CLI model name each one asks for.
 *
 * The lane is the reason this is a set rather than three constants used in three places. Claude jobs
 * contend for one signed-in account and one headless session, so a second Claude model is not a second
 * lane — it is the same lane, and anything deciding "is this job Claude's" has to answer yes for all
 * of them or a queued Opus reply will run beside a Sonnet one on a CLI that can only serve one.
 *
 * The CLI takes an alias for the latest model or a full model name. `opus` follows whatever is latest;
 * these are pinned, because the model a reply was written by is part of how that reply reads and a
 * story should not change voice because an alias moved.
 */
export const CLAUDE_ROLEPLAY_MODELS = new Map([
  [CLAUDE_CODE_ROLEPLAY_MODEL, "sonnet"],
  [CLAUDE_OPUS_48_ROLEPLAY_MODEL, "claude-opus-4-8"],
  [CLAUDE_OPUS_5_ROLEPLAY_MODEL, "claude-opus-5"]
]);

/**
 * Every Roleplay Model that runs on the Codex CLI.
 *
 * The id is the same string as the Codex Continuity Engine on purpose: it is the one Codex model,
 * doing two jobs. The lane is what makes that safe — a codex roleplay reply and a codex Continuity
 * Update both hold the codex lane, so they never run at once on the one account, exactly as the two
 * roles of Claude share the claude lane. The CLI model name is not pinned here because, unlike the
 * Claude aliases, the id already carries the exact model the host was configured with.
 */
export const CODEX_ROLEPLAY_MODEL = CODEX_CONTINUITY_ENGINE;
export const CODEX_ROLEPLAY_MODELS = new Set([CODEX_ROLEPLAY_MODEL]);
export const ANTIGRAVITY_PORTRAIT_MODEL = "antigravity:managed-image";

/**
 * Which CLI a Continuity Engine occupies. Continuity is globally serialized, but the lane still
 * decides whether a queued roleplay reply or portrait can run beside it: two jobs on one CLI would
 * contend for the same account and the same headless session.
 */
export const CONTINUITY_ENGINE_LANES = new Map([
  [CODEX_CONTINUITY_ENGINE, "codex"],
  [ANTIGRAVITY_CONTINUITY_ENGINE, "antigravity"],
  [CLAUDE_CONTINUITY_ENGINE, "claude"]
]);
export const SUPPORTED_CONTINUITY_ENGINES = [...CONTINUITY_ENGINE_LANES.keys()];

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
  roleplayRunners,
  runPortrait,
  // Why a Continuity Engine is not on offer, keyed by engine id. A checkpoint for an engine that
  // failed preflight is refused at submission with that reason instead of being queued for a run
  // nobody can complete.
  continuityEngineFailures = new Map(),
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
  let claudeActive = false;
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
  const roleplay = roleplayRunners ?? new Map(
    runRoleplay ? [[ANTIGRAVITY_ROLEPLAY_MODEL, runRoleplay]] : []
  );

  const laneForRoleplayModel = modelId =>
    CLAUDE_ROLEPLAY_MODELS.has(modelId) ? "claude"
    : CODEX_ROLEPLAY_MODELS.has(modelId) ? "codex"
    : "antigravity";
  const laneAvailable = lane =>
    lane === "claude" ? !claudeActive : lane === "codex" ? !codexActive : !antigravityActive;

  const launch = (job, request, runner, lane) => {
    const isContinuity = (job.job_type ?? "continuity") === "continuity";
    if (isContinuity) continuityActive = true;
    if (lane === "codex") codexActive = true;
    if (lane === "antigravity") antigravityActive = true;
    if (lane === "claude") claudeActive = true;
    const controller = new AbortController();
    active.set(job.request_id, { controller, lane, isContinuity });
    const execution = (async () => {
      await store.markRunning(job.request_id);
      try {
        const result = await runner(request, {
          signal: controller.signal,
          // Continuity work is the only kind expensive enough for a corrective run to be worth
          // resuming rather than restarting.
          drafts: isContinuity ? {
            load: () => store.getDraft(job.request_id),
            save: (draft, defects) => store.saveDraft(job.request_id, draft, defects)
          } : undefined,
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
        if (lane === "claude") claudeActive = false;
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
            const lane = CONTINUITY_ENGINE_LANES.get(engineId) ?? "antigravity";
            const runner = runners.get(engineId);
            if (!runner) await store.markFailed(job.request_id, `Unsupported Continuity Engine: ${engineId || "missing"}`);
            else if (laneAvailable(lane)) launch(job, request, runner, lane);
          }
        }
      }
      for (const [modelId, runner] of roleplay) {
        const lane = laneForRoleplayModel(modelId);
        if (!runner || !laneAvailable(lane)) continue;
        const job = await store.nextQueued(["roleplay"], state => state.model_id === modelId);
        if (job) {
          const request = await store.getRequest(job.request_id);
          if (!request) await store.markFailed(job.request_id, "Roleplay request content is unavailable");
          else launch(job, request, runner, lane);
        }
      }
      const unavailableRoleplay = await store.nextQueued(
        ["roleplay"],
        state => !roleplay.has(state.model_id)
      );
      if (unavailableRoleplay) {
        await store.markFailed(
          unavailableRoleplay.request_id,
          CLAUDE_ROLEPLAY_MODELS.has(unavailableRoleplay.model_id)
            ? "Claude Code is not installed or not available to the Mac Host"
            : CODEX_ROLEPLAY_MODELS.has(unavailableRoleplay.model_id)
              ? "Codex is not installed or not available to the Mac Host"
              : `Unsupported Roleplay Model: ${unavailableRoleplay.model_id || "missing"}`
        );
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
          roleplay_models: [...roleplay.keys()],
          continuity_engines: [...runners.keys()],
          continuity_engines_unavailable: Object.fromEntries(continuityEngineFailures),
          ...(await store.summary())
        });
      }

      if (request.method === "POST" && url.pathname === "/v2/checkpoints") {
        if (draining) return jsonResponse(response, 503, { code: "draining", message: "Mac Host is shutting down" });
        const body = await readJsonBody(request);
        if (!SUPPORTED_CONTINUITY_ENGINES.includes(body.engine_id)) throw new Error("Unsupported Continuity Engine");
        const engineFailure = continuityEngineFailures.get(body.engine_id);
        if (engineFailure) throw new Error(`Continuity Engine is unavailable: ${engineFailure}`);
        const result = await serialize("submit", () => store.createOrGet(body, device.id, "continuity"));
        pump();
        return jsonResponse(response, result.created ? 202 : 200, await store.statusForDevice(body.request_id, device.id));
      }

      if (request.method === "POST" && url.pathname === "/v2/roleplay-jobs") {
        if (draining) return jsonResponse(response, 503, { code: "draining", message: "Mac Host is shutting down" });
        const body = await readJsonBody(request);
        if (
          body.model_id !== ANTIGRAVITY_ROLEPLAY_MODEL &&
          !CLAUDE_ROLEPLAY_MODELS.has(body.model_id) &&
          !CODEX_ROLEPLAY_MODELS.has(body.model_id)
        ) {
          throw new Error("Unsupported Roleplay Model");
        }
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
  let claude = null;
  try {
    claude = await firstWorkingExecutable(config.claudeCandidates);
  } catch {
    console.warn("Claude Code is not installed; Claude roleplay will remain unavailable");
  }
  const prompt = await readFile(join(here, "PROMPT.md"), "utf8");
  // Engines produce a Continuity Draft; the Continuity Compiler produces the snapshot. The response
  // schema still governs what leaves the host, but no model is ever asked to satisfy it. See ADR-0010.
  const draftSchema = join(here, "draft.schema.json");
  const probeSchema = join(here, "probe.schema.json");
  const validateSchema = await createSchemaValidator(draftSchema);
  const runCodexContinuity = createCodexRunner({
    codex,
    model: config.codexModel,
    reasoningEffort: config.codexReasoningEffort,
    prompt,
    draftSchema,
    validateSchema,
    timeoutMillis: config.continuityTimeoutMilliseconds,
    workspaceRoot: here
  });
  const runAntigravityContinuity = createAntigravityContinuityRunner({
    agy,
    model: config.antigravityModel,
    effort: config.antigravityEffort,
    prompt,
    draftSchemaJson: await readFile(draftSchema, "utf8"),
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
  // Codex as a Roleplay Model, on the same CLI and lane as the Codex Continuity Engine. Codex is a
  // hard requirement for the host to start, so unlike Claude there is no absence to guard against.
  const runCodexRoleplay = createCodexRoleplayRunner({
    codex,
    model: config.codexModel,
    reasoningEffort: config.codexReasoningEffort,
    timeoutMillis: config.roleplayTimeoutMilliseconds
  });
  // One runner per Claude Roleplay Model, each pinned to its own CLI model name. They still share the
  // Claude lane, so only one of them ever runs at a time.
  const claudeRoleplayRunners = claude
    ? [...CLAUDE_ROLEPLAY_MODELS].map(([modelId, cliModel]) => [
        modelId,
        createClaudeRoleplayRunner({
          claude,
          model: cliModel,
          effort: config.claudeEffort,
          timeoutMillis: config.roleplayTimeoutMilliseconds,
          workspaceRoot: here
        })
      ])
    : [];
  const runClaudeContinuity = claude ? createClaudeContinuityRunner({
    claude,
    model: config.claudeContinuityModel,
    effort: config.claudeContinuityEffort,
    prompt,
    draftSchemaJson: await readFile(draftSchema, "utf8"),
    validateSchema,
    timeoutMillis: config.continuityTimeoutMilliseconds,
    workspaceRoot: here
  }) : null;
  const runPortrait = createAntigravityPortraitRunner({
    agy,
    model: config.antigravityModel,
    effort: config.antigravityEffort,
    timeoutMillis: config.portraitTimeoutMilliseconds,
    workspaceRoot: here
  });
  // Each Continuity Engine proves its exact execution path before it is offered. An engine that fails
  // here is refused at submission with the reason, instead of accepting a checkpoint and failing after
  // the wait — which is how a permission Antigravity could not prompt for stayed invisible.
  const continuityEngineFailures = new Map();
  const healthyContinuityRunners = new Map();
  if (!claude) {
    continuityEngineFailures.set(CLAUDE_CONTINUITY_ENGINE, "Claude Code is not installed or not available to the Mac Host");
  }
  for (const [engineId, runner, preflight] of [
    [CODEX_CONTINUITY_ENGINE, runCodexContinuity, createCodexProbe({
      codex, model: config.codexModel, reasoningEffort: config.codexReasoningEffort, probeSchema
    })],
    [ANTIGRAVITY_CONTINUITY_ENGINE, runAntigravityContinuity, createAntigravityProbe({
      agy, model: config.antigravityModel, effort: config.antigravityEffort
    })],
    ...(claude ? [[CLAUDE_CONTINUITY_ENGINE, runClaudeContinuity, createClaudeProbe({
      claude, model: config.claudeContinuityModel, effort: config.claudeContinuityEffort
    })]] : [])
  ]) {
    try {
      await preflight();
      healthyContinuityRunners.set(engineId, runner);
      console.log(`Continuity Engine ready: ${engineId}`);
    } catch (error) {
      const reason = String(error?.message || "preflight failed").slice(0, 300);
      continuityEngineFailures.set(engineId, reason);
      console.warn(`Continuity Engine unavailable: ${engineId} — ${reason}`);
    }
  }

  const authPepper = await ensureHostAuthPepper();
  const host = await createContinuityHost({
    root,
    bind: config.hostBind ?? "127.0.0.1",
    port: config.hostPort ?? 47831,
    continuityRunners: healthyContinuityRunners,
    continuityEngineFailures,
    roleplayRunners: new Map([
      [ANTIGRAVITY_ROLEPLAY_MODEL, runRoleplay],
      [CODEX_ROLEPLAY_MODEL, runCodexRoleplay],
      ...claudeRoleplayRunners
    ]),
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
