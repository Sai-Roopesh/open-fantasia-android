import { afterEach, describe, expect, it } from "vitest";
import type { BackstageView, SceneView } from "../../src/protocol/generated/link.js";
import { openStream, runningMac } from "../support/link.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

describe("the Director's plan over the link", () => {
  // WHEN the Director plans the next Stretch
  // THEN its plan appears in Backstage and nowhere in the Scene, the Day View, the World screen or the Journal
  it("long-run › The Director shapes the long run around Arcs and Landmarks › The plan stays Backstage", async () => {
    const running = await runningMac();
    closers.push(running.close);
    const { call, storyId, engine, base, headers } = running;
    const view = async () => await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const post = (path: string, body: unknown) => call(`/stories/${storyId}/${path}`, { method: "POST", body: JSON.stringify(body) });
    const stream = openStream(base, storyId, headers, (await view()).last_event_id, (await view()).path_id, (await view()).head_entry_id);

    await post("moves", { text: "I say goodnight.", after: (await view()).head_entry_id });
    await engine.settled(storyId);
    await post("end-scene", { after: (await view()).head_entry_id });
    await engine.directed(storyId);

    const backstage = await (await call(`/stories/${storyId}/backstage`)).json() as BackstageView;
    expect(backstage.director).toEqual({ toward: "what comes next", phase: "build", line: "Building toward what comes next. This stretch builds; rest comes after it." });

    // The plan's own words: what it builds toward, a Scene that matters, an Arc's step and what is not yet, a Lead's
    // move, the roadmap, and how the Premise comes in.
    const planWords = ["what comes next", "A step for the Story.", "Something else in his life.", "anything more", "does something about him", "a step further than now", "Some Scenes serve the Premise"];
    const elsewhere = {
      scene: await (await call(`/stories/${storyId}/scene`)).text(),
      dayView: JSON.stringify((await view()).day_view),
      stories: await (await call("/stories")).text(),
      journal: await (await call(`/stories/${storyId}/journal`)).text(),
      pastScene: await (await call(`/stories/${storyId}/scenes/1`)).text(),
      paths: await (await call(`/stories/${storyId}/paths`)).text()
    };
    await stream.close();
    const events = JSON.stringify(stream.received);
    for (const [where, text] of Object.entries({ ...elsewhere, events })) {
      for (const words of planWords) expect(text.includes(words), `${where} says "${words}"`).toBe(false);
    }
    expect((await view()).day_view).not.toBeNull();
  });
});
