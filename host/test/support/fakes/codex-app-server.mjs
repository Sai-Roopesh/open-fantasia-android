#!/usr/bin/env node
// A stand-in for `codex app-server` (codex-cli 0.160.0): the same JSON-RPC over stdio, enough of it for the runner.
// What the prompt asks for decides what it does: "fail", "die", "approval", "slow", or else an answer in three parts.
// Every message it receives is appended to $FAKE_CODEX_LOG, one JSON per line, for the test to read.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const log = process.env.FAKE_CODEX_LOG;
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
let threads = 0;
const waiting = new Map(); // threadId -> turnId, for a slow turn that waits to be interrupted

createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line);
  if (log) appendFileSync(log, `${line}\n`);
  const { id, method, params } = message;
  if (method === "initialize") return send({ id, result: { userAgent: "codex_cli_rs/0.160.0" } });
  if (method === "thread/start") return send({ id, result: { thread: { id: `thread-${++threads}` }, model: params.model } });
  if (method === "turn/interrupt") {
    send({ id, result: {} });
    if (waiting.has(params.threadId)) send({ method: "turn/completed", params: { threadId: params.threadId, turn: { id: waiting.get(params.threadId), items: [], status: "interrupted", error: null } } });
    return;
  }
  if (method === "turn/start") {
    const threadId = params.threadId;
    const turnId = `turn-${threadId}`;
    const prompt = params.input[0].text;
    send({ id, result: { turn: { id: turnId, items: [], status: "inProgress" } } });
    send({ method: "turn/started", params: { threadId, turn: { id: turnId, items: [], status: "inProgress" } } });
    const done = (status, error = null) => send({ method: "turn/completed", params: { threadId, turn: { id: turnId, items: [], status, error } } });
    if (prompt.includes("die")) return process.exit(3);
    // As the API does (6 October 2026): every object in an output schema must list every key it has as required.
    const loose = params.outputSchema && unrequired(params.outputSchema, "schema");
    if (loose) {
      const message = JSON.stringify({ type: "error", error: { message: `Invalid schema for response_format 'codex_output_schema': '${loose.at}.required' is required to include every key in properties. Missing '${loose.key}'.`, code: "invalid_json_schema" }, status: 400 });
      return done("failed", { message });
    }
    if (prompt.includes("fail")) {
      send({ method: "error", params: { threadId, turnId, willRetry: false, error: { message: "gpt-6.1-sol is at capacity" } } });
      return done("failed", { message: "gpt-6.1-sol is at capacity" });
    }
    if (prompt.includes("slow")) return void waiting.set(threadId, turnId);
    if (prompt.includes("approval")) send({ id: 900, method: "item/commandExecution/requestApproval", params: { threadId, turnId, itemId: "cmd", command: "ls" } });
    // A strict schema's optional keys come back as null, as the real model answers them.
    const answer = params.outputSchema ? JSON.stringify({ note: "Meera looks up.", thread: threadId, ...(params.outputSchema.properties?.mood ? { mood: null } : {}) }) : `She closes the book. (${threadId})`;
    const parts = [answer.slice(0, 5), answer.slice(5, 12), answer.slice(12)];
    // Two calls side by side interleave their deltas, as the real server does.
    parts.forEach((delta, index) => setTimeout(() => send({ method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "msg", delta } }), 5 * index));
    setTimeout(() => {
      send({ method: "item/completed", params: { threadId, turnId, completedAtMs: 0, item: { type: "agentMessage", id: "msg", text: answer } } });
      done("completed");
    }, 30);
    return;
  }
  if (id !== undefined && method) send({ id, error: { code: -32601, message: `fake has no ${method}` } });
});

function unrequired(schema, at) {
  if (!schema || typeof schema !== "object") return null;
  if (schema.type === "object" || schema.properties) {
    const missing = Object.keys(schema.properties ?? {}).find(key => !(schema.required ?? []).includes(key));
    if (missing) return { at, key: missing };
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      const found = unrequired(value, `${at}.properties.${key}`);
      if (found) return found;
    }
  }
  if (schema.items) return unrequired(schema.items, `${at}.items`);
  for (const option of schema.anyOf ?? []) {
    const found = unrequired(option, at);
    if (found) return found;
  }
  return null;
}
