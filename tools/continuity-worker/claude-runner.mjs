import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PREFLIGHT_TASK, PREFLIGHT_TIMEOUT_MILLIS, runProcessCapture } from "./codex-runner.mjs";
import {
  acceptContinuityDraft,
  describeContinuityFailure,
  renderContinuityModelInput,
  renderContinuityRepairInput,
  renderDraftShapeInstruction,
  requireDirectModelInputSize,
  unfenceJson
} from "./host-lib.mjs";
import { renderRoleplayTranscript, validateRoleplayOutput, validateRoleplayRequest } from "./antigravity-runner.mjs";

const CONTINUITY_SYSTEM_PROMPT = [
  "You are Open Fantasia's stateless Continuity Engine.",
  "The user prompt contains the complete authoritative Continuity Request and the Continuity Draft schema it must be answered with.",
  "Read every exchange, then return only one Continuity Draft JSON object — no prose, no preface, no Markdown fence."
].join(" ");

/**
 * The roleplay lane has no system prompt of its own any more. It used to replace the app's with three
 * sentences announcing "Open Fantasia's stateless Roleplay Model" and a "generation contract", and
 * demote the real one into the user turn; the character was then played by something that had just
 * been told it was a contract-executing machine. Claude Code's `--system-prompt` replaces its own
 * coding-agent prompt entirely, so the app's system prompt goes there, as a system prompt, and the
 * transcript goes in the user turn as a transcript.
 */

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

/**
 * The flags every Open Fantasia Claude job runs under: safe mode, a replacement non-coding system
 * prompt, no tools, no MCP servers, no slash commands, one agent turn, and no session persistence.
 * A Continuity Update and a roleplay reply differ only in their system prompt and their task, so
 * they share the invocation rather than each carrying its own copy to drift from. See ADR-0009.
 */
function claudeArguments({ task, model, effort, systemPrompt }) {
  return [
    "--safe-mode",
    "-p", task,
    "--output-format", "json",
    "--model", model,
    "--effort", effort,
    "--system-prompt", systemPrompt,
    "--tools", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-chrome",
    "--no-session-persistence",
    "--permission-mode", "dontAsk",
    "--max-turns", "1"
  ];
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

      validateRoleplayRequest(generationRequest);
      const task = renderRoleplayTranscript(generationRequest);
      requireDirectModelInputSize(task + generationRequest.system_prompt, "Canonical roleplay context");
      let output;
      try {
        output = await runProcess(claude, claudeArguments({
          task, model, effort, systemPrompt: generationRequest.system_prompt
        }), {
          cwd: work,
          env: subscriptionOnlyEnvironment(processEnvironment),
          timeoutMillis,
          signal,
          label: "Claude Code roleplay"
        });
      } catch (error) {
        // A Claude reply hits the same expired-login wall as the preflight, and the phone should read
        // the cause rather than a transport status. An interrupt is not a Claude failure, so it passes
        // through untranslated.
        if (/run interrupted/.test(String(error?.message))) throw error;
        throw new Error(describeClaudeCliError(error));
      }
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

/**
 * Failures this adapter can name, so the phone reads a cause instead of CLI noise.
 *
 * Claude's own transport envelope reports an exhausted subscription allowance as a plain error string;
 * without translation it reaches Android as an unexplained "Update failed". A signed-out CLI fails the
 * same way. Neither is a Continuity Draft defect and neither is worth a second attempt's minutes.
 */
function describeClaudeFailure(error) {
  const message = String(error?.message ?? "");
  if (/usage limit|rate limit|allowance|quota/i.test(message)) {
    return "The Claude subscription allowance is exhausted. Continuity can run on another engine, " +
      "or on Claude again once the allowance resets.";
  }
  if (/not (?:logged|signed) in|authenticat|credential|oauth|session expired/i.test(message)) {
    return "Claude Code is not signed in to a Claude subscription on the Mac Host. " +
      "Run `fantasia-host claude-login`, then restart the host.";
  }
  return message || "Invalid Continuity Draft";
}

/**
 * The cause behind a failed Claude invocation, stated so a person can act on it.
 *
 * Claude Code reports a failure two ways. On a clean exit it returns a JSON envelope carrying its own
 * error in `result`; [parseClaudeResult] already surfaces that. On a non-zero exit — an expired login,
 * for one — it writes the same envelope to stdout and exits 1, and the thrown transport error carried
 * only "exited with status 1" until [runProcessCapture] began attaching the raw streams. This reaches
 * into those streams for the envelope's `result` so the real sentence ("Failed to authenticate: OAuth
 * session expired…") is what gets recorded, then routes it through [describeClaudeFailure] for the
 * fix. Without a parseable envelope it falls back to the error's own message.
 */
export function describeClaudeCliError(error) {
  for (const stream of [error?.stdout, error?.message]) {
    if (typeof stream !== "string") continue;
    const match = stream.match(/\{[\s\S]*\}/);
    if (!match) continue;
    try {
      const envelope = JSON.parse(match[0]);
      if (envelope?.is_error && typeof envelope.result === "string" && envelope.result.trim()) {
        return describeClaudeFailure(new Error(envelope.result));
      }
    } catch {}
  }
  return describeClaudeFailure(error);
}

/**
 * The Claude half of ADR-0012's preflight: prove this adapter's exact invocation — binary, safe mode,
 * subscription-only environment, model, effort, and JSON envelope — before the host offers the engine.
 *
 * Claude fails in ways a `--version` probe cannot see: a signed-out CLI, a subscription that cannot
 * reach Opus, and an exhausted allowance all answer `--version` happily and then lose a full
 * Continuity Update. This spends a few seconds to make those knowable before the wait, not after it.
 */
export function createClaudeProbe({
  claude,
  model,
  effort,
  timeoutMillis = PREFLIGHT_TIMEOUT_MILLIS,
  runProcess = runProcessCapture,
  processEnvironment = process.env
}) {
  return async function preflight() {
    const work = await mkdtemp(join(tmpdir(), "open-fantasia-preflight-"));
    try {
      let output;
      try {
        output = await runProcess(claude, claudeArguments({
          task: PREFLIGHT_TASK,
          model,
          effort,
          systemPrompt: CONTINUITY_SYSTEM_PROMPT
        }), {
          cwd: work,
          env: subscriptionOnlyEnvironment(processEnvironment),
          timeoutMillis,
          label: "Claude preflight"
        });
      } catch (error) {
        // The reason the host records and offers back to the phone. "Claude preflight exited with
        // status 1" told nobody that the login had expired; this makes the preflight say what a person
        // has to do about it.
        throw new Error(describeClaudeCliError(error));
      }
      const value = JSON.parse(unfenceJson(parseClaudeResult(output)));
      if (value?.ready !== true) throw new Error("preflight returned an unexpected value");
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  };
}

export function createClaudeContinuityRunner({
  claude,
  model,
  effort,
  prompt,
  draftSchemaJson = "",
  validateSchema = () => {},
  timeoutMillis,
  workspaceRoot = process.cwd(),
  runProcess = runProcessCapture,
  processEnvironment = process.env
}) {
  return async function runContinuity(request, { signal, onState = async () => {}, drafts } = {}) {
    const work = await mkdtemp(join(workspaceRoot, ".open-fantasia-claude-continuity-"));
    try {
      // Claude Code has no `--output-schema`, so the Continuity Draft shape travels in the prompt the
      // same way it does for Antigravity.
      const shape = renderDraftShapeInstruction(draftSchemaJson);
      const task = renderContinuityModelInput(prompt, request) + shape;
      requireDirectModelInputSize(task, "Canonical continuity context");
      let validationError = null;
      // Same resumable, section-scoped repair as every other adapter: the draft an earlier run
      // authored is handed back for correction instead of being regenerated from nothing.
      let priorDraft = (await drafts?.load?.())?.draft ?? null;

      for (let attempt = 0; attempt < 2; attempt++) {
        await onState("generating");
        const repair = priorDraft && renderContinuityRepairInput(
          prompt, request, priorDraft,
          validationError?.message ?? "A previous run was interrupted before its draft could be validated.",
          shape
        );
        const attemptInput = repair ?? task;
        let draft = null;
        try {
          const output = await runProcess(claude, claudeArguments({
            task: attemptInput,
            model,
            effort,
            systemPrompt: CONTINUITY_SYSTEM_PROMPT
          }), {
            cwd: work,
            env: subscriptionOnlyEnvironment(processEnvironment),
            timeoutMillis,
            signal,
            label: "Claude continuity"
          });
          await onState("validating");
          draft = JSON.parse(unfenceJson(parseClaudeResult(output)));
          validateSchema(draft);
          return acceptContinuityDraft(request, draft);
        } catch (error) {
          if (signal?.aborted) throw error;
          validationError = new Error(describeClaudeFailure({ message: describeContinuityFailure(error) }));
          if (draft) {
            priorDraft = draft;
            await drafts?.save?.(draft, error?.defects ?? []);
          }
          if (attempt === 1) throw validationError;
        }
      }
      throw validationError ?? new Error("Invalid Continuity Draft");
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  };
}
