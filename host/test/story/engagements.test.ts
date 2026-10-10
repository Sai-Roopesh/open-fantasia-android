import { describe, expect, it } from "vitest";
import { engagementsOn, occurrencesBetween } from "../../src/story/engagements.js";
import type { Engagement, EngagementChange } from "../../src/story/entries.js";
import { freshHome } from "../support/host.js";
import { malfoyProblemStoryFile } from "../support/story-files.js";

const model = { provider: "claude", model: "claude-sonnet-5-5" } as const;

/** A Story played Scene by Scene (each at Day n 09:00), its records hung off each Scene's end. */
function story() {
  const mac = freshHome();
  mac.db.prepare("INSERT INTO stories (id, title, folder, created_at) VALUES ('s', 'T', '/x', 'now')").run();
  const { tree } = mac;
  let at = tree.append("s", null, { kind: "story_set_up", storyFile: malfoyProblemStoryFile(), portraits: {} });
  const scene = (number: number, records: { engagements?: Engagement[]; changed?: EngagementChange[]; meanwhile?: Engagement[] } = {}) => {
    const opened = tree.append("s", at.id, { kind: "scene_opened", number, title: `Scene ${number}`, place: "The Great Hall", at: `Day ${number} 09:00`, who: [], prose: null, startsAt: null, purpose: null, exit: null });
    const move = tree.append("s", opened.id, { kind: "move", text: "I look up." });
    at = tree.append("s", move.id, { kind: "scene_closed", by: "player" });
    if (records.engagements || records.changed) tree.append("s", at.id, { kind: "chronicle", scene: opened.id, summary: null, sceneEnded: true, moments: [], told: [], engagements: records.engagements ?? [], changed: records.changed ?? [], callId: "c", model });
    if (records.meanwhile) tree.append("s", at.id, { kind: "world_moved", scene: opened.id, from: `Day ${number} 09:00`, until: `Day ${number} 10:00`, lives: [], threads: [], happened: [], happenings: [],
      meanwhile: records.meanwhile.map(engagement => ({ text: "A note.", how: "seen" as const, happened: "h", toldBy: null, engagement })), callId: "w", model });
    return { opened, closed: at };
  };
  return { mac, tree, scene, head: () => at.id };
}

const quotes = [{ entry: "e", text: "w" }];
const library: Engagement = { id: "g-library", what: "Draconia's hour.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week", quotes };
const summons: Engagement = { id: "g-office", what: "McGonagall's account.", at: "Day 2 09:00", place: "McGonagall's office", who: [], expected: true, every: null };

describe("what is on (engagements design decision 1)", () => {
  it("reads Engagements from the record and from Meanwhile, each with its next time ahead of the clock", () => {
    const { mac, scene, head } = story();
    scene(1, { meanwhile: [summons] });
    scene(5, { engagements: [library] });
    // Day 5 at nine: the summons on Day 2 is past; the library's first Wednesday is ahead.
    expect(engagementsOn(mac, head(), "Day 5 10:00").map(on => [on.engagement.id, on.next])).toEqual([["g-library", "Day 8 19:30"]]);
    expect(engagementsOn(mac, head(), "Day 1 10:00").map(on => [on.engagement.id, on.next])).toEqual([["g-office", "Day 2 09:00"], ["g-library", "Day 8 19:30"]]);
  });

  it("rolls a weekly Engagement on to its next week, and moves or calls off one when a Scene says so", () => {
    const { mac, scene, head } = story();
    scene(5, { engagements: [library] });
    expect(engagementsOn(mac, head(), "Day 8 20:00").map(on => on.next)).toEqual(["Day 15 19:30"]);
    scene(9, { changed: [{ engagement: "g-library", to: "Day 16 18:00", quotes }] });
    expect(engagementsOn(mac, head(), "Day 9 10:00").map(on => on.next)).toEqual(["Day 16 18:00"]);
    expect(engagementsOn(mac, head(), "Day 16 19:00").map(on => on.next)).toEqual(["Day 23 18:00"]);
    scene(10, { changed: [{ engagement: "g-library", to: "off", quotes }] });
    expect(engagementsOn(mac, head(), "Day 10 10:00")).toEqual([]);
  });

  it("is another Path's own: a Path from before the Engagement was made does not have it", () => {
    const { mac, tree, scene, head } = story();
    const first = scene(1);
    scene(5, { engagements: [library] });
    expect(engagementsOn(mac, head(), "Day 5 10:00")).toHaveLength(1);
    const other = tree.createPath("s", "Elsewhere", first.closed.id, false);
    expect(engagementsOn(mac, other.headEntryId, "Day 5 10:00")).toEqual([]);
  });

  it("lists every time an Engagement falls in a span", () => {
    const { mac, scene, head } = story();
    scene(5, { engagements: [library] });
    expect(occurrencesBetween(engagementsOn(mac, head(), "Day 5 10:00")[0]!.engagement, "Day 6 00:00", "Day 16 00:00")).toEqual(["Day 8 19:30", "Day 15 19:30"]);
    expect(occurrencesBetween(summons, "Day 1 00:00", "Day 2 08:00")).toEqual([]);
  });
});
