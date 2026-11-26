import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";

/** The smallest valid image: a 1x1 PNG, enough to stand in for a Portrait. */
export const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c636000010000050001" + "0d0a2db40000000049454e44ae426082",
  "hex"
);

export function minimalStoryFile(): StoryFile {
  return {
    format: 1,
    title: "A Small Story",
    premise: "Two strangers share a compartment on a night train.",
    style: "Quiet, close, British English.",
    people: [
      { name: "Mira", who_they_are: "A cellist going home for her father's funeral." },
      { name: "Tom", who_they_are: "A student who missed his stop." }
    ],
    player_character: "Tom",
    opening: {
      title: "The night train",
      place: "A sleeper compartment",
      at: "Day 1 23:10",
      who: ["Mira"],
      prose: "The train lurches. Mira looks up from her book as the compartment door slides open."
    }
  };
}

/**
 * The Harry Potter Story's shape: 46 people, three Leads, an opening at a party. The people beyond the named ones
 * are numbered stand-ins; what matters to the tests is the size and the structure.
 */
export function malfoyProblemStoryFile(): StoryFile {
  const named = [
    { name: "Draconia Malfoy", who_they_are: "Pure-blood heir, Slytherin, sharp-tongued and proud.", known: "Slytherin, and a Malfoy. Calls him Stray.", portrait: "portraits/draconia.png", aliases: ["Connie"] },
    { name: "Hermione Granger", who_they_are: "Muggle-born, Gryffindor, top of every class.", known: "A Gryffindor who knows every answer.", portrait: "portraits/hermione.png" },
    { name: "Harry Potter", who_they_are: "The Boy Who Lived, Gryffindor.", known: "The Boy Who Lived. Everyone knows who he is.", portrait: "portraits/harry.png" },
    { name: "Roopesh Gantasala", who_they_are: "A Muggle-born from Bangalore with powers he hides.", portrait: "portraits/roopesh.png" },
    { name: "Crabbe", who_they_are: "Draconia's shadow.", group: "Crabbe and Goyle" },
    { name: "Goyle", who_they_are: "Draconia's other shadow.", group: "Crabbe and Goyle" }
  ];
  const others = Array.from({ length: 40 }, (_, index) => ({ name: `Student ${index + 1}`, who_they_are: "A first-year." }));
  return {
    format: 1,
    title: "The Malfoy Problem",
    premise: "An enemies-to-lovers romance with Draconia Malfoy at Hogwarts as a university.",
    style: "Young-adult romance with Game of Thrones politics underneath. British English, 1991.",
    reply_length: "full",
    actor: { provider: "claude", model: "claude-opus-5-5" },
    clock: { starts: "Day 1 21:40", day_one: "1991-09-06" },
    world: { summary: "Hogwarts as a university; everyone is eighteen.", places: [{ name: "The Three Broomsticks", description: "A pub in Hogsmeade." }] },
    people: [...named, ...others] as StoryFile["people"],
    groups: [{ name: "Crabbe and Goyle", description: "The most background of background characters." }],
    leads: ["Draconia Malfoy", "Hermione Granger", "Harry Potter"],
    player_character: "Roopesh Gantasala",
    arcs: ["Draconia comes round to Roopesh, slowly, against everything she was raised to be."],
    landmarks: [{ name: "The Triwizard Tournament", at: "Day 720 18:00", what: "The Tournament begins." }],
    opening: {
      title: "The insult",
      place: "The Three Broomsticks",
      at: "Day 1 21:40",
      who: ["Draconia Malfoy", "Hermione Granger", "Harry Potter", "Crabbe", "Goyle"],
      prose: "The laugh that goes round the Slytherin corner is for him. \"Honestly, Stray,\" Draconia says, \"don't they have mirrors at the mission?\""
    }
  };
}

/** Writes [story] as a Story File folder, with a Portrait image for every path it names, and returns the folder. */
export function writeStoryFile(story: unknown, options: { omitPortraits?: string[] } = {}): string {
  const folder = mkdtempSync(join(tmpdir(), "story-file-"));
  writeFileSync(join(folder, "story.yaml"), stringify(story));
  const people = (story as { people?: { portrait?: string }[] }).people ?? [];
  for (const person of people) {
    if (!person.portrait || options.omitPortraits?.includes(person.portrait)) continue;
    const path = join(folder, person.portrait);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, PNG);
  }
  return folder;
}

/**
 * Hogwarts after dark, for the Scene scenarios: Roopesh with Hermione in the Gryffindor common room on a Friday
 * night, with Harry, Ron, Neville and Draconia in the Story. [opening] changes where and when it begins.
 */
export function hogwartsStoryFile(opening: Partial<StoryFile["opening"]> = {}): StoryFile {
  return {
    format: 1,
    title: "After Curfew",
    premise: "An enemies-to-lovers romance with Draconia Malfoy at Hogwarts as a university.",
    style: "Close third person, British English, 1991.",
    clock: { starts: opening.at ?? "Day 3 21:40", day_one: "1991-09-04" },
    people: [
      { name: "Roopesh Gantasala", who_they_are: "A Muggle-born from Bangalore with powers he hides.", aliases: ["Roo"] },
      { name: "Hermione Granger", who_they_are: "Muggle-born, Gryffindor, top of every class." },
      { name: "Harry Potter", who_they_are: "The Boy Who Lived, Gryffindor." },
      { name: "Ron Weasley", who_they_are: "Harry's best friend, Gryffindor, sixth of seven children." },
      { name: "Neville Longbottom", who_they_are: "A Gryffindor who is better with plants than wands." },
      { name: "Draconia Malfoy", who_they_are: "Pure-blood heir, Slytherin, sharp-tongued and proud." },
      { name: "Severus Snape", who_they_are: "Potions master, Head of Slytherin." },
      { name: "Rubeus Hagrid", who_they_are: "Keeper of Keys and Grounds, with a soft spot for dangerous creatures." }
    ] as StoryFile["people"],
    leads: ["Draconia Malfoy", "Hermione Granger"],
    player_character: "Roopesh Gantasala",
    arcs: ["Draconia comes round to Roopesh, slowly, against everything she was raised to be."],
    landmarks: [{ name: "Draconia's flying test", at: "Day 8 10:00", what: "Madam Hooch tests the first-years on brooms." }],
    opening: {
      title: "After curfew",
      place: "The Gryffindor common room",
      at: "Day 3 21:40",
      who: ["Hermione Granger"],
      prose: "The fire has burned down to red. Hermione is on the sofa with a book she has not turned a page of in ten minutes.",
      ...opening
    }
  };
}

/** Hogwarts with a World to move: Crabbe and Goyle as a Group, Quirrell's secret Thread, and the people who spread news. */
export function hogwartsWorldStoryFile(opening: Partial<StoryFile["opening"]> = {}): StoryFile {
  const story = hogwartsStoryFile(opening);
  story.people.push(
    { name: "Vincent Crabbe", who_they_are: "Draconia's bodyguard, large and slow.", group: "Crabbe and Goyle" },
    { name: "Gregory Goyle", who_they_are: "Draconia's other bodyguard, larger and slower.", group: "Crabbe and Goyle" },
    { name: "Quirinus Quirrell", who_they_are: "The nervous Defence teacher, who is not what he seems.", known: "The Defence teacher. Stammers, and smells of garlic.", after: "The Stone on the third floor." },
    { name: "Minerva McGonagall", who_they_are: "Deputy Headmistress, Head of Gryffindor.", known: "Deputy Headmistress, Head of Gryffindor." },
    { name: "Lavender Brown", who_they_are: "A Gryffindor who hears everything first and tells it louder." },
    { name: "Cedric Diggory", who_they_are: "Hufflepuff's Seeker and captain.", group: "The Hufflepuff Quidditch team" }
  );
  story.groups = [
    { name: "Crabbe and Goyle", description: "Draconia's errands, and whatever she wants hit." },
    { name: "The Hufflepuff Quidditch team", description: "Practising for the Hufflepuff v Ravenclaw match." }
  ];
  story.threads = [
    { name: "the dragon egg in Hagrid's hut", now: "Hagrid is keeping it warm in the fire" },
    { name: "Quirrell and the third-floor door", now: "Quirrell is testing the wards on the third-floor door, at night, alone" }
  ];
  return story;
}

/** The Night Train example (examples/night-train), opening on the platform at Barog unless told otherwise. */
export function nightTrainStoryFile(opening: Partial<StoryFile["opening"]> = {}): StoryFile {
  const story = parse(readFileSync(fileURLToPath(new URL("../../../examples/night-train/story.yaml", import.meta.url)), "utf8")) as StoryFile;
  story.opening = { title: "Water at Barog", place: "Barog station platform, hill mist, the toy train's engine taking water", at: "Day 2 09:05", who: ["Meera Kulkarni"],
    prose: "The toy train stops at Barog to take water. Meera is off the step before it has properly stopped.", ...opening };
  return story;
}
