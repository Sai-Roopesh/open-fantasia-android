import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AntigravityDirectRunner } from "../../src/models/antigravity-direct.js";
import { CodexDirectRunner } from "../../src/models/codex-direct.js";
import { antigravityToken, codexCredentials, preferDirect, UseFallback } from "../../src/models/direct.js";
import { NO_TOOLS, type ModelRequest, type ModelRunner, type ToolSpec, type Tools } from "../../src/models/model-call.js";
import { antigravityBody, codexBody, conversationOf, geminiSchema, schemaInWords } from "../../src/models/wire.js";

const SYSTEM = "SYSTEM-SENTINEL: you write everyone but Ishaan.";
const PROMPT = "PROMPT-SENTINEL: *I block the door.*";
const SEARCH: ToolSpec = { name: "search_story", description: "Find a passage", params: { words: { type: "string", description: "Words to find" } } };
const SCHEMA = { type: "object", additionalProperties: false, required: ["reply", "moves_to"], properties: {
  reply: { type: "string", minLength: 1, description: "The Reply" },
  moves_to: { type: ["string", "null"], description: "The new place" },
  call: { type: "string", enum: ["continue", "land"] }
} };

const request = (extra: Partial<ModelRequest> = {}): ModelRequest => ({
  agent: "actor", model: { provider: "codex", model: "gpt-6.1-sol", effort: "high" }, system: SYSTEM, prompt: PROMPT,
  traceId: "t", storyId: null, ...extra
});

/** Every string anywhere in a body, with the path it was found at. */
function strings(value: unknown, at = "$"): { at: string; text: string }[] {
  if (typeof value === "string") return [{ at, text: value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${at}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => strings(item, `${at}.${key}`));
  return [];
}

/** Every string the host itself authored for a call: its prompts, its tools, and its schema's values and field names. */
function authored(): Set<string> {
  return new Set([SYSTEM, PROMPT, ...strings(SEARCH).map(item => item.text), ...strings(SCHEMA).map(item => item.text), ...Object.keys(SCHEMA.properties), "words"]);
}

/**
 * The whole point of the direct transports (docs/adr/0023): what a model reads is what the host wrote. Each body may
 * carry only the host's own strings and the protocol's named constants listed here, so text a tool would have added
 * (a skills catalogue, an agent-team prompt, a global AGENTS.md) cannot reach a model without failing this test.
 */
describe("one request, delivered the same way to every provider", () => {
  const codexConstants = new Set(["gpt-6.1-sol", "high", "message", "user", "input_text", "function", "web_search", "auto", "reasoning.encrypted_content", "json_schema", "answer", "object", "null"]);
  const antigravityConstants = new Set(["gemini-3.8-flash-high", "project-1", "antigravity", "agent", "user", "application/json", "OBJECT", "object"]);

  it("gives Codex the system prompt as its instructions and nothing the host did not write", () => {
    const body = codexBody(conversationOf(request({ schema: SCHEMA })), "gpt-6.1-sol", { story: [SEARCH], web: true });
    expect(body.instructions).toBe(SYSTEM);
    const found = strings(body);
    expect(found.filter(item => item.text === SYSTEM).map(item => item.at)).toEqual(["$.instructions"]);
    expect(found.filter(item => item.text === PROMPT).map(item => item.at)).toEqual(["$.input[0].content[0].text"]);
    const own = authored();
    const stray = found.filter(item => !own.has(item.text) && !codexConstants.has(item.text) && item.at !== "$.prompt_cache_key");
    expect(stray).toEqual([]);
  });

  it("gives Gemini the system prompt as its system instruction and nothing the host did not write", () => {
    const body = antigravityBody(conversationOf(request({ schema: SCHEMA })), "gemini-3.8-flash-high", "project-1", { story: [SEARCH] });
    const found = strings(body);
    expect(found.filter(item => item.text === SYSTEM).map(item => item.at)).toEqual(["$.request.systemInstruction.parts[0].text"]);
    expect(found.filter(item => item.text === PROMPT).map(item => item.at)).toEqual(["$.request.contents[0].parts[0].text"]);
    const own = authored();
    const stray = found.filter(item => !own.has(item.text) && !antigravityConstants.has(item.text) && item.at !== "$.requestId");
    expect(stray).toEqual([]);
  });

  it("asks for full-length writing only where the player reads the answer as story", () => {
    expect((codexBody(conversationOf(request()), "m", { story: [], web: false }).text as { verbosity: string }).verbosity).toBe("high");
    expect((codexBody(conversationOf(request({ agent: "editor" })), "m", { story: [], web: false }).text as { verbosity: string }).verbosity).toBe("medium");
  });

  it("turns a JSON Schema into the subset Gemini's responseSchema takes", () => {
    expect(geminiSchema(SCHEMA)).toEqual({ type: "object", required: ["reply", "moves_to"], properties: {
      reply: { type: "string", description: "The Reply" },
      moves_to: { type: "string", nullable: true, description: "The new place" },
      call: { type: "string", enum: ["continue", "land"] }
    } });
  });
});

/** A fetch that answers each request with the next of [answers], an SSE stream of events, and keeps what it was sent. */
function fetchOf(answers: (Record<string, unknown>[] | Response)[]) {
  const sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const post = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) as Record<string, unknown>, headers: init.headers });
    if (String(url).includes("loadCodeAssist")) return new Response(JSON.stringify({ cloudaicompanionProject: "project-1" }));
    const next = answers.shift();
    if (next instanceof Response) return next;
    return new Response((next ?? []).map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  }) as unknown as typeof fetch;
  return { post, sent };
}

function lookupTools(): Tools & { asked: string[] } {
  const asked: string[] = [];
  return { ...NO_TOOLS, story: [SEARCH], asked, use: (name, args) => { asked.push(`${name}:${String(args.words)}`); return "Meera: \"I left Shimla because of the telegram.\""; } };
}

describe("Codex, called directly", () => {
  const signedIn = () => ({ token: "t", accountId: "a" });

  it("streams the reply, answers a Story lookup in between, and sends back the turn without ids", async () => {
    const { post, sent } = fetchOf([
      [{ type: "response.output_item.done", item: { id: "rs_1", type: "reasoning", encrypted_content: "x" } },
        { type: "response.output_item.done", item: { id: "fc_1", type: "function_call", call_id: "call_1", name: "search_story", arguments: "{\"words\":\"Shimla\"}" } },
        { type: "response.completed", response: { usage: { input_tokens: 10 } } }],
      [{ type: "response.output_text.delta", delta: "She left " }, { type: "response.output_text.delta", delta: "for the telegram." },
        { type: "response.output_item.done", item: { id: "msg_1", type: "message", content: [{ type: "output_text", text: "She left for the telegram." }] } },
        { type: "response.completed", response: { usage: { input_tokens: 20 } } }]
    ]);
    const tools = lookupTools();
    const deltas: string[] = [];
    const wire: unknown[] = [];
    const answer = await new CodexDirectRunner(signedIn, post).run(request(), delta => deltas.push(delta), new AbortController().signal, tools, () => {}, body => wire.push(body));
    expect(answer).toBe("She left for the telegram.");
    expect(deltas.join("")).toBe("She left for the telegram.");
    expect(tools.asked).toEqual(["search_story:Shimla"]);
    const second = sent[1]!.body.input as Record<string, unknown>[];
    expect(second.slice(1)).toEqual([
      { type: "reasoning", encrypted_content: "x" },
      { type: "function_call", call_id: "call_1", name: "search_story", arguments: "{\"words\":\"Shimla\"}" },
      { type: "function_call_output", call_id: "call_1", output: "Meera: \"I left Shimla because of the telegram.\"" }
    ]);
    expect(wire).toHaveLength(2);
  });

  // Checked live on 17 November 2026: the backend read nothing from its prompt cache for a request with no session.
  it("names a session, the same for every call with the same model and system prompt, so the prompt cache is read", async () => {
    const answer = [{ type: "response.output_item.done", item: { type: "message", content: [{ type: "output_text", text: "Yes." }] } }, { type: "response.completed", response: { usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 90 }, output_tokens: 7, output_tokens_details: { reasoning_tokens: 3 } } } }];
    const { post, sent } = fetchOf([answer, answer, answer]);
    const runner = new CodexDirectRunner(signedIn, post);
    const usage: unknown[] = [];
    await runner.run(request({ prompt: "one" }), () => {}, new AbortController().signal, NO_TOOLS, value => usage.push(value));
    await runner.run(request({ prompt: "two" }), () => {}, new AbortController().signal);
    await runner.run(request({ system: "Another Story." }), () => {}, new AbortController().signal);
    const sessions = sent.map(item => item.headers["session-id"]);
    expect(sessions[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(sessions[0]).toBe(sent[0]!.body.prompt_cache_key);
    expect(sessions[1]).toBe(sessions[0]);
    expect(sessions[2]).not.toBe(sessions[0]);
    expect(usage).toEqual([{ input_tokens: 100, cached_tokens: 90, output_tokens: 7, reasoning_tokens: 3, requests: 1 }]);
  });

  it("hands a refused sign-in to the Codex CLI, and nothing else", async () => {
    const refused = new CodexDirectRunner(signedIn, fetchOf([new Response("{\"detail\":\"expired\"}", { status: 401 })]).post);
    const cli: ModelRunner = { run: async () => "from the CLI" };
    expect(await preferDirect(refused, cli).run(request(), () => {}, new AbortController().signal)).toBe("from the CLI");
    const broken = new CodexDirectRunner(signedIn, fetchOf([new Response("{\"detail\":\"bad request\"}", { status: 400 })]).post);
    await expect(preferDirect(broken, cli).run(request(), () => {}, new AbortController().signal)).rejects.toThrow("Codex answered 400: bad request");
  });

  it("reads the Codex sign-in only while its token is good", () => {
    const dir = process.env.TMPDIR ?? "/tmp";
    const file = `${dir}/fantasia-codex-auth-${process.pid}.json`;
    const token = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;
    writeFileSync(file, JSON.stringify({ tokens: { access_token: token(2_000), account_id: "acct" } }));
    expect(codexCredentials(file, 1_000_000)).toEqual({ token: token(2_000), accountId: "acct" });
    expect(() => codexCredentials(file, 1_990_000)).toThrow(UseFallback);
    expect(() => codexCredentials(`${file}.missing`)).toThrow(UseFallback);
  });
});

describe("Antigravity, called directly", () => {
  it("answers a Story lookup and sends Gemini's own turn back with its thought signature", async () => {
    const { post, sent } = fetchOf([
      [{ response: { candidates: [{ content: { parts: [{ thoughtSignature: "sig", functionCall: { name: "search_story", args: { words: "Shimla" } } }] } }] } }],
      [{ response: { candidates: [{ content: { parts: [{ text: "She left ", thought: false }] } }] } },
        { response: { candidates: [{ content: { parts: [{ text: "for the telegram." }] }, finishReason: "STOP" }], usageMetadata: { totalTokenCount: 5 } } }]
    ]);
    const tools = lookupTools();
    const deltas: string[] = [];
    const answer = await new AntigravityDirectRunner("2.32.2", () => "token", post)
      .run(request({ model: { provider: "antigravity", model: "gemini-3.8-flash", effort: "high" } }), delta => deltas.push(delta), new AbortController().signal, tools);
    expect(answer).toBe("She left for the telegram.");
    expect(deltas.join("")).toBe("She left for the telegram.");
    expect(tools.asked).toEqual(["search_story:Shimla"]);
    const generate = sent.filter(item => item.url.includes("streamGenerateContent"));
    expect(generate[0]!.body.model).toBe("gemini-3.8-flash-high");
    expect((generate[1]!.body.request as { contents: unknown[] }).contents.slice(1)).toEqual([
      { role: "model", parts: [{ thoughtSignature: "sig", functionCall: { name: "search_story", args: { words: "Shimla" } } }] },
      { role: "user", parts: [{ functionResponse: { name: "search_story", response: { output: "Meera: \"I left Shimla because of the telegram.\"" } } }] }
    ]);
  });

  it("asks for a schema in words once the gateway says it is too large to hold Gemini to, and remembers", async () => {
    const tooLarge = () => new Response(JSON.stringify({ error: { message: "The specified schema produces a constraint that has too many states for serving." } }), { status: 400 });
    const answer = [{ response: { candidates: [{ content: { parts: [{ text: "{\"reply\":\"Yes.\",\"moves_to\":null}" }] }, finishReason: "STOP" }] } }];
    const { post, sent } = fetchOf([tooLarge(), answer, answer]);
    const runner = new AntigravityDirectRunner("2.32.2", () => "token", post);
    const gemini = request({ schema: SCHEMA, model: { provider: "antigravity", model: "gemini-3.8-flash", effort: "high" } });
    expect(await runner.run(gemini, () => {}, new AbortController().signal)).toBe("{\"reply\":\"Yes.\",\"moves_to\":null}");
    await runner.run(gemini, () => {}, new AbortController().signal);
    const [held, inWords, again] = sent.filter(item => item.url.includes("streamGenerateContent")).map(item => item.body.request as { generationConfig: Record<string, unknown>; contents: { parts: { text: string }[] }[] });
    expect(held!.generationConfig.responseSchema).toBeDefined();
    expect(inWords!.generationConfig).toEqual({ responseMimeType: "application/json" });
    expect(inWords!.contents.at(-1)!.parts[0]!.text).toBe(`${PROMPT}\n\n${schemaInWords(SCHEMA)}`);
    // The second call does not pay for the refusal again.
    expect(again!.generationConfig).toEqual({ responseMimeType: "application/json" });
  });

  it("asks again when the gateway has no capacity, and says so when it still has none", async () => {
    const busy = () => new Response(JSON.stringify({ error: { message: "No capacity available for model gemini-3.8-flash-high on the server" } }), { status: 503 });
    const answer = [{ response: { candidates: [{ content: { parts: [{ text: "She waits." }] }, finishReason: "STOP" }] } }];
    const waited: number[] = [];
    const wait = async (ms: number) => { waited.push(ms); };
    const gemini = request({ model: { provider: "antigravity", model: "gemini-3.8-flash", effort: "high" } });
    expect(await new AntigravityDirectRunner("2.32.2", () => "token", fetchOf([busy(), busy(), answer]).post, wait).run(gemini, () => {}, new AbortController().signal)).toBe("She waits.");
    expect(waited).toEqual([2_000, 6_000]);
    await expect(new AntigravityDirectRunner("2.32.2", () => "token", fetchOf([busy(), busy(), busy(), busy()]).post, wait).run(gemini, () => {}, new AbortController().signal))
      .rejects.toThrow("Antigravity answered 503: No capacity available");
  });

  it("reads the Antigravity sign-in from the keychain only while its token is good", () => {
    const stored = (expiry: string) => `go-keyring-base64:${Buffer.from(JSON.stringify({ token: { access_token: "ya29", expiry } })).toString("base64")}`;
    expect(antigravityToken(() => stored("2026-11-17T12:00:00Z"), Date.parse("2026-11-17T11:00:00Z"))).toBe("ya29");
    expect(() => antigravityToken(() => stored("2026-11-17T11:00:30Z"), Date.parse("2026-11-17T11:00:00Z"))).toThrow(UseFallback);
    expect(() => antigravityToken(() => { throw new Error("not found"); })).toThrow(UseFallback);
  });
});
