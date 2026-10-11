import { afterEach, describe, expect, it } from "vitest";
import type { SceneView, StoryView } from "../../src/protocol/generated/link.js";
import { runningMac } from "../support/link.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function mac() {
  const running = await runningMac();
  closers.push(running.close);
  const { call, storyId } = running;
  const head = async () => (await (await call(`/stories/${storyId}/scene`)).json() as SceneView).head_entry_id;
  const send = async (method: "PUT" | "POST", path: string, body: Record<string, unknown>) =>
    await call(`/stories/${storyId}/${path}`, { method, body: JSON.stringify({ after: await head(), ...body }) });
  const story = async () => await (await call(`/stories/${storyId}/story`)).json() as StoryView;
  const message = async (response: Response) => (await response.json() as { error: { message: string } }).error.message;
  return { ...running, head, send, story, message };
}

describe("editing the Story over the link (editing-the-story design decision 4)", () => {
  it("shows The Story as it stands on the current Path", async () => {
    const { story, head } = await mac();
    const view = await story();
    expect(view).toMatchObject({
      title: "The Malfoy Problem",
      premise: "An enemies-to-lovers romance with Draconia Malfoy at Hogwarts as a university.",
      reply_length: "full",
      arcs: ["Draconia comes round to Roopesh, slowly, against everything she was raised to be."],
      world_summary: "Hogwarts as a university; everyone is eighteen.",
      places: [{ name: "The Three Broomsticks", description: "A pub in Hogsmeade." }],
      institutions: [],
      clock: { at: "Day 1 21:40", at_label: "Friday 6 September, 9:40 pm", day_one: "1991-09-06" },
      world_stands: "Day 1 21:40",
      head_entry_id: await head()
    });
    expect(view.landmarks).toEqual([{ name: "The Triwizard Tournament", at: "Day 720 18:00", at_label: "Wednesday 25 August 1993, 6:00 pm", when: expect.any(String), what: "The Tournament begins.", passed: false }]);
  });

  it("answers each edit with The Story as it now stands, from the head the phone saw", async () => {
    const { send, head } = await mac();
    const answer = async (response: Response) => { expect(response.status).toBe(200); return await response.json() as StoryView; };
    expect((await answer(await send("PUT", "premise", { premise: "A rivalry, slowly." }))).premise).toBe("A rivalry, slowly.");
    expect((await answer(await send("PUT", "style", { style: "Dry and British." }))).style).toBe("Dry and British.");
    expect((await answer(await send("PUT", "reply-length", { length: "short" }))).reply_length).toBe("short");
    expect((await answer(await send("PUT", "arcs", { arcs: ["Harry and Roopesh become friends."] }))).arcs).toEqual(["Harry and Roopesh become friends."]);
    const ball = await answer(await send("PUT", "landmarks/The%20Yule%20Ball", { at: "Day 100 19:00", what: "A dance.", create: true }));
    expect(ball.landmarks.map(landmark => landmark.name)).toEqual(["The Yule Ball", "The Triwizard Tournament"]);
    expect((await answer(await send("POST", "landmarks/The%20Yule%20Ball/drop", {}))).landmarks.map(landmark => landmark.name)).toEqual(["The Triwizard Tournament"]);
    expect((await answer(await send("PUT", "places/The%20Ministry%20of%20Magic", { description: "Slow and proud.", institution: true, create: true }))).institutions)
      .toEqual([{ name: "The Ministry of Magic", description: "Slow and proud." }]);
    expect((await answer(await send("PUT", "world", { summary: "Hogwarts, 1991.", history: "The war is over." }))).world_history).toBe("The war is over.");
    const clock = await answer(await send("PUT", "clock", { at: "Day 2 09:00", day_one: "1991-09-06" }));
    expect(clock.clock).toEqual({ at: "Day 2 09:00", at_label: "Saturday 7 September, 9:00 am", day_one: "1991-09-06" });
    expect(clock.head_entry_id).toBe(await head());
  });

  it("marks a Landmark the World has reached as passed, and refuses moving it, with the reason", async () => {
    const { send, story, message } = await mac();
    await send("PUT", "landmarks/The%20morning%20post", { at: "Day 2 08:00", what: "Owls.", create: true });
    await send("PUT", "clock", { at: "Day 2 09:00", day_one: "1991-09-06" });
    const view = await story();
    expect(view.world_stands).toBe("Day 2 09:00");
    expect(view.landmarks[0]).toMatchObject({ name: "The morning post", passed: true, when: null });
    const refused = await send("PUT", "landmarks/The%20morning%20post", { at: "Day 3 08:00", what: "Owls, late.", create: false });
    expect(refused.status).toBe(400);
    expect(await message(refused)).toBe("The morning post has already happened on this Path.");
  });

  it("rewords a lesson in Taste, and refuses an edit against a head the Story has moved past, or one it cannot take", async () => {
    const { call, storyId, send, message } = await mac();
    const missing = await send("POST", "taste/reword", { line: "keep Ron in the background", text: "x" });
    expect(missing.status).toBe(400);
    expect(await message(missing)).toBe("Taste has no such line.");
    const stale = await call(`/stories/${storyId}/premise`, { method: "PUT", body: JSON.stringify({ premise: "A romance.", after: "an-old-head" }) });
    expect(stale.status).toBe(409);
    const back = await send("PUT", "clock", { at: "Day 1 08:00", day_one: null });
    expect(await message(back)).toBe("The clock only moves on.");
    const malformed = await send("PUT", "reply-length", { length: "long" });
    expect(malformed.status).toBe(400);
  });
});
