import { describe, expect, it } from "vitest";
import { chroniclerPrompt } from "../../src/agents/chronicler.js";
import { weaverPrompt } from "../../src/agents/weaver.js";
import type { OutlineSet } from "../../src/story/entries.js";
import type { Outline } from "../../src/story/outline.js";
import { relevance, tiers } from "../../src/story/relevance.js";
import { emptyUpdate, type PersonNow } from "../../src/story/truth.js";
import { ledger, SONNET, type Ledger } from "../agents/ledger.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

/** Hogwarts with Luna Lovegood in the Story, its opening Scene with Hermione played, closed and recorded. */
function hogwarts(): Ledger {
  const file = hogwartsWorldStoryFile();
  file.people.push({ name: "Luna Lovegood", who_they_are: "A Ravenclaw who sees what other people miss." });
  const story = ledger(file);
  story.move("I say goodnight to Hermione and go up.");
  story.reply("Hermione doesn't look up from her book.");
  story.close();
  story.chronicle();
  return story;
}

/** A Scene by the lake with [who], played and closed: the Chronicler has not recorded it yet. */
function byTheLake(story: Ledger, day: number, who: string[] = ["Luna Lovegood"]) {
  story.open("By the lake", "The Black Lake", `Day ${day} 16:00`, who);
  story.move("I sit down on the grass beside Luna.");
  story.reply("Luna goes on feeding the bread to something nobody else can see.");
  story.close();
}

/** What the Chronicler is shown of Luna, among the people in the Scene. */
const lunaIn = (prompt: string) => prompt.slice(prompt.indexOf("<people_in_the_scene>\nLuna Lovegood\n"), prompt.indexOf("</people_in_the_scene>"));

/** An Outline whose current Act names [movers], with [later] in the Act after it, and [promoted] brought forward. */
function outlined(story: Ledger, movers: string[], later: string[] = [], promoted: string[] = []) {
  const act = (number: number, who: string[]) => ({ number, title: `Year ${number}`, question: "q", buildsTo: "b", detail: "detailed" as const, turns: [], relationships: [], movers: who.map(name => ({ who: name, doing: "what they pursue" })), handsOn: "h" });
  const outline: Omit<Outline, "version"> = { current: 1, acts: [act(1, movers), act(2, later)], ending: "e", intentions: [], setups: [], promoted, revisedAfter: 0, deep: true, lookedUp: [] };
  const entry: OutlineSet = { kind: "outline_set", outline, reason: "The Story starts.", planFollows: false, dropped: [], callId: "c", model: SONNET };
  story.add(entry);
}

describe("Lives in tiers by relevance (openspec living-world: Everyone has a Life; the-storys-mind design decision 3)", () => {
  it("has the Leads Close from the start, and everyone else in a line, a Group as one and never him", () => {
    const { close, movers, others } = tiers(hogwarts().state());
    expect(close).toEqual(["Draconia Malfoy", "Hermione Granger"]);
    expect(movers).toEqual([]);
    expect(others).toContain("Crabbe and Goyle");
    expect(others).toContain("The Hufflepuff Quidditch team");
    expect(others).toContain("Luna Lovegood");
    expect(others.filter(name => ["Vincent Crabbe", "Gregory Goyle", "Cedric Diggory", "Roopesh Gantasala"].includes(name))).toEqual([]);
  });

  it("has the current Act's Movers and whoever the Director promoted as Movers, a Lead staying Close", () => {
    const story = hogwarts();
    outlined(story, ["Quirinus Quirrell", "Professor Snape", "Draconia Malfoy", "Vincent Crabbe", "Lord Voldemort"], ["Rubeus Hagrid"], ["Neville Longbottom"]);
    const { close, movers, others } = tiers(story.state());
    expect(close).toEqual(["Draconia Malfoy", "Hermione Granger"]);
    expect(movers).toEqual(["Quirinus Quirrell", "Severus Snape", "Crabbe and Goyle", "Neville Longbottom"]);
    expect(others).toContain("Rubeus Hagrid");
    expect(others).not.toContain("Crabbe and Goyle");
  });

  it("works out how much someone matters from play: Scenes with him, turning points between them, and mentions", () => {
    const story = hogwarts();
    byTheLake(story, 4, ["Luna Lovegood", "Neville Longbottom"]);
    const turn = { text: "She told him about her mother.", scene: 2, sources: [] };
    story.chronicle({ paragraph: "By the lake, Luna told him about her mother, and Neville listened.", truth: { ...emptyUpdate(), between: [{ people: ["Luna Lovegood", "Roopesh Gantasala"], stands: "She trusts him with her mother.", turn, keepsakes: [] }] } });
    story.world({ meanwhile: [{ text: "Ron says Luna was in the Owlery at midnight.", how: "rumour", fact: "h1", toldBy: null, about: ["Luna Lovegood"], engagement: null }] });
    const scored = relevance(story.state());
    expect(scored.find(item => item.who === "Luna Lovegood")).toMatchObject({ scenes: 1, turns: 1, mentions: 1 });
    expect(scored.find(item => item.who === "Neville Longbottom")).toMatchObject({ scenes: 1, turns: 0, mentions: 0 });
    expect(scored.find(item => item.who === "Hermione Granger")).toMatchObject({ scenes: 1 });
    expect(scored.findIndex(item => item.who === "Luna Lovegood")).toBeLessThan(scored.findIndex(item => item.who === "Neville Longbottom"));
  });

  // GIVEN Luna Lovegood has a one-line Life
  // WHEN the player spends three Scenes with her
  // THEN she has a full Life from the end of the third
  it("living-world › Everyone has a Life › Rising from a line", () => {
    const story = hogwarts();
    story.world({ lives: [{ who: "Luna Lovegood", where: "the Black Lake", doing: "feeding something nobody else can see", after: "The creatures in her father's magazine." }] });
    const weaveAsk = () => {
      const state = story.state();
      return { state, from: state.scene!.endedAt!, until: state.clock, gap: false, scene: story.scene(), missed: [] };
    };

    for (const day of [4, 5]) {
      byTheLake(story, day);
      expect(tiers(story.state()).others).toContain("Luna Lovegood");
      expect(lunaIn(chroniclerPrompt({ state: story.state(), scene: story.scene() }, []).prompt)).toContain("Their Life: a line");
      story.chronicle();
      expect(weaverPrompt(weaveAsk()).prompt).toContain("- Luna Lovegood: at the Black Lake, feeding something nobody else can see");
    }

    // The end of the third: the Chronicler is asked for who she is now, whole.
    byTheLake(story, 6);
    expect(tiers(story.state()).close).toContain("Luna Lovegood");
    expect(lunaIn(chroniclerPrompt({ state: story.state(), scene: story.scene() }, []).prompt)).toContain("Their Life: Close, kept in full");
    const luna: PersonNow = {
      who: "Luna Lovegood", now: "Lets him sit with her by the lake most afternoons now, and has started to wait for him.",
      feelings: [{ about: "Roopesh Gantasala", feels: "Glad of him; he does not laugh." }, { about: "Hermione Granger", feels: "Wary of her certainty." }],
      wants: "To find a Crumple-Horned Snorkack before the spring, and her mother's last notebook.", hides: "How much she misses her mother.", scene: 4, sources: []
    };
    story.chronicle({ truth: { ...emptyUpdate(), now: [luna] } });

    // The World lives her full Life out.
    const { prompt } = weaverPrompt(weaveAsk());
    expect(prompt).toMatch(/<lives_by_tier>\nClose, each with a full Life: [^\n]*Luna Lovegood/);
    const lives = prompt.slice(prompt.indexOf("<people_now>"), prompt.indexOf("</people_now>"));
    const hers = lives.slice(lives.indexOf("\nLuna Lovegood\n"));
    expect(hers).toContain(luna.now);
    expect(hers).toContain("About Hermione Granger: Wary of her certainty.");
    expect(hers).toContain(`Wants: ${luna.wants}`);
  });
});
