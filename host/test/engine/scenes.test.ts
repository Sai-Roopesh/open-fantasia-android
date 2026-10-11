import { describe, expect, it } from "vitest";
import { LinkError } from "../../src/link/errors.js";
import type { Script } from "../../src/models/scripted.js";
import type { Beat } from "../../src/story/state.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

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
    const actor = models.actor.requests[0]!;
    expect(actor.prompt.slice(actor.prompt.indexOf("holding on"))).toContain("Thursday, 5:05 pm");
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
    expect(kinds.slice(left)).toEqual(["move", "scene_closed", "chronicle", "director_plan", "world_moved", "scene_opened", "beat_note", "reply"]);
    expect(path()[left + 1]).toEqual({ kind: "scene_closed", by: "move" });
    expect(path()[left + 2]).toMatchObject({ kind: "chronicle", scene: 1 });
    expect(path()[left + 4]).toMatchObject({ kind: "world_moved", gap: false, from: "Day 3 21:40", until: "Day 3 21:40" });
    expect(models.writer.requests).toHaveLength(1);
    expect(path().at(-3)).toMatchObject({ kind: "scene_opened", number: 2, title: "Lights out", place: "The boys' dormitory", at: "Day 3 21:45", who: ["Harry Potter", "Ron Weasley", "Neville Longbottom"], prose: null });
    const shown = view();
    expect(shown.scene).toMatchObject({ number: 2, title: "Lights out", place: "The boys' dormitory", at_label: "Friday 9:45 pm" });
    expect(shown.scene.people.map(person => person.name)).toEqual(["Harry Potter", "Ron Weasley", "Neville Longbottom"]);
    expect(shown.exchanges).toEqual([{ move: { entry_id: expect.any(String), text: move }, reply: { entry_id: expect.any(String), text: "Ron looks up from the board. \"Your go, Roo.\"" } }]);
    expect(shown.earlier_scenes.map(scene => scene.title)).toEqual(["After curfew"]);
    expect(shown.day_view).toBeNull();
    expect(models.actor.requests[0]!.system).toContain("Lights out. The boys' dormitory");
    // The phone is told each step of the end of the Scene he left, then the new Scene opens with no Day View between.
    expect(events.map(event => event.event.kind).filter(kind => kind !== "reply_delta" && kind !== "scene_end_step")).toEqual(["move", "scene_closed", "world_moved", "scene_opened", "reply_started", "reply"]);
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
    expect(path().slice(-5).map(payload => payload.kind)).toEqual(["reply", "scene_closed", "chronicle", "director_plan", "world_moved"]);
    expect(path().at(-4)).toMatchObject({ kind: "scene_closed", by: "story" });
    const shown = view();
    expect(shown.day_view).toMatchObject({ at: "Day 3 21:42", at_label: "Friday 9:42 pm", place: "The Gryffindor common room", closed_by: "story", scene_end: { step: null, failed: null } });
    expect(shown.exchanges.at(-1)!.move!.text).toBe("I say goodnight.");
    const kinds = events.map(event => event.event.kind).filter(kind => kind !== "reply_delta" && kind !== "scene_end_step");
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
      expect(request.system).not.toContain('<person name="Ron Weasley">');
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
    expect(models.actor.requests[0]!.system).toContain('<person name="Ron Weasley">');
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
    const { play, engine, storyId, head, models, view, events, path, state, mac } = playable(hogwartsStoryFile(), {
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
    expect(state().taste).toEqual([]);
  });

  // WHEN the player Redoes with the Direction "don't dwell on school procedure" and ticks "remember this"
  // THEN Taste gains a line saying so, and later Scenes honour it
  it("scenes › Redo, with a Direction and another model if wanted › Remember this", async () => {
    const lesson = "Keep school procedure to a line.";
    const { play, engine, storyId, head, models, state } = playable(hogwartsStoryFile(), {
      writer: [writer({ frame: PLAN }), writer({ frame: PLAN, taste: lesson }), writer({ call: "end" }), writer({ frame: { title: "Breakfast", place: "The Great Hall", purpose: "p", exit: "e" }, comes_in: ["Draconia Malfoy"], minutes: 616 })]
    });
    await play("I ask about the prefects' rota.");
    engine.redo(storyId, head(), "don't dwell on school procedure", true, "trace-redo");
    await engine.settled(storyId);
    expect(models.writer.requests[1]!.prompt).toMatch(/they asked for it to be remembered: put it in taste/);
    expect(state().taste).toEqual([lesson]);

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
