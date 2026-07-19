import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { validateResponse } from "./worker-lib.mjs";
import { JOB_TIMEOUT_MILLIS } from "./host-lib.mjs";

class OutputValidationError extends Error {}

function runProcess(bin, args, { cwd, timeoutMillis, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
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
      fail(new Error("Codex run interrupted"));
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      fail(new Error("Codex run exceeded the 30-minute limit"));
    }, timeoutMillis ?? JOB_TIMEOUT_MILLIS);
    timer.unref();
    child.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-2_000); });
    child.on("error", fail);
    child.on("close", code => {
      if (code === 0) succeed();
      else fail(new Error(`Codex exited with status ${code}${stderr.includes("not found") ? ": executable unavailable" : ""}`));
    });
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function firstWorkingExecutable(candidates, args = ["--version"]) {
  for (const candidate of candidates) {
    try {
      await runProcess(candidate, args, { timeoutMillis: 10_000 });
      return candidate;
    } catch {}
  }
  throw new Error("Codex executable is unavailable");
}

export function createCodexRunner({ codex, model, reasoningEffort, prompt, responseSchema, timeoutMillis = JOB_TIMEOUT_MILLIS }) {
  return async function runContinuity(request, { signal, onState = async () => {} } = {}) {
    const work = await mkdtemp(join(tmpdir(), `open-fantasia-${request.request_id}-`));
    try {
      const requestPath = join(work, "request.json");
      const rawPath = join(work, "raw.txt");
      await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
      const task = `${prompt}\n\nThe request is available at ${requestPath}. Read it and return the response JSON.`;
      let validationError = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        await onState("generating");
        const correction = attempt === 0 ? "" : `\n\nYour previous response failed validation: ${validationError.message}. Correct it completely.`;
        await runProcess(codex, [
          "exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "workspace-write",
          "--output-schema", responseSchema, "-m", model,
          "-c", `model_reasoning_effort=\"${reasoningEffort}\"`, "-o", rawPath, task + correction
        ], { cwd: work, timeoutMillis, signal });

        await onState("validating");
        try {
          const text = (await readFile(rawPath, "utf8")).trim();
          const response = JSON.parse(text);
          validateResponse(request, response);
          return response;
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
