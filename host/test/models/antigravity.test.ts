import { existsSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { AntigravityRunner } from "../../src/models/antigravity.js";
import type { ModelRequest } from "../../src/models/model-call.js";

const fake = fileURLToPath(new URL("../support/fakes/agy.mjs", import.meta.url));

const request = (prompt: string, extra: Partial<ModelRequest> = {}): ModelRequest => ({
  agent: "writer",
  model: { provider: "antigravity", model: "gemini-3.8-flash", effort: "high" },
  system: "You plan each Reply before it starts.",
  prompt,
  traceId: "trace-agy",
  storyId: null,
  ...extra
});

type Logged = { args: string[]; cwd: string; message: { event: string; message: { role: string; content: string } } };

describe("Antigravity through agy, started ahead of each call (docs/adr/0005)", () => {
  const runners: AntigravityRunner[] = [];
  const runner = () => {
    const home = mkdtempSync(join(tmpdir(), "fantasia-agy-"));
    const log = join(home, "received.jsonl");
    const made = new AntigravityRunner(home, [process.execPath, fake], { FAKE_AGY_LOG: log });
    runners.push(made);
    const received = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line) as Logged) : [];
    return { runner: made, received, home };
  };
  afterEach(() => { for (const made of runners.splice(0)) made.close(); });

  it("streams the agent's words and answers with its response, the system prompt leading the one message", async () => {
    const { runner: agy, received, home } = runner();
    const words: string[] = [];
    const answer = await agy.run(request("The Move: I sit down."), delta => words.push(delta), new AbortController().signal);
    expect(answer).toBe("She closes the book.");
    expect(words.join("").trim()).toBe(answer);
    const [call] = received();
    expect(call!.message).toEqual({ event: "user", message: { role: "user", content: "You plan each Reply before it starts.\n\nThe Move: I sit down." } });
    expect(call!.cwd).toBe(realpathSync(join(home, "agy-workdir")));
    expect(call!.args).toEqual(["--print=", "--input-format", "stream-json", "--output-format", "stream-json",
      "--model", "gemini-3.8-flash-high", "--disable-slash-commands", "--sandbox"]);
  });

  it("asks for the schema in the message, never through --json-schema, and answers with the JSON alone", async () => {
    const { runner: agy, received } = runner();
    const schema = { type: "object", required: ["note"], properties: { note: { type: "string" } } };
    expect(JSON.parse(await agy.run(request("Plan it.", { schema }), () => {}, new AbortController().signal))).toEqual({ note: "Meera looks up." });
    const [call] = received();
    expect(call!.args).not.toContain("--json-schema");
    expect(call!.message.message.content).toContain(JSON.stringify(schema));
    expect(call!.message.message.content).toMatch(/one JSON object and nothing else/);
  });

  it("takes the JSON out of a code fence", async () => {
    const { runner: agy } = runner();
    const answer = await agy.run(request("fenced", { schema: { type: "object" } }), () => {}, new AbortController().signal);
    expect(JSON.parse(answer)).toEqual({ note: "Meera looks up." });
  });

  it("asks for a model without an effort by its own id", async () => {
    const { runner: agy, received } = runner();
    await agy.run(request("Hello.", { model: { provider: "antigravity", model: "claude-sonnet-4-6" } }), () => {}, new AbortController().signal);
    expect(received()[0]!.args).toContain("claude-sonnet-4-6");
  });

  it("fails a call agy could not answer, in its own words", async () => {
    const { runner: agy } = runner();
    await expect(agy.run(request("fail"), () => {}, new AbortController().signal)).rejects.toThrow(/Antigravity.*gemini-3\.8-flash-high is overloaded/);
  });

  it("fails a call when agy ends without an answer", async () => {
    const { runner: agy } = runner();
    await expect(agy.run(request("die"), () => {}, new AbortController().signal)).rejects.toThrow(/Antigravity.*stopped without an answer/);
  });

  it("stops agy when the call is abandoned", async () => {
    const { runner: agy } = runner();
    const controller = new AbortController();
    controller.abort();
    await expect(agy.run(request("Hello."), () => {}, controller.signal)).rejects.toThrow(/stopped/);
  });

  it("has the next call's process started before it is wanted", async () => {
    const { runner: agy } = runner();
    await agy.run(request("One."), () => {}, new AbortController().signal);
    expect(agy.warmFor({ provider: "antigravity", model: "gemini-3.8-flash", effort: "high" })).toBe(true);
    expect(await agy.run(request("Two."), () => {}, new AbortController().signal)).toBe("She closes the book.");
  });
});
