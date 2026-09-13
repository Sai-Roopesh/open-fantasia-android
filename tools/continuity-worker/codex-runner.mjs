import { createHash } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  JOB_TIMEOUT_MILLIS,
  acceptContinuityDraft,
  describeContinuityFailure,
  renderContinuityRepairInput,
  renderContinuityModelInput,
  requireDirectModelInputSize
} from "./host-lib.mjs";
// The Roleplay Generation Contract is provider-neutral: the same task rendering and the same output
// validation every runner uses. It lives in antigravity-runner because that adapter was written
// first; claude-runner imports it the same way. That makes codex-runner and antigravity-runner a
// cyclic pair, which is safe here because both bindings are only ever used inside the runners they
// return, never while either module is still evaluating.
import { renderRoleplayTask, validateRoleplayOutput } from "./antigravity-runner.mjs";

class OutputValidationError extends Error {}

export function runProcessCapture(bin, args, { cwd, env, timeoutMillis, signal, label = "Model" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const finish = callback => value => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const fail = finish(reject);
    const succeed = finish(resolve);
    const abort = () => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      fail(new Error(`${label} run interrupted`));
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      fail(new Error(`${label} exceeded its time limit`));
    }, timeoutMillis ?? JOB_TIMEOUT_MILLIS);
    timer.unref();
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-256 * 1024); });
    child.on("error", fail);
    child.on("close", code => {
      if (code === 0 && !stderr.includes("no output produced")) succeed(stdout.trim() ? stdout : stderr);
      else fail(new Error(`${label} exited with status ${code}${stderr ? `: ${stderr.trim().slice(-500)}` : ""}`));
    });
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function firstWorkingExecutable(candidates, args = ["--version"]) {
  for (const candidate of candidates) {
    try {
      await runProcessCapture(candidate, args, { timeoutMillis: 10_000, label: "Executable probe" });
      return candidate;
    } catch {}
  }
  throw new Error("Codex executable is unavailable");
}

export const PREFLIGHT_TIMEOUT_MILLIS = 120_000;
export const PREFLIGHT_TASK =
  "Return only the JSON object {\"ready\": true}. Do not use any tool, do not read any file, do not explain.";

/**
 * Proves the exact path a Continuity Update takes before the host offers the engine.
 *
 * Installation probes only ask whether a binary answers `--version`, which is why an engine could be
 * advertised, accept a checkpoint, and fail minutes later on something knowable in seconds — a signed
 * out account, an unreachable model, or headless mode auto-denying a tool permission it cannot prompt
 * for. This runs a real schema-constrained job through the same flags, sandbox, and output path.
 *
 * It cannot promise a large job will never request a tool the sandbox denies. It does establish that
 * everything the host controls is working, which is the part that was failing silently.
 */
export function createCodexProbe({ codex, model, reasoningEffort, probeSchema, timeoutMillis = PREFLIGHT_TIMEOUT_MILLIS }) {
  return async function preflight() {
    const work = await mkdtemp(join(tmpdir(), "open-fantasia-preflight-"));
    try {
      const rawPath = join(work, "probe.json");
      await runProcessCapture(codex, [
        "exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "workspace-write",
        "--output-schema", probeSchema, "-m", model,
        "-c", `model_reasoning_effort=\"${reasoningEffort}\"`, "-o", rawPath, PREFLIGHT_TASK
      ], { cwd: work, timeoutMillis, label: "Codex preflight" });
      const value = JSON.parse((await readFile(rawPath, "utf8")).trim());
      if (value?.ready !== true) throw new Error("preflight returned an unexpected value");
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  };
}

/**
 * A Roleplay Model on the Codex CLI.
 *
 * The same request contract, sandbox, and output path the Codex Continuity Engine already proved out.
 * The one difference is the shape of the answer: a Continuity Draft is JSON constrained by
 * `--output-schema`, while a roleplay reply is prose, so this drops the schema and reads the model's
 * final message straight from `--output-last-message`. There is no corrective second attempt — a
 * roleplay reply that comes back wrong is regenerated by the player, not repaired by the host.
 */
export function createCodexRoleplayRunner({
  codex,
  model,
  reasoningEffort,
  timeoutMillis = JOB_TIMEOUT_MILLIS,
  runProcess = runProcessCapture
}) {
  return async function runRoleplay(request, { signal } = {}) {
    const work = await mkdtemp(join(tmpdir(), `open-fantasia-codex-roleplay-${request.request_id}-`));
    const startedAt = Date.now();
    try {
      const generationRequest = request.generation_request;
      const actualHash = createHash("sha256")
        .update(JSON.stringify(generationRequest))
        .digest("hex");
      if (request.request_hash !== actualHash) {
        throw new Error("Roleplay Generation Request hash mismatch");
      }

      const task = renderRoleplayTask(generationRequest);
      requireDirectModelInputSize(task, "Canonical roleplay context");
      const replyPath = join(work, "reply.txt");
      await runProcess(codex, [
        "exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "workspace-write",
        "-m", model, "-c", `model_reasoning_effort=\"${reasoningEffort}\"`, "-o", replyPath, task
      ], { cwd: work, timeoutMillis, signal, label: "Codex roleplay" });

      const replyText = validateRoleplayOutput((await readFile(replyPath, "utf8")).trim());
      return {
        protocol_version: request.protocol_version,
        job_type: "roleplay",
        request_id: request.request_id,
        thread_id: request.thread_id,
        branch_id: request.branch_id,
        turn_id: request.turn_id,
        requested_speaker_id: request.requested_speaker_id ?? null,
        speaker_mode: request.speaker_mode,
        model_id: request.model_id,
        reply_text: replyText,
        elapsed_millis: Date.now() - startedAt
      };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  };
}

export function createCodexRunner({ codex, model, reasoningEffort, prompt, draftSchema, validateSchema = () => {}, timeoutMillis = JOB_TIMEOUT_MILLIS }) {
  return async function runContinuity(request, { signal, onState = async () => {}, drafts } = {}) {
    const work = await mkdtemp(join(tmpdir(), `open-fantasia-${request.request_id}-`));
    try {
      const rawPath = join(work, "raw.txt");
      const task = renderContinuityModelInput(prompt, request);
      requireDirectModelInputSize(task, "Canonical continuity context");
      let validationError = null;
      // A draft stored by an earlier run — an interrupted host, or an attempt that failed validation —
      // is repaired rather than thrown away. Repair is section-scoped: the engine is handed what it
      // wrote and told only what to change.
      let priorDraft = (await drafts?.load?.())?.draft ?? null;

      for (let attempt = 0; attempt < 2; attempt++) {
        await onState("generating");
        const repair = priorDraft && renderContinuityRepairInput(
          prompt, request, priorDraft,
          validationError?.message ?? "A previous run was interrupted before its draft could be validated."
        );
        await runProcessCapture(codex, [
          "exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "workspace-write",
          "--output-schema", draftSchema, "-m", model,
          "-c", `model_reasoning_effort=\"${reasoningEffort}\"`, "-o", rawPath, repair ?? task
        ], { cwd: work, timeoutMillis, signal, label: "Codex continuity" });

        await onState("validating");
        let draft = null;
        try {
          draft = JSON.parse((await readFile(rawPath, "utf8")).trim());
          validateSchema(draft);
          return acceptContinuityDraft(request, draft);
        } catch (error) {
          validationError = new OutputValidationError(describeContinuityFailure(error));
          if (draft) {
            priorDraft = draft;
            await drafts?.save?.(draft, error?.defects ?? []);
          }
          if (attempt === 1) throw validationError;
        }
      }
      throw validationError ?? new OutputValidationError("Invalid Continuity Draft");
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  };
}
