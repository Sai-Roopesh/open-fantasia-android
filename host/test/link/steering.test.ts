import { afterEach, describe, expect, it } from "vitest";
import { fakeWriterAnswer } from "../../src/models/fake.js";
import type { Script } from "../../src/models/scripted.js";
import type { BackstageView } from "../../src/protocol/generated/link.js";
import { answerNotes, besideOf, learnLesson } from "../../src/store/beside.js";
import { playable } from "../support/play.js";
import { served } from "./served.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

type Refusal = { error: { code: string; message: string } };

/** The Writer's answer, with the Scene rated at the top of the scale: it peaked. */
const peaked: Script = { from: request => {
  const answer = fakeWriterAnswer(request) as { answer: string };
  return { answer: JSON.stringify({ ...JSON.parse(answer.answer) as object, intensity: 5 }) };
} };

describe("the player steers over the link", () => {
  // WHEN the player writes in the brief "more danger, more mysteries that aren't in the books"
  // THEN the next Stretch brings a danger or a mystery of the Story's own
  it("long-run › The player steers with a brief and reactions › A brief from the phone", async () => {
    const story = await served(playable());
    closers.push(story.close);
    const { call, storyId, engine, models, scene, post, path, mac } = story;
    const wish = "more danger, more mysteries that aren't in the books";
    const before = path().length;
    const set = await post<{ head_entry_id: string }>("brief", { more: [` ${wish} `, ""], less: [] });
    expect(set.status).toBe(200);
    // It is kept beside the Story, not on the Path (docs/adr/0020), and the Scene shows it.
    expect(path()).toHaveLength(before);
    expect(besideOf(mac, storyId).brief).toEqual({ more: [wish], less: [] });
    expect((await scene()).brief).toEqual({ more: [wish], less: [] });

    await post("moves", { text: "I say goodnight.", after: (await scene()).head_entry_id });
    await engine.settled(storyId);
    await post("end-scene", { after: (await scene()).head_entry_id });
    await engine.ended(storyId);
    // The Director plans the next Stretch from the brief, and the Stretch brings a mystery of the Story's own.
    const asked = models.director.requests.at(-1)!;
    expect(`${asked.system}\n${asked.prompt}`).toContain(`More of:\n- ${wish}`);
    const backstage = await (await call(`/stories/${storyId}/backstage`)).json() as BackstageView;
    expect(backstage.new_things).toEqual([{ kind: "mystery", what: "A locked door nobody admits to.", stretch: "This Stretch" }]);
  });

  it("refuses a brief that does not match the contract, and takes one wherever the phone is on the Path, since the brief is on none", async () => {
    const story = await served(playable());
    closers.push(story.close);
    const { post, mac, storyId } = story;
    expect((await post("brief", { more: "danger" })).status).toBe(400);
    expect((await post("brief", { after: "an-old-head", more: [], less: ["the library"] })).status, "a brief names no place on the Path").toBe(400);
    expect((await post("brief", { more: [], less: ["the library"] })).status).toBe(200);
    expect(besideOf(mac, storyId).brief).toEqual({ more: [], less: ["the library"] });
  });

  it("deletes a lesson from the Story's Taste or the player's own, refusing one that is not there", async () => {
    const story = await served(playable());
    closers.push(story.close);
    const { post, mac, storyId, call } = story;
    learnLesson(mac, storyId, "story", "Keep school procedure to a line.");
    learnLesson(mac, storyId, "player", "Don't decide what my character feels.");
    const backstage = async () => await (await call(`/stories/${storyId}/backstage`)).json() as BackstageView;
    expect(await backstage()).toMatchObject({ taste: ["Keep school procedure to a line."], player_taste: ["Don't decide what my character feels."] });
    const wrong = await post<Refusal>("taste/remove", { line: "Keep school procedure to a line.", scope: "player" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toBe("That is not a line of your own Taste.");
    expect((await post("taste/remove", { line: "Keep school procedure to a line.", scope: "story", after: "a-head" })).status).toBe(400);
    expect((await post("taste/remove", { line: "Keep school procedure to a line.", scope: "story" })).status).toBe(200);
    expect((await post("taste/remove", { line: "Don't decide what my character feels.", scope: "player" })).status).toBe(200);
    expect(await backstage()).toMatchObject({ taste: [], player_taste: [] });
  });

  it("keeps the player's steering notes beside the Story, shows each until the Director has answered it, and deletes one", async () => {
    const story = await served(playable());
    closers.push(story.close);
    const { post, mac, storyId, call } = story;
    const note = "Year One ends with Draconia breaking from her father";
    const written = await post<BackstageView>("notes", { text: ` ${note} ` });
    expect(written.status).toBe(200);
    expect(written.body.notes).toEqual([{ id: expect.any(String), text: note, written_at: expect.any(String), answered: false }]);
    expect((await post<Refusal>("notes", { text: "  " })).body.error.message).toBe("Write what you want the Story to do.");
    expect((await post("notes", { words: note })).status).toBe(400);
    // The Director answers it with the next Outline; it stays, marked answered.
    answerNotes(mac, storyId, 2);
    const id = written.body.notes[0]!.id;
    expect(besideOf(mac, storyId).notes).toEqual([{ id, text: note, writtenAt: expect.any(String), answeredBy: 2 }]);
    const dropped = await call(`/stories/${storyId}/notes/${id}`, { method: "DELETE", body: "{}" });
    expect(dropped.status).toBe(200);
    expect((await dropped.json() as BackstageView).notes).toEqual([]);
    expect((await call(`/stories/${storyId}/notes/${id}`, { method: "DELETE", body: "{}" })).status).toBe(404);
    expect((await call("/stories/nowhere/notes", { method: "POST", body: JSON.stringify({ text: note }) })).status).toBe(404);
  });

  it("takes a reaction to a played Scene, shows it on the Day View and in How it's going, and the next plan is made knowing it", async () => {
    // The second Scene peaks, so the Director plans again at its end.
    const story = await served(playable(undefined, { writer: [{ from: fakeWriterAnswer }, peaked] }));
    closers.push(story.close);
    const { call, storyId, engine, models, scene, post } = story;
    const backstage = async () => await (await call(`/stories/${storyId}/backstage`)).json() as BackstageView;
    await post("moves", { text: "I say goodnight.", after: (await scene()).head_entry_id });
    await engine.settled(storyId);
    await post("end-scene", { after: (await scene()).head_entry_id });
    await engine.ended(storyId);

    const unplayed = await post<Refusal>("reaction", { scene_number: 9, reaction: "more" });
    expect(unplayed.status).toBe(400);
    expect(unplayed.body.error.message).toBe("Scene 9 has not been played on this Path.");
    expect((await post("reaction", { scene_number: 1, reaction: "less", note: "too quiet" })).status).toBe(200);
    expect((await scene()).day_view!.reaction).toBe("less");
    expect((await backstage()).how_its_going).toMatchObject({ more: 0, less: 1 });
    // Taken back, then given again.
    await post("reaction", { scene_number: 1, reaction: null });
    expect((await scene()).day_view!.reaction).toBeNull();
    expect((await backstage()).how_its_going).toMatchObject({ more: 0, less: 0 });
    await post("reaction", { scene_number: 1, reaction: "less", note: "too quiet" });

    await post("moves", { text: "In the morning I go down to breakfast.", after: (await scene()).head_entry_id });
    await engine.settled(storyId);
    await post("end-scene", { after: (await scene()).head_entry_id });
    await engine.ended(storyId);
    expect(models.director.requests).toHaveLength(2);
    expect(models.director.requests[1]!.prompt).toContain("- Scene 1, After curfew: less like this (too quiet)");
  });
});
