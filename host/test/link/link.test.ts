import { afterEach, describe, expect, it } from "vitest";
import linkSchema from "../../../protocol/schemas/link.schema.json" with { type: "json" };
import { ScriptedRunner } from "../../src/models/scripted.js";
import { CONTRACT_VERSION } from "../../src/protocol/generated/contract.js";
import type { SceneView } from "../../src/protocol/generated/link.js";
import { Traces } from "../../src/trace.js";
import { fakeWriterAnswer } from "../../src/models/fake.js";
import { GatedRunner, HeldRunner, openStream, runningMac, type ReceivedEvent } from "../support/link.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function mac(actor?: ConstructorParameters<typeof ScriptedRunner>[0] | GatedRunner) {
  const running = await runningMac(actor instanceof GatedRunner ? actor : new ScriptedRunner(actor ?? []));
  closers.push(running.close);
  return running;
}

/** What the phone ends up showing as the Reply, from the events it received. */
function shownReply(events: ReceivedEvent[]): string {
  let writing = "";
  let finished: string | null = null;
  for (const { event } of events) {
    if (event.kind === "reply_started") writing = "";
    if (event.kind === "reply_delta") writing += event.text;
    if (event.kind === "reply") finished = event.passage!.text;
  }
  return finished ?? writing;
}

describe("mac-link", () => {
  // WHEN the player runs the pairing command on the Mac and scans the QR code it shows with the phone
  // THEN the phone lists the Mac's Stories
  it("mac-link › Pairing happens once, by QR code › First pairing", async () => {
    const { call } = await mac();
    const response = await call("/stories");
    expect(response.status).toBe(200);
    expect((await response.json() as { stories: { title: string }[] }).stories.map(story => story.title)).toEqual(["The Malfoy Problem"]);
  });

  // WHEN a device that never paired sends a Move to the Mac
  // THEN the Mac refuses it and nothing changes
  it("mac-link › Pairing happens once, by QR code › An unpaired phone", async () => {
    const { base, storyId, mac: store, headers } = await mac();
    const before = store.db.prepare("SELECT COUNT(*) AS n FROM entries").get();
    const response = await fetch(`${base}/stories/${storyId}/moves`, {
      method: "POST",
      headers: { ...headers, authorization: "Bearer not-a-token" },
      body: JSON.stringify({ text: "I wave.", after: store.tree.currentPath(storyId)!.headEntryId })
    });
    expect(response.status).toBe(401);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("unpaired");
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM entries").get()).toEqual(before);
  });

  // WHEN the Mac starts writing a Reply
  // THEN the phone shows its words as they are written, in order
  it("mac-link › A Story's changes reach the phone live and in order › A Reply arrives live", async () => {
    const { base, headers, storyId, call } = await mac([{ answer: "She sets down her glass and does not look at you." }]);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const stream = openStream(base, storyId, headers, String(scene.seq));
    closers.push(stream.close);
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I raise my glass.", after: scene.head_entry_id }) });
    await stream.until(events => events.some(event => event.event.kind === "reply"));
    const kinds = stream.received.map(event => event.event.kind);
    expect(kinds[0]).toBe("move");
    expect(kinds[1]).toBe("reply_started");
    expect(kinds.filter(kind => kind === "reply_delta").length).toBeGreaterThan(3);
    expect(kinds.at(-1)).toBe("reply");
    const deltas = stream.received.filter(event => event.event.kind === "reply_delta").map(event => event.event.text).join("");
    expect(deltas).toBe("She sets down her glass and does not look at you.");
  });

  // GIVEN the connection drops while a Reply is being written and returns after the Reply is finished
  // THEN the phone shows the whole finished Reply and everything after it, with nothing missing or repeated
  it("mac-link › A dropped connection loses nothing › Wi-Fi drops mid-Reply", async () => {
    const words = ["She ", "turns ", "the ", "glass ", "in ", "her ", "fingers."];
    const actor = new GatedRunner(words);
    const { base, headers, storyId, call, engine } = await mac(actor);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const first = openStream(base, storyId, headers, String(scene.seq));
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I wait.", after: scene.head_entry_id }) });
    await actor.ready();
    actor.release(3);
    await first.until(events => events.filter(event => event.event.kind === "reply_delta").length === 3);
    await first.close();

    // The Reply finishes while the phone is away.
    for (let index = 3; index < words.length; index++) {
      await actor.ready();
      actor.release();
    }
    await engine.settled(storyId);

    const second = openStream(base, storyId, headers, first.received.at(-1)!.id);
    closers.push(second.close);
    await second.until(events => events.some(event => event.event.kind === "reply"));
    const all = [...first.received, ...second.received];
    expect(new Set(all.map(event => event.id)).size).toBe(all.length);
    expect(shownReply(all)).toBe(words.join(""));
  });

  it("resumes a Reply still being written from the word the phone last saw", async () => {
    const words = ["One ", "two ", "three ", "four ", "five."];
    const actor = new GatedRunner(words);
    const { base, headers, storyId, call, engine } = await mac(actor);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const first = openStream(base, storyId, headers, String(scene.seq));
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "Count.", after: scene.head_entry_id }) });
    await actor.ready();
    actor.release(2);
    await first.until(events => events.filter(event => event.event.kind === "reply_delta").length === 2);
    await first.close();
    await actor.ready();
    actor.release();
    await actor.ready();

    const second = openStream(base, storyId, headers, first.received.at(-1)!.id);
    closers.push(second.close);
    await second.until(events => events.filter(event => event.event.kind === "reply_delta").length === 1);
    actor.release(2);
    await engine.settled(storyId);
    await second.until(events => events.some(event => event.event.kind === "reply"));
    const all = [...first.received, ...second.received];
    expect(new Set(all.map(event => event.id)).size).toBe(all.length);
    expect(all.filter(event => event.event.kind === "reply_delta").map(event => event.event.text).join("")).toBe(words.join(""));
  });

  // GIVEN the Mac speaks a newer contract than the app
  // WHEN the app connects
  // THEN the app says it needs updating to match the Mac
  it("mac-link › The phone and the Mac agree on what they speak › An old app", async () => {
    const { call } = await mac();
    const response = await call("/stories", { headers: { "fantasia-contract": "0" } });
    expect(response.status).toBe(426);
    const body = await response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("version_mismatch");
    expect(body.error.message).toMatch(/Update the app to match your Mac/);
    expect(response.headers.get("fantasia-contract")).toBe(String(CONTRACT_VERSION));
  });

  // GIVEN the app showed a failure with its trace id
  // WHEN that trace id is looked up on the Mac
  // THEN the Mac shows what was asked, what happened, and any model call involved
  it("mac-link › Every request is answered or refused with a reason › Looking up a failure", async () => {
    const { call, storyId, engine, mac: store } = await mac([{ fail: "Claude is overloaded" }]);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const accepted = await (await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I wave.", after: scene.head_entry_id }) })).json() as { trace_id: string };
    await engine.settled(storyId);
    const failed = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    expect(failed.turn.trace_id).toBe(accepted.trace_id);
    const described = new Traces(store.db).describe(failed.turn.trace_id!)!;
    expect(described).toContain(`POST /stories/${storyId}/moves`);
    expect(described).toContain("I wave.");
    expect(described).toContain("Failed: Claude is overloaded");
    expect(described).toContain("System prompt:");
  });

  it("refuses a Move while a Reply is being written, with a reason and a trace id", async () => {
    const actor = new GatedRunner(["Slowly."]);
    const { call, storyId, engine } = await mac(actor);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I wave.", after: scene.head_entry_id }) });
    const refused = await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I wave again.", after: scene.head_entry_id }) });
    expect(refused.status).toBe(409);
    const body = await refused.json() as { error: { message: string; trace_id: string } };
    expect(body.error.message).toMatch(/still being written/);
    expect(body.error.trace_id).toMatch(/\w+/);
    await actor.ready();
    actor.release();
    await engine.settled(storyId);
  });

  it("ends a Scene, sets Focus and Linger, and redoes a Reply, each change reaching the phone live", async () => {
    const { base, headers, storyId, call, engine } = await mac([{ answer: "Draconia laughs." }, { answer: "Hermione does not laugh." }]);
    const post = async (path: string, body: unknown) => {
      const response = await call(`/stories/${storyId}/${path}`, { method: "POST", body: JSON.stringify(body) });
      expect(response.status, path).toBe(200);
      return await response.json() as { head_entry_id: string; trace_id: string };
    };
    const view = async () => await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const stream = openStream(base, storyId, headers, String((await view()).seq));
    closers.push(stream.close);

    await post("moves", { text: "I raise my glass.", after: (await view()).head_entry_id });
    await engine.settled(storyId);
    const focused = await post("focus", { after: (await view()).head_entry_id, on: "Hermione Granger" });
    expect(focused.head_entry_id).toBe((await view()).head_entry_id);
    await post("linger", { after: (await view()).head_entry_id, on: true });
    expect(await view()).toMatchObject({ focus: "Hermione Granger", linger: true, day_view: null });

    await post("redo", { after: (await view()).head_entry_id, direction: "less Draconia", remember: false });
    await engine.settled(storyId);
    expect((await view()).exchanges.at(-1)!.reply!.text).toBe("Hermione does not laugh.");

    await post("end-scene", { after: (await view()).head_entry_id });
    expect((await view()).day_view).toMatchObject({ place: "The Three Broomsticks" });
    // The World moves on after the Scene ends, and that reaches the phone too.
    await stream.until(events => events.some(event => event.event.kind === "world_moved"));
    const kinds = stream.received.map(event => event.event.kind).filter(kind => kind !== "reply_delta");
    expect(kinds).toEqual(["move", "reply_started", "reply", "focus_set", "linger_set", "redo", "reply_started", "reply", "scene_closed", "world_moved"]);
    expect(stream.received.find(event => event.event.kind === "focus_set")!.event.focus).toBe("Hermione Granger");
    expect(stream.received.find(event => event.event.kind === "scene_closed")!.event.day_view).toMatchObject({ place: "The Three Broomsticks" });
  });

  it("takes a choice at the Day View as a turn, and refuses one without its kind", async () => {
    const { call, storyId, engine } = await mac([{ answer: "Draconia laughs." }]);
    const view = async () => await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I say goodnight.", after: (await view()).head_entry_id }) });
    await engine.settled(storyId);
    await call(`/stories/${storyId}/end-scene`, { method: "POST", body: JSON.stringify({ after: (await view()).head_entry_id }) });
    await engine.woven(storyId);
    const day = await view();
    const refused = await call(`/stories/${storyId}/choose`, { method: "POST", body: JSON.stringify({ after: day.head_entry_id, gap: null }) });
    expect(refused.status).toBe(400);
    const skip = day.day_view!.choices.skips[0]!;
    const accepted = await call(`/stories/${storyId}/choose`, { method: "POST", body: JSON.stringify({ after: day.head_entry_id, kind: "skip", at: skip.at, gap: null }) });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ move_entry_id: expect.any(String), trace_id: expect.any(String) });
    await engine.settled(storyId);
  });

  it("takes a choice the way the phone sends it: the Gap in the player's words, the fields its kind does not use as null", async () => {
    const { call, storyId, engine } = await mac([{ answer: "Draconia laughs." }]);
    const view = async () => await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I say goodnight.", after: (await view()).head_entry_id }) });
    await engine.settled(storyId);
    await call(`/stories/${storyId}/end-scene`, { method: "POST", body: JSON.stringify({ after: (await view()).head_entry_id }) });
    await engine.woven(storyId);
    const day = await view();
    const skip = day.day_view!.choices.skips.at(-1)!;
    // Byte for byte what the phone's encoder writes for a Skip (LinkClientTest on the phone pins the same body).
    const body = `{"after":"${day.head_entry_id}","at":"${skip.at}","gap":"I ride on to Shimla.","happening":null,"kind":"skip","place":null,"who":null}`;
    const accepted = await call(`/stories/${storyId}/choose`, { method: "POST", body });
    expect(accepted.status).toBe(200);
    await engine.settled(storyId);
  });

  // GIVEN the Night Train's Day View at 9:05 am
  // WHEN the player chooses Skip to later, This evening, and writes "I ride on to Shimla, go to the interview at eleven, and come out not sure of anything."
  // THEN the Scene opens at once with that Move, under a card that says Friday 6:00 pm and that the Scene is being written
  // AND the card takes the Scene's title, place and Portraits when the Scene has opened
  it("presence › Between Scenes is quiet, and shows progress › The next Scene is being written: a phone that reads the Scene mid-wait sees it", async () => {
    const writer = new HeldRunner(new ScriptedRunner([], fakeWriterAnswer));
    const running = await runningMac(new ScriptedRunner([{ answer: "Draconia laughs." }]), writer);
    closers.push(running.close);
    const { call, storyId, engine, base, headers } = running;
    const view = async () => await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I say goodnight.", after: (await view()).head_entry_id }) });
    await engine.settled(storyId);
    await call(`/stories/${storyId}/end-scene`, { method: "POST", body: JSON.stringify({ after: (await view()).head_entry_id }) });
    await engine.woven(storyId);
    const day = await view();
    const skip = day.day_view!.choices.skips[0]!;
    writer.hold();
    const stream = openStream(base, storyId, headers, day.last_event_id);
    closers.push(stream.close);
    await call(`/stories/${storyId}/choose`, { method: "POST", body: JSON.stringify({ after: day.head_entry_id, kind: "skip", at: skip.at, gap: "I sleep." }) });
    const opening = await view();
    expect(opening.day_view).toBeNull();
    expect(opening.opening).toMatchObject({ at: skip.at, at_label: expect.stringContaining(skip.time) });
    expect(opening.exchanges.map(exchange => exchange.move?.text)).toEqual([expect.stringMatching(/^I sleep\. I let the time pass until /)]);
    await stream.until(events => events.some(event => event.event.kind === "move"));
    expect(stream.received.find(event => event.event.kind === "move")!.event.opening).toEqual(opening.opening);
    // A phone that reconnects mid-wait is sent the same Move, with the same card.
    const again = openStream(base, storyId, headers, day.last_event_id);
    closers.push(again.close);
    await again.until(events => events.some(event => event.event.kind === "move"));
    expect(again.received.find(event => event.event.kind === "move")!.event.opening).toEqual(opening.opening);
    writer.release();
    await engine.settled(storyId);
    expect((await view()).opening).toBeNull();
  });

  it("lets every field a request may leave out also be null, since the phone writes every field it has", () => {
    const defs = (linkSchema as { $defs: Record<string, { type?: string; required?: string[]; properties?: Record<string, { type?: string | string[] }> }> }).$defs;
    const strict = Object.entries(defs)
      .filter(([name, def]) => name.endsWith("Request") && def.type === "object")
      .flatMap(([name, def]) => Object.entries(def.properties ?? {})
        .filter(([field, property]) => !(def.required ?? []).includes(field) && ![property.type].flat().includes("null"))
        .map(([field]) => `${name}.${field}`));
    expect(strict).toEqual([]);
  });

  it("answers Retry for the World only when the World could not move on", async () => {
    const { call, storyId } = await mac();
    const refused = await call(`/stories/${storyId}/world/retry`, { method: "POST", body: "{}" });
    expect(refused.status).toBe(400);
    expect((await refused.json() as { error: { message: string } }).error.message).toMatch(/not waiting on anything/);
  });

  it("refuses End scene, Focus, Linger and Redo while a Reply is being written, with the reason", async () => {
    const actor = new GatedRunner(["Slowly."]);
    const { call, storyId, engine } = await mac(actor);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I wave.", after: scene.head_entry_id }) });
    for (const [path, body] of [["end-scene", {}], ["focus", { on: "Hermione Granger" }], ["linger", { on: true }], ["redo", { direction: null, remember: false }]] as const) {
      const refused = await call(`/stories/${storyId}/${path}`, { method: "POST", body: JSON.stringify({ after: scene.head_entry_id, ...body }) });
      expect(refused.status, path).toBe(409);
      expect((await refused.json() as { error: { message: string } }).error.message, path).toMatch(/still being written/);
    }
    await actor.ready();
    actor.release();
    await engine.settled(storyId);
  });

  it("refuses a command that does not match the contract", async () => {
    const { call, storyId } = await mac();
    for (const [path, body] of [["end-scene", {}], ["focus", { after: "x" }], ["linger", { after: "x", on: "yes" }], ["redo", { after: "x", direction: "less" }]] as const) {
      const refused = await call(`/stories/${storyId}/${path}`, { method: "POST", body: JSON.stringify(body) });
      expect(refused.status, path).toBe(400);
    }
  });

  it("says in the Scene view how far into a Reply it is, so reading it mid-Reply repeats no word", async () => {
    const words = ["One ", "two ", "three ", "four."];
    const actor = new GatedRunner(words);
    const { base, headers, storyId, call, engine } = await mac(actor);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "Count.", after: scene.head_entry_id }) });
    await actor.ready();
    actor.release(2);
    await actor.ready();
    const midway = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    expect(midway.turn).toMatchObject({ kind: "writing", text_so_far: "One two " });
    expect(midway.last_event_id).toMatch(/^\d+\.2$/);
    actor.release();
    await actor.ready();
    const stream = openStream(base, storyId, headers, midway.last_event_id);
    closers.push(stream.close);
    await stream.until(events => events.some(event => event.event.kind === "reply_delta"));
    actor.release();
    await engine.settled(storyId);
    await stream.until(events => events.some(event => event.event.kind === "reply"));
    expect(stream.received.filter(event => event.event.kind === "reply_delta").map(event => event.event.text).join("")).toBe("three four.");
    expect(stream.received.some(event => event.event.kind === "reply_started")).toBe(false);
  });

  // GIVEN the player is in Scene 14
  // THEN Scenes 1 to 13 appear above it as one-line summaries
  // AND tapping Scene 13's summary shows that Scene in full
  it("scenes › Every Scene opens with a title card › Scrolling back", async () => {
    const { call, storyId, engine } = await mac([{ answer: "Draconia laughs." }, { answer: "Breakfast is loud." }, { answer: "The library is quiet." }]);
    const view = async () => await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const post = (path: string, body: unknown) => call(`/stories/${storyId}/${path}`, { method: "POST", body: JSON.stringify(body) });
    for (const move of ["I raise my glass.", "In the morning I go to breakfast.", "After breakfast I go to the library."]) {
      await post("moves", { text: move, after: (await view()).head_entry_id });
      await engine.settled(storyId);
      await post("end-scene", { after: (await view()).head_entry_id });
      await engine.chronicled(storyId);
    }
    await post("moves", { text: "I go up to the tower.", after: (await view()).head_entry_id });
    await engine.settled(storyId);
    await engine.chronicled(storyId);

    const shown = await view();
    expect(shown.scene.number).toBe(4);
    expect(shown.earlier_scenes.map(scene => scene.number)).toEqual([1, 2, 3]);
    expect(shown.earlier_scenes.every(scene => scene.summary.length > 0)).toBe(true);

    const third = await call(`/stories/${storyId}/scenes/3`);
    expect(third.status).toBe(200);
    const past = await third.json() as { number: number; summary: string; exchanges: { move: { text: string } | null; reply: { text: string } | null }[] };
    expect(past).toMatchObject({ number: 3, summary: shown.earlier_scenes[2]!.summary });
    expect(past.exchanges.map(exchange => [exchange.move?.text, exchange.reply?.text])).toEqual([["After breakfast I go to the library.", "The library is quiet."]]);
    expect((await call(`/stories/${storyId}/scenes/9`)).status).toBe(404);
  });
});
