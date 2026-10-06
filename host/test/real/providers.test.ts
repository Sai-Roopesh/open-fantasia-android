import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, describe, expect, it } from "vitest";
import { WEAVER_SCHEMA } from "../../src/agents/weaver.js";
import { Models, type ModelRequest } from "../../src/models/model-call.js";
import { subscriptionRunners } from "../../src/models/runners.js";
import type { ModelChoice } from "../../src/story/state.js";
import { freshHome } from "../support/host.js";

// One short call to each provider through the player's own subscription (docs/adr/0005), plain and with the Weaver's
// schema: what proves a runner still speaks to the CLI it was built against. Runs only with `npm run test:real`.
const mac = freshHome();
const runners = subscriptionRunners(mac.home);
const models = new Models(mac.db, runners);
afterAll(() => runners.close());

const PROVIDERS: ModelChoice[] = [
  { provider: "claude", model: "claude-sonnet-5-5" },
  { provider: "codex", model: "gpt-6.1-sol", effort: "low" },
  { provider: "antigravity", model: "gemini-3.8-flash", effort: "low" }
];

const ask = (model: ModelChoice, extra: Partial<ModelRequest> = {}): ModelRequest => ({
  agent: "weaver", model, traceId: `live-${model.provider}`, storyId: null,
  system: "You write one line of a story when asked. Answer only with what is asked.",
  prompt: "A woman on a night train to Kalka looks up from her book. In one sentence, what does she see?",
  ...extra
});

describe.each(PROVIDERS)("a real call on $provider $model", model => {
  it("lists what the provider offers, this model among them", async () => {
    const offered = await runners[model.provider].listModels();
    const found = offered.find(option => option.id === model.model || option.aliases.includes(model.model));
    expect(found, JSON.stringify(offered.map(option => option.id))).toBeDefined();
    if (model.effort) expect(found!.efforts).toContain(model.effort);
  });

  it("streams words and answers", async () => {
    const words: string[] = [];
    const answer = await models.call(ask(model), delta => words.push(delta));
    expect(answer.text.trim().length).toBeGreaterThan(10);
    expect(words.join("").trim().length).toBeGreaterThan(0);
  });

  it("answers the Weaver's schema", async () => {
    const answer = await models.call(ask(model, {
      system: "You move a story's World on between Scenes. Answer only with JSON.",
      prompt: "Day 1, 9:40 pm to Day 2, 7:10 am. Hermione went up to bed; Ron stayed by the fire. Nothing else moved. Fill every list with what moved, empty if nothing; at most two lines of meanwhile.",
      schema: WEAVER_SCHEMA
    }));
    const check = new Ajv2020({ strict: false }).compile(WEAVER_SCHEMA);
    expect(check(answer.json), JSON.stringify(check.errors)).toBe(true);
  });
});
