import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Catalog, type OfferedModel } from "../../src/models/catalog.js";
import { agyModels } from "../../src/models/antigravity.js";
import { claudeModels } from "../../src/models/claude.js";
import { codexModels } from "../../src/models/codex.js";
import { freshHome } from "../support/host.js";

const opus: OfferedModel = { id: "claude-opus-5-5", aliases: ["opus"], name: "Opus 5.5", efforts: ["low", "medium", "high", "xhigh", "max"], defaultEffort: null };
const sol: OfferedModel = { id: "gpt-6.1-sol", aliases: [], name: "GPT 6.1 Sol", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"], defaultEffort: "low" };
const flash: OfferedModel = { id: "gemini-3.8-flash", aliases: [], name: "Gemini 3.8 Flash", efforts: ["low", "medium", "high"], defaultEffort: null };

describe("what each provider offers, as the Models screen shows it", () => {
  it("reads Claude's list as its SDK gives it: the resolved id, the alias kept, the default row left out", () => {
    expect(claudeModels([
      { value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)", description: "", supportsEffort: true, supportedEffortLevels: ["low", "high"] },
      { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5", description: "", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"] },
      { value: "haiku", resolvedModel: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5", description: "" }
    ])).toEqual([opus, { id: "claude-haiku-4-5-20251001", aliases: ["haiku"], name: "Haiku 4.5", efforts: [], defaultEffort: null }]);
  });

  it("reads Codex's model/list, its hidden models left out and its names spaced as people write them", () => {
    expect(codexModels([
      { id: "gpt-6.1-sol", model: "gpt-6.1-sol", displayName: "GPT-6.1-Sol", hidden: false, defaultReasoningEffort: "low",
        supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"].map(reasoningEffort => ({ reasoningEffort, description: "" })) },
      { id: "gpt-internal", model: "gpt-internal", displayName: "GPT-Internal", hidden: true, defaultReasoningEffort: "low", supportedReasoningEfforts: [] }
    ])).toEqual([sol]);
  });

  it("reads agy models, a model's efforts folded from its ids into one", () => {
    expect(agyModels([
      "gemini-3.8-flash-high\tGemini 3.8 Flash (High)",
      "gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)",
      "gemini-3.8-flash-low\tGemini 3.8 Flash (Low)",
      "claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)",
      ""
    ].join("\n"))).toEqual([flash, { id: "claude-opus-4-6-thinking", aliases: [], name: "Claude Opus 4.6 (Thinking)", efforts: [], defaultEffort: null }]);
  });

  it("names a choice with its effort, and finds a model by its id or its alias", async () => {
    const { home } = freshHome();
    const catalog = new Catalog(home, { claude: async () => [opus], codex: async () => [sol], antigravity: async () => [flash] });
    await catalog.refresh();
    expect(catalog.label({ provider: "codex", model: "gpt-6.1-sol", effort: "high" })).toBe("GPT 6.1 Sol · high");
    expect(catalog.label({ provider: "claude", model: "opus" })).toBe("Opus 5.5");
    expect(catalog.offers({ provider: "claude", model: "opus" })).toBe(true);
    expect(catalog.offers({ provider: "codex", model: "gpt-6.1-sol", effort: "ultra" })).toBe(true);
    expect(catalog.offers({ provider: "codex", model: "gpt-6.1-sol", effort: "enormous" })).toBe(false);
    expect(catalog.offers({ provider: "antigravity", model: "gemini-9" })).toBe(false);
    // A model the catalog has never seen is still named, by its id.
    expect(catalog.label({ provider: "antigravity", model: "gemini-9", effort: "low" })).toBe("gemini-9 · low");
  });

  it("keeps the last list each provider gave, and shows it marked unreachable when the provider cannot be asked", async () => {
    const { home } = freshHome();
    let codexUp = true;
    const sources = { claude: async () => [opus], codex: async () => { if (!codexUp) throw new Error("Codex is not signed in"); return [sol]; }, antigravity: async () => [flash] };
    await new Catalog(home, sources).refresh();
    expect(existsSync(join(home, "catalog.json"))).toBe(true);
    codexUp = false;
    // A Mac started again, asking afresh.
    const restarted = new Catalog(home, sources);
    await restarted.refresh();
    expect(restarted.view().find(provider => provider.provider === "codex")).toEqual({
      provider: "codex", label: "CODEX", reachable: false, reason: "Codex is not signed in", models: [sol]
    });
    expect(restarted.view().map(provider => provider.label)).toEqual(["CLAUDE", "CODEX", "ANTIGRAVITY"]);
    // A choice is not refused only because its provider could not be asked just now.
    expect(restarted.offers({ provider: "codex", model: "gpt-6.1-sol" })).toBe(true);
    expect(JSON.parse(readFileSync(join(home, "catalog.json"), "utf8")).codex).toEqual([sol]);
  });

  it("says why a provider that was never reached offers nothing", async () => {
    const { home } = freshHome();
    const catalog = new Catalog(home, { claude: async () => [opus], codex: async () => [sol], antigravity: async () => { throw new Error("spawn agy ENOENT"); } });
    await catalog.refresh();
    expect(catalog.view().find(provider => provider.provider === "antigravity")).toEqual({
      provider: "antigravity", label: "ANTIGRAVITY", reachable: false, reason: "spawn agy ENOENT", models: []
    });
    // With nothing known, nothing can be checked, so nothing is refused.
    expect(catalog.offers({ provider: "antigravity", model: "gemini-3.8-flash" })).toBe(true);
  });
});
