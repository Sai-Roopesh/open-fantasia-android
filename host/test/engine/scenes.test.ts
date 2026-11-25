import { describe, expect, it } from "vitest";
import { nothingTrue } from "../../src/agents/truth-record.js";
import { emptyUpdate, type TruthUpdate } from "../../src/story/truth.js";
import { LinkError } from "../../src/errors.js";
import type { OutgoingEvent } from "../../src/engine/engine.js";
import type { ModelRequest } from "../../src/models/model-call.js";
import type { Script } from "../../src/models/scripted.js";
import type { Beat } from "../../src/story/state.js";
import { besideOf } from "../../src/store/beside.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile, malfoyProblemStoryFile } from "../support/story-files.js";

const beats = (inPlay: number): Beat[] => [0, 1, 2].map(index => ({ text: `beat ${index + 1}`, status: index < inPlay ? "done" : index === inPlay ? "in_play" : "pending" }));
const PLAN = { title: "After curfew", place: "The Gryffindor common room", purpose: "Hermione decides whether to ask what he is.", exit: "She asks, or goes up to bed." };

/** A Writer's answer for the common room with Hermione, changed as a scenario needs: the Reply two minutes on. */
function writer(changes: Record<string, unknown> = {}): Script {
  return { answer: JSON.stringify({ frame: null, comes_in: [], goes: [], beats: beats(0), note: "Hermione closes her book.", call: "continue", intensity: 2, minutes: 2, in_play: [], moves_to: null, ...changes }) };
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
    expect(moment).toMatch(/^<now>\nIt is Thursday 5 September 1991, 4:00 pm \(1991-09-05 16:00\)\.\n<\/now>[\s\S]*holding on/);
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
  // THEN the Scene continues in the dormitory, and the Reply plays it
  // AND no Day View appears
  it("scenes › Only End Scene ends a Scene › Walking out keeps the Scene open", async () => {
    const move = "I go to my room; Harry, Ron and Neville are playing a board game";
    const { play, path, view, events, models } = playable(hogwartsStoryFile(), {
      writer: [writer({ moves_to: "The boys' dormitory", frame: { title: "Lights out", place: "The boys' dormitory", purpose: "Ron finds out where Roopesh goes at night.", exit: "Ron asks, or lets it go." }, comes_in: ["Harry Potter", "Ron Weasley", "Neville Longbottom"], goes: ["Hermione Granger"], minutes: 5 })],
      actor: [{ answer: "Ron looks up from the board. \"Your go, Roo.\"" }]
    });
    await play(move);

    // A change of place updates the Scene without running its end or opening another.
    const kinds = path().map(payload => payload.kind);
    const left = kinds.lastIndexOf("move");
    expect(kinds.slice(left)).toEqual(["move", "beat_note", "reply"]);
    expect(models.chronicler.requests).toHaveLength(0);
    expect(models.weaver.requests).toHaveLength(0);
    expect(models.writer.requests).toHaveLength(1);
    const shown = view();
    expect(shown.scene).toMatchObject({ number: 1, title: "After curfew", place: "The boys' dormitory" });
    expect(shown.scene.people.map(person => person.name)).toEqual(["Harry Potter", "Ron Weasley", "Neville Longbottom"]);
    expect(shown.exchanges.at(-1)).toEqual({ move: { entry_id: expect.any(String), text: move }, reply: { entry_id: expect.any(String), text: "Ron looks up from the board. \"Your go, Roo.\"" } });
    expect(shown.earlier_scenes).toEqual([]);
    expect(shown.day_view).toBeNull();
    expect(models.actor.requests[0]!.prompt).toContain(move); // Location is computed in the same writing generation.
    expect(events.map(event => event.event.kind).filter(kind => kind !== "turn_step" && kind !== "scene_end_step")).toEqual(["move", "reply"]);
    expect(events.flatMap(event => (event.event.kind === "turn_step" ? [event.event.turn_step] : []))).toEqual(["writing", "checking"]);
    expect(events.some(event => event.event.kind === "scene_end_step")).toBe(false);
  });

  // GIVEN a Scene in the Great Hall in which Hermione wants to know where he went on Wednesday
  // WHEN the Move is "I go to the library with Hermione"
  // THEN the same Scene goes on in the library, the place shown changes, and no new title card opens
  it("scenes › Only End Scene ends a Scene › Walking somewhere together keeps the Scene", async () => {
    const hall = { title: "Wednesday", place: "The Great Hall", purpose: "Hermione decides whether to believe where he says he went on Wednesday.", exit: "She lets it go, or says she knows he is lying." };
    const { play, path, view, events, models } = playable(hogwartsStoryFile({ title: "Wednesday", place: "The Great Hall", at: "Day 3 12:30", who: ["Hermione Granger"] }), {
      writer: [writer({ frame: hall }), writer({ moves_to: "The library", minutes: 8 })]
    });
    await play("I tell Hermione I was in the library on Wednesday.");
    await play("I go to the library with Hermione.");
    expect(path().filter(payload => payload.kind === "scene_opened")).toHaveLength(1);
    expect(view().scene).toMatchObject({ number: 1, title: "Wednesday", place: "The library" });
    expect(events.filter(event => event.event.kind === "scene_opened")).toHaveLength(0);
    expect(models.writer.requests[1]!.system).toContain("Only the player's End Scene closes a Scene.");
  });

  // GIVEN a Scene whose purpose has turned: Draconia has said what she came to say
  // WHEN the Reply lands it
  // THEN the Scene stays open with the composer ready, and no Day View opens until the player ends the Scene or a Move
  //   leaves it
  it("scenes › Only End Scene ends a Scene › The Story never closes a Scene", async () => {
    const { play, path, view, events, models } = playable(hogwartsStoryFile(), { writer: [writer({ frame: PLAN, call: "land", note: "Hermione says what she came to say, and goes quiet." })] });
    await play("I say goodnight.");
    // The Reply lands the Scene, and the Scene stays open: no close, no Scene's end, no Day View.
    expect(path().at(-1)).toMatchObject({ kind: "reply" });
    expect(path().some(payload => payload.kind === "scene_closed")).toBe(false);
    const shown = view();
    expect(shown.day_view).toBeNull();
    expect(shown.turn.kind).toBe("idle");
    expect(events.some(event => event.event.kind === "scene_closed")).toBe(false);
    // The writing prompt runs free-text (no strict JSON schema) and never offers a way to close the Scene.
    expect(models.writer.requests[0]!.schema).toBeUndefined();
    expect(models.writer.requests[0]!.system).toContain("Only the player's End Scene closes a Scene.");
    expect(models.writer.requests[0]!.system).not.toContain("leaves_scene");
  });

  // WHEN the player taps End scene after a Reply
  // THEN the Scene is closed at that Reply and the Day View opens
  it("scenes › Only End Scene ends a Scene › The player ends a Scene", async () => {
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
  // THEN a beat can develop without a forced Arc deadline
  it("scenes › Pacing follows play › A beat can develop without a deadline", async () => {
    const stalled = { beats: beats(0) };
    const { play, models, state } = playable(hogwartsStoryFile(), {
      writer: [writer({ ...stalled, frame: PLAN }), writer(stalled), writer(stalled),
        writer({ beats: beats(1), note: "Hermione puts the book down: she asks where he goes at night." })]
    });
    for (const move of ["I sit down.", "I look at the fire.", "I yawn."]) await play(move);
    expect(models.writer.requests[2]!.prompt).not.toMatch(/No Arc has moved/);
    await play("I look at the fire again.");
    expect(models.writer.requests[3]!.prompt).not.toMatch(/No Arc has moved/);
    expect(models.writer.requests).toHaveLength(4);
    expect(state().scene!.beats.findIndex(beat => beat.status === "in_play")).toBe(1);
    expect(models.actor.requests[3]!.prompt).toContain("Hermione puts the book down: she asks where he goes at night.");
  });

  it("does not force a beat to happen after four exchanges", async () => {
    const { play, models } = playable(hogwartsStoryFile(), { writer: [writer({ frame: PLAN })] });
    for (const move of ["I sit down.", "I look at the fire.", "I yawn.", "I stretch."]) await play(move);
    expect(models.writer.requests[3]!.prompt).not.toMatch(/in play for/);
    await play("I look at Hermione.");
    expect(models.writer.requests[4]!.prompt).not.toMatch(/make it happen now|in play for 4 Replies/);
  });

  // GIVEN Linger is on in the common room with Hermione
  // WHEN eight exchanges pass with no beat happening
  // THEN no beat is forced and the Scene stays open
  it("scenes › Linger holds the moment › Lingering with Hermione", async () => {
    const still = { beats: beats(0) };
    // The fifth answer lands the Scene: with Linger on, it goes on as it was.
    const { play, engine, storyId, head, models, state, path } = playable(hogwartsStoryFile(), {
      writer: [writer({ ...still, frame: PLAN }), writer(still), writer(still), writer(still), writer({ ...still, call: "land" }), writer(still), writer(still), writer(still)]
    });
    engine.setLinger(storyId, head(), true, "trace-linger");
    for (let exchange = 1; exchange <= 8; exchange++) await play(`I stay where I am, by the fire (${exchange}).`);
    expect(models.writer.requests).toHaveLength(8);
    expect(models.writer.requests.every(request => /Linger is on/.test(request.prompt))).toBe(true);
    expect(models.writer.requests.some(request => /make it happen now|No Arc has moved/.test(request.prompt))).toBe(false);
    expect(path().some(payload => payload.kind === "scene_closed")).toBe(false);
    expect(state().scene).toMatchObject({ closed: null, linger: true });
    expect(state().scene!.beats).toEqual(beats(0));
  });

  // GIVEN Linger is on in the common room with Hermione
  // WHEN the Move is "We walk down to the lake and talk until the sun comes up"
  // THEN the same Scene goes on at the lake, with no new title card and no Scene's end, until the player taps End scene
  it("scenes › Linger holds the moment › Lingering never leaves the Scene", async () => {
    const { play, engine, storyId, head, path, state, models } = playable(hogwartsStoryFile(), {
      writer: [writer({ frame: PLAN }), writer({ moves_to: "The lake shore", frame: { title: "Sunrise", place: "The lake shore", purpose: "p", exit: "e" }, minutes: 480 })]
    });
    await play("I sit down beside Hermione.");
    engine.setLinger(storyId, head(), true, "trace-linger");
    await play("We walk down to the lake and talk until the sun comes up.");
    // The Writer tried to leave: under Linger the Scene goes on, at the lake, and nothing of a Scene's end runs.
    expect(path().filter(payload => payload.kind === "scene_closed")).toHaveLength(0);
    expect(path().filter(payload => payload.kind === "scene_opened")).toHaveLength(1);
    expect(state().scene).toMatchObject({ number: 1, closed: null, linger: true, place: "The lake shore" });
    expect(models.chronicler.requests).toHaveLength(0);
    expect(models.writer.requests.at(-1)!.prompt).toContain("Linger is on: hold the moment without forcing a payoff.");
  });

  it("fails the turn when the Writer fails twice, keeping the Move, and runs the Writer again on Retry", async () => {
    const { engine, storyId, head, mac, models, view, events } = playable(hogwartsStoryFile(), { writer: [{ fail: "Sonnet is overloaded" }, { fail: "Sonnet is overloaded" }, writer({ frame: PLAN })] });
    engine.move(storyId, "I sit down.", head(), "trace-1");
    await engine.settled(storyId);
    expect(mac.tree.entry(head())!.payload).toEqual({ kind: "move", text: "I sit down." });
    // The Writer's model and its second model both failed.
    expect(view().turn).toEqual({ kind: "failed", reason: expect.stringMatching(/could not be written.*Sonnet is overloaded/), trace_id: "trace-1", job: "actor" });
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
    expect(mac.tree.entry(head())!.payload.kind).toBe("move");
    expect(view().turn).toMatchObject({ kind: "failed", reason: expect.stringMatching(/Opus is overloaded/) });
    expect(() => engine.move(storyId, "I wave.", head(), "trace-x")).toThrow(LinkError);

    engine.retry(storyId, "trace-2");
    await engine.settled(storyId);
    expect(models.writer.requests).toHaveLength(3);
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
        writer({ moves_to: "The library", frame: { title: "The library", place: "The library", purpose: "p", exit: "e" }, comes_in: ["Hermione Granger"], minutes: 60 })
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
    engine.endScene(storyId, head(), "trace-end-supper");
    await engine.ended(storyId);
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
      expect(request.prompt).toContain("Focus is on Hermione Granger.");
      expect(state().scene!.here).toEqual(["Hermione Granger", "Harry Potter"]);
    }
  });

  // GIVEN Focus is on Hermione
  // WHEN the Move is "Ron stumbles down the stairs in his pyjamas"
  // THEN Ron is in the Scene and the Reply plays him
  it("scenes › Focus keeps a Scene close to one person › A Move brings someone in", async () => {
    const { play, view } = playable(hogwartsStoryFile(), {
      writer: [writer({ frame: PLAN, comes_in: ["Hermione Granger", "Ron Weasley"], note: "Ron, half asleep, wants to know why they are both still up." })]
    });
    expect(view().focus).toBe("Hermione Granger");
    await play("Ron stumbles down the stairs in his pyjamas");
    expect(view().scene.people.map(person => person.name)).toEqual(["Hermione Granger", "Ron Weasley"]);
    expect(view().scene.people.map(person => person.name)).toEqual(["Hermione Granger", "Ron Weasley"]);
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
    // An unremembered Redo direction is one-shot for that rewrite only: it must not bleed into later Moves or notes.
    expect(models.actor.requests.at(-1)!.prompt).not.toContain(direction);
    expect(models.requests.filter(request => request.agent === "actor").at(-1)!.conversation?.map(turn => turn.text).join("\n")).not.toContain(direction);
    expect(besideOf(mac, storyId, head()).notes.some(note => note.text === direction)).toBe(false);
    expect(besideOf(mac, storyId).taste).toEqual([]);
  });

  // WHEN the player Redoes with the Direction "don't dwell on school procedure" and ticks "remember this"
  // THEN it is kept as a Note (not Taste), and later Scenes honour it
  it("scenes › Redo, with a Direction and another model if wanted › Remember this", async () => {
    const { play, engine, storyId, head, models, state, mac } = playable(hogwartsStoryFile(), {
      writer: [writer({ frame: PLAN }), writer({ frame: PLAN }), writer({}), writer({ moves_to: "The Great Hall", frame: { title: "Breakfast", place: "The Great Hall", purpose: "p", exit: "e" }, comes_in: ["Draconia Malfoy"], minutes: 616 })]
    });
    await play("I ask about the prefects' rota.");
    engine.redo(storyId, head(), "don't dwell on school procedure", true, "trace-redo");
    await engine.settled(storyId);
    expect(models.writer.requests[1]!.prompt).toContain("<active_directions>");
    expect(models.writer.requests[1]!.prompt).toContain("don't dwell on school procedure");
    expect(besideOf(mac, storyId).taste).toEqual([]);
    expect(besideOf(mac, storyId).notes.some(note => note.text === "don't dwell on school procedure")).toBe(true);

    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    await play("In the morning I find Draconia at breakfast.");
    expect(state().scene!.title).toBe("Breakfast");
    expect(models.writer.requests.at(-1)!.prompt).toContain("don't dwell on school procedure");
    expect(models.actor.requests.at(-1)!.prompt).toContain("don't dwell on school procedure");
  });

  it("redoes the first Reply after End Scene, keeping the previous Scene's end", async () => {
    const dorm = { title: "Lights out", place: "The boys' dormitory", purpose: "p", exit: "e" };
    const { play, engine, storyId, head, path, models, view } = playable(hogwartsStoryFile(), {
      writer: [writer({ frame: PLAN }), writer({ moves_to: dorm.place, frame: dorm, comes_in: ["Harry Potter"], minutes: 5 }), writer({ frame: dorm, comes_in: ["Harry Potter"] }), writer({ frame: dorm, comes_in: ["Harry Potter"] })]
    });
    await play("I sit down by the fire.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    await play("I go up to the dormitory.");
    const recorded = models.chronicler.requests.length;
    const woven = models.weaver.requests.length;
    expect(view().scene.title).toBe("Lights out");
    engine.redo(storyId, head(), "don't decide for him", false, "trace-redo");
    // While it is written, the next Scene is being written: no Day View.
    expect(view().day_view).toBeNull();
    expect(view().opening).not.toBeNull();
    await engine.settled(storyId);
    // The Scene the Move left is not ended again: one close, one record, one World.
    expect(models.chronicler.requests).toHaveLength(recorded);
    expect(models.weaver.requests).toHaveLength(woven);
    expect(path().filter(payload => payload.kind === "scene_closed")).toHaveLength(1);
    expect(path().filter(payload => payload.kind === "chronicle")).toHaveLength(1);
    // The Move is planned again with the Direction, the Scene it walked into opens again, and the Reply is new.
    expect(models.writer.requests.at(-1)!.prompt).toContain("don't decide for him");
    expect(path().at(-1)).toMatchObject({ kind: "reply" });
    expect(view().scene.title).toBe("Lights out");
    expect(view().day_view).toBeNull();
    // Redone again: still one Scene's end, and only the latest Redo on the Path.
    engine.redo(storyId, head(), null, false, "trace-again");
    await engine.settled(storyId);
    expect(models.chronicler.requests).toHaveLength(recorded);
    expect(path().filter(payload => payload.kind === "redo")).toMatchObject([{ kind: "redo", direction: null, remember: false, rejected: { text: expect.any(String) } }]);
    expect(path().at(-1)).toMatchObject({ kind: "reply" });
  });

  it("shows the next Scene being written, not the Day View, while a Move that left the Scene waits behind a Redo", async () => {
    const { play, write, view } = playable(hogwartsStoryFile(), { writer: [writer({ frame: PLAN })] });
    await play("I sit down by the fire.");
    const move = write({ kind: "move", text: "I go up to the dormitory." });
    write({ kind: "redo", direction: null, remember: false });
    write({ kind: "scene_closed", by: "move" });
    expect(view().day_view).toBeNull();
    expect(view().opening).not.toBeNull();
    expect(view().exchanges.at(-1)!.move!.entry_id).toBe(move.id);
  });

  it("never redoes a Reply the player closed the Scene after", async () => {
    const { play, engine, storyId, head } = playable(hogwartsStoryFile(), { writer: [writer({ frame: PLAN })] });
    await play("I say goodnight.");
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
    expect(models.actor.requests[1]!.prompt).toContain("Focus is on Hermione Granger.");
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
    story.write({ kind: "beat_note", plan: index === 0 ? { purpose: "Something between them turns.", exit: "It turns, or it does not." } : null, here: story.state().scene!.here, goes: [], beats: beats(0), note: "n", call: "continue", intensity: 2, clock: story.state().clock, inPlay: [], callId: "c", model });
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
    expect(calls.map(call => call.agent)).toEqual(["chronicler", "actor", "editor", "actor", "editor"]);
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
  // THEN the Scene stays open at the new place, with its earlier exchanges preserved
  it("scenes › A long Scene is recorded as it goes › A Scene that has become another", async () => {
    const dorm = hogwartsStoryFile({ title: "Lights out", place: "The boys' dormitory", who: ["Harry Potter", "Ron Weasley"], prose: "Ron has the board out on his bed." });
    const tower = { title: "The Astronomy Tower", place: "The Astronomy Tower", purpose: "Draconia decides whether to say why she came.", exit: "She says it, or goes back down." };
    const story = playable(dorm, {
      writer: [writer({ moves_to: tower.place, frame: tower, comes_in: [DRACONIA], minutes: 5 })],
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

    expect(story.models.writer.requests[0]!.prompt).toContain("<recorded_so_far>");
    const kinds = story.path().map(payload => payload.kind);
    const from = kinds.lastIndexOf("move");
    expect(kinds.slice(from)).toEqual(["move", "scene_recorded", "beat_note", "reply"]);
    const shown = story.view();
    expect(shown.scene).toMatchObject({ number: 1, title: "Lights out", place: "The Astronomy Tower" });
    expect(shown.earlier_scenes).toEqual([]);
    expect(shown.exchanges.at(-1)).toEqual({ move: { entry_id: expect.any(String), text: "I ask Draconia why she came." }, reply: { entry_id: expect.any(String), text: "Draconia does not turn round. “You took your time.”" } });
    expect(story.events.some(event => event.event.kind === "scene_opened")).toBe(false);
    expect(story.models.chronicler.requests).toHaveLength(1);
    story.engine.endScene(story.storyId, story.head(), "manual-end");
    await story.engine.ended(story.storyId);
    // Its end records only what came after the record kept while it was played, and tells the whole Scene.
    const ending = story.models.chronicler.requests[1]!;
    expect((ending.facts as { passages: { text: string }[] }).passages.map(item => item.text)).toEqual(["I ask Draconia why she came.", "Draconia does not turn round. “You took your time.”"]);
    expect(ending.prompt).toContain("The Scene was played to its end, and something between them turned.");
  });
});

