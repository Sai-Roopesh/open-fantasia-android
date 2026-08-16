import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { runProcessCapture } from "./codex-runner.mjs";
import { requireDirectModelInputSize } from "./host-lib.mjs";
import { renderRoleplayTask, validateRoleplayOutput } from "./antigravity-runner.mjs";

const ROLEPLAY_SYSTEM_PROMPT = [
  "You are Open Fantasia's stateless Roleplay Model.",
  "The user prompt contains the complete authoritative generation contract, character instructions, Continuity Snapshot, chronological transcript, and reply control.",
  "Obey that contract exactly and return only the next in-character prose reply."
].join(" ");

/**
 * Claude Code gives API keys and cloud-provider credentials precedence over a signed-in
 * Claude subscription. Remove every non-subscription route from the worker process so a
 * background job cannot accidentally incur API or gateway charges.
 */
export function subscriptionOnlyEnvironment(source = process.env) {
  const env = { ...source };
  [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_CUSTOM_HEADERS",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
    "ANTHROPIC_MODEL",
    "CLAUDE_CODE_EFFORT_LEVEL"
  ].forEach(key => delete env[key]);
  return env;
}

function parseClaudeResult(output) {
  let envelope;
  try {
    envelope = JSON.parse(String(output ?? ""));
  } catch {
    throw new Error("Claude Code returned an invalid JSON transport envelope");
  }
  if (envelope?.is_error) {
    throw new Error(`Claude Code failed: ${String(envelope.result || "unknown error").slice(0, 400)}`);
  }
  if (typeof envelope?.result !== "string") {
    throw new Error("Claude Code returned no roleplay result");
  }
  return envelope.result;
}

export function createClaudeRoleplayRunner({
  claude,
  model,
  effort,
  timeoutMillis,
  workspaceRoot = process.cwd(),
  runProcess = runProcessCapture,
  processEnvironment = process.env
}) {
  return async function runRoleplay(request, { signal } = {}) {
    const work = await mkdtemp(join(workspaceRoot, ".open-fantasia-claude-roleplay-"));
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
      const output = await runProcess(claude, [
        "--safe-mode",
        "-p", task,
        "--output-format", "json",
        "--model", model,
        "--effort", effort,
        "--system-prompt", ROLEPLAY_SYSTEM_PROMPT,
        "--tools", "",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--no-chrome",
        "--no-session-persistence",
        "--permission-mode", "dontAsk",
        "--max-turns", "1"
      ], {
        cwd: work,
        env: subscriptionOnlyEnvironment(processEnvironment),
        timeoutMillis,
        signal,
        label: "Claude Code roleplay"
      });
      const replyText = validateRoleplayOutput(parseClaudeResult(output));
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
