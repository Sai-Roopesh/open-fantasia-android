import { afterEach, describe, expect, it } from "vitest";
import type { PeopleView, PersonDetail, SceneView } from "../../src/protocol/generated/link.js";
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
  const put = async (path: string, body: Record<string, unknown>) => await call(`/stories/${storyId}/${path}`, { method: "PUT", body: JSON.stringify({ after: await head(), ...body }) });
  const get = async <T>(path: string) => await (await call(`/stories/${storyId}/${path}`)).json() as T;
  const message = async (response: Response) => (await response.json() as { error: { message: string } }).error.message;
  return { ...running, head, put, get, message };
}

const theo = { create: true, aliases: ["Theo"], who_they_are: "A quiet Slytherin who reads in the library.", known: "A Slytherin who is always reading.", appearance: "Ink on his fingers.", wants: "To be left alone.", voice: ["Mm."], knows: [], group: null };

describe("editing people over the link", () => {
  it("lists everyone, Leads first, with no one's description, and shows a person whole for editing", async () => {
    const { get } = await mac();
    const people = await get<PeopleView>("people");
    expect(people.people.slice(0, 3).map(person => [person.name, person.lead])).toEqual([["Draconia Malfoy", true], ["Hermione Granger", true], ["Harry Potter", true]]);
    expect(people.people.find(person => person.name === "Roopesh Gantasala")).toMatchObject({ player_character: true, lead: false });
    expect(people.groups).toEqual([{ name: "Crabbe and Goyle", description: "The most background of background characters." }]);
    expect(JSON.stringify(people)).not.toContain("Pure-blood heir");
    const draconia = await get<PersonDetail>("people/Draconia%20Malfoy");
    expect(draconia).toMatchObject({ name: "Draconia Malfoy", aliases: ["Connie"], who_they_are: "Pure-blood heir, Slytherin, sharp-tongued and proud.", lead: true, group: null, player_character: false });
    expect(draconia.portrait_url).toMatch(/portraits/);
  });

  it("creates a person, changes them, makes them a Lead, and adds a Group, each from the head the phone saw", async () => {
    const { put, get, message } = await mac();
    expect((await put("people/Theodore%20Nott", theo)).status).toBe(200);
    expect((await get<PersonDetail>("people/Theodore%20Nott")).wants).toBe("To be left alone.");
    expect((await put("groups/The%20library%20regulars", { description: "Always in the library after supper." })).status).toBe(200);
    expect((await put("people/Theodore%20Nott", { ...theo, create: false, group: "The library regulars" })).status).toBe(200);
    expect((await put("people/Theodore%20Nott/lead", { lead: true })).status).toBe(200);
    const after = await get<PeopleView>("people");
    expect(after.people.find(person => person.name === "Theodore Nott")).toMatchObject({ lead: true, group: "The library regulars" });
    const refused = await put("people/Hermione%20Granger", { ...theo, create: true });
    expect(refused.status).toBe(400);
    expect(await message(refused)).toBe("Hermione Granger is already in the Story.");
  });

  it("refuses an edit against a head the Story has moved past, and a person it does not have", async () => {
    const { call, storyId, message } = await mac();
    const stale = await call(`/stories/${storyId}/people/Theodore%20Nott`, { method: "PUT", body: JSON.stringify({ ...theo, after: "an-old-head" }) });
    expect(stale.status).toBe(409);
    expect((await call(`/stories/${storyId}/people/Nobody`)).status).toBe(404);
    expect(await message(await call(`/stories/${storyId}/people/Nobody`))).toBe("Nobody is not in the Story.");
  });
});
