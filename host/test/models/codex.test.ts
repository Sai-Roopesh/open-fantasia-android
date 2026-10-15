import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CodexRunner, webSearchLine } from "../../src/models/codex.js";
import { NO_TOOLS, type ModelRequest } from "../../src/models/model-call.js";

const fake = fileURLToPath(new URL("../support/fakes/codex-app-server.mjs", import.meta.url));

const request = (prompt: string, extra: Partial<ModelRequest> = {}): ModelRequest => ({
  agent: "weaver",
  model: { provider: "codex", model: "gpt-6.1-sol", effort: "high" },
  system: "You move the World on between Scenes.",
  prompt,
  traceId: "trace-codex",
  storyId: null,
  ...extra
});

describe("Codex through one warm app server (docs/adr/0005)", () => {
  const runners: CodexRunner[] = [];
  const runner = () => {
    const home = mkdtempSync(join(tmpdir(), "fantasia-codex-"));
    const log = join(home, "received.jsonl");
    const made = new CodexRunner(home, [process.execPath, fake], { FAKE_CODEX_LOG: log });
    runners.push(made);
    const received = () => !existsSync(log) ? [] : readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line) as { method?: string; params?: Record<string, unknown> });
    return { runner: made, received, home };
  };
  afterEach(() => { for (const made of runners.splice(0)) made.close(); });

  it("streams the agent's words and answers with its message, on a fresh thread with the system prompt as its only instructions", async () => {
    const { runner: codex, received, home } = runner();
    const words: string[] = [];
    const answer = await codex.run(request("The Scene ended at 11:05 pm."), delta => words.push(delta), new AbortController().signal);
    expect(answer).toBe("She closes the book. (thread-1)");
    expect(words.join("")).toBe(answer);
    expect(words.length).toBe(3);
    const thread = received().find(message => message.method === "thread/start")!.params!;
    expect(thread).toMatchObject({
      model: "gpt-6.1-sol", baseInstructions: "You move the World on between Scenes.",
      ephemeral: true, sandbox: "read-only", approvalPolicy: "never", cwd: join(home, "codex-workdir")
    });
    const turn = received().find(message => message.method === "turn/start")!.params!;
    expect(turn).toMatchObject({ threadId: "thread-1", model: "gpt-6.1-sol", effort: "high", input: [{ type: "text", text: "The Scene ended at 11:05 pm." }] });
    expect(turn.outputSchema).toBeUndefined();
  });

  it("keeps Codex off the web unless the call may use it, and then gives it live search (docs/adr/0018)", async () => {
    const { runner: codex, received } = runner();
    await codex.run(request("The Scene ended at 11:05 pm."), () => {}, new AbortController().signal);
    await codex.run(request("Plan Year Two.", { tools: { story: null, web: true } }), () => {}, new AbortController().signal, { ...NO_TOOLS, web: true });
    const threads = received().filter(message => message.method === "thread/start").map(message => message.params!.config);
    expect(threads).toEqual([{ web_search: "disabled" }, { web_search: "live" }]);
  });

  it("says each web search and page Codex opened in a line, as every provider's lookups are", () => {
    expect(webSearchLine({ type: "webSearch", query: "", action: { type: "search", query: "Chamber of Secrets plot" } })).toBe("searched the web for “Chamber of Secrets plot”");
    expect(webSearchLine({ type: "webSearch", query: "", action: { type: "search", query: null, queries: ["Gilderoy Lockhart", "Dobby"] } })).toBe("searched the web for “Gilderoy Lockhart; Dobby”");
    expect(webSearchLine({ type: "webSearch", query: "", action: { type: "openPage", url: "https://harrypotter.fandom.com/wiki/Dobby" } })).toBe("read https://harrypotter.fandom.com/wiki/Dobby");
    expect(webSearchLine({ type: "webSearch", query: "Polyjuice Potion", action: null })).toBe("searched the web for “Polyjuice Potion”");
    expect(webSearchLine({ type: "webSearch", query: "", action: { type: "other" } })).toBeNull();
  });

  it("asks for the schema when the call has one, and answers with the JSON", async () => {
    const { runner: codex, received } = runner();
    const schema = { type: "object", additionalProperties: false, required: ["note"], properties: { note: { type: "string" } } };
    const answer = await codex.run(request("Plan the night.", { schema }), () => {}, new AbortController().signal);
    expect(JSON.parse(answer)).toMatchObject({ note: "Meera looks up." });
    expect(received().find(message => message.method === "turn/start")!.params!.outputSchema).toEqual(schema);
  });

  it("sends Codex a schema with every key required, an optional one able to be null, and answers without those nulls", async () => {
    const { runner: codex, received } = runner();
    const schema = {
      type: "object", additionalProperties: false, required: ["note"],
      properties: {
        note: { type: "string", minLength: 1 },
        mood: { type: "string" },
        lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["who"], properties: { who: { type: "string" }, missed: { type: ["string", "null"] } } } }
      }
    };
    const answer = JSON.parse(await codex.run(request("Plan it.", { schema }), () => {}, new AbortController().signal)) as Record<string, unknown>;
    expect(answer).toEqual({ note: "Meera looks up.", thread: "thread-1" });
    const sent = received().find(message => message.method === "turn/start")!.params!.outputSchema as typeof schema;
    expect(sent.required).toEqual(["note", "mood", "lines"]);
    expect(sent.properties.mood).toEqual({ type: ["string", "null"] });
    expect(sent.properties.note).toEqual({ type: "string", minLength: 1 });
    expect(sent.properties.lines.items.required).toEqual(["who", "missed"]);
    expect(sent.properties.lines.items.properties.missed).toEqual({ type: ["string", "null"] });
    // The engine's own schema is untouched.
    expect(schema.required).toEqual(["note"]);
  });

  it("starts one app server and keeps it for every call, two at once on their own threads", async () => {
    const { runner: codex, received } = runner();
    const first: string[] = [];
    const second: string[] = [];
    const [a, b] = await Promise.all([
      codex.run(request("One."), delta => first.push(delta), new AbortController().signal),
      codex.run(request("Two."), delta => second.push(delta), new AbortController().signal)
    ]);
    expect(new Set([a, b])).toEqual(new Set(["She closes the book. (thread-1)", "She closes the book. (thread-2)"]));
    expect(first.join("")).toBe(a);
    expect(second.join("")).toBe(b);
    expect(received().filter(message => message.method === "initialize")).toHaveLength(1);
  });

  it("fails a turn the model could not finish, in Codex's own words", async () => {
    const { runner: codex } = runner();
    await expect(codex.run(request("fail, please"), () => {}, new AbortController().signal)).rejects.toThrow(/Codex.*gpt-6\.1-sol is at capacity/);
  });

  it("fails the call when the app server dies, and starts a new one for the next", async () => {
    const { runner: codex, received } = runner();
    await expect(codex.run(request("die"), () => {}, new AbortController().signal)).rejects.toThrow(/Codex stopped/);
    expect(await codex.run(request("Again."), () => {}, new AbortController().signal)).toMatch(/She closes the book/);
    expect(received().filter(message => message.method === "initialize")).toHaveLength(2);
  });

  it("interrupts the turn when the call is abandoned while it runs", async () => {
    const { runner: codex, received } = runner();
    const controller = new AbortController();
    // The turn is under way once its first word arrives: waited for, not timed, as a loaded machine starts Codex slowly.
    let underWay!: () => void;
    const firstWord = new Promise<void>(resolve => (underWay = resolve));
    const running = codex.run(request("slow"), () => underWay(), controller.signal);
    await firstWord;
    controller.abort();
    await expect(running).rejects.toThrow(/stopped/);
    // The interrupt is sent as the call is abandoned; the server writes it down as it reads it.
    await expect.poll(() => received().find(message => message.method === "turn/interrupt")?.params, { timeout: 10_000 }).toMatchObject({ threadId: "thread-1", turnId: "turn-thread-1" });
  });

  it("starts no turn for a call abandoned before it began", async () => {
    const { runner: codex, received } = runner();
    const controller = new AbortController();
    controller.abort();
    await expect(codex.run(request("Hello."), () => {}, controller.signal)).rejects.toThrow(/stopped/);
    expect(received().some(message => message.method === "turn/start")).toBe(false);
  });

  it("declines a request to run a command: the agents run none", async () => {
    const { runner: codex, received } = runner();
    const answer = await codex.run(request("approval"), () => {}, new AbortController().signal);
    expect(answer).toMatch(/She closes the book/);
    const reply = received().find(message => (message as { id?: number }).id === 900) as { error?: { message: string }; result?: unknown };
    expect(reply.error?.message).toMatch(/run no commands/);
    expect(reply.result).toBeUndefined();
  });
});
