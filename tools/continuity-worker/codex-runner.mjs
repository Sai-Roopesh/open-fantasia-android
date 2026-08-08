import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { canonicalizeResponse, validateResponse } from "./worker-lib.mjs";
import {
  JOB_TIMEOUT_MILLIS,
  renderContinuityModelInput,
  requireDirectModelInputSize
} from "./host-lib.mjs";

class OutputValidationError extends Error {}

export function runProcessCapture(bin, args, { cwd, timeoutMillis, signal, label = "Model" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
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

export function createCodexRunner({ codex, model, reasoningEffort, prompt, responseSchema, validateSchema = () => {}, timeoutMillis = JOB_TIMEOUT_MILLIS }) {
  return async function runContinuity(request, { signal, onState = async () => {} } = {}) {
    const work = await mkdtemp(join(tmpdir(), `open-fantasia-${request.request_id}-`));
    try {
      const rawPath = join(work, "raw.txt");
      const task = renderContinuityModelInput(prompt, request);
      requireDirectModelInputSize(task, "Canonical continuity context");
      let validationError = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        await onState("generating");
        const correction = attempt === 0 ? "" : `\n\nYour previous response failed validation: ${validationError.message}. Correct it completely.`;
        await runProcessCapture(codex, [
          "exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "workspace-write",
          "--output-schema", responseSchema, "-m", model,
          "-c", `model_reasoning_effort=\"${reasoningEffort}\"`, "-o", rawPath, task + correction
        ], { cwd: work, timeoutMillis, signal, label: "Codex continuity" });

        await onState("validating");
        try {
          const text = (await readFile(rawPath, "utf8")).trim();
          const response = JSON.parse(text);
          validateSchema(response);
          const canonical = canonicalizeResponse(request, response);
          validateResponse(request, canonical);
          return canonical;
        } catch (error) {
          validationError = new OutputValidationError(error?.message || "Invalid Continuity response");
          if (attempt === 1) throw validationError;
        }
      }
      throw validationError ?? new OutputValidationError("Invalid Continuity response");
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  };
}
