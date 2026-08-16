import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { createClaudeRoleplayRunner, subscriptionOnlyEnvironment } from "./claude-runner.mjs";

function generationRequest() {
  return {
    contract_version: 1,
    system_prompt: "SYSTEM-SENTINEL\n<durable_state>\n{\"story\":\"continuity\"}\n</durable_state>",
    messages: [
      { role: "user", content: "Earlier user beat." },
      { role: "assistant", content: "Earlier assistant beat." },
      { role: "user", content: "<reply_control>Jean Grey</reply_control>\nLatest user beat." }
    ],
    requested_speaker_id: "cast-jean",
    speaker_mode: "single",
    settings: { temperature: 0.9, top_p: 0.95, max_tokens: 4096 }
  };
}

test("Claude roleplay receives the same complete canonical request with no tools", async () => {
  const root = await mkdtemp(`${tmpdir()}/open-fantasia-claude-runner-test-`);
  const generation = generationRequest();
  const requestHash = createHash("sha256").update(JSON.stringify(generation)).digest("hex");
  let invocation;
  const runner = createClaudeRoleplayRunner({
    claude: "claude",
    model: "sonnet",
    effort: "high",
    timeoutMillis: 1000,
    workspaceRoot: root,
    processEnvironment: {
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "must-not-leak",
      ANTHROPIC_AUTH_TOKEN: "must-not-leak",
      CLAUDE_CODE_USE_VERTEX: "1",
      CLAUDE_CODE_OAUTH_TOKEN: "subscription-token"
    },
    runProcess: async (binary, args, options) => {
      invocation = { binary, args, options };
      return JSON.stringify({ result: "Jean answers in character.", is_error: false });
    }
  });
  try {
    const result = await runner({
      protocol_version: 2,
      request_id: "claude-roleplay-1",
      thread_id: "thread-1",
      branch_id: "branch-1",
      turn_id: "turn-1",
      requested_speaker_id: "cast-jean",
      speaker_mode: "single",
      model_id: "claude-code:sonnet:high",
      request_hash: requestHash,
      generation_request: generation
    });

    assert.equal(result.reply_text, "Jean answers in character.");
    assert.equal(invocation.binary, "claude");
    assert.equal(invocation.args[0], "--safe-mode");
    const task = invocation.args[invocation.args.indexOf("-p") + 1];
    assert.match(task, /SYSTEM-SENTINEL/);
    assert.match(task, /Earlier user beat/);
    assert.match(task, /Earlier assistant beat/);
    assert.match(task, /Latest user beat/);
    assert.equal(invocation.args[invocation.args.indexOf("--tools") + 1], "");
    assert.equal(invocation.args[invocation.args.indexOf("--max-turns") + 1], "1");
    assert.equal(invocation.options.env.ANTHROPIC_API_KEY, undefined);
    assert.equal(invocation.options.env.ANTHROPIC_AUTH_TOKEN, undefined);
    assert.equal(invocation.options.env.CLAUDE_CODE_USE_VERTEX, undefined);
    assert.equal(invocation.options.env.CLAUDE_CODE_OAUTH_TOKEN, "subscription-token");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("subscription environment removes every API and cloud-provider route", () => {
  const env = subscriptionOnlyEnvironment({
    KEEP: "yes",
    ANTHROPIC_API_KEY: "api",
    ANTHROPIC_AUTH_TOKEN: "gateway",
    ANTHROPIC_BASE_URL: "https://gateway.example",
    CLAUDE_CODE_USE_BEDROCK: "1",
    CLAUDE_CODE_USE_VERTEX: "1",
    CLAUDE_CODE_USE_FOUNDRY: "1"
  });
  assert.deepEqual(env, { KEEP: "yes" });
});

test("Claude transport errors never become visible roleplay prose", async () => {
  const root = await mkdtemp(`${tmpdir()}/open-fantasia-claude-error-test-`);
  const generation = generationRequest();
  const requestHash = createHash("sha256").update(JSON.stringify(generation)).digest("hex");
  const runner = createClaudeRoleplayRunner({
    claude: "claude",
    model: "sonnet",
    effort: "high",
    timeoutMillis: 1000,
    workspaceRoot: root,
    runProcess: async () => JSON.stringify({ result: "subscription limit reached", is_error: true })
  });
  try {
    await assert.rejects(runner({
      protocol_version: 2,
      request_id: "claude-error-1",
      thread_id: "thread-1",
      branch_id: "branch-1",
      turn_id: "turn-1",
      requested_speaker_id: null,
      speaker_mode: "single",
      model_id: "claude-code:sonnet:high",
      request_hash: requestHash,
      generation_request: generation
    }), /subscription limit reached/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
