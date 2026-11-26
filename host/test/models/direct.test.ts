import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AntigravityDirectRunner, antigravityGatewayModels } from "../../src/models/antigravity-direct.js";
import { CodexDirectRunner, codexBackendModels } from "../../src/models/codex-direct.js";
import { antigravityToken, codexCredentials, opencodeApiKey, preferDirect, UseFallback } from "../../src/models/direct.js";
import { NO_TOOLS, type ModelRequest, type ModelRunner, type ToolSpec, type Tools } from "../../src/models/model-call.js";
import { OpencodeDirectRunner, opencodeGoModels } from "../../src/models/opencode-direct.js";
import { antigravityBody, codexBody, conversationOf, geminiSchema, schemaInWords } from "../../src/models/wire.js";
import { opencodeChatBody, opencodeGeminiBody, opencodeMessagesBody, opencodeResponsesBody } from "../../src/models/opencode-wire.js";

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
  const codexConstants = new Set(["", "gpt-6.1-sol", "low", "medium", "high", "message", "developer", "user", "input_text", "function", "web_search", "auto", "reasoning.encrypted_content", "json_schema", "answer", "object", "null"]);
  const antigravityConstants = new Set(["gemini-3.8-flash-high", "project-1", "antigravity", "agent", "user", "application/json", "OBJECT", "object"]);

  it("gives Codex the system prompt as its leading developer message and nothing the host did not write", () => {
    const body = codexBody(conversationOf(request({ schema: SCHEMA })), "gpt-6.1-sol", { story: [SEARCH], web: true });
    expect(body.instructions).toBe("");
    const found = strings(body);
    expect(found.filter(item => item.text === SYSTEM).map(item => item.at)).toEqual(["$.input[0].content[0].text"]);
    expect(found.filter(item => item.text === PROMPT).map(item => item.at)).toEqual(["$.input[1].content[0].text"]);
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

  it("passes the Story's chosen verbosity through to Codex instead of hardcoding high verbosity", () => {
    expect((codexBody(conversationOf(request()), "m", { story: [], web: false }).text as { verbosity: string }).verbosity).toBe("medium");
    expect((codexBody(conversationOf(request({ verbosity: "low" })), "m", { story: [], web: false }).text as { verbosity: string }).verbosity).toBe("low");
    expect((codexBody(conversationOf(request({ agent: "editor" })), "m", { story: [], web: false }).text as { verbosity: string }).verbosity).toBe("medium");
  });

  it("delivers multi-turn conversation history to both Codex and Antigravity when present", () => {
    const turns = [
      { role: "user" as const, text: "Standing context" },
      { role: "assistant" as const, text: "She looks up." },
      { role: "user" as const, text: "I step inside." }
    ];
    const codex = codexBody(conversationOf(request({ conversation: turns })), "gpt-6.1-sol", { story: [], web: false });
    expect(codex.input).toEqual([
      { type: "message", role: "developer", content: [{ type: "input_text", text: SYSTEM }] },
      { type: "message", role: "user", content: [{ type: "input_text", text: "Standing context" }] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "She looks up." }] },
      { type: "message", role: "user", content: [{ type: "input_text", text: "I step inside." }] }
    ]);
    const agy = antigravityBody(conversationOf(request({ conversation: turns })), "gemini-3.8-flash-high", "project-1", { story: [] });
    expect((agy.request as { contents: unknown }).contents).toEqual([
      { role: "user", parts: [{ text: "Standing context" }] },
      { role: "model", parts: [{ text: "She looks up." }] },
      { role: "user", parts: [{ text: "I step inside." }] }
    ]);
    // Distinct Stories get distinct prompt_cache_key shards, while different agents on the SAME Story share one shard
    // so Chronicler/Director/Weaver reuse Composer's warmed Story Bible KV cache.
    const shardA = codexBody(conversationOf(request({ storyId: "story-a", system: "Story A\n\nComposer" })), "gpt-6.1-sol", { story: [], web: false });
    const shardAChronicler = codexBody(conversationOf(request({ storyId: "story-a", system: "Story A\n\nChronicler" })), "gpt-6.1-sol", { story: [], web: false });
    const shardB = codexBody(conversationOf(request({ storyId: "story-b", system: "Story B\n\nComposer" })), "gpt-6.1-sol", { story: [], web: false });
    expect(shardA.prompt_cache_key).toBe(shardAChronicler.prompt_cache_key);
    expect(shardA.prompt_cache_key).not.toBe(shardB.prompt_cache_key);
    // Layered Story system prompts split at </people> into two developer messages so input[0] is byte-identical across agents.
    const bible = "<story>\nTitle: T\n</story>\n\n<people>\n- A\n</people>";
    const cComposer = codexBody(conversationOf(request({ storyId: "s", system: `${bible}\n\n# Composer` })), "gpt-6.2-sol", { story: [], web: false });
    const cChron = codexBody(conversationOf(request({ storyId: "s", system: `${bible}\n\n# Chronicler` })), "gpt-6.2-sol", { story: [], web: false });
    expect((cComposer.input as unknown[])[0]).toEqual((cChron.input as unknown[])[0]);
    expect((cComposer.input as unknown[])[1]).not.toEqual((cChron.input as unknown[])[1]);
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
  const post = (async (url: string, init: { body?: string; headers: Record<string, string> }) => {
    if (String(url).endsWith("/inference/go/v1/models")) return new Response(JSON.stringify({ data: [] }));
    sent.push({ url: String(url), body: JSON.parse(init.body ?? "{}") as Record<string, unknown>, headers: init.headers });
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
    expect(second.slice(2)).toEqual([
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
    expect(sessions[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
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

  it("lists all visible Codex models directly from /backend-api/codex/models", async () => {
    expect(codexBackendModels([
      { slug: "gpt-6.2-sol", display_name: "GPT-6.2-Sol", visibility: "list", default_reasoning_level: "low", supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }, { effort: "high" }] },
      { slug: "gpt-reserve", display_name: "GPT-Reserve", visibility: "hide", default_reasoning_level: "medium", supported_reasoning_levels: [{ effort: "medium" }] }
    ])).toEqual([
      { id: "gpt-6.2-sol", aliases: [], name: "GPT 6.2 Sol", efforts: ["low", "medium", "high"], defaultEffort: "low" }
    ]);

    const get = (async (url: string, init: { method?: string; headers: Record<string, string> }) => {
      expect(url).toContain("/backend-api/codex/models");
      expect(init.method).toBe("GET");
      expect(init.headers["chatgpt-account-id"]).toBe("a");
      return new Response(JSON.stringify({
        models: [
          { slug: "gpt-6.2-sol", display_name: "GPT-6.2-Sol", visibility: "list", default_reasoning_level: "low", supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }] }
        ]
      }));
    }) as unknown as typeof fetch;
    expect(await new CodexDirectRunner(signedIn, get).listModels()).toEqual([
      { id: "gpt-6.2-sol", aliases: [], name: "GPT 6.2 Sol", efforts: ["low", "medium"], defaultEffort: "low" }
    ]);
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

  it("folds all latest Antigravity models from the gateway payload in recommended order, dropping non-callable entries", () => {
    expect(antigravityGatewayModels({
      agentModelSorts: [{ groups: [{ modelIds: [
        "gemini-4-neon-high", "gemini-4-neon-xhigh", "gemini-4-neon-medium", "gemini-4-neon-low",
        "gemini-4-carbon-high", "gemini-4-carbon-medium",
        "gemini-pro-orchestrator-neon",
        "claude-opus-5-5-low", "claude-opus-5-5-high",
        "gpt-oss-120b-medium"
      ] }] }],
      imageGenerationModelIds: ["gemini-3.1-flash-image"],
      tieredModelIds: { pro: ["gemini-4-hydrogen-tiered-xhigh"] },
      models: {
        "gemini-4-neon-high": { displayName: "Gemini 4 Neon (High)", recommended: true },
        "gemini-4-neon-xhigh": { displayName: "Gemini 4 Neon (XHigh)", recommended: true },
        "gemini-4-neon-medium": { displayName: "Gemini 4 Neon (Medium)", recommended: true },
        "gemini-4-neon-low": { displayName: "Gemini 4 Neon (Low)", recommended: true },
        "gemini-4-carbon-high": { displayName: "Gemini 4 Carbon (High)", recommended: true },
        "gemini-4-carbon-medium": { displayName: "Gemini 4 Carbon (Medium)", recommended: true },
        "gemini-pro-orchestrator-neon": { displayName: "Orchestrator (Neon)", recommended: true },
        "claude-opus-5-5-low": { displayName: "Claude Opus 5.5 (Low)", recommended: true },
        "claude-opus-5-5-high": { displayName: "Claude Opus 5.5 (High)", recommended: true },
        "gpt-oss-120b-medium": { displayName: "GPT-OSS 120B (Medium)", recommended: true },
        "gemini-3.5-flash-lite": { displayName: "Gemini 3.5 Flash Lite", recommended: true },
        "gemini-2.5-flash": { displayName: "Gemini 3.5 Flash Lite", recommended: true },
        "gemini-3.1-flash-image": { displayName: "Gemini 3.1 Flash Image", recommended: false },
        "gemini-4-hydrogen-tiered-xhigh": { displayName: "Gemini 4 Hydrogen (XHigh)", recommended: true },
        "internal-model": { displayName: "Internal", recommended: true, isInternal: true }
      }
    })).toEqual([
      { id: "gemini-4-neon", aliases: [], name: "Gemini 4 Neon", efforts: ["low", "medium", "high", "xhigh"], defaultEffort: "medium" },
      { id: "gemini-4-carbon", aliases: [], name: "Gemini 4 Carbon", efforts: ["medium", "high"], defaultEffort: "medium" },
      { id: "claude-opus-5-5", aliases: [], name: "Claude Opus 5.5", efforts: ["low", "high"], defaultEffort: "high" },
      { id: "gpt-oss-120b", aliases: [], name: "GPT-OSS 120B", efforts: ["medium"], defaultEffort: "medium" },
      { id: "gemini-3.5-flash-lite", aliases: [], name: "Gemini 3.5 Flash Lite", efforts: [], defaultEffort: null }
    ]);
  });

  it("lists models directly via fetchAvailableModels and falls back to the local Hub daemon when the keychain token expired", async () => {
    const gatewayPayload = {
      agentModelSorts: [{ groups: [{ modelIds: ["gemini-4-neon-high", "gemini-4-neon-xhigh"] }] }],
      models: {
        "gemini-4-neon-high": { displayName: "Gemini 4 Neon (High)", recommended: true },
        "gemini-4-neon-xhigh": { displayName: "Gemini 4 Neon (XHigh)", recommended: true }
      }
    };
    const { post, sent } = fetchOf([new Response(JSON.stringify(gatewayPayload))]);
    const direct = await new AntigravityDirectRunner("2.32.2", () => "token", post, async () => {}, () => []).listModels();
    expect(direct).toEqual([{ id: "gemini-4-neon", aliases: [], name: "Gemini 4 Neon", efforts: ["high", "xhigh"], defaultEffort: "xhigh" }]);
    expect(sent.some(item => item.url.includes("fetchAvailableModels") && item.body.project === "project-1")).toBe(true);

    const daemonFetch = (async (url: string, init: { headers: Record<string, string> }) => {
      expect(url).toBe("http://127.0.0.1:62305/exa.language_server_pb.LanguageServerService/GetAvailableModels");
      expect(init.headers["x-codeium-csrf-token"]).toBe("csrf-1");
      return new Response(JSON.stringify({ response: gatewayPayload }));
    }) as unknown as typeof fetch;
    const fromDaemon = await new AntigravityDirectRunner(
      "2.32.2",
      () => { throw new UseFallback("expired"); },
      daemonFetch,
      async () => {},
      () => [{ httpPort: 62305, csrfToken: "csrf-1" }]
    ).listModels();
    expect(fromDaemon).toEqual(direct);
  });

  it("falls back to schema-in-words when a Claude-on-Antigravity model rejects tool_choice for responseSchema", async () => {
    const unsupportedToolChoice = () => new Response(JSON.stringify({ error: { message: "tool_choice: type \"tool\" and \"any\" are not supported for this model." } }), { status: 400 });
    const answer = [{ response: { candidates: [{ content: { parts: [{ text: "{\"reply\":\"Yes.\",\"moves_to\":null}" }] }, finishReason: "STOP" }] } }];
    const { post, sent } = fetchOf([unsupportedToolChoice(), answer, answer]);
    const runner = new AntigravityDirectRunner("2.32.2", () => "token", post);
    const claudeOnAgy = request({ schema: SCHEMA, model: { provider: "antigravity", model: "claude-sonnet-5-5", effort: "medium" } });
    expect(await runner.run(claudeOnAgy, () => {}, new AbortController().signal)).toBe("{\"reply\":\"Yes.\",\"moves_to\":null}");
    // Gemini with the exact same schema still uses responseSchema because schema refusal is keyed per model.
    const gemini = request({ schema: SCHEMA, model: { provider: "antigravity", model: "gemini-4-neon", effort: "medium" } });
    expect(await runner.run(gemini, () => {}, new AbortController().signal)).toBe("{\"reply\":\"Yes.\",\"moves_to\":null}");
    const calls = sent.filter(item => item.url.includes("streamGenerateContent")).map(item => item.body.request as { generationConfig: Record<string, unknown> });
    expect(calls[1]!.generationConfig).toEqual({ responseMimeType: "application/json" });
    expect(calls[2]!.generationConfig.responseSchema).toBeDefined();
  });
});

describe("OpenCode Go, called directly", () => {
  it("routes OpenCode Go models to their native API families with Story Bible caching and x-opencode-session", async () => {
    // 1. OpenAI Responses API (e.g. grok-4.7): developer prefix, tools, usage + allowance
    const { post, sent } = fetchOf([
      [{ type: "response.output_item.done", item: { id: "fc_1", type: "function_call", call_id: "call_1", name: "search_story", arguments: "{\"words\":\"Shimla\"}" } },
        { type: "response.completed", response: { usage: { opencode: { allowance: 0.004, tokens: { input: 100, cache_read: 900, output: 20, reasoning: 5 } } } } }],
      [{ type: "response.output_text.delta", delta: "She left for the telegram." },
        { type: "response.output_item.done", item: { id: "msg_1", type: "message", content: [{ type: "output_text", text: "She left for the telegram." }] } },
        { type: "response.completed", response: { usage: { input_tokens: 1100, input_tokens_details: { cached_tokens: 950 }, output_tokens: 30, output_tokens_details: { reasoning_tokens: 10 }, opencode: { allowance: 0.005 } } } }]
    ]);
    const tools = lookupTools();
    const usage: unknown[] = [];
    const runner = new OpencodeDirectRunner(() => "oc_sk_test", post, async () => {});
    const answer = await runner.run(
      request({ model: { provider: "opencode", model: "grok-4.7", effort: "high" }, storyId: "story-1" }),
      () => {}, new AbortController().signal, tools, u => usage.push(u)
    );
    expect(answer).toBe("She left for the telegram.");
    expect(tools.asked).toEqual(["search_story:Shimla"]);
    expect(sent[0]!.url).toBe("https://opencode.ai/inference/go/openai/v1/responses");
    expect(sent[0]!.headers["User-Agent"]).toBe("open-fantasia/1.0");
    expect(sent[0]!.headers["x-opencode-session"]).toBe(`ses_${String(sent[0]!.body.prompt_cache_key)}`);
    expect(sent[0]!.headers["session-id"]).toBe(String(sent[0]!.body.prompt_cache_key));
    expect(usage.at(-1)).toEqual({ input_tokens: 2100, cached_tokens: 1850, output_tokens: 50, reasoning_tokens: 15, requests: 2, allowance: 0.005 });

    // 2. OpenAI Chat Completions API (e.g. glm-5.3): skips reasoning_content, streams delta.content, parses cached_tokens
    const chatFetch = fetchOf([
      [{ choices: [{ delta: { reasoning_content: "internal thinking", content: "Quiet rain." } }] },
        { choices: [], usage: { prompt_tokens: 2000, prompt_tokens_details: { cached_tokens: 1800 }, completion_tokens: 40, opencode: { allowance: 0.002 } } }]
    ]);
    const chatDeltas: string[] = [];
    const chatUsage: unknown[] = [];
    const chatRunner = new OpencodeDirectRunner(() => "oc_sk_test", chatFetch.post, async () => {});
    const chatAnswer = await chatRunner.run(
      request({ model: { provider: "opencode", model: "glm-5.3", effort: "high" }, storyId: "story-1" }),
      d => chatDeltas.push(d), new AbortController().signal, undefined, u => chatUsage.push(u)
    );
    expect(chatAnswer).toBe("Quiet rain.");
    expect(chatDeltas).toEqual(["Quiet rain."]);
    expect(chatFetch.sent[0]!.url).toBe("https://opencode.ai/inference/go/openai/v1/chat/completions");
    expect(chatFetch.sent[0]!.headers["x-opencode-session"]).toMatch(/^ses_/);
    expect(chatUsage.at(-1)).toEqual({ input_tokens: 2000, cached_tokens: 1800, output_tokens: 40, reasoning_tokens: 0, requests: 1, allowance: 0.002 });

    // 3. Anthropic Messages API (e.g. qwen4-max, minimax-m3, claude-haiku-5-5): 4 cache_control breakpoints + anthropic-version
    const msgFetch = fetchOf([
      [{ type: "message_start", message: { usage: { input_tokens: 120, cache_read_input_tokens: 3000, cache_creation_input_tokens: 80 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "She nods once." } },
        { type: "message_delta", usage: { output_tokens: 18, opencode: { allowance: 0.001 } } }]
    ]);
    const msgUsage: unknown[] = [];
    const msgRunner = new OpencodeDirectRunner(() => "oc_sk_test", msgFetch.post, async () => {});
    const msgAnswer = await msgRunner.run(
      request({
        model: { provider: "opencode", model: "qwen4-max", effort: "high" },
        system: "<story>\nBible\n</people>\n\nRules",
        conversation: [{ role: "user", text: "Opening" }, { role: "assistant", text: "Reply 1" }, { role: "user", text: "Move 2" }],
        storyId: "story-1"
      }),
      () => {}, new AbortController().signal, lookupTools(), u => msgUsage.push(u)
    );
    expect(msgAnswer).toBe("She nods once.");
    expect(msgFetch.sent[0]!.url).toBe("https://opencode.ai/inference/go/anthropic/v1/messages");
    expect(msgFetch.sent[0]!.headers["anthropic-version"]).toBe("2023-06-01");
    expect(msgUsage.at(-1)).toEqual({ input_tokens: 3200, cached_tokens: 3000, output_tokens: 18, reasoning_tokens: 0, requests: 1, allowance: 0.001 });
    const msgBody = opencodeMessagesBody(conversationOf(request({
      system: "<story>\nBible\n</people>\n\nRules",
      conversation: [{ role: "user", text: "Opening" }, { role: "assistant", text: "Reply 1" }, { role: "user", text: "Move 2" }]
    })), "qwen4-max", { story: [SEARCH] });
    expect((msgBody.system as { cache_control?: unknown }[]).map(b => b.cache_control)).toEqual([{ type: "ephemeral" }, { type: "ephemeral" }]);
    expect((msgBody.tools as { cache_control?: unknown }[])[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(((msgBody.messages as { content: unknown }[])[1]!.content as { cache_control?: unknown }[])[0]!.cache_control).toEqual({ type: "ephemeral" });

    // 4. Gemini generate-content API (e.g. gemini-4-argon): implicit prefix caching + cachedContentTokenCount
    const gemBody = opencodeGeminiBody(conversationOf(request({ system: "<story>\nBible\n</people>\n\nRules", model: { provider: "opencode", model: "gemini-4-argon", effort: "medium" } })), { story: [SEARCH] });
    expect((gemBody.systemInstruction as { parts: unknown[] }).parts).toHaveLength(2);
    expect((gemBody.generationConfig as { thinkingConfig?: { thinkingLevel: string } }).thinkingConfig?.thinkingLevel).toBe("MEDIUM");

    // Wire purity for Responses + Chat bodies
    const respBody = opencodeResponsesBody(conversationOf(request({ model: { provider: "opencode", model: "grok-4.7", effort: "high" }, schema: SCHEMA })), "grok-4.7", { story: [SEARCH] });
    expect(respBody.instructions).toBe("");
    expect((respBody.text as { format?: { type: string } }).format?.type).toBe("json_schema");
    const chatBody = opencodeChatBody(conversationOf(request({ model: { provider: "opencode", model: "glm-5.3", effort: "high" }, schema: SCHEMA })), "glm-5.3", { story: [SEARCH] });
    expect((chatBody.response_format as { type: string }).type).toBe("json_schema");
  });

  it("filters out free-only models from OpenCode Go catalog, sorts featured and highest allowance first, and resolves keys from keychain or auth.json", async () => {
    expect(opencodeGoModels([
      { id: "beam-free", name: "Beam Free", type: "chat", cost: { text: { input: { price: 0 } } }, go: { monthly_usage: { go: 0 } } },
      { id: "text-embedding-3-small", name: "Embed", type: "embedding", cost: { text: { input: { price: 0.02 } } }, go: { monthly_usage: { go: 10 } } },
      { id: "grok-4.7", name: "Grok 4.7", type: "chat", capabilities: { reasoning: { supported: true, effort: ["low", "medium", "high", "xhigh"] } }, cost: { text: { input: { price: 2 } } }, go: { monthly_usage: { go: 15 }, featured: false } },
      { id: "glm-5.3", name: "GLM-5.3", type: "chat", capabilities: { reasoning: { supported: true, effort: ["low", "high", "max"] } }, cost: { text: { input: { price: 1.4 } } }, go: { monthly_usage: { go: 200 }, featured: true } }
    ])).toEqual([
      { id: "glm-5.3", aliases: [], name: "GLM-5.3", efforts: ["low", "high", "max"], defaultEffort: "high" },
      { id: "grok-4.7", aliases: [], name: "Grok 4.7", efforts: ["low", "medium", "high", "xhigh"], defaultEffort: "medium" }
    ]);

    const dir = process.env.TMPDIR ?? "/tmp";
    const file = `${dir}/fantasia-opencode-auth-${process.pid}.json`;
    writeFileSync(file, JSON.stringify({ "opencode-go": { type: "api", key: "oc_sk_from_auth" } }));
    expect(opencodeApiKey(() => "oc_sk_from_keychain", file)).toBe("oc_sk_from_keychain");
    expect(opencodeApiKey(() => null, file)).toBe("oc_sk_from_auth");
    expect(() => opencodeApiKey(() => null, `${file}.missing`)).toThrow(/fantasia opencode-key/);
  });

  it("falls back to schema-in-words when an OpenCode Go model rejects strict json_schema", async () => {
    const unsupported = () => new Response(JSON.stringify({ error: { message: "text.format json_schema is not supported" } }), { status: 400 });
    const answer = [{ type: "response.output_item.done", item: { id: "m1", type: "message", content: [{ type: "output_text", text: "```json\n{\"reply\":\"Yes.\",\"moves_to\":null}\n```" }] } },
      { type: "response.completed", response: { usage: { input_tokens: 10, output_tokens: 5 } } }];
    const { post, sent } = fetchOf([unsupported(), answer]);
    const runner = new OpencodeDirectRunner(() => "oc_sk_test", post, async () => {});
    const out = await runner.run(request({ model: { provider: "opencode", model: "grok-4.7", effort: "high" }, schema: SCHEMA }), () => {}, new AbortController().signal);
    expect(out).toBe("{\"reply\":\"Yes.\",\"moves_to\":null}");
    expect(sent[0]!.body.text).toBeDefined();
    expect(sent[1]!.body.text).toBeUndefined();
    expect(JSON.stringify(sent[1]!.body.input)).toContain(schemaInWords(SCHEMA).slice(0, 40));
  });

  it("lazily loads /inference/go/v1/models once on cold start so explicitCache breakpoints apply before listModels()", async () => {
    let modelFetches = 0;
    const chatBodies: Record<string, unknown>[] = [];
    const customFetch = (async (url: string, init: { method?: string; body?: string }) => {
      if (String(url).endsWith("/inference/go/v1/models")) {
        modelFetches++;
        return new Response(JSON.stringify({
          data: [{
            id: "deepseek-v4",
            type: "chat",
            recommended_api: "chat-completions",
            capabilities: { cache: { explicit: true } },
            cost: { text: { input: { price: 1 } } },
            go: { monthly_usage: { go: 100 } }
          }]
        }));
      }
      chatBodies.push(JSON.parse(init.body ?? "{}") as Record<string, unknown>);
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "She answers." } }] })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } }
      );
    }) as unknown as typeof fetch;

    const runner = new OpencodeDirectRunner(() => "oc_sk_test", customFetch, async () => {});
    const req = request({
      model: { provider: "opencode", model: "deepseek-v4", effort: "high" },
      system: "<story>\nBible\n</people>\n\nRules",
      conversation: [{ role: "user", text: "Opening" }, { role: "assistant", text: "Reply 1" }, { role: "user", text: "Move 2" }],
      storyId: "story-1"
    });
    expect(await runner.run(req, () => {}, new AbortController().signal)).toBe("She answers.");
    expect(await runner.run(req, () => {}, new AbortController().signal)).toBe("She answers.");
    expect(modelFetches).toBe(1);
    const messages = chatBodies[0]!.messages as { role: string; content: unknown }[];
    expect(messages[0]!.content).toEqual([{ type: "text", text: "<story>\nBible\n</people>", cache_control: { type: "ephemeral" } }]);
    expect(messages[1]!.content).toEqual([{ type: "text", text: "Rules", cache_control: { type: "ephemeral" } }]);
    expect(messages[3]!.content).toEqual([{ type: "text", text: "Reply 1", cache_control: { type: "ephemeral" } }]);

    // If /v1/models fails transiently on cold start, inference still proceeds via inferOpencodeApi().
    const failCatalog = (async (url: string) => {
      if (String(url).endsWith("/inference/go/v1/models")) return new Response("upstream down", { status: 503 });
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Fallback ok." } }] })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } }
      );
    }) as unknown as typeof fetch;
    const fallbackRunner = new OpencodeDirectRunner(() => "oc_sk_test", failCatalog, async () => {});
    expect(await fallbackRunner.run(req, () => {}, new AbortController().signal)).toBe("Fallback ok.");
  });
});
