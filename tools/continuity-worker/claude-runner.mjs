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
import { renderRoleplayTask, validateRoleplayOutput } from "./antigravity-runner.mjs";

const CONTINUITY_SYSTEM_PROMPT = [
  "You are Open Fantasia's stateless Continuity Engine.",
  "The user prompt contains the complete authoritative Continuity Request and the Continuity Draft schema it must be answered with.",
  "Read every exchange, then return only one Continuity Draft JSON object — no prose, no preface, no Markdown fence."
].join(" ");

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

      const task = renderRoleplayTask(generationRequest);
      requireDirectModelInputSize(task, "Canonical roleplay context");
      const output = await runProcess(claude, claudeArguments({
        task, model, effort, systemPrompt: ROLEPLAY_SYSTEM_PROMPT
      }), {
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
  if (/not (?:logged|signed) in|authenticat|credential/i.test(message)) {
    return "Claude Code is not signed in to a Claude subscription on the Mac Host. " +
      "Run `fantasia-host claude-login`, then restart the host.";
  }
  return message || "Invalid Continuity Draft";
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
      const output = await runProcess(claude, claudeArguments({
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
