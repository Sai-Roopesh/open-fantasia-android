import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { claudeOptions, storyToolsFor, type Calling } from "../../src/models/claude.js";
import { Models, NO_LOOKUPS_LEFT, NO_TOOLS, type ModelRequest, type ModelRunner, type Tools } from "../../src/models/model-call.js";
import { ledger } from "../agents/ledger.js";

const request = (extra: Partial<ModelRequest> = {}): ModelRequest => ({
  agent: "writer",
  model: { provider: "claude", model: "claude-sonnet-5-5" },
  system: "You plan each Reply before it starts.",
  prompt: "Plan the Reply.",
  traceId: "trace-claude",
  storyId: null,
  ...extra
});

/** What the SDK hands a PreToolUse hook, only what is read of it. */
const asked = (tool: string, input: Record<string, unknown>) =>
  ({ hook_event_name: "PreToolUse", tool_name: tool, tool_input: input, tool_use_id: "use-1", session_id: "session", transcript_path: "", cwd: "" }) as unknown as Parameters<HookCallback>[0];

/**
 * Claude's runner, short of the SDK: it starts with the options a real call would get and makes the tool calls a
 * model would, through the hook and the in-process server's handlers, as the SDK calls them.
 */
class AsTheSdk implements ModelRunner {
  readonly canLookUp = { story: true, web: true };
  readonly said: string[] = [];
  async run(sent: ModelRequest, _onText: (delta: string) => void, _signal: AbortSignal, tools: Tools = NO_TOOLS): Promise<string> {
    const calling: Calling = { tools };
    const options = claudeOptions(sent, tools, calling, "/tmp", {});
    const hook = options.hooks?.PreToolUse?.[0]?.hooks[0];
    const server = storyToolsFor(tools.story, calling);
    const search = server.find(item => item.name === "search_story")!;
    const result = await search.handler({ words: "dragon egg" }, {});
    this.said.push(result.content[0]!.type === "text" ? result.content[0]!.text : "");
    for (const query of ["Norwegian Ridgeback", "dragon eggs"]) {
      const decision = await hook!(asked("WebSearch", { query }), "use-1", { signal: new AbortController().signal });
      this.said.push(JSON.stringify(decision));
    }
    return JSON.stringify({ n: [2] });
  }
}

describe("Claude with tools, through the Agent SDK (docs/adr/0018)", () => {
  it("starts with no tools and the turns of an answer, for a call with nothing to look up", () => {
    const options = claudeOptions(request({ schema: { type: "object" } }), NO_TOOLS, { tools: NO_TOOLS }, "/tmp", {});
    expect(options).toMatchObject({ tools: [], maxTurns: 3 });
    expect(options.mcpServers).toBeUndefined();
    expect(options.allowedTools).toBeUndefined();
    expect(options.hooks).toBeUndefined();
    // A Reply in prose answers in its one turn.
    expect(claudeOptions(request({ agent: "actor" }), NO_TOOLS, { tools: NO_TOOLS }, "/tmp", {}).maxTurns).toBe(1);
  });

  it("starts with the web's search and fetch and the Story's tools for a call that may use them, in its turns and two for the answer", () => {
    const tools: Tools = { ...NO_TOOLS, web: true, story: [{ name: "search_story", description: "Search the Story.", params: { words: { type: "string", description: "The words." } } }] };
    const options = claudeOptions(request({ schema: { type: "object" }, turns: 5 }), tools, { tools }, "/tmp", {});
    expect(options).toMatchObject({ tools: ["WebSearch", "WebFetch"], maxTurns: 7, allowedTools: ["WebSearch", "WebFetch", "mcp__story__search_story"] });
    expect(options.mcpServers?.story).toMatchObject({ type: "sdk", name: "story" });
    expect(options.hooks?.PreToolUse?.[0]?.matcher).toBe("WebSearch|WebFetch");
    // The Story's tools without the web: no web tools, and nothing to count before they run.
    const storyOnly = claudeOptions(request({ turns: 5 }), { ...tools, web: false }, { tools }, "/tmp", {});
    expect(storyOnly).toMatchObject({ tools: [], allowedTools: ["mcp__story__search_story"] });
    expect(storyOnly.hooks).toBeUndefined();
  });

  it("answers the Story's tools from the call that took the process, counts the web, and refuses it once the lookups are used up", async () => {
    const story = ledger();
    story.move("I ask Hermione what Hagrid is hiding.");
    story.reply("\"Hagrid has a dragon egg,\" Hermione whispers.");
    const claude = new AsTheSdk();
    const models = new Models(story.mac.db, { claude });
    const answer = await models.call(request({ schema: { type: "object" }, turns: 3, storyId: story.storyId, tools: { story: { storyId: story.storyId, head: story.head() }, web: true } }));
    expect(claude.said[0]).toContain("Scene 1, “After curfew”, a Reply: \"Hagrid has a dragon egg,\" Hermione whispers.");
    expect(JSON.parse(claude.said[1]!)).toEqual({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } });
    expect(JSON.parse(claude.said[2]!)).toEqual({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: NO_LOOKUPS_LEFT } });
    expect(answer.lookups).toEqual(["searched the Story for “dragon egg”: 1 passage", "searched the web for “Norwegian Ridgeback”"]);
    expect(models.lookedUp(answer.callId)).toEqual(answer.lookups);
  });
});
