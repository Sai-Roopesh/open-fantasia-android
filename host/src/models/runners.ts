import { CLAUDE_TOKEN, readSecret } from "../secrets.js";
import { AntigravityRunner } from "./antigravity.js";
import { AntigravityDirectRunner } from "./antigravity-direct.js";
import { ClaudeRunner } from "./claude.js";
import { CodexRunner } from "./codex.js";
import { CodexDirectRunner } from "./codex-direct.js";
import { preferDirect } from "./direct.js";
import type { OfferedModel } from "./catalog.js";
import type { ModelRunner } from "./model-call.js";
import type { ModelChoice } from "../story/state.js";

/** A provider's runner, which can also say what the provider offers. */
export type ListingRunner = ModelRunner & { listModels(): Promise<OfferedModel[]> };
export type Runners = Record<ModelChoice["provider"], ListingRunner> & { close(): void };

/**
 * A way to every provider through the player's own subscriptions (docs/adr/0005), each started on first use. Codex
 * and Antigravity are called directly, on the sign-in their own tools keep (docs/adr/0023); the tools stay as the way
 * back when that sign-in needs renewing, and for listing models.
 */
export function subscriptionRunners(home: string): Runners {
  const claude = new ClaudeRunner(home, () => readSecret(CLAUDE_TOKEN));
  const codexCli = new CodexRunner(home);
  const antigravityCli = new AntigravityRunner(home);
  const codexDirect = new CodexDirectRunner();
  const codex = {
    ...preferDirect(codexDirect, codexCli),
    listModels: async () => {
      try {
        return await codexDirect.listModels();
      } catch (directError) {
        try {
          return await codexCli.listModels();
        } catch {
          throw directError;
        }
      }
    }
  };
  const antigravityDirect = new AntigravityDirectRunner();
  const antigravity = {
    ...preferDirect(antigravityDirect, antigravityCli),
    listModels: async () => {
      try {
        return await antigravityDirect.listModels();
      } catch (directError) {
        try {
          return await antigravityCli.listModels();
        } catch {
          throw directError;
        }
      }
    }
  };
  return { claude, codex, antigravity, close: () => { claude.close(); codexCli.close(); antigravityCli.close(); } };
}

/** One scripted runner standing in for every provider, so a setting on any of them plays without spending quota. */
export function scriptedRunners(runner: ModelRunner, offered: Partial<Record<ModelChoice["provider"], OfferedModel[]>> = SCRIPTED_OFFERS): Runners {
  const listing = (provider: ModelChoice["provider"]): ListingRunner => ({
    ...(runner.canLookUp ? { canLookUp: runner.canLookUp } : {}),
    run: (request, onText, signal, tools) => runner.run(request, onText, signal, tools),
    listModels: async () => offered[provider] ?? []
  });
  return { claude: listing("claude"), codex: listing("codex"), antigravity: listing("antigravity"), close: () => {} };
}

const upTo = (top: string) => ["low", "medium", "high", "xhigh", "max", "ultra"].slice(0, ["low", "medium", "high", "xhigh", "max", "ultra"].indexOf(top) + 1);

/**
 * What scripted models say the providers offer: a few of each, as they listed them on 6 October 2026. `fantasia serve
 * --fake-models` shows these on the Models screen, and the tests use them.
 */
export const SCRIPTED_OFFERS: Record<ModelChoice["provider"], OfferedModel[]> = {
  claude: [
    { id: "claude-opus-5-5", aliases: ["opus"], name: "Opus 5.5", efforts: upTo("max"), defaultEffort: null },
    { id: "claude-fable-5-1", aliases: ["fable"], name: "Fable 5.1", efforts: upTo("max"), defaultEffort: null },
    { id: "claude-sonnet-5-5", aliases: ["sonnet"], name: "Sonnet 5.5", efforts: upTo("max"), defaultEffort: null },
    { id: "claude-haiku-4-5-20251001", aliases: ["haiku", "claude-haiku-4-5"], name: "Haiku 4.5", efforts: [], defaultEffort: null }
  ],
  codex: [
    { id: "gpt-6.1-sol", aliases: [], name: "GPT 6.1 Sol", efforts: upTo("ultra"), defaultEffort: "low" },
    { id: "gpt-6-luna", aliases: [], name: "GPT 6 Luna", efforts: upTo("max"), defaultEffort: "medium" }
  ],
  antigravity: [
    { id: "gemini-3.8-flash", aliases: [], name: "Gemini 3.8 Flash", efforts: ["low", "medium", "high"], defaultEffort: "medium" }
  ]
};

