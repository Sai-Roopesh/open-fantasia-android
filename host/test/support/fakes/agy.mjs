#!/usr/bin/env node
// A stand-in for `agy --print= --input-format stream-json --output-format stream-json` as it behaved on 6 October 2026:
// an init event, then for the one user message a step_update per text delta of the agent's response, then a result.
// What the message asks for decides what it does: "fail" (a result with status ERROR), "die" (exits with no result),
// "fenced" (JSON inside a code fence), or else an answer in three parts. Its arguments and the message it read are
// written to $FAKE_AGY_LOG as one JSON line.
import { appendFileSync } from "node:fs";

const send = event => process.stdout.write(`${JSON.stringify(event)}\n`);
const model = process.argv[process.argv.indexOf("--model") + 1];
const conversation = `conversation-${process.pid}`;
send({ event: "init", conversation_id: conversation, init: { model, cwd: process.cwd(), tools: [], permission_mode: "request-review" } });

let input = "";
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  const message = JSON.parse(input.trim().split("\n")[0]);
  if (process.env.FAKE_AGY_LOG) appendFileSync(process.env.FAKE_AGY_LOG, `${JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), message })}\n`);
  const content = message.message.content;
  if (content.includes("die")) process.exit(2);
  const step = (index, state, extra) => send({ event: "step_update", step_update: { conversation_id: conversation, step_index: index, state, ...extra } });
  step(0, "DONE", { step_type: "user_input" });
  if (content.includes("fail")) {
    console.log(`error: ${model} is overloaded`);
    send({ event: "result", result: { conversation_id: conversation, status: "ERROR", response: "", error: `${model} is overloaded`, num_turns: 0 } });
    return;
  }
  const answer = content.includes("fenced") ? "```json\n{\"note\": \"Meera looks up.\"}\n```" :
    content.includes("JSON Schema") ? "{\"note\": \"Meera looks up.\"}" : "She closes the book.";
  const parts = [answer.slice(0, 4), answer.slice(4, 9), `${answer.slice(9)}\n`];
  parts.forEach((delta, index) => step(1, index === parts.length - 1 ? "DONE" : "ACTIVE", { step_type: "agent_response", text_delta: delta }));
  send({ event: "result", result: { conversation_id: conversation, status: "SUCCESS", response: `${answer}\n`, num_turns: 1 } });
});
