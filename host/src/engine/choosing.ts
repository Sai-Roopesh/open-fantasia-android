import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import type { ChooseRequest } from "../protocol/generated/link.js";
import { dayChoicesOf, offersOn, todayOn } from "../story/day.js";
import type { Choice } from "../story/entries.js";
import type { State } from "../story/state.js";
import { minutesOf, parseStoryTime, sayDay, sayStoryTime, sayTime } from "../time.js";

/** "The Gryffindor common room" in a sentence: "the Gryffindor common room". */
const inSentence = (place: string) => place.replace(/^The /, "the ");

/**
 * A choice at the Day View at [head], checked against what the Day View offers, and the Move it becomes in the
 * player's words: what he did in the Gap first (or, left blank, the rule's own words), then the choice.
 */
export function chosen(mac: Mac, head: string, request: ChooseRequest): { choice: Choice; text: string } {
  const state = mac.states.at(head);
  const scene = state.scene;
  if (!scene?.closed) throw new LinkError("invalid", "A choice is made at the Day View, and there is none open.");
  if (!scene.ended.includes("weaver")) throw new LinkError("busy", "The Scene's end is still being worked out; choose once the Day View is ready.");
  const today = todayOn(state);
  const offered = dayChoicesOf(state);
  const first = (name: string) => state.people[name]?.aliases.find(alias => !alias.includes(" ")) ?? name.split(" ")[0] ?? name;

  let choice: Choice;
  let line: string;
  switch (request.kind) {
    case "go":
    case "story": {
      const happening = request.kind === "story" ? today.find(item => item.pick) : today.find(item => item.id === request.happening);
      if (!happening) throw new LinkError("invalid", request.kind === "story" ? "The Story has no pick today." : "That is not on today.");
      // A Happening that is the Stretch's Scene that matters opens it; one that is an Engagement keeps it.
      const on = offersOn(state).find(item => item.id === happening.id);
      choice = { kind: request.kind, place: happening.place, at: happening.at, who: happening.who, scene: on?.scene ?? null, engagement: on?.engagement ?? null };
      line = `I go along ${whenOf(happening.at, state)}: ${happening.place}.`;
      break;
    }
    case "follow": {
      if (!request.who || !offered.follow.includes(request.who)) throw new LinkError("invalid", `You cannot follow ${request.who ?? "nobody"} from here.`);
      choice = { kind: "follow", place: null, at: null, who: [request.who], scene: null, engagement: null };
      line = `I follow ${first(request.who)}.`;
      break;
    }
    case "somewhere": {
      if (!request.place || !offered.places.includes(request.place)) throw new LinkError("invalid", `${request.place ?? "That"} is not one of the Story's places.`);
      choice = { kind: "somewhere", place: request.place, at: null, who: [], scene: null, engagement: null };
      line = `I go to ${inSentence(request.place)}.`;
      break;
    }
    case "skip": {
      const skip = offered.skips.find(item => item.at === request.at);
      if (!skip) throw new LinkError("invalid", "That is not one of the times to skip to.");
      choice = { kind: "skip", place: null, at: skip.at, who: [], scene: null, engagement: null };
      const at = parseStoryTime(skip.at);
      line = `I let the time pass until ${skip.in_sentence}: ${at ? sayStoryTime(at, state.dayOneWeekday) : skip.time}.`;
      break;
    }
  }
  const written = request.gap?.trim() || null;
  // The player's words stay theirs; a Gap left without its full stop gets one, so the choice reads as its own sentence.
  const gap = written && !/[.!?…]["'”’)]*$/.test(written) ? `${written}.` : written;
  const later = choice.at !== null && isLater(choice.at, state);
  // Left blank, he spends it quietly: where he was within the day, going about his days past a night (openspec day-view).
  const blank = choice.at !== null && pastANight(choice.at, state) ? "I go about my days quietly until then." : `I spend the time until then quietly in ${inSentence(scene.place)}.`;
  const before = gap ?? (later ? blank : null);
  return { choice, text: before ? `${before} ${line}` : line };
}

/**
 * When [at] is, in a sentence from the clock: "at 9:00 am" today, "tomorrow at 10:00 am", "on Monday at 3:00 pm"
 * within the week, and "in 9 days, on Thursday at 10:00 am" beyond it.
 */
function whenOf(at: string, state: State): string {
  const then = parseStoryTime(at);
  const now = parseStoryTime(state.clock);
  if (!then || !now) return `at ${at}`;
  const days = then.day - now.day;
  const onDay = `on ${sayDay(then, state.dayOneWeekday)} at ${sayTime(then)}`;
  return days <= 0 ? `at ${sayTime(then)}` : days === 1 ? `tomorrow at ${sayTime(then)}` : days < 7 ? onDay : `in ${days} days, ${onDay}`;
}

/** Whether [at] is on a later Story day than the clock: the Gap runs past a night. */
function pastANight(at: string, state: State): boolean {
  const then = parseStoryTime(at);
  const now = parseStoryTime(state.clock);
  return then !== null && now !== null && then.day > now.day;
}

function isLater(at: string, state: State): boolean {
  const then = parseStoryTime(at);
  const now = parseStoryTime(state.clock);
  return then !== null && now !== null && minutesOf(then) > minutesOf(now);
}
