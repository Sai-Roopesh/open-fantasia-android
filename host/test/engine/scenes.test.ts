import { describe, expect, it } from "vitest";
import { nothingTrue } from "../../src/agents/truth-record.js";
import { emptyUpdate, type TruthUpdate } from "../../src/story/truth.js";
import { LinkError } from "../../src/link/errors.js";
import type { OutgoingEvent } from "../../src/engine/engine.js";
import type { ModelRequest } from "../../src/models/model-call.js";
import type { Script } from "../../src/models/scripted.js";
import type { Beat } from "../../src/story/state.js";
import { besideOf } from "../../src/store/beside.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile, malfoyProblemStoryFile } from "../support/story-files.js";

/** Who an Actor's prompt says is here, in the order it tells who each person here is now. */
const peopleHere = (prompt: string) => [...(/<people_now>\n[^\n]*\n([\s\S]*?)\n<\/people_now>/.exec(prompt)?.[1] ?? "").matchAll(/^(\S[^\n]*)$/gm)].map(match => match[1]!);

const beats = (inPlay: number): Beat[] => [0, 1, 2].map(index => ({ text: `beat ${index + 1}`, status: index < inPlay ? "done" : index === inPlay ? "in_play" : "pending" }));
const PLAN = { title: "After curfew", place: "The Gryffindor common room", purpose: "Hermione decides whether to ask what he is.", exit: "She asks, or goes up to bed." };

/** A Writer's answer for the common room with Hermione, changed as a scenario needs: the Reply two minutes on. */
function writer(changes: Record<string, unknown> = {}): Script {
  return { answer: JSON.stringify({ leaves_scene: false, frame: null, comes_in: [], goes: [], beats: beats(0), note: "Hermione closes her book.", call: "continue", intensity: 2, arc_moved: true, minutes: 2, taste: null, in_play: [], moves_to: null, ...changes }) };
}

describe("a turn with the Writer", () => {
  // GIVEN the clock stands at 4:00 pm
  // WHEN the Move is "after an hour, I'm still sitting on her broom, holding on"
  // THEN the clock stands at 5:00 pm or later, and the Reply picks up there
  it("scenes › A Move can contain anything, and what it says has happened › A time skip in a Move", async () => {
    const broom = hogwartsStoryFile({ title: "Flying lesson", place: "The Quidditch pitch", at: "Day 2 16:00", who: ["Draconia Malfoy"], prose: "Draconia hovers above you, unimpressed." });
    const { play, state, models } = playable(broom, {
      writer: [writer({ frame: { ...PLAN, title: "Flying lesson", place: "The Quidditch pitch" }, comes_in: ["Draconia Malfoy"], minutes: 65 })]
    });
    await play("after an hour, I'm still sitting on her broom, holding on");
    expect(state().clock).toBe("Day 2 17:05");
    // The time moves in this moment's layer, with the Move.
    const moment = models.actor.requests[0]!.prompt.slice(models.actor.requests[0]!.prompt.lastIndexOf("<now>"));
    expect(moment).toMatch(/^<now>\nIt is Thursday 5 September 1991, 5:05 pm \(1991-09-05 17:05\)\.\n<\/now>[\s\S]*holding on/);
  });

  it("sends a Writer's answer it cannot use back once, and takes the repair", async () => {
    // Minutes before now are not in the format: the clock never goes back.
    const { play, state, models } = playable(hogwartsStoryFile(), { writer: [writer({ frame: PLAN, minutes: -100 }), writer({ frame: PLAN })] });
    await play("I sit down at the other end of the sofa.");
    expect(models.writer.requests).toHaveLength(2);
    expect(state().clock).toBe("Day 3 21:42");
  });

  // GIVEN a Scene in the Gryffindor common room
  // WHEN the Move is "I go to my room; Harry, Ron and Neville are playing a board game"
  // THEN a new Scene opens in the dormitory with its title card, and the Reply plays it
  // AND no Day View appears
  it("scenes › A Scene ends in one of three ways › Walking out of a Scene", async () => {
    const move = "I go to my room; Harry, Ron and Neville are playing a board game";
    const { play, path, view, events, models } = playable(hogwartsStoryFile(), {
      writer: [writer({ leaves_scene: true, frame: { title: "Lights out", place: "The boys' dormitory", purpose: "Ron finds out where Roopesh goes at night.", exit: "Ron asks, or lets it go." }, comes_in: ["Harry Potter", "Ron Weasley", "Neville Longbottom"], minutes: 5 })],
      actor: [{ answer: "Ron looks up from the board. \"Your go, Roo.\"" }]
    });
    await play(move);

    // The Scene he left is closed by the Move and recorded like any other before the next opens (living-world: Every
    // Scene SHALL be recorded); no time passes before the next.
    const kinds = path().map(payload => payload.kind);
    const left = kinds.lastIndexOf("move");
    expect(kinds.slice(left)).toEqual(["move", "scene_closed", "chronicle", "outline_set", "director_plan", "world_moved", "scene_opened", "beat_note", "reply"]);
    expect(path()[left + 1]).toEqual({ kind: "scene_closed", by: "move" });
    expect(path()[left + 2]).toMatchObject({ kind: "chronicle", truth: emptyUpdate(), scene: 1 });
    expect(path()[left + 5]).toMatchObject({ kind: "world_moved", truth: emptyUpdate(), gap: false, from: "Day 3 21:40", until: "Day 3 21:40" });
    expect(models.writer.requests).toHaveLength(1);
    expect(path().at(-3)).toMatchObject({ kind: "scene_opened", number: 2, title: "Lights out", place: "The boys' dormitory", at: "Day 3 21:45", who: ["Harry Potter", "Ron Weasley", "Neville Longbottom"], prose: null });
    const shown = view();
    expect(shown.scene).toMatchObject({ number: 2, title: "Lights out", place: "The boys' dormitory", at_label: "Friday 9:45 pm" });
    expect(shown.scene.people.map(person => person.name)).toEqual(["Harry Potter", "Ron Weasley", "Neville Longbottom"]);
    expect(shown.exchanges).toEqual([{ move: { entry_id: expect.any(String), text: move }, reply: { entry_id: expect.any(String), text: "Ron looks up from the board. \"Your go, Roo.\"" } }]);
    expect(shown.earlier_scenes.map(scene => scene.title)).toEqual(["After curfew"]);
    expect(shown.day_view).toBeNull();
    expect(models.actor.requests[0]!.prompt).toContain("<scene>\nLights out. The boys' dormitory");
    // The phone is told each step of the end of the Scene he left, then the new Scene opens with no Day View between,
    // and the Reply is written, checked, and sent whole.
    expect(events.map(event => event.event.kind).filter(kind => kind !== "turn_step" && kind !== "scene_end_step")).toEqual(["move", "scene_closed", "world_moved", "scene_opened", "reply"]);
    expect(events.flatMap(event => (event.event.kind === "turn_step" ? [event.event.turn_step] : []))).toEqual(["writing", "checking"]);
    expect(events.flatMap(event => (event.event.kind === "scene_end_step" ? [event.event.step] : []))).toEqual(["chronicler", "director", "weaver", null]);
  });

  // GIVEN a Scene in the Great Hall in which Hermione wants to know where he went on Wednesday
  // WHEN the Move is "I go to the library with Hermione"
  // THEN the same Scene goes on in the library, the place shown changes, and no new title card opens
  it("scenes › A Scene ends in one of three ways › Walking somewhere together keeps the Scene", async () => {
    const hall = { title: "Wednesday", place: "The Great Hall", purpose: "Hermione decides whether to believe where he says he went on Wednesday.", exit: "She lets it go, or says she knows he is lying." };
    const { play, path, view, events, models } = playable(hogwartsStoryFile({ title: "Wednesday", place: "The Great Hall", at: "Day 3 12:30", who: ["Hermione Granger"] }), {
      writer: [writer({ frame: hall }), writer({ moves_to: "The library", minutes: 8 })]
    });
    await play("I tell Hermione I was in the library on Wednesday.");
    await play("I go to the library with Hermione.");
    expect(path().filter(payload => payload.kind === "scene_opened")).toHaveLength(1);
    expect(view().scene).toMatchObject({ number: 1, title: "Wednesday", place: "The library" });
    expect(events.filter(event => event.event.kind === "scene_opened")).toHaveLength(0);
    // The Writer was told the Scene goes on when they walk somewhere together.
    expect(models.writer.requests[1]!.system.replace(/\s+/g, " ")).toContain("A Move that walks somewhere with them while it goes on keeps the Scene: set moves_to to the new place");
  });

  // WHEN a Reply brings the Scene to its close
  // THEN the Day View opens after it
  it("scenes › A Scene ends in one of three ways › The Story closes a Scene", async () => {
    const { play, path, view, events } = playable(hogwartsStoryFile(), { writer: [writer({ frame: PLAN, call: "end", note: "Hermione goes up to bed without a word." })] });
    await play("I say goodnight.");
    // The Reply closes the Scene, and its end follows on the Path (docs/adr/0015): the record, the plan, the World.
    expect(path().slice(-6).map(payload => payload.kind)).toEqual(["reply", "scene_closed", "chronicle", "outline_set", "director_plan", "world_moved"]);
    expect(path().at(-5)).toMatchObject({ kind: "scene_closed", by: "story" });
    const shown = view();
    expect(shown.day_view).toMatchObject({ at: "Day 3 21:42", at_label: "Friday 9:42 pm", place: "The Gryffindor common room", closed_by: "story", scene_end: { step: null, failed: null } });
    expect(shown.exchanges.at(-1)!.move!.text).toBe("I say goodnight.");
    const kinds = events.map(event => event.event.kind).filter(kind => kind !== "turn_step" && kind !== "scene_end_step");
    expect(kinds.slice(-3)).toEqual(["reply", "scene_closed", "world_moved"]);
  });

  // WHEN the player taps End scene after a Reply
  // THEN the Scene is closed at that Reply and the Day View opens
  it("scenes › A Scene ends in one of three ways › The player ends a Scene", async () => {
    const { play, engine, storyId, head, path, view, events } = playable();
    await play("I say goodnight.");
    const reply = head();
    const accepted = engine.endScene(storyId, reply, "trace-end");
    expect(accepted.head_entry_id).toBe(head());
    expect(path().at(-1)).toEqual({ kind: "scene_closed", by: "player" });
    expect(path().at(-2)).toMatchObject({ kind: "reply" });
    expect(view().day_view).not.toBeNull();
    expect(events.at(-1)!.event).toMatchObject({ kind: "scene_closed", day_view: { place: "The Gryffindor common room" } });
    await engine.ended(storyId);
    expect(() => engine.endScene(storyId, head(), "trace-again")).toThrow(expect.objectContaining({ code: "invalid" }));
  });

  it("opens the next Scene from the Day View with the Move that chose it", async () => {
    const { play, engine, storyId, head, view, models } = playable(hogwartsStoryFile(), {
      writer: [writer({ frame: PLAN }), writer({ frame: { title: "Breakfast", place: "The Great Hall", purpose: "Draconia lets him sit, or not.", exit: "She moves her bag, or doesn't." }, comes_in: ["Draconia Malfoy"], minutes: 618 })]
    });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    await play("In the morning I sit down at the Slytherin table.");
    expect(models.writer.requests[1]!.prompt).toMatch(/The last Scene has closed/);
    const shown = view();
    expect(shown.day_view).toBeNull();
    expect(shown.scene).toMatchObject({ number: 2, title: "Breakfast", at_label: "Saturday 8:00 am" });
    expect(shown.focus).toBe("Draconia Malfoy");
    expect(shown.exchanges[0]!.move!.text).toBe("In the morning I sit down at the Slytherin table.");
  });

  it("refuses End scene while a Reply is being written or a Move waits for one", async () => {
    // The Actor's model and its second model both fail: the Move waits for its Reply.
    const { engine, storyId, head } = playable(hogwartsStoryFile(), { actor: [{ fail: "Claude is overloaded" }, { fail: "Claude is overloaded" }] });
    engine.move(storyId, "I wave.", head(), "trace-1");
    expect(() => engine.endScene(storyId, head(), "trace-end")).toThrow(expect.objectContaining({ code: "busy" }));
    await engine.settled(storyId);
    expect(() => engine.endScene(storyId, head(), "trace-end")).toThrow(expect.objectContaining({ code: "busy", message: expect.stringMatching(/Retry/) }));
  });

  // GIVEN three exchanges in a row in which no Arc moved, and Linger is off
  // THEN the next Reply moves the Scene to its next beat or brings it to a close
  it("scenes › Only what matters earns time › A stalled Scene moves on", async () => {
    const stalled = { arc_moved: false, beats: beats(0) };
    const { play, models, state } = playable(hogwartsStoryFile(), {
      writer: [writer({ ...stalled, frame: PLAN }), writer(stalled), writer(stalled),
        writer({ arc_moved: true, beats: beats(1), note: "Hermione puts the book down: she asks where he goes at night." })]
    });
    for (const move of ["I sit down.", "I look at the fire.", "I yawn."]) await play(move);
    expect(models.writer.requests[2]!.prompt).not.toMatch(/No Arc has moved/);
    await play("I look at the fire again.");
    // The Writer is told the Scene has stalled, and moves it to its next beat; the Reply plays that beat.
    expect(models.writer.requests[3]!.prompt).toMatch(/No Arc has moved for 3 Replies: move the Scene on toward its turn, or call land\./);
    expect(models.writer.requests).toHaveLength(4);
    expect(state().scene!.beats.findIndex(beat => beat.status === "in_play")).toBe(1);
    expect(models.actor.requests[3]!.prompt).toContain("Hermione puts the book down: she asks where he goes at night.");
  });

  it("tells the Writer to make a beat happen once it has been in play for four exchanges", async () => {
    const { play, models } = playable(hogwartsStoryFile(), { writer: [writer({ frame: PLAN })] });
    for (const move of ["I sit down.", "I look at the fire.", "I yawn.", "I stretch."]) await play(move);
    expect(models.writer.requests[3]!.prompt).not.toMatch(/in play for/);
    await play("I look at Hermione.");
    expect(models.writer.requests[4]!.prompt).toMatch(/The beat in play has been in play for 4 Replies: make it happen now, or skip it\./);
  });

  // GIVEN Linger is on in the common room with Hermione
  // WHEN eight exchanges pass with no beat happening
  // THEN no beat is forced and the Scene stays open
  it("scenes › Linger holds the moment › Lingering with Hermione", async () => {
    const still = { arc_moved: false, beats: beats(0) };
    // The fifth answer calls the Scene to its end: with Linger on, the Scene does not close on its own.
    const { play, engine, storyId, head, models, state, path } = playable(hogwartsStoryFile(), {
      writer: [writer({ ...still, frame: PLAN }), writer(still), writer(still), writer(still), writer({ ...still, call: "end" }), writer(still), writer(still), writer(still)]
    });
    engine.setLinger(storyId, head(), true, "trace-linger");
    for (let exchange = 1; exchange <= 8; exchange++) await play(`I stay where I am, by the fire (${exchange}).`);
    const tasks = models.writer.requests.map(request => request.prompt.slice(request.prompt.lastIndexOf("<task>")));
    expect(tasks).toHaveLength(8);
    expect(tasks.every(task => /Linger is on/.test(task))).toBe(true);
    expect(tasks.some(task => /make it happen now|No Arc has moved/.test(task))).toBe(false);
    expect(path().some(payload => payload.kind === "scene_closed")).toBe(false);
    expect(state().scene).toMatchObject({ closed: null, linger: true });
    expect(state().scene!.beats).toEqual(beats(0));
  });

  it("fails the turn when the Writer fails twice, keeping the Move, and runs the Writer again on Retry", async () => {
    const { engine, storyId, head, mac, models, view, events } = playable(hogwartsStoryFile(), { writer: [{ fail: "Sonnet is overloaded" }, { fail: "Sonnet is overloaded" }, writer({ frame: PLAN })] });
    engine.move(storyId, "I sit down.", head(), "trace-1");
    await engine.settled(storyId);
    expect(mac.tree.entry(head())!.payload).toEqual({ kind: "move", text: "I sit down." });
    // The Writer's model and its second model both failed.
    expect(view().turn).toEqual({ kind: "failed", reason: expect.stringMatching(/could not be planned.*Sonnet is overloaded/), trace_id: "trace-1", job: "writer" });
    expect(events.at(-1)!.event.kind).toBe("reply_failed");
    expect(models.actor.requests).toHaveLength(0);

    engine.retry(storyId, "trace-2");
    await engine.settled(storyId);
    expect(models.writer.requests).toHaveLength(3);
    expect(mac.tree.entry(head())!.payload.kind).toBe("reply");
  });

  it("keeps the Beat Note when the Actor fails, and Retry runs only the Actor", async () => {
    const { engine, storyId, head, mac, models, view } = playable(hogwartsStoryFile(), { writer: [writer({ frame: PLAN })], actor: [{ fail: "Opus is overloaded" }, { fail: "Opus is overloaded" }] });
    engine.move(storyId, "I sit down.", head(), "trace-1");
    await engine.settled(storyId);
    expect(mac.tree.entry(head())!.payload.kind).toBe("beat_note");
    expect(view().turn).toMatchObject({ kind: "failed", reason: expect.stringMatching(/Opus is overloaded/) });
    expect(() => engine.move(storyId, "I wave.", head(), "trace-x")).toThrow(LinkError);

    engine.retry(storyId, "trace-2");
    await engine.settled(storyId);
    expect(models.writer.requests).toHaveLength(1);
    expect(mac.tree.entry(head())!.payload.kind).toBe("reply");
  });
});

describe("Focus, Linger and Redo", () => {
  // GIVEN a Scene opens with only Draconia besides the Player Character
  // THEN Focus is on Draconia
  // AND when that Scene ends, the next Scene starts with no Focus unless it too opens with one other person
  it("scenes › Focus keeps a Scene close to one person › Focus starts and clears by itself", async () => {
    const pitch = hogwartsStoryFile({ title: "Flying lesson", place: "The Quidditch pitch", at: "Day 2 16:00", who: ["Draconia Malfoy"], prose: "Draconia hovers above you." });
    const { play, engine, storyId, head, view } = playable(pitch, {
      writer: [
        writer({ frame: { ...PLAN, title: "Flying lesson", place: "The Quidditch pitch" }, comes_in: ["Draconia Malfoy"], minutes: 5 }),
        writer({ frame: { title: "Supper", place: "The Great Hall", purpose: "p", exit: "e" }, comes_in: ["Harry Potter", "Ron Weasley"], minutes: 175 }),
        writer({ leaves_scene: true, frame: { title: "The library", place: "The library", purpose: "p", exit: "e" }, comes_in: ["Hermione Granger"], minutes: 60 })
      ]
    });
    expect(view().focus).toBe("Draconia Malfoy");
    await play("I hold on.");
    engine.endScene(storyId, head(), "trace-end");
    expect(view().focus).toBeNull();
    await engine.ended(storyId);
    await play("At supper I sit with Harry and Ron.");
    expect(view().scene.title).toBe("Supper");
    expect(view().focus).toBeNull();
    await play("After supper I go to the library.");
    expect(view().scene.title).toBe("The library");
    expect(view().focus).toBe("Hermione Granger");
  });

  // GIVEN Focus is on Hermione in the common room
  // WHEN the player makes five Moves that bring nobody in
  // THEN no one else enters, and the Replies are hers
  it("scenes › Focus keeps a Scene close to one person › A private moment stays private", async () => {
    const { play, engine, storyId, head, models, state } = playable(hogwartsStoryFile({ who: ["Hermione Granger", "Harry Potter"] }), { writer: [writer({ frame: PLAN })] });
    engine.setFocus(storyId, head(), "Hermione Granger", "trace-focus");
    expect(state().scene!.focus).toBe("Hermione Granger");
    for (const move of ["I sit beside her.", "I ask what she's reading.", "I wait.", "I watch the fire.", "I say her name."]) await play(move);
    expect(models.writer.requests).toHaveLength(5);
    // The Writer is told every time; nobody enters: Harry, there from the opening, is still there, and nobody comes in.
    expect(models.writer.requests.every(request => request.prompt.includes("Focus is on Hermione Granger."))).toBe(true);
    expect(state().scene!.here).toEqual(["Hermione Granger", "Harry Potter"]);
    for (const request of models.actor.requests) {
      expect(request.prompt).toMatch(/Stay close beside Hermione Granger/);
      expect(peopleHere(request.prompt)).toEqual(["Hermione Granger", "Harry Potter"]);
    }
  });

  // GIVEN Focus is on Hermione
  // WHEN the Move is "Ron stumbles down the stairs in his pyjamas"
  // THEN Ron is in the Scene and the Reply plays him
  it("scenes › Focus keeps a Scene close to one person › A Move brings someone in", async () => {
    const { play, models, view } = playable(hogwartsStoryFile(), {
      writer: [writer({ frame: PLAN, comes_in: ["Hermione Granger", "Ron Weasley"], note: "Ron, half asleep, wants to know why they are both still up." })]
    });
    expect(view().focus).toBe("Hermione Granger");
    await play("Ron stumbles down the stairs in his pyjamas");
    expect(view().scene.people.map(person => person.name)).toEqual(["Hermione Granger", "Ron Weasley"]);
    expect(peopleHere(models.actor.requests[0]!.prompt)).toEqual(["Hermione Granger", "Ron Weasley"]);
  });

  it("refuses Focus on someone who is not in the Scene, and Linger after the Scene has closed", async () => {
    const { play, engine, storyId, head } = playable();
    expect(() => engine.setFocus(storyId, head(), "Severus Snape", "t")).toThrow(expect.objectContaining({ code: "invalid" }));
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "t");
    await engine.ended(storyId);
    expect(() => engine.setLinger(storyId, head(), true, "t")).toThrow(expect.objectContaining({ code: "invalid" }));
  });

  // WHEN the player Redoes with the Direction "you're leaning too much into Ron, move on"
  // THEN the new Reply moves away from Ron
  // AND the Direction's words appear nowhere in the Story
  it("scenes › Redo, with a Direction and another model if wanted › A Direction that is not remembered", async () => {
    const direction = "you're leaning too much into Ron, move on";
    const { play, engine, storyId, head, models, view, events, path, mac } = playable(hogwartsStoryFile(), {
      writer: [writer({ frame: PLAN, note: "Ron comes down and talks about Quidditch." }), writer({ frame: PLAN, note: "Hermione sends Ron back up to bed and turns to Roopesh." }), writer()],
      actor: [{ answer: "Ron talks about the Cannons for a long time." }, { answer: "\"Bed, Ronald,\" Hermione says. Then she turns to you." }]
    });
    // Redoing the first exchange takes the Beat Note that planned the Scene off the Path, so the Writer plans it again.
    await play("I sit down.");
    const move = mac.tree.pathTo(head()).findLast(entry => entry.payload.kind === "move")!;
    const accepted = engine.redo(storyId, head(), direction, false, "trace-redo");
    expect(events.some(event => event.event.kind === "redo")).toBe(true);
    await engine.settled(storyId);

    expect(accepted.move_entry_id).toBe(move.id);
    expect(models.writer.requests[1]!.prompt).toContain(direction);
    expect(models.actor.requests[1]!.prompt).toContain("Hermione sends Ron back up to bed and turns to Roopesh.");
    const shown = view();
    expect(shown.exchanges.at(-1)!.reply!.text).toBe("\"Bed, Ronald,\" Hermione says. Then she turns to you.");
    expect(shown.exchanges.filter(exchange => exchange.move?.text === "I sit down.")).toHaveLength(1);
    expect(path().some(payload => payload.kind === "reply" && payload.text.startsWith("Ron talks"))).toBe(false);
    expect(path().some(entry => entry.kind === "move" && entry.text === "I sit down.")).toBe(true);

    await play("I ask her what she's reading.");
    expect(JSON.stringify(view())).not.toContain(direction);
    for (const request of models.actor.requests) expect(request.system + request.prompt).not.toContain(direction);
    expect(besideOf(mac, storyId).taste).toEqual([]);
  });

  // WHEN the player Redoes with the Direction "don't dwell on school procedure" and ticks "remember this"
  // THEN Taste gains a line saying so, and later Scenes honour it
  it("scenes › Redo, with a Direction and another model if wanted › Remember this", async () => {
    const lesson = "Keep school procedure to a line.";
    const { play, engine, storyId, head, models, state, mac } = playable(hogwartsStoryFile(), {
      writer: [writer({ frame: PLAN }), writer({ frame: PLAN, taste: lesson }), writer({ call: "end" }), writer({ frame: { title: "Breakfast", place: "The Great Hall", purpose: "p", exit: "e" }, comes_in: ["Draconia Malfoy"], minutes: 616 })]
    });
    await play("I ask about the prefects' rota.");
    engine.redo(storyId, head(), "don't dwell on school procedure", true, "trace-redo");
    await engine.settled(storyId);
    expect(models.writer.requests[1]!.prompt).toMatch(/they asked for it to be remembered: put it in taste/);
    expect(besideOf(mac, storyId).taste).toEqual([lesson]);

    await play("I say goodnight.");
    await play("In the morning I find Draconia at breakfast.");
    expect(state().scene!.title).toBe("Breakfast");
    expect(models.writer.requests.at(-1)!.prompt).toContain(lesson);
    expect(models.actor.requests.at(-1)!.prompt).toContain(lesson);
  });

  it("redoes the Reply that closed a Scene, which opens again, and never a Reply the player closed the Scene after", async () => {
    // Redoing the first exchange takes the Beat Note that planned the Scene off the Path, so the Writer plans it again.
    const { play, engine, storyId, head, view, state } = playable(hogwartsStoryFile(), { writer: [writer({ frame: PLAN, call: "end" }), writer({ frame: PLAN })] });
    await play("I say goodnight.");
    expect(view().day_view).not.toBeNull();
    // The Scene's end is on the Path after the Reply; the Redo takes it off with the Reply.
    engine.redo(storyId, head(), "she should not leave yet", false, "trace-redo");
    await engine.settled(storyId);
    expect(view().day_view).toBeNull();
    expect(state().scene!.closed).toBeNull();
    expect(state().recorded).toEqual([]);
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    expect(() => engine.redo(storyId, head(), null, false, "trace-again")).toThrow(expect.objectContaining({ code: "invalid" }));
    expect(() => engine.redo(storyId, head(), null, true, "trace-again")).toThrow(LinkError);
  });

  it("redoes the latest Reply after Focus or Linger was set, keeping them for the new Reply", async () => {
    const { play, engine, storyId, head, models, state, path } = playable(hogwartsStoryFile({ who: ["Hermione Granger", "Harry Potter"] }), { writer: [writer({ frame: PLAN, comes_in: ["Hermione Granger", "Harry Potter"] }), writer({ frame: PLAN, comes_in: ["Hermione Granger", "Harry Potter"] })] });
    await play("I sit down.");
    engine.setFocus(storyId, head(), "Hermione Granger", "t1");
    engine.setLinger(storyId, head(), true, "t2");
    engine.redo(storyId, head(), null, false, "t3");
    await engine.settled(storyId);
    expect(path().slice(-6).map(payload => payload.kind)).toEqual(["move", "focus_set", "linger_set", "redo", "beat_note", "reply"]);
    expect(state().scene).toMatchObject({ focus: "Hermione Granger", linger: true });
    expect(models.writer.requests[1]!.prompt).toMatch(/Focus is on Hermione Granger/);
    expect(models.actor.requests[1]!.prompt).toMatch(/Stay close beside Hermione Granger/);
  });

  it("asks for a Direction to remember, and refuses a Redo while a Reply is being written", async () => {
    const { play, engine, storyId, head } = playable();
    await play("I sit down.");
    expect(() => engine.redo(storyId, head(), "  ", true, "t")).toThrow(expect.objectContaining({ code: "invalid", message: expect.stringMatching(/Direction to remember/) }));
    engine.move(storyId, "I wave.", head(), "t2");
    expect(() => engine.redo(storyId, head(), null, false, "t3")).toThrow(expect.objectContaining({ code: "busy" }));
    await engine.settled(storyId);
  });
});

const DRACONIA = "Draconia Malfoy";
const HERMIONE = "Hermione Granger";
const ROOPESH = "Roopesh Gantasala";
const said = (entry: string, text: string) => ({ entry, text });

/** An Editor's answer: the slips it sets right in place, and what breaks the Reply. */
const editor = (answer: { fixes?: unknown[]; breaks?: unknown[] } = {}): Script => ({ answer: JSON.stringify({ fixes: [], breaks: [], ...answer }) });

/** What the Story keeps from Scene 18: the ribbon on his wrist was Draconia's grandmother's. */
const RIBBON: TruthUpdate = {
  ...emptyUpdate(),
  truths: {
    open: [{
      id: "t-ribbon", kind: "status", what: "The silk ribbon on Roopesh's wrist was Draconia's grandmother's; she tied it there as a lease.", terms: [],
      who: [DRACONIA, ROOPESH], knownTo: [DRACONIA, ROOPESH], due: null, replaces: null, sources: [said("e-18", "It's silk, it was my grandmother's")]
    }],
    close: []
  }
};

/** What the Story keeps from Scene 6: he showed Hermione he can stop time, and nobody else knows. */
const STOPPED_TIME: TruthUpdate = {
  ...emptyUpdate(),
  truths: {
    open: [{
      id: "t-power", kind: "secret", what: "Roopesh can stop time.", terms: [], who: [ROOPESH], knownTo: [ROOPESH, HERMIONE], due: null, replaces: null,
      sources: [said("e-6", "Every clock in the library stopped, and only the two of them moved.")]
    }],
    close: []
  },
  beliefs: { open: [{ id: "b-power", holder: HERMIONE, what: "Roopesh can stop time; he showed her in the library", true: true, sources: [said("e-6", "Every clock in the library stopped")] }], close: [] }
};

/**
 * The Malfoy Problem after [scene]'s record kept [truth], with its next Scene open in the Gryffindor common room late on
 * Thursday 19 September 1991, Draconia and Hermione there.
 */
function kept(scene: number, truth: TruthUpdate, scripts: Parameters<typeof playable>[1] = {}) {
  const story = playable(malfoyProblemStoryFile(), scripts);
  story.write({ kind: "scene_closed", by: "player" });
  story.write({ kind: "chronicle", scene, summary: "A Scene was played.", paragraph: "A Scene was played.", moments: [], told: [], known: [], bonds: [], engagements: [], changed: [], truth, dropped: [], callId: "c", model: { provider: "claude", model: "claude-opus-5-5" } });
  story.write({ kind: "scene_opened", number: 2, title: "Between them", place: "The Gryffindor common room", at: "Day 14 23:30", who: [DRACONIA, HERMIONE], prose: "The fire is down to embers. Draconia has not gone back to the dungeons.", startsAt: null, purpose: "Draconia and Hermione decide who sits nearer him.", exit: "One of them goes to bed." });
  return story;
}

/** The text of every event a phone was sent, so a test can say what the player could have read. */
const sent = (events: OutgoingEvent[]) => events.map(event => JSON.stringify(event.event)).join("\n");

describe("every Reply is checked before it is read (docs/adr/0019)", () => {
  // GIVEN Draconia said in Scene 18 that the ribbon was her grandmother's
  // WHEN a Reply has her say she bought it in Paris
  // THEN the player reads that it was her grandmother's
  it("scenes › Every Reply is checked before it is read › The ribbon's story", async () => {
    const paris = "Draconia catches his wrist and turns the ribbon over. “I bought this in Paris last spring,” she says. “Don't you dare fray it.”";
    const story = kept(18, RIBBON, {
      actor: [{ answer: paris }],
      editor: [editor({ fixes: [{ wrong: "I bought this in Paris last spring", right: "This was my grandmother's", why: "Draconia said in Scene 18 that the ribbon was her grandmother's." }] })]
    });
    await story.play("I hold out my wrist so she can see the ribbon.");
    const read = "Draconia catches his wrist and turns the ribbon over. “This was my grandmother's,” she says. “Don't you dare fray it.”";
    expect(story.view().exchanges.at(-1)!.reply).toEqual({ entry_id: story.head(), text: read });
    expect(sent(story.events)).not.toContain("Paris");
    // The Editor was given what Scene 18 established, in the words it was said in; the slip cost no second Reply.
    expect(story.models.editor.requests[0]!.prompt).toMatch(/since Scene 18: The silk ribbon on Roopesh's wrist was Draconia's grandmother's[^\n]*"It's silk, it was my grandmother's"/);
    expect(story.models.actor.requests).toHaveLength(1);
  });

  // WHEN a Reply says what the Player Character feels about Hermione
  // THEN it is written again without it before the player reads it
  it("scenes › Every Reply is checked before it is read › Deciding for him, caught", async () => {
    const feels = "Hermione closes the book on her finger. Roopesh feels the old pull toward her, and hates it.";
    const again = "Hermione closes the book on her finger and waits to see what he will do.";
    const story = kept(6, emptyUpdate(), { actor: [{ answer: feels }, { answer: again }] });
    await story.play("I sit down beside Hermione.");
    expect(story.view().exchanges.at(-1)!.reply).toEqual({ entry_id: story.head(), text: again });
    expect(sent(story.events)).not.toContain("old pull");
    // Written again once, by the Actor, with the Editor's note and what it wrote; then checked again.
    const rewrite = story.models.actor.requests[1]!.prompt;
    expect(rewrite).toContain("Decides for Roopesh Gantasala: \"Roopesh feels the old pull toward her, and hates it\".");
    expect(rewrite).toContain(feels);
    expect(story.models.editor.requests).toHaveLength(2);
    expect(story.models.editor.requests[1]!.prompt).toContain(`<reply>\n${again}\n</reply>`);
    // The phone was told the Reply was written, checked, written again and checked again.
    const steps = story.events.flatMap(event => (event.event.kind === "turn_step" ? [event.event.turn_step] : []));
    expect(steps).toEqual(["writing", "checking", "writing", "checking"]);
  });

  // GIVEN a Reply narrated midnight
  // WHEN the next Reply is written
  // THEN it does not go back to half past ten
  it("scenes › Every Reply is checked before it is read › The clock kept", async () => {
    const opening = { title: "The insult", place: "The Three Broomsticks", purpose: "Draconia decides whether he is worth insulting twice.", exit: "She leaves, or sits down." };
    const midnight = "Somewhere above the village a clock strikes midnight, and Madam Rosmerta starts stacking chairs around them.";
    const story = playable(malfoyProblemStoryFile(), {
      writer: [writer({ frame: opening, minutes: 140 }), writer({ minutes: 5 })],
      actor: [{ answer: midnight }, { answer: "“It's only half past ten,” Draconia says. “Nobody's going anywhere.”" }],
      editor: [editor(), editor({ fixes: [{ wrong: "half past ten", right: "five past twelve", why: "Midnight struck in the last Reply; it is 12:05 am." }] })]
    });
    await story.play("I stay where I am and finish my drink.");
    await story.play("I ask Draconia whether she means to go back to the castle.");
    expect(story.view().exchanges.at(-1)!.reply!.text).toBe("“It's only five past twelve,” Draconia says. “Nobody's going anywhere.”");
    expect(sent(story.events)).not.toContain("half past ten");
    // The Editor read the Reply against the Scene so far, where midnight struck, and the time now.
    const checked = story.models.editor.requests[1]!.prompt;
    expect(checked).toContain(midnight);
    expect(checked).toContain("<now>\nIt is Saturday 7 September 1991, 12:05 am (1991-09-07 00:05).\n</now>");
  });

  // GIVEN a Reply that still has a person act on what they could not know after it is written again
  // THEN the player sees the Reply with a note saying so, and can Redo it
  it("scenes › Every Reply is checked before it is read › A break that will not go", async () => {
    const leak = { kind: "leak", who: DRACONIA, words: "Stop the clocks again", why: "Only Hermione knows Roopesh can stop time; Draconia has never seen it or been told." };
    const first = "Draconia leans across Hermione. “Stop the clocks again, Gantasala, and I'll tell my father what you are.”";
    const second = "Draconia smiles without warmth. “Stop the clocks again and see what happens.”";
    const story = kept(6, STOPPED_TIME, {
      actor: [{ answer: first }, { answer: second }, { answer: "Draconia says nothing at all, and watches the fire." }],
      editor: [editor({ breaks: [leak] }), editor({ breaks: [{ ...leak, words: "Stop the clocks again and see what happens" }] })]
    });
    await story.play("I sit down between them.");
    const note = "Leak (Draconia Malfoy): \"Stop the clocks again and see what happens\". Only Hermione knows Roopesh can stop time; Draconia has never seen it or been told.";
    const shown = story.view().exchanges.at(-1)!.reply!;
    expect(shown).toEqual({ entry_id: story.head(), text: second, note });
    expect(story.events.at(-1)!.event).toMatchObject({ kind: "reply", passage: { text: second, note } });
    expect(story.path().at(-1)).toMatchObject({ kind: "reply", text: second, note });
    expect(story.models.actor.requests).toHaveLength(2);

    // The player can Redo it, and the Reply written then is checked like any other.
    story.engine.redo(story.storyId, story.head(), null, false, "trace-redo");
    await story.engine.settled(story.storyId);
    expect(story.view().exchanges.at(-1)!.reply).toEqual({ entry_id: story.head(), text: "Draconia says nothing at all, and watches the fire." });
  });
});

describe("what each person knows, checked (openspec living-world)", () => {
  // GIVEN only Hermione knows he can stop time
  // WHEN a Reply has Draconia mention it
  // THEN the Reply is written again before the player reads it, and Draconia does not mention it
  it("living-world › Characters know only what they could know › A slip caught before it is read", async () => {
    const slip = "Draconia leans across Hermione. “Stop the clocks again, Gantasala, and I'll tell my father what you are.”";
    const kept_ = "Draconia leans across Hermione to take the last biscuit, and says nothing to either of them.";
    const story = kept(6, STOPPED_TIME, {
      actor: [{ answer: slip }, { answer: kept_ }],
      editor: [editor({ breaks: [{ kind: "leak", who: DRACONIA, words: "Stop the clocks again, Gantasala", why: "Only Hermione knows Roopesh can stop time; Draconia has never seen it or been told." }] })]
    });
    await story.play("I sit down between them.");
    expect(story.view().exchanges.at(-1)!.reply).toEqual({ entry_id: story.head(), text: kept_ });
    expect(sent(story.events)).not.toContain("clocks");
    // Whoever writes them is told plainly who knows it and who does not, and the rewrite is told what leaked.
    for (const request of story.models.actor.requests) {
      expect(request.prompt).toContain("Hermione Granger knows Roopesh can stop time; he showed her in the library");
      expect(request.prompt).toContain("Draconia Malfoy does not know Roopesh can stop time.");
    }
    expect(story.models.actor.requests[1]!.prompt).toContain("Leak (Draconia Malfoy): \"Stop the clocks again, Gantasala\".");
  });
});

/** Exchanges of the open Scene, written as play would have written them, the first planning it. */
function exchanges(story: ReturnType<typeof playable>, moves: { move: string; reply: string }[]) {
  const model = { provider: "claude" as const, model: "claude-opus-5-5" };
  for (const [index, { move, reply }] of moves.entries()) {
    story.write({ kind: "move", text: move });
    story.write({ kind: "beat_note", plan: index === 0 ? { purpose: "Something between them turns.", exit: "It turns, or it does not." } : null, here: story.state().scene!.here, goes: [], beats: beats(0), note: "n", call: "continue", intensity: 2, arcMoved: true, clock: story.state().clock, inPlay: [], callId: "c", model });
    story.write({ kind: "reply", text: reply, callId: "c", model });
  }
}

const ordinary = (from: number, count: number, where = "by the fire") => Array.from({ length: count }, (_, index) => ({ move: `I pour the tea ${where} (${from + index}).`, reply: `They argue about the Charms essay ${where} (${from + index}).` }));

/** The Chronicler's record of a Scene so far, from its passages: what was agreed at its start, in its own words. */
function recordedSoFar(request: ModelRequest): Script {
  const passages = (request.facts as { passages: { label: string; text: string }[] }).passages;
  const agreed = passages.find(item => item.text.includes("Not Ron, not Harry"))!;
  return {
    answer: JSON.stringify({
      summary: "They swore the suite to secrecy.", paragraph: "In the secret suite the three of them agreed that nobody else would ever come in, then argued the Charms essay into the night.",
      moments: [{ what: "They agree that nobody else ever comes into the suite.", quotes: [{ entry: agreed.label, text: "Nobody else. Not Ron, not Harry, not anyone." }], there: [DRACONIA, HERMIONE], weight: 4 }],
      told: [], known: [], bonds: [], engagements: [], changed: [],
      truth: { ...nothingTrue(), truths: { open: [{ kind: "agreement", what: "Nobody but the three of them ever comes into the secret suite.", terms: ["Not Ron, not Harry, not anyone"], who: [DRACONIA, HERMIONE, ROOPESH], known_to: [DRACONIA, HERMIONE, ROOPESH], due: null, replaces: null, quotes: [{ entry: agreed.label, text: "Nobody else. Not Ron, not Harry, not anyone." }] }], close: [] } }
    })
  };
}

describe("a long Scene (the-storys-mind design decision 8)", () => {
  // GIVEN a Scene in the secret suite has run past thirty exchanges
  // WHEN the next Move is sent
  // THEN the Scene so far is recorded first, and what was decided at its start still holds in the Reply
  it("scenes › A long Scene is recorded as it goes › Thirty exchanges in", async () => {
    const suite = hogwartsStoryFile({ title: "The secret suite", place: "The Room of Requirement", who: [DRACONIA, HERMIONE], prose: "The door appears where there was only wall." });
    const letIn = "“Oh, let him in,” Draconia says, and opens the door to Ron.";
    const shut = "Draconia looks at the door, and does not move. Hermione turns a page.";
    const story = playable(suite, {
      chronicler: [{ from: recordedSoFar }],
      actor: [{ answer: letIn }, { answer: shut }],
      editor: [editor({ breaks: [{ kind: "contradiction", who: DRACONIA, words: "opens the door to Ron", why: "They agreed at the Scene's start that nobody else ever comes into the suite." }] })]
    });
    exchanges(story, [{ move: "I lock the door behind us. “Nobody else ever comes in here. Agreed?”", reply: "“Agreed,” Draconia says. Hermione nods. “Nobody else. Not Ron, not Harry, not anyone.”" }, ...ordinary(1, 30)]);
    expect(story.state().scene!.number).toBe(1);

    await story.play("Ron knocks on the door and asks to come in.");
    // Recorded first, before the Writer planned the Reply: the record is on the Path after the Move.
    const left = story.path().map(payload => payload.kind);
    expect(left.slice(left.lastIndexOf("move"))).toEqual(["move", "scene_recorded", "beat_note", "reply"]);
    const calls = story.mac.db.prepare("SELECT agent FROM calls WHERE trace_id = 'trace-1' ORDER BY rowid").all() as { agent: string }[];
    expect(calls.map(call => call.agent)).toEqual(["chronicler", "writer", "actor", "editor", "actor", "editor"]);
    expect(story.events.flatMap(event => (event.event.kind === "turn_step" ? [event.event.turn_step] : []))).toEqual(["looking_back", "writing", "checking", "writing", "checking"]);
    expect(story.state().scene).toMatchObject({ number: 1, closed: null });
    expect(Object.values(story.state().truth.truths)).toEqual([expect.objectContaining({ what: "Nobody but the three of them ever comes into the secret suite.", opened: 1, closed: null })]);

    // From then on the prompts carry the record and the latest exchanges word for word, not the Scene's start.
    for (const prompt of [story.models.writer.requests[0]!.prompt, story.models.actor.requests[0]!.prompt, story.models.editor.requests[0]!.prompt]) {
      expect(prompt).toContain("In the secret suite the three of them agreed that nobody else would ever come in");
      expect(prompt).toContain("Nobody but the three of them ever comes into the secret suite.");
      expect(prompt).toContain("I pour the tea by the fire (30).");
      const scene = prompt.slice(prompt.indexOf("<scene_so_far>"));
      expect(scene).not.toContain("I pour the tea by the fire (1).");
      expect(scene).not.toContain("I lock the door behind us.");
    }
    // The Writer can still read any earlier passage.
    expect(story.models.writer.requests[0]!.prompt).toMatch(/read the Scene in full/);
    // What was decided at its start holds in the Reply.
    expect(story.view().exchanges.at(-1)!.reply!.text).toBe(shut);

    // It is recorded once: the next Move goes straight to the Writer.
    await story.play("I tell Ron through the door that we are studying.");
    expect(story.path().filter(payload => payload.kind === "scene_recorded")).toHaveLength(1);
    expect(story.models.chronicler.requests).toHaveLength(1);
  });

  // GIVEN a long Scene in the dorm in which they have left for the Astronomy Tower and a different night has begun
  // WHEN the next Move is answered
  // THEN the dorm Scene closes and a new Scene opens with its own title card
  it("scenes › A long Scene is recorded as it goes › A Scene that has become another", async () => {
    const dorm = hogwartsStoryFile({ title: "Lights out", place: "The boys' dormitory", who: ["Harry Potter", "Ron Weasley"], prose: "Ron has the board out on his bed." });
    const tower = { title: "The Astronomy Tower", place: "The Astronomy Tower", purpose: "Draconia decides whether to say why she came.", exit: "She says it, or goes back down." };
    const story = playable(dorm, {
      writer: [writer({ leaves_scene: true, frame: tower, comes_in: [DRACONIA], minutes: 5 })],
      actor: [{ answer: "Draconia does not turn round. “You took your time.”" }]
    });
    exchanges(story, [
      { move: "I sit on the end of Ron's bed.", reply: "Ron moves a knight. “Your go, Roo.”" },
      ...ordinary(1, 26, "in the dormitory"),
      { move: "Harry and I climb to the Astronomy Tower to look at the stars.", reply: "The tower is cold and the stars are very close." },
      { move: "We go back down, and I sleep.", reply: "The castle sleeps." },
      { move: "The next night I climb back up to the tower alone.", reply: "Someone is already there at the parapet, silver-blonde in the moonlight." },
      { move: "I wait by the telescope.", reply: "Draconia Malfoy is at the parapet, and does not look round." }
    ]);
    await story.play("I ask Draconia why she came.");

    // The Writer was told the Scene has run long, and to close it if it has become another.
    expect(story.models.writer.requests[0]!.prompt).toMatch(/This Scene has run 31 exchanges[^\n]*If it has become another one/);
    // The dorm Scene closes where the Move is, and is recorded and ended like any other; the new one opens with the Move.
    const kinds = story.path().map(payload => payload.kind);
    const from = kinds.lastIndexOf("move");
    expect(kinds.slice(from, from + 3)).toEqual(["move", "scene_recorded", "scene_closed"]);
    expect(kinds.slice(-3)).toEqual(["scene_opened", "beat_note", "reply"]);
    expect(story.path()[from + 2]).toEqual({ kind: "scene_closed", by: "move" });
    const shown = story.view();
    expect(shown.scene).toMatchObject({ number: 2, title: "The Astronomy Tower", place: "The Astronomy Tower" });
    expect(shown.earlier_scenes.map(scene => scene.title)).toEqual(["Lights out"]);
    expect(shown.exchanges).toEqual([{ move: { entry_id: expect.any(String), text: "I ask Draconia why she came." }, reply: { entry_id: expect.any(String), text: "Draconia does not turn round. “You took your time.”" } }]);
    expect(story.events.find(event => event.event.kind === "scene_opened")!.event.scene).toMatchObject({ title: "The Astronomy Tower" });
    // Its end records only what came after the record kept while it was played, and tells the whole Scene.
    const ending = story.models.chronicler.requests[1]!;
    expect((ending.facts as { passages: { text: string }[] }).passages.map(item => item.text)).toEqual(["I ask Draconia why she came."]);
    expect(ending.prompt).toContain("The Scene was played to its end, and something between them turned.");
  });
});

